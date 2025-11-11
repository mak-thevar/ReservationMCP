"""
Restaurant Reservation Assistant MCP Server
Built with FastMCP - provides tools for managing restaurant table bookings
"""

from datetime import datetime, time, timedelta
from typing import Optional, List
import uuid
from fastmcp import FastMCP

mcp = FastMCP("Restaurant Reservation Assistant")

TABLES = [
    {"id": 1, "capacity": 2, "location": "Window"},
    {"id": 2, "capacity": 2, "location": "Window"},
    {"id": 3, "capacity": 4, "location": "Main Hall"},
    {"id": 4, "capacity": 4, "location": "Main Hall"},
    {"id": 5, "capacity": 6, "location": "Private"},
    {"id": 6, "capacity": 8, "location": "Main Hall"},
]

OPENING_TIME = time(11, 0)
CLOSING_TIME = time(21, 0)
SLOT_DURATION = 30

reservations = {}


def generate_reservation_id() -> str:
    """Generate a unique reservation ID"""
    count = len(reservations) + 1
    return f"RES{count:04d}"


def parse_time(time_str: str) -> time:
    """Parse time string in various formats (e.g., '7pm', '19:00', '7:30 PM')"""
    time_str = time_str.strip().upper()
    
    if 'PM' in time_str or 'AM' in time_str:
        time_str = time_str.replace(' ', '')
        try:
            return datetime.strptime(time_str, '%I:%M%p').time()
        except ValueError:
            return datetime.strptime(time_str, '%I%p').time()
    else:
        if ':' in time_str:
            return datetime.strptime(time_str, '%H:%M').time()
        else:
            hour = int(time_str)
            return time(hour, 0)


