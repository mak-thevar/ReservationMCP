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

// ============ SSE (Server-Sent Events) HANDLER ============
export default async function handler(req: any, res: any) {
  // Set CORS and SSE headers as per OpenAI requirements
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Health check endpoint
  if (req.method === 'GET' && !req.url?.includes('/sse')) {
    return res.status(200).json({
      name: 'restaurant-reservation-mcp',
      version: '1.0.0',
      status: 'running',
      transport: 'sse',
      tools: ['search', 'fetch'],
      message: 'MCP Server is running with ChatGPT-compatible tools (search and fetch)'
    });
  }

  // Handle SSE endpoint for ChatGPT
  if (req.url?.includes('/sse') || req.method === 'GET') {
    // Send initial connection message
    res.write('event: endpoint\n');
    res.write(`data: ${JSON.stringify({ type: 'endpoint' })}\n\n`);
    
    // Keep connection alive
    const keepAlive = setInterval(() => {
      res.write(':ping\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(keepAlive);
      res.end();
    });

    return;
  }

  // Handle MCP POST requests with search and fetch tools
  if (req.method === 'POST') {
    try {
      const { method, params } = req.body;

      // REQUIRED TOOL 1: search
      // Per OpenAI docs: Returns results array with id, title, url
      if (method === 'tools/call' && params?.name === 'search') {
        const query = params.arguments?.query || '';
        const results: any[] = [];

        // Parse search query for reservation searches
        if (query.toLowerCase().includes('reservation') || 
            query.toLowerCase().includes('booking') ||
            query.toLowerCase().includes('table')) {
          
          // Search through reservations
          const matchedReservations = reservations.filter(r => 
            query.toLowerCase().includes(r.customerName.toLowerCase()) ||
            query.toLowerCase().includes(r.date) ||
            query.toLowerCase().includes(r.status)
          );

          matchedReservations.forEach((r, index) => {
            results.push({
              id: r.id,
              title: `Reservation for ${r.customerName} - Table ${r.tableNumber}`,
              url: `https://your-app.vercel.app/reservations/${r.id}`
            });
          });
        }

        // Search for table availability
        if (query.toLowerCase().includes('available') || 
            query.toLowerCase().includes('capacity')) {
          tables.forEach(table => {
            results.push({
              id: `table-${table.number}`,
              title: `Table ${table.number} (${table.capacity} seats, ${table.location})`,
              url: `https://your-app.vercel.app/tables/${table.number}`
            });
          });
        }

        // Return in ChatGPT-required format
        const responseContent = {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ results })
            }
          ]
        };

        return res.status(200).json(responseContent);
      }

      // REQUIRED TOOL 2: fetch
      // Per OpenAI docs: Returns single document with id, title, text, url, metadata
      if (method === 'tools/call' && params?.name === 'fetch') {
        const id = params.arguments?.id || '';

        // Fetch reservation by ID
        if (id.startsWith('RES')) {
          const reservation = reservations.find(r => r.id === id);
          
          if (!reservation) {
            return res.status(404).json({
              error: { code: -32602, message: `Reservation ${id} not found` }
            });
          }

          const document = {
            id: reservation.id,
            title: `Reservation ${reservation.id} - ${reservation.customerName}`,
            text: `
Reservation Details:
- ID: ${reservation.id}
- Customer: ${reservation.customerName}
- Table Number: ${reservation.tableNumber}
- Date: ${reservation.date}
- Time: ${reservation.timeSlot}
- Party Size: ${reservation.partySize}
- Status: ${reservation.status}
- Created: ${reservation.createdAt}
            `.trim(),
            url: `https://your-app.vercel.app/reservations/${reservation.id}`,
            metadata: {
              type: 'reservation',
              status: reservation.status,
              tableNumber: reservation.tableNumber
            }
          };

          const responseContent = {
            content: [
              {
                type: 'text',
                text: JSON.stringify(document)
              }
            ]
          };

          return res.status(200).json(responseContent);
        }

        // Fetch table information
        if (id.startsWith('table-')) {
          const tableNum = parseInt(id.split('-')[1]);
          const table = tables.find(t => t.number === tableNum);

          if (!table) {
            return res.status(404).json({
              error: { code: -32602, message: `Table ${tableNum} not found` }
            });
          }

          const document = {
            id: `table-${table.number}`,
            title: `Table ${table.number} Information`,
            text: `
Table Details:
- Number: ${table.number}
- Capacity: ${table.capacity} people
- Location: ${table.location}
- Available Time Slots: ${timeSlots.join(', ')}
            `.trim(),
            url: `https://your-app.vercel.app/tables/${table.number}`,
            metadata: {
              type: 'table',
              capacity: table.capacity,
              location: table.location
            }
          };

          const responseContent = {
            content: [
              {
                type: 'text',
                text: JSON.stringify(document)
              }
            ]
          };

          return res.status(200).json(responseContent);
        }

        return res.status(404).json({
          error: { code: -32602, message: 'Document not found' }
        });
      }

      // List available tools (MCP protocol requirement)
      if (method === 'tools/list') {
        return res.status(200).json({
          tools: [
            {
              name: 'search',
              description: 'Search for table reservations and availability',
              inputSchema: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    description: 'Search query for reservations or tables'
                  }
                },
                required: ['query']
              }
            },
            {
              name: 'fetch',
              description: 'Fetch detailed information about a reservation or table',
              inputSchema: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    description: 'ID of the reservation (RES####) or table (table-#)'
                  }
                },
                required: ['id']
              }
            }
          ]
        });
      }

      // Initialize session (MCP protocol)
      if (method === 'initialize') {
        return res.status(200).json({
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'restaurant-reservation-mcp',
            version: '1.0.0'
          }
        });
      }

      return res.status(400).json({
        error: { code: -32601, message: `Unknown method: ${method}` }
      });

    } catch (error: any) {
      return res.status(500).json({
        error: { code: -32603, message: error.message }
      });
    }
  }

  return res.status(405).json({ 
    error: { code: -32600, message: 'Method not allowed' }
  });
}
