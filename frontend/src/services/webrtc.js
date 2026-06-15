/**
 * Audio handling for browser-based calls.
 *
 * Improvements over the previous implementation:
 *  - AudioWorkletNode (dedicated audio thread) replaces deprecated ScriptProcessorNode
 *  - 500ms chunk size for low-latency capture (was 3 000ms)
 *  - Binary WebSocket frames eliminate Base64 encoding overhead (~33% smaller)
 *  - Falls back to ScriptProcessorNode if AudioWorklet is unavailable
 */

const DEFAULT_SAMPLE_RATE = 16000;
const DEFAULT_CHUNK_MS = 500;

// ---------------------------------------------------------------------------
// AudioHandler – captures microphone audio and fires chunk callbacks
// ---------------------------------------------------------------------------

export class AudioHandler {
  /**
   * @param {Object}   opts
   * @param {Function} opts.onAudioChunk  – called with a Float32Array per chunk
   * @param {number}   [opts.sampleRate]  – target sample rate (default 16 000)
   * @param {number}   [opts.chunkDurationMs] – ms per chunk (default 500)
   */
  constructor({ onAudioChunk, sampleRate = DEFAULT_SAMPLE_RATE, chunkDurationMs = DEFAULT_CHUNK_MS }) {
    this.onAudioChunk = onAudioChunk;
    this.targetSampleRate = sampleRate;
    this.chunkDurationMs = chunkDurationMs;
    this.mediaStream = null;
    this.audioContext = null;
    this.workletNode = null;
    this.scriptNode = null; // fallback
    this.sourceNode = null;
    this.isRecording = false;
    this._fallbackBuffer = [];
  }

  async start() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: this.targetSampleRate,
        },
      });

      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this.targetSampleRate,
      });

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      const chunkSize = Math.floor(
        (this.targetSampleRate * this.chunkDurationMs) / 1000
      );

      // Try AudioWorklet first (modern browsers)
      if (this.audioContext.audioWorklet) {
        try {
          await this.audioContext.audioWorklet.addModule('/audio-processor.js');
          this.workletNode = new AudioWorkletNode(
            this.audioContext,
            'audio-chunk-processor',
            { processorOptions: { chunkSize } }
          );

          this.workletNode.port.onmessage = (event) => {
            if (!this.isRecording) return;
            if (event.data.type === 'chunk' && this.onAudioChunk) {
              this.onAudioChunk(event.data.audio);
            }
          };

          this.sourceNode.connect(this.workletNode);
          this.workletNode.connect(this.audioContext.destination);
          this.isRecording = true;
          console.log('[AudioHandler] Using AudioWorkletNode');
          return true;
        } catch (workletErr) {
          console.warn('[AudioHandler] AudioWorklet failed, falling back:', workletErr);
        }
      }

      // Fallback: ScriptProcessorNode (deprecated but universal)
      this.scriptNode = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.scriptNode.onaudioprocess = (event) => {
        if (!this.isRecording) return;
        const inputData = event.inputBuffer.getChannelData(0);
        this._fallbackBuffer.push(...inputData);

        while (this._fallbackBuffer.length >= chunkSize) {
          const chunk = new Float32Array(this._fallbackBuffer.splice(0, chunkSize));
          if (this.onAudioChunk) this.onAudioChunk(chunk);
        }
      };

      this.sourceNode.connect(this.scriptNode);
      this.scriptNode.connect(this.audioContext.destination);
      this.isRecording = true;
      console.log('[AudioHandler] Using ScriptProcessorNode (fallback)');
      return true;
    } catch (error) {
      console.error('[AudioHandler] Failed to access microphone:', error);
      return false;
    }
  }

  stop() {
    this.isRecording = false;

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.scriptNode) {
      this.scriptNode.disconnect();
      this.scriptNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this._fallbackBuffer = [];
  }
}

// ---------------------------------------------------------------------------
// Binary helpers – send Float32 audio as raw bytes over WebSocket
// ---------------------------------------------------------------------------

/**
 * Convert a Float32Array to an ArrayBuffer suitable for ws.send() as a binary frame.
 * This is a zero-copy view – no Base64 overhead.
 */
export function float32ToArrayBuffer(float32Array) {
  return float32Array.buffer.slice(
    float32Array.byteOffset,
    float32Array.byteOffset + float32Array.byteLength
  );
}

/**
 * Legacy helper kept for backward compatibility.
 * Prefer float32ToArrayBuffer + binary WebSocket frames.
 */
export function float32ToBase64(float32Array) {
  const bytes = new Uint8Array(float32Array.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// Audio playback
// ---------------------------------------------------------------------------

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
