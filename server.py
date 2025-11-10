from fastmcp import FastMCP
from typing import Optional
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastMCP server
mcp = FastMCP("restaurant-reservation")

# ============ DATA STRUCTURES ============
reservations = []
next_reservation_id = 1

tables = [
    {"number": 1, "capacity": 2, "location": "Window"},
    {"number": 2, "capacity": 2, "location": "Window"},
    {"number": 3, "capacity": 4, "location": "Main Hall"},
    {"number": 4, "capacity": 4, "location": "Main Hall"},
    {"number": 5, "capacity": 6, "location": "Private"},
    {"number": 6, "capacity": 8, "location": "Private"}
]

time_slots = [
    "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
    "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00"
]

# ============ HELPER FUNCTIONS ============
def get_available_tables(date: str, time_slot: str, party_size: int):
    """Find available tables for given date, time, and party size."""
    suitable_tables = [t for t in tables if t["capacity"] >= party_size]
    booked_table_numbers = [
        r["table_number"] for r in reservations 
        if r["date"] == date and r["time_slot"] == time_slot and r["status"] == "active"
    ]
    return [t for t in suitable_tables if t["number"] not in booked_table_numbers]

# ============ TOOLS ============

@mcp.tool()
def check_availability(date: str, time_slot: str, party_size: int) -> str:
    """Check available tables for a specific date, time slot, and party size.
    
    Args:
        date: Date in YYYY-MM-DD format (e.g., 2025-11-15)
        time_slot: Time slot in HH:MM format (e.g., 19:00)
        party_size: Number of people in the party (1-10)
    
    Returns:
        Information about available tables or suggestions if none available
    """
    try:
        logger.info(f"Checking availability: {date} at {time_slot} for {party_size} people")
        
        available_tables = get_available_tables(date, time_slot, party_size)
        
        if not available_tables:
            alternatives = [t for t in time_slots if t != time_slot][:5]
            return (f"❌ No tables available for {party_size} people on {date} at {time_slot}.\n\n"
                   f"Try these alternative time slots:\n{', '.join(alternatives)}")
        
        table_list = "\n".join([
            f"  • Table {t['number']} ({t['capacity']} seats, {t['location']})"
            for t in available_tables
        ])
        
        return (f"✅ {len(available_tables)} table(s) available for {party_size} people "
               f"on {date} at {time_slot}:\n\n{table_list}")
    
    except Exception as e:
        logger.error(f"Error checking availability: {str(e)}")
        return f"Error checking availability: {str(e)}"


@mcp.tool()
def book_table(
    customer_name: str,
    date: str,
    time_slot: str,
    party_size: int,
    contact_phone: Optional[str] = ""
) -> str:
    """Create a new table reservation.
    
    Args:
        customer_name: Customer name (minimum 2 characters)
        date: Date in YYYY-MM-DD format (e.g., 2025-11-15)
        time_slot: Time slot in HH:MM format (e.g., 19:00)
        party_size: Number of people in the party (1-10)
        contact_phone: Contact phone number (optional)
    
    Returns:
        Confirmation with reservation details or error message
    """
    global next_reservation_id
    
    try:
        logger.info(f"Booking request: {customer_name}, {date} at {time_slot}, party of {party_size}")
        
        # Validate time slot
        if time_slot not in time_slots:
            return f"❌ Invalid time slot. Available: {', '.join(time_slots)}"
        
        # Check availability
        available_tables = get_available_tables(date, time_slot, party_size)
        
        if not available_tables:
            return (f"❌ Sorry, no tables available for {party_size} people on {date} "
                   f"at {time_slot}.\n\nPlease check availability first or try a different time slot.")
        
        # Book the first available table
        selected_table = available_tables[0]
        reservation_id = f"RES{str(next_reservation_id).zfill(4)}"
        next_reservation_id += 1
        
        new_reservation = {
            "id": reservation_id,
            "table_number": selected_table["number"],
            "customer_name": customer_name,
            "date": date,
            "time_slot": time_slot,
            "party_size": party_size,
            "status": "active",
            "contact_phone": contact_phone,
            "created_at": datetime.now().isoformat()
        }
        
        reservations.append(new_reservation)
        logger.info(f"Reservation created: {reservation_id}")
        
        result = (f"✅ Reservation confirmed!\n\n"
                 f"Reservation ID: {reservation_id}\n"
                 f"Customer: {customer_name}\n"
                 f"Table: {selected_table['number']} ({selected_table['capacity']} seats, {selected_table['location']})\n"
                 f"Date: {date}\n"
                 f"Time: {time_slot}\n"
                 f"Party Size: {party_size}")
        
        if contact_phone:
            result += f"\nContact: {contact_phone}"
        
        result += "\n\nPlease save your reservation ID for future reference."
        
        return result
    
    except Exception as e:
        logger.error(f"Error booking table: {str(e)}")
        return f"Error creating reservation: {str(e)}"


