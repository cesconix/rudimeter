// AudioWorklet: copies its input to the main thread in 4096-frame batches, for the remote debug layer's
// recordings. 128-frame blocks one message each would be 375 messages a second; 4096 keeps it under 12.
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buf = new Float32Array(4096)
    this.n = 0
    // `record()` posts 'flush' once its capture window elapses. Without this, the up-to-4096 samples
    // (85 ms at 48 kHz) sitting in `buf` since the last full batch would never be posted and the tail
    // of every recording would be silently dropped.
    this.port.onmessage = (e) => {
      if (e.data !== 'flush') return
      if (this.n > 0) {
        this.port.postMessage(this.buf.slice(0, this.n))
        this.n = 0
      }
      this.port.postMessage('end')
    }
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (!ch) return true
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i]
      if (this.n === this.buf.length) {
        this.port.postMessage(this.buf)
        this.buf = new Float32Array(4096)
        this.n = 0
      }
    }
    return true
  }
}

registerProcessor('recorder-processor', RecorderProcessor)