def parse_date(date_str: str) -> datetime:
    """Parse date string in various formats"""
    date_str = date_str.strip()
    
    formats = [
        '%Y-%m-%d',
        '%m/%d/%Y',
        '%d/%m/%Y',
        '%B %d, %Y',
        '%b %d, %Y',
        '%B %d %Y',
        '%b %d %Y',
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    
    raise ValueError(f"Could not parse date: {date_str}. Use format YYYY-MM-DD")


def is_within_hours(check_time: time) -> bool:
    """Check if time is within operating hours"""
    return OPENING_TIME <= check_time < CLOSING_TIME


def is_valid_timeslot(check_time: time) -> bool:
    """Check if time is on a valid 30-minute boundary"""
    return check_time.minute in (0, 30)


def get_time_slots() -> List[time]:
    """Generate all possible time slots"""
    slots = []
    current = datetime.combine(datetime.today(), OPENING_TIME)
    end = datetime.combine(datetime.today(), CLOSING_TIME)
    
    while current.time() < end.time():
        slots.append(current.time())
        current += timedelta(minutes=SLOT_DURATION)
    
    return slots


def find_available_tables(date: datetime, req_time: time, party_size: int) -> List[dict]:
    """Find tables that can accommodate party size and are available at given time"""
    suitable_tables = [t for t in TABLES if t["capacity"] >= party_size]
    available = []
    
    for table in suitable_tables:
        is_available = True
        for res_id, res in reservations.items():
            if (res["date"] == date.strftime('%Y-%m-%d') and 
                res["table_id"] == table["id"] and 
                res["time"] == req_time.strftime('%H:%M')):
                is_available = False
                break
        
        if is_available:
            available.append(table)
    
    return available


@mcp.tool()
def check_availability(date: str, time_str: str, party_size: int) -> str:
    """
    Check if tables are available for a specific date, time, and party size.
    
    Args:
        date: Date in YYYY-MM-DD format (e.g., '2025-12-15')
        time_str: Time in format like '7pm', '19:00', or '7:30 PM'
        party_size: Number of people (1-8)
    
    Returns:
        Availability status with table details if available
    """
    try:
        parsed_date = parse_date(date)
        parsed_time = parse_time(time_str)
        
        if not is_valid_timeslot(parsed_time):
            return f"Invalid time slot. Please choose a time on the hour or half-hour (e.g., 12:00, 12:30, 1:00, 1:30). We have 30-minute time slots."
        
        if not is_within_hours(parsed_time):
            return f"Sorry, we're closed at {parsed_time.strftime('%I:%M %p')}. Operating hours: 11:00 AM - 9:00 PM"
        
        if party_size < 1 or party_size > 8:
            return "Sorry, we can only accommodate parties of 1-8 people"
        
        available_tables = find_available_tables(parsed_date, parsed_time, party_size)
        
        if available_tables:
            table_info = ", ".join([f"Table {t['id']} ({t['capacity']} seats, {t['location']})" 
                                   for t in available_tables])
            return f"✓ Available! Tables for {party_size} people on {parsed_date.strftime('%B %d, %Y')} at {parsed_time.strftime('%I:%M %p')}:\n{table_info}"
        else:
            return f"✗ No tables available for {party_size} people on {parsed_date.strftime('%B %d, %Y')} at {parsed_time.strftime('%I:%M %p')}"
    
    except Exception as e:
        return f"Error: {str(e)}"


@mcp.tool()
def book_table(name: str, party_size: int, date: str, time_str: str, 
               phone: str = "", email: str = "", notes: str = "") -> str:
    """
    Create a new table reservation.
    
    Args:
        name: Customer name
        party_size: Number of people (1-8)
        date: Date in YYYY-MM-DD format
        time_str: Time in format like '7pm', '19:00', or '7:30 PM'
        phone: Contact phone number (optional)
        email: Contact email (optional)
        notes: Special requests or notes (optional)
    
    Returns:
        Confirmation with reservation ID or error message
    """
    try:
        parsed_date = parse_date(date)
        parsed_time = parse_time(time_str)
        
        if not is_valid_timeslot(parsed_time):
            return f"Invalid time slot. Please choose a time on the hour or half-hour (e.g., 12:00, 12:30, 1:00, 1:30). We have 30-minute time slots."
        
        if not is_within_hours(parsed_time):
            return f"Sorry, we're closed at {parsed_time.strftime('%I:%M %p')}. Operating hours: 11:00 AM - 9:00 PM"
        
        if party_size < 1 or party_size > 8:
            return "Sorry, we can only accommodate parties of 1-8 people"
        
        available_tables = find_available_tables(parsed_date, parsed_time, party_size)
        
        if not available_tables:
            return f"Sorry, no tables available for {party_size} people on {parsed_date.strftime('%B %d, %Y')} at {parsed_time.strftime('%I:%M %p')}. Try get_available_timeslots to find alternatives."
        
        table = available_tables[0]
        res_id = generate_reservation_id()
        
        reservations[res_id] = {
            "id": res_id,
            "customer_name": name,
            "party_size": party_size,
            "date": parsed_date.strftime('%Y-%m-%d'),
            "time": parsed_time.strftime('%H:%M'),
            "table_id": table["id"],
            "table_location": table["location"],
            "phone": phone,
            "email": email,
            "notes": notes,
            "created_at": datetime.now().isoformat()
        }
        
        confirmation = f"""
✓ Reservation Confirmed!

Reservation ID: {res_id}
Customer: {name}
Party Size: {party_size} people
Date: {parsed_date.strftime('%B %d, %Y')}
Time: {parsed_time.strftime('%I:%M %p')}
Table: {table['id']} ({table['capacity']} seats, {table['location']})
"""
        if phone:
            confirmation += f"Phone: {phone}\n"
        if email:
            confirmation += f"Email: {email}\n"
        if notes:
            confirmation += f"Notes: {notes}\n"
        
        return confirmation.strip()
    
    except Exception as e:
        return f"Error creating reservation: {str(e)}"


@mcp.tool()
def cancel_reservation(reservation_id: str) -> str:
    """
    Cancel an existing reservation by ID.
    
    Args:
        reservation_id: The reservation ID (e.g., 'RES0001')
    
    Returns:
        Cancellation confirmation or error message
    """
    reservation_id = reservation_id.upper().strip()
    
    if reservation_id in reservations:
        res = reservations[reservation_id]
        del reservations[reservation_id]
        return f"""
✓ Reservation Cancelled

Reservation ID: {reservation_id}
Customer: {res['customer_name']}
Date: {res['date']}
Time: {res['time']}
Party Size: {res['party_size']} people

The table has been released and is now available for booking.
"""
    else:
        return f"✗ Reservation {reservation_id} not found. Please check the ID and try again."


@mcp.tool()
def view_reservations(date: Optional[str] = None, customer_name: Optional[str] = None) -> str:
    """
    View all reservations with optional filtering.
    
    Args:
        date: Filter by date (YYYY-MM-DD format, optional)
        customer_name: Filter by customer name (optional, partial match)
    
    Returns:
        List of reservations matching the filters
    """
    if not reservations:
        return "No reservations found."
    
    filtered = reservations.values()
    
    if date:
        try:
            parsed_date = parse_date(date)
            date_str = parsed_date.strftime('%Y-%m-%d')
            filtered = [r for r in filtered if r['date'] == date_str]
        except Exception as e:
            return f"Error parsing date: {str(e)}"
    
    if customer_name:
        filtered = [r for r in filtered if customer_name.lower() in r['customer_name'].lower()]
    
    if not filtered:
        return "No reservations found matching your criteria."
    
    result = f"Found {len(filtered)} reservation(s):\n\n"
    
    sorted_reservations = sorted(filtered, key=lambda x: (x['date'], x['time']))
    
    for res in sorted_reservations:
        result += f"""---
ID: {res['id']}
Customer: {res['customer_name']}
Date: {res['date']} at {res['time']}
Party: {res['party_size']} people
Table: {res['table_id']} ({res['table_location']})
"""
        if res['phone']:
            result += f"Phone: {res['phone']}\n"
        if res['email']:
            result += f"Email: {res['email']}\n"
        if res['notes']:
            result += f"Notes: {res['notes']}\n"
    
    return result.strip()


@mcp.tool()
def get_available_timeslots(date: str, party_size: int) -> str:
    """
    Find all available time slots for a specific date and party size.
    
    Args:
        date: Date in YYYY-MM-DD format
        party_size: Number of people (1-8)
    
    Returns:
        List of available time slots
    """
    try:
        parsed_date = parse_date(date)
        
        if party_size < 1 or party_size > 8:
            return "Sorry, we can only accommodate parties of 1-8 people"
        
        available_slots = []
        time_slots = get_time_slots()
        
        for slot in time_slots:
            tables = find_available_tables(parsed_date, slot, party_size)
            if tables:
                available_slots.append(slot.strftime('%I:%M %p'))
        
        if available_slots:
            slots_formatted = ", ".join(available_slots)
            return f"""Available time slots for {party_size} people on {parsed_date.strftime('%B %d, %Y')}:

{slots_formatted}

Use book_table to reserve your preferred time.
"""
        else:
            return f"Sorry, no available slots for {party_size} people on {parsed_date.strftime('%B %d, %Y')}. The restaurant is fully booked."
    
    except Exception as e:
        return f"Error: {str(e)}"


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8080))
    logger.info(f"Starting MCP server on port {port}")
    
    # Run with SSE transport for web hosting
    mcp.run(transport="sse", host="0.0.0.0", port=port)
    #import sys
    
    # Detect environment
    #if sys.stdin.isatty():
        # Running in terminal/cloud - use HTTP
    mcp.run(transport="sse", port=8080)
    # else:
    #     # Running with Claude Desktop - use STDIO
    #     mcp.run(transport="stdio")