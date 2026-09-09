// AudioWorklet: detects the hits (onsets) on a practice pad and measures the peak.
// Runs in the audio thread, blocks of 128 frames. Timestamps in frames of the context
// (currentFrame + i), hence in the same clock used to schedule the click.
//
// Algorithm (sample-level):
//  - fast: peak follower with ~3 ms decay (tracks the attack)
//  - bg: moving average of the level, updated only outside the refractory period
//  - onset when fast > absolute floor and fast > bg * ratio
//  - after the onset: 5 ms hold to capture the true peak, then 40 ms refractory
//    (two hits closer than 40 ms get merged: known limit, accepted)

class OnsetProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.fast = 0
    this.bg = 1e-4
    this.fastDecay = Math.exp(-1 / (sampleRate * 0.003))
    this.bgAlpha = 1 - Math.exp(-1 / (sampleRate * 0.3))
    this.ratio = 4
    this.floor = 0.01 // -40 dBFS
    this.holdSamples = Math.round(sampleRate * 0.005)
    this.refractorySamples = Math.round(sampleRate * 0.04)
    this.sinceOnset = Infinity
    this.pending = false
    this.peak = 0
    this.onsetFrame = 0
    this.blockPeak = 0
    this.meterCounter = 0
    this.port.onmessage = (e) => {
      const d = e.data || {}
      if (typeof d.ratio === 'number') this.ratio = d.ratio
      if (typeof d.floor === 'number') this.floor = d.floor
    }
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (!ch) return true
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i])
      this.fast = a > this.fast ? a : this.fast * this.fastDecay

      if (this.pending) {
        if (a > this.peak) this.peak = a
        if (this.sinceOnset >= this.holdSamples) {
          this.port.postMessage({ type: 'onset', frame: this.onsetFrame, peak: this.peak })
          this.pending = false
        }
      }

      if (this.sinceOnset >= this.refractorySamples) {
        this.bg += (a - this.bg) * this.bgAlpha
        if (this.fast > this.floor && this.fast > this.bg * this.ratio) {
          this.onsetFrame = currentFrame + i
          this.peak = a
          this.sinceOnset = 0
          this.pending = true
        }
      }

      this.sinceOnset++
      if (a > this.blockPeak) this.blockPeak = a
    }

    if (++this.meterCounter >= 8) {
      this.port.postMessage({ type: 'meter', peak: this.blockPeak, bg: this.bg })
      this.blockPeak = 0
      this.meterCounter = 0
    }
    return true
  }
}

registerProcessor('onset-processor', OnsetProcessor)
