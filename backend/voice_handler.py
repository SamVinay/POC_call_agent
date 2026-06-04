"""
Voice Handler - Manages Speech-to-Text and Text-to-Speech using open-source models.
  STT: Faster-Whisper (GPU accelerated)
  TTS: Piper TTS (CPU, fast neural synthesis)
"""

import io
import os
import wave
import logging
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)

MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")
PIPER_VOICE_DIR = os.path.join(MODELS_DIR, "piper")
AUDIO_TEMP_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "temp_audio"
)
os.makedirs(AUDIO_TEMP_DIR, exist_ok=True)


class SpeechToText:
    """Faster-Whisper based speech-to-text engine."""

    def __init__(self, model_size: str = "small", device: str = "auto"):
        self.model_size = model_size
        self.device = device
        self.model = None
        self._load_model()

    def _load_model(self):
        """Load the Faster-Whisper model."""
        try:
            from faster_whisper import WhisperModel

            compute_type = "float16" if self.device != "cpu" else "int8"
            actual_device = "cuda" if self.device == "auto" else self.device

            logger.info(
                f"Loading Faster-Whisper {self.model_size} on {actual_device} "
                f"(compute_type={compute_type})..."
            )
            self.model = WhisperModel(
                self.model_size,
                device=actual_device,
                compute_type=compute_type,
            )
            logger.info("✅ Faster-Whisper model loaded")
        except Exception as e:
            logger.error(f"Failed to load Faster-Whisper: {e}")
            logger.info("Falling back to CPU with int8...")
            try:
                from faster_whisper import WhisperModel

                self.model = WhisperModel(
                    self.model_size, device="cpu", compute_type="int8"
                )
                logger.info("✅ Faster-Whisper loaded on CPU (fallback)")
            except Exception as e2:
                logger.error(f"Failed to load Faster-Whisper on CPU: {e2}")

    async def transcribe(self, audio_data: bytes, sample_rate: int = 16000) -> str:
        """Transcribe audio bytes to text."""
        if self.model is None:
            logger.error("STT model not loaded")
            return ""

        try:
            # Convert raw bytes to numpy array
            audio_array = np.frombuffer(audio_data, dtype=np.float32)

            # If stereo, convert to mono
            if len(audio_array.shape) > 1:
                audio_array = audio_array.mean(axis=1)

            # Resample to 16kHz if needed (Whisper expects 16kHz)
            if sample_rate != 16000:
                from scipy.signal import resample

                num_samples = int(len(audio_array) * 16000 / sample_rate)
                audio_array = resample(audio_array, num_samples)

            segments, info = self.model.transcribe(
                audio_array,
                beam_size=5,
                language="en",
                vad_filter=True,
                vad_parameters=dict(
                    min_silence_duration_ms=500,
                    speech_pad_ms=200,
                ),
            )

            text = " ".join(segment.text for segment in segments).strip()
            logger.debug(f"STT result: '{text}' (lang={info.language}, prob={info.language_probability:.2f})")
            return text

        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return ""

    async def transcribe_file(self, file_path: str) -> str:
        """Transcribe an audio file to text."""
        if self.model is None:
            return ""

        try:
            segments, info = self.model.transcribe(
                file_path,
                beam_size=5,
                language="en",
                vad_filter=True,
            )
            return " ".join(segment.text for segment in segments).strip()
        except Exception as e:
            logger.error(f"File transcription error: {e}")
            return ""


