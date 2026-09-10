import { noiseBuffer } from '../audio/noise'

/**
 * A practice-pad stroke as the onset detector sees it: a noise burst with a 0.5 ms attack — the same
 * ramp as `scheduleClick`, so the detector fires with the same delay on a click and on a stroke and
 * the calibration cancels it — and a 30 ms exponential decay. `peakDb` is the peak amplitude in dBFS.
 */
export function scheduleStroke(dest: AudioNode, time: number, peakDb: number): void {
  const ctx = dest.context
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx)
  const g = ctx.createGain()
  const peak = 10 ** (peakDb / 20)
  g.gain.setValueAtTime(0, time)
  g.gain.linearRampToValueAtTime(peak, time + 0.0005)
  // `exponentialRampToValueAtTime` cannot aim at zero: down to −60 dB, then the source is stopped.
  g.gain.exponentialRampToValueAtTime(peak * 0.001, time + 0.03)
  src.connect(g).connect(dest)
  src.start(time)
  src.stop(time + 0.04)
}
