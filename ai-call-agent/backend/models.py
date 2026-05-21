"""
Database models for the AI Call Answering Agent.
Uses SQLAlchemy ORM with SQLite backend.
"""

import os
from datetime import datetime, date, time
from typing import Optional, List

from sqlalchemy import (
    create_engine, Column, Integer, String, Text, Float,
    Boolean, DateTime, Date, Time, ForeignKey, Index, event
)
from sqlalchemy.orm import (
    DeclarativeBase, Session, sessionmaker, relationship, Mapped, mapped_column
)


DATABASE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "database")
DATABASE_PATH = os.path.join(DATABASE_DIR, "call_agent.db")
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

os.makedirs(DATABASE_DIR, exist_ok=True)

engine = create_engine(DATABASE_URL, echo=False, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class Call(Base):
    __tablename__ = "calls"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    call_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    caller_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    caller_phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    caller_email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    transcript: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    urgency: Mapped[str] = mapped_column(String, default="LOW")
    urgency_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    urgency_reason: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="active")
    owner_notified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    messages: Mapped[List["ConversationMessage"]] = relationship(
        back_populates="call", cascade="all, delete-orphan"
    )
    appointments: Mapped[List["Appointment"]] = relationship(
        back_populates="call", cascade="all, delete-orphan"
    )

    def to_dict(self):
        return {
            "id": self.id,
            "call_id": self.call_id,
            "caller_name": self.caller_name,
            "caller_phone": self.caller_phone,
            "caller_email": self.caller_email,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "duration_seconds": self.duration_seconds,
            "transcript": self.transcript,
            "summary": self.summary,
            "urgency": self.urgency,
            "urgency_confidence": self.urgency_confidence,
            "urgency_reason": self.urgency_reason,
            "status": self.status,
            "owner_notified": self.owner_notified,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    call_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("calls.call_id"), nullable=True
    )
    customer_name: Mapped[str] = mapped_column(String, nullable=False)
    customer_phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    customer_email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    service_requested: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    appointment_date: Mapped[date] = mapped_column(Date, nullable=False)
    appointment_time: Mapped[time] = mapped_column(Time, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60)
    status: Mapped[str] = mapped_column(String, default="scheduled")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    call: Mapped[Optional["Call"]] = relationship(back_populates="appointments")

    def to_dict(self):
        return {
            "id": self.id,
            "call_id": self.call_id,
            "customer_name": self.customer_name,
            "customer_phone": self.customer_phone,
            "customer_email": self.customer_email,
            "service_requested": self.service_requested,
            "appointment_date": self.appointment_date.isoformat() if self.appointment_date else None,
            "appointment_time": self.appointment_time.isoformat() if self.appointment_time else None,
            "duration_minutes": self.duration_minutes,
            "status": self.status,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    call_id: Mapped[str] = mapped_column(
        String, ForeignKey("calls.call_id"), nullable=False
    )
    role: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    audio_file_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    call: Mapped["Call"] = relationship(back_populates="messages")

    def to_dict(self):
        return {
            "id": self.id,
            "call_id": self.call_id,
            "role": self.role,
            "content": self.content,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
        }


def init_db():
    """Create all database tables."""
    Base.metadata.create_all(bind=engine)


def get_db() -> Session:
    """Get a database session (for FastAPI dependency injection)."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
