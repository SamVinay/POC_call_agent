# AI Call Answering Agent for Small Business Owners

A fully open-source AI-powered call answering system running entirely on your local hardware (RTX 4070 GPU), using WebRTC browser calls for POC validation before scaling to real telephony — zero ongoing API costs.

## Architecture Overview

**Fully Open-Source Local Stack:**
- **Frontend**: React web app with WebRTC for browser-based calls
- **Backend**: Python FastAPI server for call orchestration
- **AI Processing**: Local LLaMA 3.1 (8B) running on your RTX 4070 via Ollama
- **Voice Services** (All running locally on GPU):
  - Speech-to-Text: Faster-Whisper (small/medium) — optimized Whisper, <500ms latency
  - Text-to-Speech: Piper TTS — fast neural TTS, natural voice, <300ms latency
- **Storage**: SQLite database for appointments, call logs, and business info
- **Future**: Easy migration to Twilio/VoIP for real phone calls

## Current Implementation Status

> **All core features are implemented and functional.** The POC is complete with full appointment scheduling, call management, and a polished UI.

| Feature | Status |
|---------|--------|
| Business Knowledge Base (YAML config) | ✅ Complete |
| Intelligent Call Handling (LLM + Voice) | ✅ Complete |
| Appointment Scheduling (Full CRUD) | ✅ Complete |
| Availability Checking (Real-time) | ✅ Complete |
| Urgency Assessment (Keyword + LLM) | ✅ Complete |
| Owner Dashboard (Stats + Call Detail) | ✅ Complete |
| Weekly Calendar View | ✅ Complete |
| Manual Appointment Booking UI | ✅ Complete |
| Settings Page (Business Config Editor) | ✅ Complete |
| WebRTC Browser Calls (POC) | ✅ Complete |

## Core Features

### 1. Business Knowledge Base
- YAML configuration file (`config/business_info.yaml`) for business information
- Business hours, services, pricing, FAQs
- Owner contact preferences and availability
- Customizable greeting and conversation style
- **Settings page** to edit configuration directly from the UI

### 2. Intelligent Call Handling
- Real-time speech-to-text transcription via Faster-Whisper
- Local LLM processes conversation context via Ollama
- Natural conversation flow with memory
- Answers common questions about the business
- **Real-time availability injection** — the AI knows which appointment slots are open during conversations

### 3. Appointment Scheduling (Complete)
- **Full CRUD operations**: Create, Read, Update, Delete appointments
- **Availability engine**: Slot generation based on business hours, buffer times, max-per-day limits
- **Conflict detection**: Prevents double-booking with configurable buffer between appointments
- **Reschedule support**: Move existing appointments to new dates/times with validation
- Captures caller information (name, phone, email, service, notes)
- Stores appointments in SQLite with status tracking (scheduled → confirmed → completed / cancelled / no_show)
- **AI-powered booking**: During calls, the LLM uses real-time availability data to suggest open slots
- **Manual booking**: Full form UI with service picker, date picker, and clickable time slot grid

### 4. Urgency Assessment
- LLM analyzes conversation for urgency signals
- Classification: Low, Medium, High, Critical
- **Dual-mode detection**: Quick keyword scan + deep LLM analysis
- Urgency triggers:
  - Emergency keywords (urgent, ASAP, emergency)
  - High-value opportunity detection
  - Existing customer issues
  - Time-sensitive requests

### 5. Owner Dashboard & Notification
- Dashboard with stats: total calls, today's calls, urgent unreviewed, upcoming appointments
- **Call detail modal**: Click any call to view full transcript, summary, and urgency assessment
- Recent calls list with urgency badges
- **Appointment management**: List view + weekly calendar view with List/Calendar toggle
- Filter appointments by status
- **Settings page**: Edit business info, hours, FAQs, and greetings from the UI

## Project Structure

```
ai-call-agent/
├── backend/
│   ├── main.py                    # FastAPI server + all API routes
│   ├── models.py                  # SQLAlchemy ORM models (Call, Appointment, ConversationMessage)
│   ├── ai_engine.py               # Local LLM integration (Ollama) with availability context
│   ├── voice_handler.py           # STT (Faster-Whisper) + TTS (Piper) handler
│   ├── call_manager.py            # Call orchestration + real-time availability injection
│   ├── urgency_classifier.py      # Keyword + LLM urgency detection
│   ├── appointment_scheduler.py   # Availability engine, slot management, conflict detection
│   └── requirements.txt           # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── CallInterface.jsx       # WebRTC call simulator UI
│   │   │   ├── Dashboard.jsx           # Stats dashboard + call detail modal integration
│   │   │   ├── AppointmentList.jsx     # Appointment list/calendar view + booking trigger
│   │   │   ├── AppointmentForm.jsx     # Manual appointment booking modal with slot picker
│   │   │   ├── AppointmentCalendar.jsx # Weekly calendar view with hour-by-hour grid
│   │   │   ├── CallDetailModal.jsx     # Call transcript + summary modal
│   │   │   └── SettingsPage.jsx        # Business configuration editor UI
│   │   ├── services/
│   │   │   ├── webrtc.js              # Audio capture + playback utilities
│   │   │   └── api.js                 # All backend API service functions
│   │   └── App.jsx                    # Main app with 4-tab navigation
│   └── package.json
├── config/
│   ├── business_info.yaml         # Business details, hours, services, FAQs, greetings
│   └── prompts.yaml               # LLM system prompts + extraction templates
├── database/
│   └── schema.sql                 # Database schema
└── README.md
```