@mcp.tool()
def cancel_reservation(reservation_id: str) -> str:
    """Cancel an existing table reservation.
    
    Args:
        reservation_id: The reservation ID to cancel (e.g., RES0001)
    
    Returns:
        Confirmation of cancellation or error message
    """
    try:
        logger.info(f"Cancellation request: {reservation_id}")
        
        reservation = next((r for r in reservations if r["id"] == reservation_id), None)
        
        if not reservation:
            return f"❌ Reservation {reservation_id} not found.\n\nPlease check the reservation ID and try again."
        
        if reservation["status"] == "cancelled":
            return f"❌ Reservation {reservation_id} is already cancelled."
        
        reservation["status"] = "cancelled"
        logger.info(f"Reservation cancelled: {reservation_id}")
        
        return (f"✅ Reservation cancelled successfully!\n\n"
               f"Reservation ID: {reservation_id}\n"
               f"Customer: {reservation['customer_name']}\n"
               f"Original booking: {reservation['date']} at {reservation['time_slot']}\n"
               f"Table {reservation['table_number']} is now available.")
    
    except Exception as e:
        logger.error(f"Error cancelling reservation: {str(e)}")
        return f"Error cancelling reservation: {str(e)}"


@mcp.tool()
def view_reservations(date: Optional[str] = "", status: str = "all") -> str:
    """View all reservations with optional filtering by date or status.
    
    Args:
        date: Filter by date in YYYY-MM-DD format (optional)
        status: Filter by status: 'active', 'cancelled', or 'all' (default: 'all')
    
    Returns:
        List of reservations matching the criteria
    """
    try:
        logger.info(f"View reservations: date={date}, status={status}")
        
        filtered = reservations.copy()
        
        # Apply filters
        if date:
            filtered = [r for r in filtered if r["date"] == date]
        
        if status != "all":
            filtered = [r for r in filtered if r["status"] == status]
        
        if not filtered:
            return (f"📋 No reservations found"
                   f"{' for ' + date if date else ''}"
                   f"{' with status: ' + status if status != 'all' else ''}.\n\n"
                   f"Total reservations in system: {len(reservations)}")
        
        # Sort by date and time
        filtered.sort(key=lambda r: (r["date"], r["time_slot"]))
        
        result_lines = [
            f"{i+1}. [{r['id']}] {r['customer_name']} - Table {r['table_number']} | "
            f"{r['date']} at {r['time_slot']} | Party of {r['party_size']} | "
            f"{r['status'].upper()}"
            for i, r in enumerate(filtered)
        ]
        
        return (f"📋 Found {len(filtered)} reservation(s)"
               f"{' for ' + date if date else ''}"
               f"{' (' + status + ')' if status != 'all' else ''}:\n\n"
               + "\n".join(result_lines))
    
    except Exception as e:
        logger.error(f"Error viewing reservations: {str(e)}")
        return f"Error viewing reservations: {str(e)}"


@mcp.tool()
def get_available_timeslots(date: str, party_size: int) -> str:
    """Get all available time slots for a specific date and party size.
    
    Args:
        date: Date in YYYY-MM-DD format (e.g., 2025-11-15)
        party_size: Number of people (1-10)
    
    Returns:
        List of available time slots
    """
    try:
        logger.info(f"Getting available slots: {date} for {party_size} people")
        
        available_slots = [
            slot for slot in time_slots
            if len(get_available_tables(date, slot, party_size)) > 0
        ]
        
        if not available_slots:
            return (f"❌ No available time slots for {party_size} people on {date}.\n\n"
                   f"The restaurant is fully booked for this date.")
        
        return (f"✅ Available time slots for {party_size} people on {date}:\n\n"
               f"{', '.join(available_slots)}\n\n"
               f"Total: {len(available_slots)} slots available")
    
    except Exception as e:
        logger.error(f"Error getting timeslots: {str(e)}")
        return f"Error getting available timeslots: {str(e)}"


# ============ RESOURCES ============

@mcp.resource("restaurant://info")
def restaurant_info() -> str:
    """Get restaurant information and operating details."""
    return """Restaurant Information:
- Name: FastMCP Restaurant
- Tables: 6 (capacities: 2, 2, 4, 4, 6, 8 people)
- Locations: Window, Main Hall, Private
- Operating Hours: 11:00 AM - 9:00 PM
- Time Slots: Every 30 minutes
- Current Reservations: """ + str(len([r for r in reservations if r["status"] == "active"]))


# ============ RUN SERVER ============

if __name__ == "__main__":
    # Run with STDIO transport for Claude Desktop
    mcp.run(transport="stdio")
