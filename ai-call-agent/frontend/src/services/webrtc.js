/**
 * WebRTC and audio handling for browser-based calls.
 * Captures microphone audio, chunks it, and sends to the backend via WebSocket.
 */

export class AudioHandler {
  constructor({ onAudioChunk, sampleRate = 16000, chunkDurationMs = 3000 }) {
    this.onAudioChunk = onAudioChunk;
    this.targetSampleRate = sampleRate;
    this.chunkDurationMs = chunkDurationMs;
    this.mediaStream = null;
    this.audioContext = null;
    this.processor = null;
    this.isRecording = false;
    this.audioBuffer = [];
  }

  async start() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: this.targetSampleRate,
        },
      });

      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this.targetSampleRate,
      });

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Use ScriptProcessor for broad compatibility (AudioWorklet is better but more complex)
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      const samplesPerChunk = Math.floor(
        (this.targetSampleRate * this.chunkDurationMs) / 1000
      );

      this.processor.onaudioprocess = (event) => {
        if (!this.isRecording) return;

        const inputData = event.inputBuffer.getChannelData(0);
        this.audioBuffer.push(...inputData);

        if (this.audioBuffer.length >= samplesPerChunk) {
          const chunk = new Float32Array(this.audioBuffer.splice(0, samplesPerChunk));
          if (this.onAudioChunk) {
            this.onAudioChunk(chunk);
          }
        }
      };

      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
      this.isRecording = true;

      return true;
    } catch (error) {
      console.error('Failed to access microphone:', error);
      return false;
    }
  }

  stop() {
    this.isRecording = false;

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.audioBuffer = [];
  }
}

/**
 * Convert Float32Array audio to base64-encoded string for WebSocket transport.
 */
export function float32ToBase64(float32Array) {
  const bytes = new Uint8Array(float32Array.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Play audio from base64-encoded WAV data.
 */
export async function playAudioBase64(base64Data) {
  try {
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start(0);

    return new Promise((resolve) => {
      source.onended = resolve;
    });
  } catch (error) {
    console.error('Failed to play audio:', error);
  }
}
