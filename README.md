# AI Call Answering Agent

A fully open-source AI-powered call answering system for small businesses. Runs entirely on local hardware (NVIDIA RTX 4070) with zero ongoing API costs.

## Features

- **AI Call Answering** — Answers questions about the business using a local LLM (LLaMA 3.1 8B)
- **Appointment Scheduling** — Books appointments during calls with validation
- **Urgency Detection** — Classifies calls as Low/Medium/High/Critical and flags urgent ones
- **Voice Processing** — Speech-to-Text (Faster-Whisper) and Text-to-Speech (Piper TTS) running locally
- **Owner Dashboard** — Review call history, transcripts, urgency levels, and appointments
- **WebRTC Browser Calls** — Test the agent from your browser (no phone line needed for POC)

## Tech Stack

| Component | Technology |
|-----------|-----------|
| LLM | LLaMA 3.1 8B via Ollama |
| STT | Faster-Whisper (GPU) |
| TTS | Piper TTS (CPU) |
| Backend | Python FastAPI |
| Frontend | React + Vite + TailwindCSS |
| Database | SQLite |
| Voice Transport | WebSocket + WebRTC |

## System Requirements

- **GPU**: NVIDIA RTX 4070 (12GB VRAM) or equivalent
- **RAM**: 32GB
- **Storage**: ~15GB for models
- **OS**: Ubuntu 22.04+ (recommended)
- **Python**: 3.10+
- **Node.js**: 20+

## Quick Setup (Ubuntu)

### 1. Automated Setup

```bash
cd ai-call-agent
chmod +x setup.sh
./setup.sh
```

This installs everything: NVIDIA drivers, CUDA, Ollama, LLaMA model, Python deps, Piper voice models, Node.js, and frontend deps.

### 2. Manual Setup (Step by Step)

#### Install System Dependencies

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y build-essential git curl wget python3 python3-pip python3-venv \
    ffmpeg portaudio19-dev libsndfile1 libsndfile1-dev sox libsox-dev libasound2-dev
```

#### Install NVIDIA Drivers & CUDA

```bash
sudo apt install -y nvidia-driver-535 nvidia-cuda-toolkit
# Reboot after installation
sudo reboot
# Verify
nvidia-smi
```

#### Install Ollama & Pull LLaMA Model

```bash
curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl enable ollama && sudo systemctl start ollama
ollama pull llama3.1:8b
```

#### Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

#### Set Up Python Environment

```bash
cd ai-call-agent
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r backend/requirements.txt
```

#### Download Piper TTS Voice Model

```bash
mkdir -p models/piper
wget -O models/piper/en_US-lessac-medium.onnx \
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx"
wget -O models/piper/en_US-lessac-medium.onnx.json \
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"
```

#### Pre-Download Faster-Whisper Model

```bash
source venv/bin/activate
python3 -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')"
```

#### Set Up Frontend

```bash
cd frontend
npm install
```

## Running the Application

### Start the Backend

```bash
cd ai-call-agent
source venv/bin/activate
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Start the Frontend (separate terminal)

```bash
cd ai-call-agent/frontend
npm run dev
```

### Open in Browser

Navigate to **http://localhost:5173**

## Usage

### 1. Dashboard
View call statistics, recent calls with urgency levels, and appointment counts.

### 2. Call Simulator
- Click **Start Call** to begin a test conversation
- Type messages as a customer would speak on the phone
- Optionally enable **Voice Mode** to use your microphone
- The AI agent will respond based on the business configuration
- Click **End Call** to see the call summary with urgency classification

### 3. Appointments
- View all appointments booked by the AI agent
- Confirm, cancel, or mark appointments as completed
- Filter by status

## Configuration

Edit `config/business_info.yaml` to customize:
- Business name, address, hours
- Services offered with pricing
- FAQs
- Owner contact preferences
- Greeting messages

Edit `config/prompts.yaml` to customize AI behavior and conversation style.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/calls/start` | Start new call |
| POST | `/api/calls/{id}/message` | Send text message |
| POST | `/api/calls/{id}/end` | End call |
| GET | `/api/calls/active` | List active calls |
| GET | `/api/calls/history` | Call history |
| GET | `/api/appointments` | List appointments |
| PATCH | `/api/appointments/{id}` | Update appointment |
| GET | `/api/dashboard/stats` | Dashboard stats |
| WS | `/ws/call/{id}` | Real-time call WebSocket |

## Production Migration Path

1. **Add Twilio** — Buy a phone number, forward calls to your server
2. **Add Google Calendar** — Sync appointments to real calendar
3. **Add SMS/Email alerts** — Notify owner of urgent calls
4. **Multi-tenant** — Serve multiple businesses
5. **Analytics** — Track conversion rates and ROI

## Troubleshooting

### Ollama not running
```bash
sudo systemctl start ollama
ollama list  # Check available models
```

### GPU not detected
```bash
nvidia-smi  # Check GPU status
# If not found, reinstall drivers and reboot
```

### Piper TTS voice not found
```bash
ls models/piper/  # Check voice files exist
# Re-download if needed (see setup instructions)
```

### Port already in use
```bash
lsof -i :8000  # Check what's using port 8000
kill -9 <PID>  # Kill the process
```