## API Endpoints

### Call Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check & component status |
| POST | `/api/calls/start` | Start a new call session |
| POST | `/api/calls/{id}/message` | Send text message in a call |
| POST | `/api/calls/{id}/end` | End call + trigger summary/urgency/appointment extraction |
| GET | `/api/calls/active` | List currently active calls |
| GET | `/api/calls/history` | Completed call history (with limit & urgency filters) |
| GET | `/api/calls/{id}` | Get call details |
| GET | `/api/calls/{id}/messages` | Get full conversation transcript |
| WS | `/ws/call/{id}` | Real-time voice call WebSocket |

### Appointment Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/appointments` | List appointments (with date & status filters) |
| POST | `/api/appointments` | Create appointment with availability validation |
| PATCH | `/api/appointments/{id}` | Update status/notes |
| PUT | `/api/appointments/{id}/reschedule` | Reschedule with conflict checking |
| DELETE | `/api/appointments/{id}` | Delete an appointment |
| GET | `/api/appointments/availability` | Get available slots for a day or entire week |

### Services & Configuration
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/services` | List available business services |
| GET | `/api/config/business` | Get current business configuration |
| PUT | `/api/config/business` | Update business configuration |
| GET | `/api/dashboard/stats` | Dashboard statistics |

## Implementation Phases (All Complete)

### Phase 1: Local AI Setup ✅
- Ollama installed with LLaMA 3.1 8B model
- Faster-Whisper configured for GPU-accelerated STT
- Piper TTS configured with `en_US-lessac-medium` voice
- Prompt templates created for business scenarios

### Phase 2: Backend Core ✅
- FastAPI server with WebSocket support
- Ollama integration for local LLM inference
- SQLite database with SQLAlchemy ORM (Calls, Appointments, ConversationMessages)
- Business configuration loader from YAML

### Phase 3: Voice Integration ✅
- Faster-Whisper real-time STT with audio chunking
- Piper TTS for natural voice responses
- `voice_handler.py` for audio streaming and model orchestration
- Conversation state management

### Phase 4: Call Logic ✅
- Call orchestration in `call_manager.py`
- Conversation flow: greeting → Q&A → appointment booking → call ending
- Urgency classifier with keyword scan + LLM deep analysis
- Call logging, transcript storage, and summary generation
- **Real-time availability injection** into LLM context during calls

### Phase 5: Frontend UI ✅
- React + Vite + TailwindCSS application
- WebRTC call interface with voice/text modes
- Owner dashboard with stats and call detail modal
- Appointment list view + weekly calendar view
- Manual appointment booking form with slot picker
- Settings page for business configuration editing
- 4-tab navigation: Dashboard, Call Simulator, Appointments, Settings

### Phase 6: Appointment Scheduling Engine ✅
- `appointment_scheduler.py` with full availability logic
- Slot generation from business hours with configurable duration + buffer
- Conflict detection against existing bookings
- Max-per-day limits and booking advance day limits
- Create, reschedule, and delete with validation
- Week-at-a-glance availability for calendar view

## Technical Specifications

### Backend Dependencies
- FastAPI + Uvicorn
- SQLAlchemy for ORM
- Ollama Python SDK
- faster-whisper (optimized Whisper STT)
- piper-tts (fast neural TTS)
- torch + torchaudio (for audio processing)
- WebSocket support (websockets library)
- PyYAML for config parsing
- soundfile, librosa (audio utilities)

### Frontend Dependencies
- React 18+ with Vite
- Lucide React (icons)
- TailwindCSS (styling)
- Date-fns (date utilities)
- WebRTC adapter for audio capture

### System Requirements
- **GPU**: RTX 4070 (12GB VRAM) — perfect for LLaMA 3.1 8B + STT/TTS
- **RAM**: 32GB (sufficient for all models + concurrent calls)
- **Storage**: ~15GB for models (LLaMA 8B: 5GB, Whisper: 1.5GB, Piper: 500MB) + database
- **OS**: Windows 11 with Python 3.10+ and CUDA 12.x
- **Network**: For initial model downloads only; POC runs fully offline after setup

### Open-Source Voice Models

**Faster-Whisper (STT):**
- Optimized version of OpenAI's Whisper using CTranslate2
- 4x faster than standard Whisper with same accuracy
- Small model: ~500MB, <500ms latency, 95%+ accuracy
- Runs on GPU with minimal VRAM (<2GB)

**Piper TTS:**
- Fast neural TTS based on VITS (Conditional Variational Autoencoder)
- ~300ms latency for short responses
- Recommended voice: `en_US-lessac-medium` (neutral, professional)
- Runs on CPU (frees GPU for LLM + STT)

**Resource Allocation on RTX 4070:**
- LLaMA 3.1 8B: ~6GB VRAM (primary)
- Faster-Whisper: ~1.5GB VRAM (concurrent)
- Piper TTS: CPU only (~2GB RAM)
- **Total**: ~7.5GB VRAM used, 4.5GB free for overhead

## Cost Breakdown (Monthly)

**POC (Current):**
- All AI/Voice/Database: $0 (local)
- WebRTC for testing: $0 (browser-based)
- **Total: $0/month** — completely free with unlimited usage

**Production (with Twilio):**
- All AI/Voice processing: $0 (still runs locally)
- Twilio phone number: $1/month
- Incoming calls: $0.0085/min
- Estimated 100 calls/month @ 3min avg: ~$2.55/month
- **Total: ~$3.55/month** — only paying for phone connectivity

## Success Metrics for POC

1. **Conversation Quality**: Natural, coherent responses (90%+ caller satisfaction)
2. **Appointment Accuracy**: Correctly captures and schedules appointments with availability checking
3. **Urgency Detection**: 85%+ accuracy in classifying urgent vs. routine calls
4. **Response Time**: <2 second latency for AI responses
5. **Business Value**: Demonstrate conversion of missed call → appointment

## Suggested Next Improvements

### Short-Term (Next Sprint)
1. **SMS/Email Notifications** — Twilio SMS or SendGrid alerts for HIGH/CRITICAL urgency calls
2. **Google Calendar Sync** — Two-way sync appointments via OAuth
3. **Appointment Reminders** — Auto-send SMS/email 24h before appointments
4. **Call Recording Storage** — Save audio files and link to call records
5. **Caller ID Recognition** — Match incoming numbers to past callers for personalized greetings

### Medium-Term (Production Readiness)
6. **Twilio/VoIP Integration** — Replace WebRTC POC with real phone numbers via SIP trunking
7. **Authentication & RBAC** — JWT login with owner vs. staff roles
8. **Multi-Tenant Support** — Serve multiple businesses from one deployment
9. **Rate Limiting & Security** — API rate limiting, input sanitization, CORS lockdown
10. **Automated Testing** — Unit tests for scheduler, integration tests for API, E2E with Playwright

### Long-Term (Scaling & Analytics)
11. **Analytics Dashboard** — Call volume trends, peak hours, conversion rates (call → appointment)
12. **Sentiment Analysis** — Caller tone/sentiment for improved urgency detection
13. **Fine-Tuned LLM** — Fine-tune LLaMA on real call transcripts for domain-specific responses
14. **Multi-Language Support** — Whisper multi-language detection + translated TTS
15. **CRM Integration** — HubSpot/Salesforce auto-lead creation from calls
16. **Voicemail Handling** — Detect when to take a voicemail vs. schedule vs. escalate
17. **Queue System** — Redis/Celery for handling concurrent calls under load

## Migration Path to Production

1. **Phase 1 (POC)**: ✅ WebRTC browser calls → AI logic validated
2. **Phase 2**: Add Twilio integration → Real phone numbers
3. **Phase 3**: Add Google Calendar integration → Real scheduling
4. **Phase 4**: Add SMS/Email notifications → Owner alerts
5. **Phase 5**: Multi-tenant support → Serve multiple businesses
6. **Phase 6**: Analytics dashboard → ROI tracking

## Risks & Mitigations

**Risk**: Multiple local models may overwhelm GPU/RAM
- **Mitigation**: Use optimized models (Faster-Whisper small, LLaMA 8B); test resource usage; implement model queuing if needed

**Risk**: Open-source TTS voice quality may not sound professional
- **Mitigation**: Test multiple Piper voice models; add option to swap in cloud TTS for production if needed

**Risk**: Real-time latency may be higher than cloud APIs
- **Mitigation**: Optimize audio chunking; use streaming responses; benchmark <2s total latency

**Risk**: WebRTC may not represent real phone call quality
- **Mitigation**: Plan early Twilio integration test (use trial credits)

**Risk**: Urgency classification may have false positives
- **Mitigation**: Include confidence scores; manual review for MVP

---

**Estimated Timeline**: 6-7 days for full POC (✅ Complete)
**Budget**: $0 for POC (unlimited usage), ~$3-4/month for production (Twilio phone only)
