"""
Call Manager - Orchestrates the full lifecycle of a call.
Coordinates between voice handling, AI engine, urgency classification,
appointment scheduling, and database persistence.
"""

import uuid
import logging
from datetime import datetime, date, time, timedelta
from typing import Optional

from models import Call, Appointment, ConversationMessage, SessionLocal
from ai_engine import AIEngine
from voice_handler import VoiceHandler
from urgency_classifier import UrgencyClassifier

logger = logging.getLogger(__name__)


class ActiveCall:
    """Represents an in-progress call with its state."""

    def __init__(self, call_id: str):
        self.call_id = call_id
        self.started_at = datetime.utcnow()
        self.conversation_history: list[dict] = []
        self.caller_name: Optional[str] = None
        self.caller_phone: Optional[str] = None
        self.caller_email: Optional[str] = None
        self.urgency: str = "LOW"
        self.appointment_details: Optional[dict] = None
        self.is_active: bool = True

    def add_message(self, role: str, content: str):
        """Add a message to the conversation history."""
        self.conversation_history.append({
            "role": role,
            "content": content,
            "timestamp": datetime.utcnow().isoformat(),
        })

    def get_transcript(self) -> str:
        """Get the full conversation transcript."""
        lines = []
        for msg in self.conversation_history:
            label = "Caller" if msg["role"] == "caller" else "Agent"
            lines.append(f"[{msg['timestamp']}] {label}: {msg['content']}")
        return "\n".join(lines)


