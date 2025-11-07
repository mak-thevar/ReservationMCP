import { z } from 'zod';
import { createMcpHandler } from 'mcp-handler';

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

// In-memory storage (for POC - in production use a database)
const reservations: Reservation[] = [];
let nextReservationId = 1;

// Mock restaurant tables
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

function formatReservation(res: Reservation): string {
  return `[${res.id}] ${res.customerName} - Table ${res.tableNumber} | ${res.date} at ${res.timeSlot} | Party of ${res.partySize} | Status: ${res.status.toUpperCase()}`;
}

// ============ CREATE MCP HANDLER ============
const handler = createMcpHandler(
  (server) => {
    
    // ============ TOOL 1: Check Availability ============
    server.tool(
      'check_availability',
      'Check available tables for a specific date, time slot, and party size',
      {
        date: z.string().describe('Date in YYYY-MM-DD format (e.g., 2025-11-15)'),
        timeSlot: z.string().describe('Time slot in HH:MM format (e.g., 19:00)'),
        partySize: z.number().min(1).max(10).describe('Number of people in the party')
      },
      async ({ date, timeSlot, partySize }) => {
        const availableTables = getAvailableTables(date, timeSlot, partySize);
        
        if (availableTables.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `❌ No tables available for ${partySize} people on ${date} at ${timeSlot}.\n\nTry these alternative time slots:\n${timeSlots.filter(t => t !== timeSlot).slice(0, 5).join(', ')}`
            }]
          };
        }
        
        const tableList = availableTables
          .map(t => `  • Table ${t.number} (${t.capacity} seats, ${t.location})`)
          .join('\n');
        
        return {
          content: [{
            type: 'text',
            text: `✅ ${availableTables.length} table(s) available for ${partySize} people on ${date} at ${timeSlot}:\n\n${tableList}`
          }]
        };
      }
    );

    // ============ TOOL 2: Book Table ============
    server.tool(
      'book_table',
      'Create a new table reservation',
      {
        customerName: z.string().min(2).describe('Customer name (minimum 2 characters)'),
        date: z.string().describe('Date in YYYY-MM-DD format (e.g., 2025-11-15)'),
        timeSlot: z.string().describe('Time slot in HH:MM format (e.g., 19:00)'),
        partySize: z.number().min(1).max(10).describe('Number of people in the party'),
        contactPhone: z.string().optional().describe('Contact phone number (optional)')
      },
      async ({ customerName, date, timeSlot, partySize, contactPhone }) => {
        // Validate time slot
        if (!timeSlots.includes(timeSlot)) {
          return {
            content: [{
              type: 'text',
              text: `❌ Invalid time slot. Available slots: ${timeSlots.join(', ')}`
            }]
          };
        }

        // Find available table
        const availableTables = getAvailableTables(date, timeSlot, partySize);
        
        if (availableTables.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `❌ Sorry, no tables available for ${partySize} people on ${date} at ${timeSlot}.\n\nPlease check availability first or try a different time slot.`
            }]
          };
        }

        // Book the first available table
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

        return {
          content: [{
            type: 'text',
            text: `✅ Reservation confirmed!\n\n` +
                  `Reservation ID: ${reservationId}\n` +
                  `Customer: ${customerName}\n` +
                  `Table: ${selectedTable.number} (${selectedTable.capacity} seats, ${selectedTable.location})\n` +
                  `Date: ${date}\n` +
                  `Time: ${timeSlot}\n` +
                  `Party Size: ${partySize}\n` +
                  (contactPhone ? `Contact: ${contactPhone}\n` : '') +
                  `\nPlease save your reservation ID for future reference.`
          }]
        };
      }
    );

    // ============ TOOL 3: Cancel Reservation ============
    server.tool(
      'cancel_reservation',
      'Cancel an existing table reservation',
      {
        reservationId: z.string().describe('The reservation ID to cancel (e.g., RES0001)')
      },
      async ({ reservationId }) => {
        const reservation = reservations.find(r => r.id === reservationId);

        if (!reservation) {
          return {
            content: [{
              type: 'text',
              text: `❌ Reservation ${reservationId} not found.\n\nPlease check the reservation ID and try again.`
            }]
          };
        }

        if (reservation.status === 'cancelled') {
          return {
            content: [{
              type: 'text',
              text: `❌ Reservation ${reservationId} is already cancelled.\n\nDetails:\n${formatReservation(reservation)}`
            }]
          };
        }

        reservation.status = 'cancelled';

        return {
          content: [{
            type: 'text',
            text: `✅ Reservation cancelled successfully!\n\n` +
                  `Reservation ID: ${reservationId}\n` +
                  `Customer: ${reservation.customerName}\n` +
                  `Original booking: ${reservation.date} at ${reservation.timeSlot}\n` +
                  `Table ${reservation.tableNumber} is now available.`
          }]
        };
      }
    );

    // ============ TOOL 4: View Reservations ============
    server.tool(
      'view_reservations',
      'View all reservations with optional filtering by date or status',
      {
        date: z.string().optional().describe('Filter by date (YYYY-MM-DD format)'),
        status: z.enum(['active', 'cancelled', 'all']).default('all').describe('Filter by status: active, cancelled, or all')
      },
      async ({ date, status }) => {
        let filtered = [...reservations];

        // Apply filters
        if (date) {
          filtered = filtered.filter(r => r.date === date);
        }

        if (status !== 'all') {
          filtered = filtered.filter(r => r.status === status);
        }

        if (filtered.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `📋 No reservations found${date ? ` for ${date}` : ''}${status !== 'all' ? ` with status: ${status}` : ''}.\n\nTotal reservations in system: ${reservations.length}`
            }]
          };
        }

        // Sort by date and time
        filtered.sort((a, b) => {
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          return a.timeSlot.localeCompare(b.timeSlot);
        });

        const reservationList = filtered
          .map((r, index) => `${index + 1}. ${formatReservation(r)}`)
          .join('\n');

        return {
          content: [{
            type: 'text',
            text: `📋 Found ${filtered.length} reservation(s)${date ? ` for ${date}` : ''}${status !== 'all' ? ` (${status})` : ''}:\n\n${reservationList}`
          }]
        };
      }
    );

    // ============ TOOL 5: Get Available Time Slots ============
    server.tool(
      'get_available_timeslots',
      'Get all available time slots for a specific date and party size',
      {
        date: z.string().describe('Date in YYYY-MM-DD format'),
        partySize: z.number().min(1).max(10).describe('Number of people')
      },
      async ({ date, partySize }) => {
        const availableSlots = timeSlots.filter(slot => {
          const availableTables = getAvailableTables(date, slot, partySize);
          return availableTables.length > 0;
        });

        if (availableSlots.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `❌ No available time slots for ${partySize} people on ${date}.\n\nThe restaurant is fully booked for this date.`
            }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: `✅ Available time slots for ${partySize} people on ${date}:\n\n${availableSlots.join(', ')}\n\nTotal: ${availableSlots.length} slots available`
          }]
        };
      }
    );

  },
  {},
  { basePath: '/api' }
);

// Export for Vercel
export { handler as GET, handler as POST, handler as DELETE };
