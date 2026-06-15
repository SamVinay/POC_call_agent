/**
 * AudioWorkletProcessor for capturing microphone audio on a dedicated thread.
 * Replaces the deprecated ScriptProcessorNode for reliable, glitch-free capture.
 *
 * Buffers incoming samples and posts Float32Array chunks to the main thread
 * once the buffer reaches the configured size.
 */
class AudioChunkProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    // Default: ~500ms chunks at 16kHz = 8000 samples
    this.chunkSize = (options.processorOptions && options.processorOptions.chunkSize) || 8000;
    this.buffer = [];
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;

    const channelData = input[0]; // mono channel
    for (let i = 0; i < channelData.length; i++) {
      this.buffer.push(channelData[i]);
    }

    while (this.buffer.length >= this.chunkSize) {
      const chunk = new Float32Array(this.buffer.splice(0, this.chunkSize));
      this.port.postMessage({ type: 'chunk', audio: chunk }, [chunk.buffer]);
    }

    return true; // keep processor alive
  }
}

registerProcessor('audio-chunk-processor', AudioChunkProcessor);
