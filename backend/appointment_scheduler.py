"""
Appointment Scheduler - Handles availability checking, slot management,
conflict detection, and appointment CRUD operations.
"""

import os
import logging
from datetime import date, time, datetime, timedelta
from typing import Optional

import yaml
from sqlalchemy import and_

from models import Appointment, SessionLocal

logger = logging.getLogger(__name__)

CONFIG_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config")


class AppointmentScheduler:
    """Manages appointment scheduling, availability, and conflicts."""

    def __init__(self):
        self.config = self._load_config()
        self.appointment_settings = self.config.get("appointment_settings", {})
        self.hours = self.config.get("hours", {})
        self.services = {s["name"]: s for s in self.config.get("services", [])}
        logger.info("✅ Appointment Scheduler initialized")

    def _load_config(self) -> dict:
        path = os.path.join(CONFIG_DIR, "business_info.yaml")
        with open(path, "r") as f:
            return yaml.safe_load(f)

    @property
    def slot_duration(self) -> int:
        return self.appointment_settings.get("slot_duration_minutes", 60)

    @property
    def max_per_day(self) -> int:
        return self.appointment_settings.get("max_appointments_per_day", 8)

    @property
    def buffer_minutes(self) -> int:
        return self.appointment_settings.get("buffer_between_appointments_minutes", 15)

    @property
    def booking_advance_days(self) -> int:
        return self.appointment_settings.get("booking_advance_days", 30)

    def get_business_hours(self, target_date: date) -> Optional[dict]:
        """Get business hours for a specific date. Returns None if closed."""
        day_name = target_date.strftime("%A").lower()
        day_hours = self.hours.get(day_name, "closed")
        if day_hours == "closed":
            return None
        return day_hours

    def generate_time_slots(self, target_date: date) -> list[dict]:
        """Generate all possible time slots for a given date."""
        hours = self.get_business_hours(target_date)
        if not hours:
            return []

        open_time = datetime.strptime(hours["open"], "%H:%M").time()
        close_time = datetime.strptime(hours["close"], "%H:%M").time()

        slots = []
        current = datetime.combine(target_date, open_time)
        end = datetime.combine(target_date, close_time)

        while current + timedelta(minutes=self.slot_duration) <= end:
            slot_start = current.time()
            slot_end = (current + timedelta(minutes=self.slot_duration)).time()
            slots.append({
                "start": slot_start.strftime("%H:%M"),
                "end": slot_end.strftime("%H:%M"),
                "available": True,
            })
            current += timedelta(minutes=self.slot_duration + self.buffer_minutes)

        return slots

    def get_booked_slots(self, target_date: date) -> list[dict]:
        """Get all booked appointment slots for a date."""
        db = SessionLocal()
        try:
            appointments = (
                db.query(Appointment)
                .filter(
                    and_(
                        Appointment.appointment_date == target_date,
                        Appointment.status.in_(["scheduled", "confirmed"]),
                    )
                )
                .all()
            )
            return [
                {
                    "id": a.id,
                    "start": a.appointment_time.strftime("%H:%M"),
                    "end": (
                        datetime.combine(target_date, a.appointment_time)
                        + timedelta(minutes=a.duration_minutes)
                    ).time().strftime("%H:%M"),
                    "customer_name": a.customer_name,
                    "service": a.service_requested,
                    "duration": a.duration_minutes,
                }
                for a in appointments
            ]
        finally:
            db.close()

    def get_available_slots(self, target_date: date) -> list[dict]:
        """Get available time slots for a date (excludes booked)."""
        all_slots = self.generate_time_slots(target_date)
        booked = self.get_booked_slots(target_date)

        booked_times = set()
        for b in booked:
            booked_times.add(b["start"])

        for slot in all_slots:
            if slot["start"] in booked_times:
                slot["available"] = False

        return all_slots

    def check_slot_available(
        self, target_date: date, target_time: time, duration_minutes: int = 60
    ) -> dict:
        """Check if a specific slot is available."""
        # Check business hours
        hours = self.get_business_hours(target_date)
        if not hours:
            return {"available": False, "reason": "Business is closed on this day"}

        open_time = datetime.strptime(hours["open"], "%H:%M").time()
        close_time = datetime.strptime(hours["close"], "%H:%M").time()

        if target_time < open_time or target_time >= close_time:
            return {
                "available": False,
                "reason": f"Outside business hours ({hours['open']} - {hours['close']})",
            }

        # Check end time within hours
        end_dt = datetime.combine(target_date, target_time) + timedelta(
            minutes=duration_minutes
        )
        if end_dt.time() > close_time:
            return {
                "available": False,
                "reason": "Appointment would extend past closing time",
            }

        # Check max appointments per day
        booked = self.get_booked_slots(target_date)
        if len(booked) >= self.max_per_day:
            return {
                "available": False,
                "reason": f"Maximum appointments ({self.max_per_day}) reached for this day",
            }

        # Check for conflicts with buffer
        req_start = datetime.combine(target_date, target_time)
        req_end = req_start + timedelta(minutes=duration_minutes)

        for b in booked:
            b_start = datetime.combine(
                target_date, datetime.strptime(b["start"], "%H:%M").time()
            )
            b_end = datetime.combine(
                target_date, datetime.strptime(b["end"], "%H:%M").time()
            )
            # Add buffer
            b_start_buffered = b_start - timedelta(minutes=self.buffer_minutes)
            b_end_buffered = b_end + timedelta(minutes=self.buffer_minutes)

            if req_start < b_end_buffered and req_end > b_start_buffered:
                return {
                    "available": False,
                    "reason": f"Conflicts with existing appointment at {b['start']} ({b['customer_name']})",
                }

        # Check booking advance limit
        today = date.today()
        max_date = today + timedelta(days=self.booking_advance_days)
        if target_date > max_date:
            return {
                "available": False,
                "reason": f"Cannot book more than {self.booking_advance_days} days in advance",
            }

        if target_date < today:
            return {"available": False, "reason": "Cannot book in the past"}

        return {"available": True, "reason": "Slot is available"}

    def create_appointment(
        self,
        customer_name: str,
        appointment_date: date,
        appointment_time: time,
        customer_phone: Optional[str] = None,
        customer_email: Optional[str] = None,
        service_requested: Optional[str] = None,
        duration_minutes: Optional[int] = None,
        notes: Optional[str] = None,
        call_id: Optional[str] = None,
    ) -> dict:
        """Create a new appointment after checking availability."""
        duration = duration_minutes or self.slot_duration

        # Check availability
        availability = self.check_slot_available(
            appointment_date, appointment_time, duration
        )
        if not availability["available"]:
            return {"success": False, "error": availability["reason"]}

        db = SessionLocal()
        try:
            appt = Appointment(
                call_id=call_id,
                customer_name=customer_name,
                customer_phone=customer_phone,
                customer_email=customer_email,
                service_requested=service_requested,
                appointment_date=appointment_date,
                appointment_time=appointment_time,
                duration_minutes=duration,
                notes=notes,
                status="scheduled",
            )
            db.add(appt)
            db.commit()
            db.refresh(appt)
            logger.info(
                f"📅 Appointment created: {customer_name} on "
                f"{appointment_date} at {appointment_time}"
            )
            return {"success": True, "appointment": appt.to_dict()}
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to create appointment: {e}")
            return {"success": False, "error": str(e)}
        finally:
            db.close()

    def reschedule_appointment(
        self,
        appointment_id: int,
        new_date: date,
        new_time: time,
        new_duration: Optional[int] = None,
    ) -> dict:
        """Reschedule an existing appointment."""
        db = SessionLocal()
        try:
            appt = db.query(Appointment).filter(Appointment.id == appointment_id).first()
            if not appt:
                return {"success": False, "error": "Appointment not found"}

            if appt.status in ("cancelled", "completed", "no_show"):
                return {
                    "success": False,
                    "error": f"Cannot reschedule a {appt.status} appointment",
                }

            duration = new_duration or appt.duration_minutes
            availability = self.check_slot_available(new_date, new_time, duration)
            if not availability["available"]:
                return {"success": False, "error": availability["reason"]}

            old_date = appt.appointment_date
            old_time = appt.appointment_time
            appt.appointment_date = new_date
            appt.appointment_time = new_time
            appt.duration_minutes = duration
            appt.updated_at = datetime.utcnow()
            appt.notes = (appt.notes or "") + (
                f"\nRescheduled from {old_date} {old_time} on "
                f"{datetime.utcnow().strftime('%Y-%m-%d %H:%M')}"
            )

            db.commit()
            db.refresh(appt)
            logger.info(
                f"📅 Appointment {appointment_id} rescheduled to "
                f"{new_date} at {new_time}"
            )
            return {"success": True, "appointment": appt.to_dict()}
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to reschedule appointment: {e}")
            return {"success": False, "error": str(e)}
        finally:
            db.close()

    def delete_appointment(self, appointment_id: int) -> dict:
        """Delete (cancel) an appointment."""
        db = SessionLocal()
        try:
            appt = db.query(Appointment).filter(Appointment.id == appointment_id).first()
            if not appt:
                return {"success": False, "error": "Appointment not found"}

            db.delete(appt)
            db.commit()
            logger.info(f"🗑️ Appointment {appointment_id} deleted")
            return {"success": True}
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to delete appointment: {e}")
            return {"success": False, "error": str(e)}
        finally:
            db.close()

    def get_week_availability(self, start_date: date) -> list[dict]:
        """Get availability for an entire week starting from start_date."""
        week = []
        for i in range(7):
            day = start_date + timedelta(days=i)
            hours = self.get_business_hours(day)
            slots = self.get_available_slots(day)
            available_count = sum(1 for s in slots if s["available"])
            booked_count = sum(1 for s in slots if not s["available"])

            week.append({
                "date": day.isoformat(),
                "day_name": day.strftime("%A"),
                "is_open": hours is not None,
                "hours": hours,
                "total_slots": len(slots),
                "available_slots": available_count,
                "booked_slots": booked_count,
                "slots": slots,
            })
        return week

    def get_services_list(self) -> list[dict]:
        """Get available services for appointment booking."""
        return self.config.get("services", [])