class CallManager:
    """Manages all active and completed calls."""

    def __init__(self):
        self.ai_engine = AIEngine()
        self.voice_handler = VoiceHandler(
            stt_model_size="small",
            stt_device="auto",
            tts_voice="en_US-lessac-medium",
        )
        self.urgency_classifier = UrgencyClassifier(ai_engine=self.ai_engine)
        self.active_calls: dict[str, ActiveCall] = {}
        logger.info("✅ Call Manager initialized")

    async def start_call(self) -> dict:
        """Initialize a new call session."""
        call_id = str(uuid.uuid4())
        active_call = ActiveCall(call_id)
        self.active_calls[call_id] = active_call

        # Get greeting
        greeting = self.ai_engine.get_greeting()
        active_call.add_message("assistant", greeting)

        # Generate greeting audio
        greeting_audio = await self.voice_handler.generate_audio_response(greeting)

        # Persist to database
        db = SessionLocal()
        try:
            db_call = Call(
                call_id=call_id,
                started_at=active_call.started_at,
                status="active",
            )
            db.add(db_call)
            db_msg = ConversationMessage(
                call_id=call_id,
                role="assistant",
                content=greeting,
            )
            db.add(db_msg)
            db.commit()
        except Exception as e:
            logger.error(f"DB error on call start: {e}")
            db.rollback()
        finally:
            db.close()

        logger.info(f"📞 New call started: {call_id}")

        return {
            "call_id": call_id,
            "greeting": greeting,
            "greeting_audio": greeting_audio,
            "status": "active",
        }

    async def process_caller_audio(
        self, call_id: str, audio_data: bytes, sample_rate: int = 16000
    ) -> dict:
        """Process incoming audio from the caller."""
        active_call = self.active_calls.get(call_id)
        if not active_call or not active_call.is_active:
            return {"error": "Call not found or inactive"}

        # Step 1: Transcribe audio
        caller_text = await self.voice_handler.process_audio_input(
            audio_data, sample_rate
        )

        if not caller_text.strip():
            return {
                "call_id": call_id,
                "caller_text": "",
                "response_text": "",
                "response_audio": None,
                "status": "waiting",
            }

        return await self.process_caller_text(call_id, caller_text)

    async def process_caller_text(self, call_id: str, caller_text: str) -> dict:
        """Process text input from the caller (for text-based testing or after STT)."""
        active_call = self.active_calls.get(call_id)
        if not active_call or not active_call.is_active:
            return {"error": "Call not found or inactive"}

        # Record caller message
        active_call.add_message("caller", caller_text)

        # Quick urgency scan
        urgency_result = self.urgency_classifier.quick_scan(caller_text)
        if urgency_result["urgency"] in ("CRITICAL", "HIGH"):
            active_call.urgency = urgency_result["urgency"]
            logger.warning(
                f"⚠️ URGENT call detected ({urgency_result['urgency']}): "
                f"{urgency_result['reason']}"
            )

        # Generate AI response
        response_text = await self.ai_engine.generate_response(
            active_call.conversation_history[:-1],  # History without current message
            caller_text,
        )
        active_call.add_message("assistant", response_text)

        # Generate response audio
        response_audio = await self.voice_handler.generate_audio_response(response_text)

        # Persist messages to database
        db = SessionLocal()
        try:
            db.add(ConversationMessage(
                call_id=call_id, role="caller", content=caller_text
            ))
            db.add(ConversationMessage(
                call_id=call_id, role="assistant", content=response_text
            ))
            db.commit()
        except Exception as e:
            logger.error(f"DB error saving messages: {e}")
            db.rollback()
        finally:
            db.close()

        return {
            "call_id": call_id,
            "caller_text": caller_text,
            "response_text": response_text,
            "response_audio": response_audio,
            "urgency": urgency_result,
            "status": "active",
        }

    async def end_call(self, call_id: str) -> dict:
        """End an active call, run final analysis, and persist results."""
        active_call = self.active_calls.get(call_id)
        if not active_call:
            return {"error": "Call not found"}

        active_call.is_active = False
        ended_at = datetime.utcnow()
        duration = int((ended_at - active_call.started_at).total_seconds())

        # Run final urgency analysis with LLM
        urgency_result = await self.urgency_classifier.classify(
            active_call.conversation_history, use_llm=True
        )

        # Extract appointment details
        appointment_data = await self.ai_engine.extract_appointment_details(
            active_call.conversation_history
        )

        # Generate call summary
        summary = await self.ai_engine.summarize_call(
            active_call.conversation_history
        )

        # Persist everything to database
        db = SessionLocal()
        try:
            db_call = db.query(Call).filter(Call.call_id == call_id).first()
            if db_call:
                db_call.ended_at = ended_at
                db_call.duration_seconds = duration
                db_call.transcript = active_call.get_transcript()
                db_call.summary = str(summary)
                db_call.urgency = urgency_result.get("urgency", "LOW")
                db_call.urgency_confidence = urgency_result.get("confidence", 0.0)
                db_call.urgency_reason = urgency_result.get("reason", "")
                db_call.status = "completed"
                db_call.caller_name = summary.get("caller_name")
                db_call.caller_phone = summary.get("caller_phone")
                db_call.owner_notified = self.urgency_classifier.should_escalate(
                    urgency_result
                )

            # Save appointment if extracted
            if appointment_data and appointment_data.get("preferred_date"):
                try:
                    appt_date = date.fromisoformat(appointment_data["preferred_date"])
                    appt_time_str = appointment_data.get("preferred_time", "09:00")
                    appt_time = time.fromisoformat(appt_time_str)

                    appointment = Appointment(
                        call_id=call_id,
                        customer_name=appointment_data.get("customer_name", "Unknown"),
                        customer_phone=appointment_data.get("customer_phone"),
                        customer_email=appointment_data.get("customer_email"),
                        service_requested=appointment_data.get("service_requested"),
                        appointment_date=appt_date,
                        appointment_time=appt_time,
                        notes=appointment_data.get("notes"),
                    )
                    db.add(appointment)
                except (ValueError, TypeError) as e:
                    logger.error(f"Invalid appointment data: {e}")

            db.commit()
        except Exception as e:
            logger.error(f"DB error on call end: {e}")
            db.rollback()
        finally:
            db.close()

        # Remove from active calls
        del self.active_calls[call_id]

        logger.info(
            f"📞 Call ended: {call_id} | Duration: {duration}s | "
            f"Urgency: {urgency_result.get('urgency', 'LOW')}"
        )

        return {
            "call_id": call_id,
            "duration_seconds": duration,
            "urgency": urgency_result,
            "summary": summary,
            "appointment": appointment_data,
            "status": "completed",
        }

    def get_active_calls(self) -> list[dict]:
        """Get list of currently active calls."""
        return [
            {
                "call_id": call.call_id,
                "started_at": call.started_at.isoformat(),
                "message_count": len(call.conversation_history),
                "urgency": call.urgency,
            }
            for call in self.active_calls.values()
        ]

    @staticmethod
    def get_call_history(
        limit: int = 50, urgency_filter: Optional[str] = None
    ) -> list[dict]:
        """Get completed call history from database."""
        db = SessionLocal()
        try:
            query = db.query(Call).filter(Call.status == "completed")
            if urgency_filter:
                query = query.filter(Call.urgency == urgency_filter.upper())
            calls = query.order_by(Call.started_at.desc()).limit(limit).all()
            return [call.to_dict() for call in calls]
        finally:
            db.close()

    @staticmethod
    def get_appointments(
        from_date: Optional[date] = None,
        status_filter: Optional[str] = None,
    ) -> list[dict]:
        """Get appointments from database."""
        db = SessionLocal()
        try:
            query = db.query(Appointment)
            if from_date:
                query = query.filter(Appointment.appointment_date >= from_date)
            if status_filter:
                query = query.filter(Appointment.status == status_filter)
            appointments = (
                query.order_by(Appointment.appointment_date, Appointment.appointment_time)
                .all()
            )
            return [appt.to_dict() for appt in appointments]
        finally:
            db.close()

    @staticmethod
    def get_dashboard_stats() -> dict:
        """Get dashboard statistics."""
        db = SessionLocal()
        try:
            today = date.today()
            total_calls = db.query(Call).count()
            today_calls = (
                db.query(Call)
                .filter(Call.started_at >= datetime.combine(today, time.min))
                .count()
            )
            urgent_calls = (
                db.query(Call)
                .filter(Call.urgency.in_(["HIGH", "CRITICAL"]))
                .filter(Call.owner_notified == False)
                .count()
            )
            upcoming_appointments = (
                db.query(Appointment)
                .filter(Appointment.appointment_date >= today)
                .filter(Appointment.status == "scheduled")
                .count()
            )
            today_appointments = (
                db.query(Appointment)
                .filter(Appointment.appointment_date == today)
                .filter(Appointment.status == "scheduled")
                .count()
            )

            return {
                "total_calls": total_calls,
                "today_calls": today_calls,
                "urgent_unreviewed": urgent_calls,
                "upcoming_appointments": upcoming_appointments,
                "today_appointments": today_appointments,
            }
        finally:
            db.close()
