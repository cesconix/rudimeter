/**
 * The AUDIBLE clock: which instant of the timeline is coming out of the speakers right now.
 *
 * `ctx.currentTime` is the SCHEDULING clock — when a sample enters the graph, not when you
 * hear it. Between the two sits the output latency of the device: 16.6 ms measured on the development
 * Mac (stable within 0.05 ms), far more over Bluetooth.
 *
 * Whoever DRAWS must use this function. The drummer syncs by ear, and the
 * correction applied to the hits (`SessionRunner.addHit`, which subtracts the whole round-trip
 * latency measured by the calibration) assumes exactly that. A cursor drawn on the scheduling
 * clock reaches the note before its click is heard: whoever follows it with their eyes plays
 * early by the whole output latency and gets judged early. With a `good` window
 * of 20 ms, the measured 16.6 ms eat up 83% of it.
 *
 * Whoever SCHEDULES must instead keep using `ctx.currentTime`: it is the clock the clicks are
 * booked in, and moving it earlier would shift the metronome instead of the drawing.
 *
 * `contextTime` advances as smoothly as `currentTime` (measured: median step 15.99 ms against 16.00,
 * zero stalled frames out of 199), so reading it every frame costs no smoothness, and unlike
 * a latency measured only once it re-adapts by itself if the output device changes halfway through
 * the session — Bluetooth headphones connected after the start, say.
 */
export function audibleTime(ctx: AudioContext): number {
  const contextTime = ctx.getOutputTimestamp?.().contextTime
  // Before the device has rendered the first block — and on browsers without getOutputTimestamp —
  // there is no output position yet. Zero there does not mean "start of the score" but
  // "I do not know yet": taken literally it would make the cursor jump to the start of the piece.
  if (typeof contextTime !== 'number' || contextTime <= 0) return ctx.currentTime
  return contextTime
}
