#!/bin/bash
# =============================================================================
# AI Call Answering Agent - Ubuntu Environment Setup Script
# =============================================================================
# Run this script on a fresh Ubuntu installation with an NVIDIA GPU
# Usage: chmod +x setup.sh && ./setup.sh
# =============================================================================

set -e

echo "============================================"
echo " AI Call Agent - Environment Setup"
echo "============================================"

# --- 1. System Updates ---
echo "[1/9] Updating system packages..."
sudo apt update && sudo apt upgrade -y

# --- 2. Install essential build tools ---
echo "[2/9] Installing build tools and dependencies..."
sudo apt install -y \
    build-essential \
    git \
    curl \
    wget \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    portaudio19-dev \
    libsndfile1 \
    libsndfile1-dev \
    sox \
    libsox-dev \
    libasound2-dev

# --- 3. Check/Install NVIDIA drivers & CUDA ---
echo "[3/9] Checking NVIDIA GPU and CUDA..."
if ! command -v nvidia-smi &> /dev/null; then
    echo "Installing NVIDIA drivers..."
    sudo apt install -y nvidia-driver-535
    echo "⚠️  Reboot may be required after driver install. Run this script again after reboot."
fi

if ! command -v nvcc &> /dev/null; then
    echo "Installing CUDA toolkit..."
    sudo apt install -y nvidia-cuda-toolkit
fi

echo "GPU Status:"
nvidia-smi || echo "⚠️  nvidia-smi not available - reboot may be needed"

# --- 4. Install Ollama ---
echo "[4/9] Installing Ollama..."
if ! command -v ollama &> /dev/null; then
    curl -fsSL https://ollama.com/install.sh | sh
fi

echo "Starting Ollama service..."
sudo systemctl enable ollama
sudo systemctl start ollama
sleep 3

echo "Pulling LLaMA 3.1 8B model (this may take 10-20 minutes)..."
ollama pull llama3.1:8b

# --- 5. Install Node.js (for frontend) ---
echo "[5/9] Installing Node.js 20 LTS..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"

# --- 6. Set up Python virtual environment ---
echo "[6/9] Setting up Python virtual environment..."
PROJ_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJ_DIR"

python3 -m venv venv
source venv/bin/activate

# --- 7. Install Python dependencies ---
echo "[7/9] Installing Python dependencies..."
pip install --upgrade pip
pip install -r backend/requirements.txt

# --- 8. Download Piper TTS voice model ---
echo "[8/9] Downloading Piper TTS voice model..."
PIPER_DIR="$PROJ_DIR/models/piper"
mkdir -p "$PIPER_DIR"

# Download en_US-lessac-medium voice (professional, neutral)
if [ ! -f "$PIPER_DIR/en_US-lessac-medium.onnx" ]; then
    echo "Downloading Piper voice: en_US-lessac-medium..."
    wget -q -O "$PIPER_DIR/en_US-lessac-medium.onnx" \
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx"
    wget -q -O "$PIPER_DIR/en_US-lessac-medium.onnx.json" \
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"
    echo "✅ Piper voice model downloaded"
else
    echo "✅ Piper voice model already exists"
fi

# --- 9. Download Faster-Whisper model ---
echo "[9/9] Pre-downloading Faster-Whisper model..."
python3 -c "
from faster_whisper import WhisperModel
print('Downloading faster-whisper small model...')
model = WhisperModel('small', device='cpu', compute_type='int8')
print('✅ Faster-Whisper model downloaded')
"

# --- 10. Set up Frontend ---
echo "[10/10] Setting up frontend..."
cd "$PROJ_DIR/frontend"
npm install

echo ""
echo "============================================"
echo " ✅ Setup Complete!"
echo "============================================"
echo ""
echo " To start the backend:"
echo "   cd $PROJ_DIR"
echo "   source venv/bin/activate"
echo "   cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000"
echo ""
echo " To start the frontend:"
echo "   cd $PROJ_DIR/frontend"
echo "   npm run dev"
echo ""
echo " Then open http://localhost:5173 in your browser"
echo "============================================"