class TextToSpeech:
    """Piper TTS based text-to-speech engine."""

    def __init__(self, voice: str = "en_US-lessac-medium"):
        self.voice_name = voice
        self.voice_model_path = os.path.join(PIPER_VOICE_DIR, f"{voice}.onnx")
        self.voice_config_path = os.path.join(PIPER_VOICE_DIR, f"{voice}.onnx.json")
        self._piper_available = False
        self._check_piper()

    def _check_piper(self):
        """Check if Piper TTS is available."""
        if not os.path.exists(self.voice_model_path):
            logger.warning(
                f"Piper voice model not found at {self.voice_model_path}. "
                f"Run setup.sh to download it."
            )
            return

        try:
            result = subprocess.run(
                ["piper", "--version"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            self._piper_available = True
            logger.info(f"✅ Piper TTS available with voice: {self.voice_name}")
        except (FileNotFoundError, subprocess.TimeoutExpired):
            # Try using piper as Python module
            try:
                import piper
                self._piper_available = True
                logger.info(f"✅ Piper TTS (Python module) available with voice: {self.voice_name}")
            except ImportError:
                logger.warning(
                    "Piper TTS not found. Install via: pip install piper-tts"
                )

    async def synthesize(self, text: str) -> Optional[bytes]:
        """Convert text to speech audio bytes (WAV format, 16kHz mono)."""
        if not text.strip():
            return None

        try:
            return await self._synthesize_with_python(text)
        except Exception as e:
            logger.error(f"Python Piper synthesis failed: {e}")
            try:
                return await self._synthesize_with_cli(text)
            except Exception as e2:
                logger.error(f"CLI Piper synthesis also failed: {e2}")
                return None

    async def _synthesize_with_python(self, text: str) -> Optional[bytes]:
        """Synthesize using piper Python module."""
        try:
            from piper import PiperVoice

            voice = PiperVoice.load(self.voice_model_path, self.voice_config_path)

            buffer = io.BytesIO()
            with wave.open(buffer, "wb") as wav_file:
                voice.synthesize(text, wav_file)

            audio_bytes = buffer.getvalue()
            logger.debug(f"TTS synthesized {len(audio_bytes)} bytes for: '{text[:50]}...'")
            return audio_bytes

        except ImportError:
            raise
        except Exception as e:
            logger.error(f"Piper Python synthesis error: {e}")
            raise

    async def _synthesize_with_cli(self, text: str) -> Optional[bytes]:
        """Synthesize using Piper CLI as fallback."""
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False, dir=AUDIO_TEMP_DIR) as tmp:
                tmp_path = tmp.name

            process = subprocess.run(
                [
                    "piper",
                    "--model", self.voice_model_path,
                    "--output_file", tmp_path,
                ],
                input=text,
                capture_output=True,
                text=True,
                timeout=30,
            )

            if process.returncode != 0:
                logger.error(f"Piper CLI error: {process.stderr}")
                return None

            with open(tmp_path, "rb") as f:
                audio_bytes = f.read()

            os.unlink(tmp_path)
            return audio_bytes

        except Exception as e:
            logger.error(f"Piper CLI synthesis error: {e}")
            return None

    async def synthesize_to_file(self, text: str, output_path: str) -> bool:
        """Synthesize speech and save to a file."""
        audio_bytes = await self.synthesize(text)
        if audio_bytes:
            with open(output_path, "wb") as f:
                f.write(audio_bytes)
            return True
        return False


class VoiceHandler:
    """Unified voice handler combining STT and TTS."""

    def __init__(
        self,
        stt_model_size: str = "small",
        stt_device: str = "auto",
        tts_voice: str = "en_US-lessac-medium",
    ):
        logger.info("Initializing Voice Handler...")
        self.stt = SpeechToText(model_size=stt_model_size, device=stt_device)
        self.tts = TextToSpeech(voice=tts_voice)
        logger.info("✅ Voice Handler initialized")

    async def process_audio_input(
        self, audio_data: bytes, sample_rate: int = 16000
    ) -> str:
        """Process incoming audio and return transcribed text."""
        return await self.stt.transcribe(audio_data, sample_rate)

    async def generate_audio_response(self, text: str) -> Optional[bytes]:
        """Generate audio from text response."""
        return await self.tts.synthesize(text)

    async def process_turn(
        self, audio_data: bytes, sample_rate: int = 16000
    ) -> tuple[str, Optional[bytes]]:
        """
        Process a full conversation turn:
        1. Transcribe caller's audio to text
        2. Return the transcribed text (AI response generation handled by call_manager)
        """
        transcribed_text = await self.stt.transcribe(audio_data, sample_rate)
        return transcribed_text, None
