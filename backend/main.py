"""
AI Call Answering Agent - FastAPI Backend Server
Provides REST API and WebSocket endpoints for the call agent system.
"""

import base64
import json
import logging
import os
import sys
from contextlib import asynccontextmanager
from datetime import date, datetime
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from models import init_db, SessionLocal, Call, Appointment, ConversationMessage
from call_manager import CallManager
from appointment_scheduler import AppointmentScheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

call_manager: Optional[CallManager] = None
appointment_scheduler: Optional[AppointmentScheduler] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown."""
    global call_manager
    logger.info("🚀 Starting AI Call Agent Backend...")
    init_db()
    logger.info("✅ Database initialized")

    try:
        call_manager = CallManager()
        logger.info("✅ Call Manager ready")
    except Exception as e:
        logger.error(f"⚠️ Call Manager init failed: {e}")
        logger.info("Server running in limited mode (text-only, no voice)")
        call_manager = None

    global appointment_scheduler
    try:
        appointment_scheduler = AppointmentScheduler()
        logger.info("✅ Appointment Scheduler ready")
    except Exception as e:
        logger.error(f"⚠️ Appointment Scheduler init failed: {e}")
        appointment_scheduler = None

    yield

    logger.info("👋 Shutting down AI Call Agent Backend...")


app = FastAPI(
    title="AI Call Answering Agent",
    description="AI-powered call answering system for small businesses",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Health Check
# =============================================================================

@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "call_manager_ready": call_manager is not None,
        "timestamp": datetime.utcnow().isoformat(),
    }


# =============================================================================
# Call Management REST API
# =============================================================================

@app.post("/api/calls/start")
async def start_call():
    """Start a new call session."""
    if call_manager is None:
        raise HTTPException(status_code=503, detail="Call manager not initialized")

    result = await call_manager.start_call()

    # Convert audio to base64 for JSON transport
    response = {
        "call_id": result["call_id"],
        "greeting": result["greeting"],
        "status": result["status"],
    }
    if result.get("greeting_audio"):
        response["greeting_audio_b64"] = base64.b64encode(
            result["greeting_audio"]
        ).decode("utf-8")

    return response


@app.post("/api/calls/{call_id}/message")
async def send_text_message(call_id: str, payload: dict):
    """Send a text message to the agent (for text-based testing)."""
    if call_manager is None:
        raise HTTPException(status_code=503, detail="Call manager not initialized")

    text = payload.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text message required")

    result = await call_manager.process_caller_text(call_id, text)

    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])

    response = {
        "call_id": result["call_id"],
        "caller_text": result["caller_text"],
        "response_text": result["response_text"],
        "urgency": result["urgency"],
        "status": result["status"],
    }
    if result.get("response_audio"):
        response["response_audio_b64"] = base64.b64encode(
            result["response_audio"]
        ).decode("utf-8")

    return response


@app.post("/api/calls/{call_id}/end")
async def end_call(call_id: str):
    """End an active call."""
    if call_manager is None:
        raise HTTPException(status_code=503, detail="Call manager not initialized")

    result = await call_manager.end_call(call_id)

    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])

    return result


@app.get("/api/calls/active")
async def get_active_calls():
    """Get all currently active calls."""
    if call_manager is None:
        return {"calls": []}
    return {"calls": call_manager.get_active_calls()}


@app.get("/api/calls/history")
async def get_call_history(
    limit: int = Query(default=50, ge=1, le=200),
    urgency: Optional[str] = Query(default=None),
):
    """Get completed call history."""
    calls = CallManager.get_call_history(limit=limit, urgency_filter=urgency)
    return {"calls": calls, "total": len(calls)}


@app.get("/api/calls/{call_id}")
async def get_call_detail(call_id: str):
    """Get details of a specific call."""
    db = SessionLocal()
    try:
        call = db.query(Call).filter(Call.call_id == call_id).first()
        if not call:
            raise HTTPException(status_code=404, detail="Call not found")
        return call.to_dict()
    finally:
        db.close()


# =============================================================================
# Appointment REST API
# =============================================================================

@app.get("/api/appointments")
async def get_appointments(
    from_date: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
):
    """Get appointments list."""
    parsed_date = None
    if from_date:
        try:
            parsed_date = date.fromisoformat(from_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format")

    appointments = CallManager.get_appointments(
        from_date=parsed_date, status_filter=status
    )
    return {"appointments": appointments, "total": len(appointments)}


@app.post("/api/appointments")
async def create_appointment(payload: dict):
    """Create a new appointment manually."""
    if appointment_scheduler is None:
        raise HTTPException(status_code=503, detail="Appointment scheduler not initialized")

    required = ["customer_name", "appointment_date", "appointment_time"]
    for field in required:
        if field not in payload or not payload[field]:
            raise HTTPException(status_code=400, detail=f"Missing required field: {field}")

    try:
        appt_date = date.fromisoformat(payload["appointment_date"])
        appt_time_str = payload["appointment_time"]
        # Handle HH:MM format
        parts = appt_time_str.split(":")
        from datetime import time as dt_time
        appt_time = dt_time(int(parts[0]), int(parts[1]))
    except (ValueError, IndexError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid date/time format: {e}")

    result = appointment_scheduler.create_appointment(
        customer_name=payload["customer_name"],
        appointment_date=appt_date,
        appointment_time=appt_time,
        customer_phone=payload.get("customer_phone"),
        customer_email=payload.get("customer_email"),
        service_requested=payload.get("service_requested"),
        duration_minutes=payload.get("duration_minutes"),
        notes=payload.get("notes"),
        call_id=payload.get("call_id"),
    )

    if not result["success"]:
        raise HTTPException(status_code=409, detail=result["error"])

    return result


@app.patch("/api/appointments/{appointment_id}")
async def update_appointment(appointment_id: int, payload: dict):
    """Update an appointment status."""
    db = SessionLocal()
    try:
        appt = db.query(Appointment).filter(Appointment.id == appointment_id).first()
        if not appt:
            raise HTTPException(status_code=404, detail="Appointment not found")

        if "status" in payload:
            appt.status = payload["status"]
        if "notes" in payload:
            appt.notes = payload["notes"]
        appt.updated_at = datetime.utcnow()

        db.commit()
        db.refresh(appt)
        return appt.to_dict()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.put("/api/appointments/{appointment_id}/reschedule")
async def reschedule_appointment(appointment_id: int, payload: dict):
    """Reschedule an existing appointment."""
    if appointment_scheduler is None:
        raise HTTPException(status_code=503, detail="Appointment scheduler not initialized")

    if "new_date" not in payload or "new_time" not in payload:
        raise HTTPException(status_code=400, detail="new_date and new_time are required")

    try:
        new_date = date.fromisoformat(payload["new_date"])
        parts = payload["new_time"].split(":")
        from datetime import time as dt_time
        new_time = dt_time(int(parts[0]), int(parts[1]))
    except (ValueError, IndexError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid date/time format: {e}")

    result = appointment_scheduler.reschedule_appointment(
        appointment_id=appointment_id,
        new_date=new_date,
        new_time=new_time,
        new_duration=payload.get("duration_minutes"),
    )

    if not result["success"]:
        raise HTTPException(status_code=409, detail=result["error"])

    return result


@app.delete("/api/appointments/{appointment_id}")
async def delete_appointment(appointment_id: int):
    """Delete an appointment."""
    if appointment_scheduler is None:
        raise HTTPException(status_code=503, detail="Appointment scheduler not initialized")

    result = appointment_scheduler.delete_appointment(appointment_id)
    if not result["success"]:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@app.get("/api/appointments/availability")
async def get_availability(
    target_date: Optional[str] = Query(default=None),
    week_start: Optional[str] = Query(default=None),
):
    """Get available appointment slots for a date or a week."""
    if appointment_scheduler is None:
        raise HTTPException(status_code=503, detail="Appointment scheduler not initialized")

    if week_start:
        try:
            start = date.fromisoformat(week_start)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid week_start date format")
        return {"week": appointment_scheduler.get_week_availability(start)}

    if target_date:
        try:
            d = date.fromisoformat(target_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid target_date format")
        slots = appointment_scheduler.get_available_slots(d)
        booked = appointment_scheduler.get_booked_slots(d)
        hours = appointment_scheduler.get_business_hours(d)
        return {
            "date": d.isoformat(),
            "is_open": hours is not None,
            "hours": hours,
            "slots": slots,
            "booked": booked,
        }

    # Default: return current week
    today = date.today()
    return {"week": appointment_scheduler.get_week_availability(today)}


@app.get("/api/services")
async def get_services():
    """Get available business services."""
    if appointment_scheduler is None:
        raise HTTPException(status_code=503, detail="Appointment scheduler not initialized")
    return {"services": appointment_scheduler.get_services_list()}


# =============================================================================
# Dashboard
# =============================================================================

@app.get("/api/dashboard/stats")
async def get_dashboard_stats():
    """Get dashboard statistics."""
    return CallManager.get_dashboard_stats()


@app.get("/api/calls/{call_id}/messages")
async def get_call_messages(call_id: str):
    """Get all messages for a specific call."""
    db = SessionLocal()
    try:
        messages = (
            db.query(ConversationMessage)
            .filter(ConversationMessage.call_id == call_id)
            .order_by(ConversationMessage.timestamp)
            .all()
        )
        return {"messages": [m.to_dict() for m in messages]}
    finally:
        db.close()


# =============================================================================
# Business Config API
# =============================================================================

@app.get("/api/config/business")
async def get_business_config():
    """Get current business configuration."""
    import yaml
    config_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)), "config", "business_info.yaml"
    )
    try:
        with open(config_path, "r") as f:
            config = yaml.safe_load(f)
        return config
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/config/business")
async def update_business_config(payload: dict):
    """Update business configuration."""
    import yaml
    config_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)), "config", "business_info.yaml"
    )
    try:
        with open(config_path, "w") as f:
            yaml.dump(payload, f, default_flow_style=False, sort_keys=False)
        return {"success": True, "message": "Configuration updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# WebSocket for Real-Time Voice Calls
# =============================================================================

@app.websocket("/ws/call/{call_id}")
async def websocket_call(websocket: WebSocket, call_id: str):
    """
    WebSocket endpoint for real-time voice calls.
    
    Protocol:
    - Client sends: {"type": "audio", "data": "<base64-encoded-audio>", "sample_rate": 16000}
    - Client sends: {"type": "text", "data": "text message"}
    - Client sends: {"type": "end_call"}
    - Server responds: {"type": "response", "text": "...", "audio": "<base64>", "urgency": {...}}
    - Server responds: {"type": "transcript", "text": "caller said..."}
    - Server responds: {"type": "call_ended", "summary": {...}}
    """
    if call_manager is None:
        await websocket.close(code=1013, reason="Call manager not available")
        return

    await websocket.accept()
    logger.info(f"🔌 WebSocket connected for call: {call_id}")

    active_call = call_manager.active_calls.get(call_id)
    if not active_call:
        await websocket.send_json({"type": "error", "message": "Call not found"})
        await websocket.close()
        return

    try:
        while True:
            raw = await websocket.receive_text()
            message = json.loads(raw)
            msg_type = message.get("type")

            if msg_type == "audio":
                # Decode base64 audio
                audio_bytes = base64.b64decode(message["data"])
                sample_rate = message.get("sample_rate", 16000)

                result = await call_manager.process_caller_audio(
                    call_id, audio_bytes, sample_rate
                )

                # Send transcript of what caller said
                if result.get("caller_text"):
                    await websocket.send_json({
                        "type": "transcript",
                        "role": "caller",
                        "text": result["caller_text"],
                    })

                # Send agent response
                if result.get("response_text"):
                    response_msg = {
                        "type": "response",
                        "text": result["response_text"],
                        "urgency": result.get("urgency"),
                    }
                    if result.get("response_audio"):
                        response_msg["audio"] = base64.b64encode(
                            result["response_audio"]
                        ).decode("utf-8")
                    await websocket.send_json(response_msg)

            elif msg_type == "text":
                # Text-based message (for testing without voice)
                text = message.get("data", "").strip()
                if text:
                    result = await call_manager.process_caller_text(call_id, text)

                    if result.get("response_text"):
                        response_msg = {
                            "type": "response",
                            "text": result["response_text"],
                            "urgency": result.get("urgency"),
                        }
                        if result.get("response_audio"):
                            response_msg["audio"] = base64.b64encode(
                                result["response_audio"]
                            ).decode("utf-8")
                        await websocket.send_json(response_msg)

            elif msg_type == "end_call":
                result = await call_manager.end_call(call_id)
                await websocket.send_json({
                    "type": "call_ended",
                    "summary": result.get("summary"),
                    "urgency": result.get("urgency"),
                    "appointment": result.get("appointment"),
                    "duration_seconds": result.get("duration_seconds"),
                })
                break

    except WebSocketDisconnect:
        logger.info(f"🔌 WebSocket disconnected: {call_id}")
        if call_id in call_manager.active_calls:
            await call_manager.end_call(call_id)
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON from WebSocket: {e}")
        await websocket.send_json({"type": "error", "message": "Invalid JSON"})
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await websocket.send_json({"type": "error", "message": str(e)})
    finally:
        logger.info(f"🔌 WebSocket closed: {call_id}")


# =============================================================================
# Entry point
# =============================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
