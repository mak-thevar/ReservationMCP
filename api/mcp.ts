import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// ============ DATA STRUCTURES ============
interface Reservation {
  id: string;
  tableNumber: number;
  customerName: string;
  date: string;
  timeSlot: string;
  partySize: number;
  status: 'active' | 'cancelled';
  createdAt: string;
}

const reservations: Reservation[] = [];
let nextReservationId = 1;

const tables = [
  { number: 1, capacity: 2, location: 'Window' },
  { number: 2, capacity: 2, location: 'Window' },
  { number: 3, capacity: 4, location: 'Main Hall' },
  { number: 4, capacity: 4, location: 'Main Hall' },
  { number: 5, capacity: 6, location: 'Private' },
  { number: 6, capacity: 8, location: 'Private' }
];

const timeSlots = [
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00'
];

// ============ HELPER FUNCTIONS ============
function getAvailableTables(date: string, timeSlot: string, partySize: number) {
  const suitableTables = tables.filter(t => t.capacity >= partySize);
  const bookedTableNumbers = reservations
    .filter(r => r.date === date && r.timeSlot === timeSlot && r.status === 'active')
    .map(r => r.tableNumber);
  
  return suitableTables.filter(t => !bookedTableNumbers.includes(t.number));
}

// ============ VERCEL SERVERLESS FUNCTION ============
export default async function handler(req: any, res: any) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Health check endpoint
  if (req.method === 'GET') {
    return res.status(200).json({
      name: 'restaurant-reservation-mcp',
      version: '1.0.0',
      status: 'running',
      tools: [
        'check_availability',
        'book_table',
        'cancel_reservation',
        'view_reservations',
        'get_available_timeslots'
      ],
      message: 'MCP Server is running. Use POST requests for MCP operations.'
    });
  }

  // Handle MCP requests
  if (req.method === 'POST') {
    try {
      const { method, params } = req.body;

      switch (method) {
        case 'check_availability': {
          const { date, timeSlot, partySize } = params;
          const availableTables = getAvailableTables(date, timeSlot, partySize);
          
          return res.status(200).json({
            available: availableTables.length > 0,
            tables: availableTables,
            message: availableTables.length > 0
              ? `${availableTables.length} table(s) available`
              : 'No tables available'
          });
        }

        case 'book_table': {
          const { customerName, date, timeSlot, partySize, contactPhone } = params;
          
          if (!timeSlots.includes(timeSlot)) {
            return res.status(400).json({
              error: `Invalid time slot. Available: ${timeSlots.join(', ')}`
            });
          }

          const availableTables = getAvailableTables(date, timeSlot, partySize);
          
          if (availableTables.length === 0) {
            return res.status(400).json({
              error: `No tables available for ${partySize} people on ${date} at ${timeSlot}`
            });
          }

          const selectedTable = availableTables[0];
          const reservationId = `RES${String(nextReservationId++).padStart(4, '0')}`;
          
          const newReservation: Reservation = {
            id: reservationId,
            tableNumber: selectedTable.number,
            customerName,
            date,
            timeSlot,
            partySize,
            status: 'active',
            createdAt: new Date().toISOString()
          };

          reservations.push(newReservation);

          return res.status(200).json({
            success: true,
            reservation: newReservation,
            message: `Table ${selectedTable.number} booked successfully!`
          });
        }

        case 'cancel_reservation': {
          const { reservationId } = params;
          const reservation = reservations.find(r => r.id === reservationId);

          if (!reservation) {
            return res.status(404).json({
              error: `Reservation ${reservationId} not found`
            });
          }

          if (reservation.status === 'cancelled') {
            return res.status(400).json({
              error: `Reservation ${reservationId} is already cancelled`
            });
          }

          reservation.status = 'cancelled';

          return res.status(200).json({
            success: true,
            message: `Reservation ${reservationId} cancelled successfully`
          });
        }

        case 'view_reservations': {
          const { date, status = 'all' } = params || {};
          let filtered = [...reservations];

          if (date) {
            filtered = filtered.filter(r => r.date === date);
          }

          if (status !== 'all') {
            filtered = filtered.filter(r => r.status === status);
          }

          return res.status(200).json({
            reservations: filtered,
            count: filtered.length
          });
        }

        case 'get_available_timeslots': {
          const { date, partySize } = params;
          const availableSlots = timeSlots.filter(slot => {
            const availableTables = getAvailableTables(date, slot, partySize);
            return availableTables.length > 0;
          });

          return res.status(200).json({
            availableSlots,
            count: availableSlots.length
          });
        }

        default:
          return res.status(400).json({
            error: `Unknown method: ${method}`,
            availableMethods: [
              'check_availability',
              'book_table',
              'cancel_reservation',
              'view_reservations',
              'get_available_timeslots'
            ]
          });
      }
    } catch (error: any) {
      return res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
