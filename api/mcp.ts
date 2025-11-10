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

// ============ MCP PROTOCOL HANDLER ============
export default async function handler(req: any, res: any) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Health check
  if (req.method === 'GET') {
    return res.status(200).json({
      name: 'restaurant-reservation-mcp',
      version: '1.0.0',
      description: 'MCP server for restaurant table reservations',
      protocolVersion: '2024-11-05'
    });
  }

  // MCP Protocol POST handler
  if (req.method === 'POST') {
    try {
      const body = req.body;
      
      // MCP Initialize
      if (body.method === 'initialize') {
        return res.status(200).json({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'restaurant-reservation-mcp',
              version: '1.0.0'
            }
          }
        });
      }

      // MCP List Tools
      if (body.method === 'tools/list') {
        return res.status(200).json({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            tools: [
              {
                name: 'check_availability',
                description: 'Check available tables for a specific date, time slot, and party size',
                inputSchema: {
                  type: 'object',
                  properties: {
                    date: {
                      type: 'string',
                      description: 'Date in YYYY-MM-DD format (e.g., 2025-11-15)'
                    },
                    timeSlot: {
                      type: 'string',
                      description: 'Time slot in HH:MM format (e.g., 19:00)'
                    },
                    partySize: {
                      type: 'number',
                      description: 'Number of people in the party'
                    }
                  },
                  required: ['date', 'timeSlot', 'partySize']
                }
              },
              {
                name: 'book_table',
                description: 'Create a new table reservation',
                inputSchema: {
                  type: 'object',
                  properties: {
                    customerName: {
                      type: 'string',
                      description: 'Customer name (minimum 2 characters)'
                    },
                    date: {
                      type: 'string',
                      description: 'Date in YYYY-MM-DD format (e.g., 2025-11-15)'
                    },
                    timeSlot: {
                      type: 'string',
                      description: 'Time slot in HH:MM format (e.g., 19:00)'
                    },
                    partySize: {
                      type: 'number',
                      description: 'Number of people in the party'
                    },
                    contactPhone: {
                      type: 'string',
                      description: 'Contact phone number (optional)'
                    }
                  },
                  required: ['customerName', 'date', 'timeSlot', 'partySize']
                }
              },
              {
                name: 'cancel_reservation',
                description: 'Cancel an existing table reservation',
                inputSchema: {
                  type: 'object',
                  properties: {
                    reservationId: {
                      type: 'string',
                      description: 'The reservation ID to cancel (e.g., RES0001)'
                    }
                  },
                  required: ['reservationId']
                }
              },
              {
                name: 'view_reservations',
                description: 'View all reservations with optional filtering by date or status',
                inputSchema: {
                  type: 'object',
                  properties: {
                    date: {
                      type: 'string',
                      description: 'Filter by date (YYYY-MM-DD format, optional)'
                    },
                    status: {
                      type: 'string',
                      enum: ['active', 'cancelled', 'all'],
                      description: 'Filter by status: active, cancelled, or all'
                    }
                  }
                }
              },
              {
                name: 'get_available_timeslots',
                description: 'Get all available time slots for a specific date and party size',
                inputSchema: {
                  type: 'object',
                  properties: {
                    date: {
                      type: 'string',
                      description: 'Date in YYYY-MM-DD format'
                    },
                    partySize: {
                      type: 'number',
                      description: 'Number of people'
                    }
                  },
                  required: ['date', 'partySize']
                }
              }
            ]
          }
        });
      }

      // MCP Call Tool
      if (body.method === 'tools/call') {
        const toolName = body.params.name;
        const args = body.params.arguments || {};

        let resultText = '';

        // Tool: check_availability
        if (toolName === 'check_availability') {
          const { date, timeSlot, partySize } = args;
          const availableTables = getAvailableTables(date, timeSlot, partySize);
          
          if (availableTables.length === 0) {
            resultText = `❌ No tables available for ${partySize} people on ${date} at ${timeSlot}.\n\nTry these alternative time slots:\n${timeSlots.filter(t => t !== timeSlot).slice(0, 5).join(', ')}`;
          } else {
            const tableList = availableTables
              .map(t => `  • Table ${t.number} (${t.capacity} seats, ${t.location})`)
              .join('\n');
            resultText = `✅ ${availableTables.length} table(s) available for ${partySize} people on ${date} at ${timeSlot}:\n\n${tableList}`;
          }
        }

        // Tool: book_table
        else if (toolName === 'book_table') {
          const { customerName, date, timeSlot, partySize, contactPhone } = args;
          
          if (!timeSlots.includes(timeSlot)) {
            resultText = `❌ Invalid time slot. Available slots: ${timeSlots.join(', ')}`;
          } else {
            const availableTables = getAvailableTables(date, timeSlot, partySize);
            
            if (availableTables.length === 0) {
              resultText = `❌ Sorry, no tables available for ${partySize} people on ${date} at ${timeSlot}.\n\nPlease check availability first or try a different time slot.`;
            } else {
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

              resultText = `✅ Reservation confirmed!\n\n` +
                          `Reservation ID: ${reservationId}\n` +
                          `Customer: ${customerName}\n` +
                          `Table: ${selectedTable.number} (${selectedTable.capacity} seats, ${selectedTable.location})\n` +
                          `Date: ${date}\n` +
                          `Time: ${timeSlot}\n` +
                          `Party Size: ${partySize}\n` +
                          (contactPhone ? `Contact: ${contactPhone}\n` : '') +
                          `\nPlease save your reservation ID for future reference.`;
            }
          }
        }

        // Tool: cancel_reservation
        else if (toolName === 'cancel_reservation') {
          const { reservationId } = args;
          const reservation = reservations.find(r => r.id === reservationId);

          if (!reservation) {
            resultText = `❌ Reservation ${reservationId} not found.\n\nPlease check the reservation ID and try again.`;
          } else if (reservation.status === 'cancelled') {
            resultText = `❌ Reservation ${reservationId} is already cancelled.`;
          } else {
            reservation.status = 'cancelled';
            resultText = `✅ Reservation cancelled successfully!\n\n` +
                        `Reservation ID: ${reservationId}\n` +
                        `Customer: ${reservation.customerName}\n` +
                        `Original booking: ${reservation.date} at ${reservation.timeSlot}\n` +
                        `Table ${reservation.tableNumber} is now available.`;
          }
        }

        // Tool: view_reservations
        else if (toolName === 'view_reservations') {
          const { date, status = 'all' } = args;
          let filtered = [...reservations];

          if (date) {
            filtered = filtered.filter(r => r.date === date);
          }

          if (status !== 'all') {
            filtered = filtered.filter(r => r.status === status);
          }

          if (filtered.length === 0) {
            resultText = `📋 No reservations found${date ? ` for ${date}` : ''}${status !== 'all' ? ` with status: ${status}` : ''}.\n\nTotal reservations in system: ${reservations.length}`;
          } else {
            filtered.sort((a, b) => {
              const dateCompare = a.date.localeCompare(b.date);
              if (dateCompare !== 0) return dateCompare;
              return a.timeSlot.localeCompare(b.timeSlot);
            });

            const reservationList = filtered
              .map((r, index) => `${index + 1}. [${r.id}] ${r.customerName} - Table ${r.tableNumber} | ${r.date} at ${r.timeSlot} | Party of ${r.partySize} | ${r.status.toUpperCase()}`)
              .join('\n');

            resultText = `📋 Found ${filtered.length} reservation(s)${date ? ` for ${date}` : ''}${status !== 'all' ? ` (${status})` : ''}:\n\n${reservationList}`;
          }
        }

        // Tool: get_available_timeslots
        else if (toolName === 'get_available_timeslots') {
          const { date, partySize } = args;
          const availableSlots = timeSlots.filter(slot => {
            const availableTables = getAvailableTables(date, slot, partySize);
            return availableTables.length > 0;
          });

          if (availableSlots.length === 0) {
            resultText = `❌ No available time slots for ${partySize} people on ${date}.\n\nThe restaurant is fully booked for this date.`;
          } else {
            resultText = `✅ Available time slots for ${partySize} people on ${date}:\n\n${availableSlots.join(', ')}\n\nTotal: ${availableSlots.length} slots available`;
          }
        }

        else {
          return res.status(400).json({
            jsonrpc: '2.0',
            id: body.id,
            error: {
              code: -32601,
              message: `Unknown tool: ${toolName}`
            }
          });
        }

        // Return tool result in MCP format
        return res.status(200).json({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            content: [
              {
                type: 'text',
                text: resultText
              }
            ]
          }
        });
      }

      // Unknown method
      return res.status(400).json({
        jsonrpc: '2.0',
        id: body.id,
        error: {
          code: -32601,
          message: `Method not found: ${body.method}`
        }
      });

    } catch (error: any) {
      return res.status(500).json({
        jsonrpc: '2.0',
        id: req.body?.id,
        error: {
          code: -32603,
          message: `Internal error: ${error.message}`
        }
      });
    }
  }

  return res.status(405).json({ 
    error: 'Method not allowed' 
  });
}
