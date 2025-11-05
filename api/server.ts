import { z } from 'zod';
import { createMcpHandler } from 'mcp-handler';

// Mock database (in production, use Vercel KV or Upstash Redis)
interface Reservation {
  id: string;
  tableNumber: number;
  customerName: string;
  date: string;
  timeSlot: string;
  partySize: number;
  status: 'active' | 'cancelled';
}

const reservations: Reservation[] = [];
let nextReservationId = 1;

const tables = [
  { number: 1, capacity: 2 },
  { number: 2, capacity: 2 },
  { number: 3, capacity: 4 },
  { number: 4, capacity: 4 },
  { number: 5, capacity: 6 },
  { number: 6, capacity: 8 }
];

const handler = createMcpHandler(
  (server) => {
    // Tool 1: Check availability
    server.tool(
      'check_availability',
      'Check available tables for a specific date, time, and party size',
      {
        date: z.string().describe('Date in YYYY-MM-DD format'),
        timeSlot: z.string().describe('Time slot (e.g., 19:00)'),
        partySize: z.number().min(1).max(10)
      },
      async ({ date, timeSlot, partySize }) => {
        const suitableTables = tables.filter(t => t.capacity >= partySize);
        const bookedTables = reservations
          .filter(r => r.date === date && r.timeSlot === timeSlot && r.status === 'active')
          .map(r => r.tableNumber);
        
        const availableTables = suitableTables.filter(t => !bookedTables.includes(t.number));
        
        return {
          content: [{
            type: 'text',
            text: `Available tables: ${availableTables.length > 0 
              ? availableTables.map(t => `Table ${t.number} (${t.capacity} seats)`).join(', ')
              : 'None available'}`
          }]
        };
      }
    );

    // Tool 2: Book table
    server.tool(
      'book_table',
      'Create a new table reservation',
      {
        customerName: z.string(),
        date: z.string().describe('Date in YYYY-MM-DD format'),
        timeSlot: z.string(),
        partySize: z.number().min(1).max(10)
      },
      async ({ customerName, date, timeSlot, partySize }) => {
        const suitableTables = tables.filter(t => t.capacity >= partySize);
        const bookedTables = reservations
          .filter(r => r.date === date && r.timeSlot === timeSlot && r.status === 'active')
          .map(r => r.tableNumber);
        
        const availableTable = suitableTables.find(t => !bookedTables.includes(t.number));
        
        if (!availableTable) {
          return {
            content: [{ type: 'text', text: `❌ No tables available for ${partySize} people` }]
          };
        }
        
        const reservationId = `RES${String(nextReservationId++).padStart(4, '0')}`;
        reservations.push({
          id: reservationId,
          tableNumber: availableTable.number,
          customerName,
          date,
          timeSlot,
          partySize,
          status: 'active'
        });
        
        return {
          content: [{
            type: 'text',
            text: `✅ Booked! Reservation ID: ${reservationId}, Table: ${availableTable.number}`
          }]
        };
      }
    );

    // Tool 3: Cancel reservation
    server.tool(
      'cancel_reservation',
      'Cancel an existing table reservation',
      { reservationId: z.string() },
      async ({ reservationId }) => {
        const reservation = reservations.find(r => r.id === reservationId);
        
        if (!reservation || reservation.status === 'cancelled') {
          return {
            content: [{ type: 'text', text: `❌ Reservation not found or already cancelled` }]
          };
        }
        
        reservation.status = 'cancelled';
        return {
          content: [{ type: 'text', text: `✅ Reservation ${reservationId} cancelled` }]
        };
      }
    );

    // Tool 4: View reservations
    server.tool(
      'view_reservations',
      'View all reservations',
      {
        date: z.string().optional(),
        status: z.enum(['active', 'cancelled', 'all']).default('all')
      },
      async ({ date, status }) => {
        let filtered = reservations;
        if (date) filtered = filtered.filter(r => r.date === date);
        if (status !== 'all') filtered = filtered.filter(r => r.status === status);
        
        return {
          content: [{
            type: 'text',
            text: filtered.length > 0 
              ? filtered.map(r => `${r.id}: ${r.customerName} - Table ${r.tableNumber} (${r.date} ${r.timeSlot}) [${r.status}]`).join('\n')
              : 'No reservations found'
          }]
        };
      }
    );
  },
  {},
  { basePath: '/api' }
);

export { handler as GET, handler as POST, handler as DELETE };
