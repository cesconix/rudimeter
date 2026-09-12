// Three calibrations in a row on one device: how repeatable is the latency the app measures? The device
// must stay untouched; the instructions on screen say so. The numbers land in the report and in the
// dashboard's calibration panel (`bun run remote calibrations <name>`).
import { defineScenario } from '../remote/scenario'

export default defineScenario('calibration-check', async (d, report) => {
  await d.say('Calibration check: hands off the device for 40 seconds.', 6)
  await d.sleep(6000)
  const latencies: number[] = []
  for (let i = 1; i <= 3; i++) {
    const done = await d.cmd('calibrate', {}, { timeoutMs: 60000 })
    report.json(`calibration ${i}`, done)
    if (typeof done.latencyMs === 'number') latencies.push(done.latencyMs)
    else report.line(`calibration ${i} failed: ${String(done.error ?? done.event)}`)
    await d.sleep(2000)
  }
  const mean = latencies.reduce((a, x) => a + x, 0) / Math.max(latencies.length, 1)
  const sd =
    latencies.length > 1 ? Math.sqrt(latencies.reduce((a, x) => a + (x - mean) ** 2, 0) / (latencies.length - 1)) : 0
  report.line(
    `latencies: ${latencies.map((x) => x.toFixed(1)).join(', ')} ms · mean ${mean.toFixed(1)} · σ ${sd.toFixed(2)} ms`,
  )
  await d.say(`Done: ${latencies.map((x) => x.toFixed(1)).join(' / ')} ms`, 5)
})
