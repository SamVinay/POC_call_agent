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

from models import init_db, SessionLocal, Call, Appointment
from call_manager import CallManager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

call_manager: Optional[CallManager] = None


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


# =============================================================================
# Dashboard
# =============================================================================

@app.get("/api/dashboard/stats")
async def get_dashboard_stats():
    """Get dashboard statistics."""
    return CallManager.get_dashboard_stats()


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
