from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
import random
import json
from datetime import datetime
import os  # For env vars if needed
import logging
# Vercel serverless wrapper
from mangum import Mangum  # Install: pip install mangum

app = FastAPI(title="Reservation Tool Server", description="AI-callable reservation APIs")

class AvailabilityRequest(BaseModel):
    restaurant_id: str
    date: str
    party_size: int

class BookingRequest(BaseModel):
    restaurant_id: str
    date: str
    party_size: int
    user_name: str
    user_email: str

times = ["18:00", "19:00", "20:00", "21:00"]

@app.post("/tools/check_availability")
async def check_availability(req: AvailabilityRequest):
    slots = random.sample(times, random.randint(0, 4))
    result = {
        "restaurant_id": req.restaurant_id,
        "date": req.date,
        "party_size": req.party_size,
        "available_slots": slots,
        "message": "Tables available!" if slots else "No tables available."
    }
    return result

@app.post("/tools/book_table")
async def book_table(req: BookingRequest):
    if random.random() < 0.8:
        booking_id = f"BOOK-{datetime.now().strftime('%Y%m%d%H%M%S')}-{random.randint(1000, 9999)}"
        return {"booking_id": booking_id, "confirmation": f"Booked for {req.user_name}!"}
    raise HTTPException(status_code=400, detail="Booking failed.")

@app.post("/tools/cancel_reservation")
async def cancel_reservation(booking_id: str):
    return {"booking_id": booking_id, "status": "Cancelled"}

@app.post("/tools/make_payment")
async def make_payment(booking_id: str, amount: float):
    success = random.random() < 0.9
    txn_id = f"TXN-{datetime.now().strftime('%Y%m%d%H%M%S')}-{random.randint(10000, 99999)}" if success else None
    return {"booking_id": booking_id, "amount": amount, "status": "Success" if success else "Failed", "txn_id": txn_id}

@app.get("/")
async def root():
    return {"msg": "Server up! POST to /tools/{name}."}


logging.basicConfig(level=logging.DEBUG)
print("App startup: Imports successful")  # Logs to Vercel console

# Vercel handler: Wraps FastAPI for serverless
handler = Mangum(app)