// The open question from the 2026-09-10 spike: can today's beeps stay, with the analysis highpassed above
// them? Digital loop said: hard edges leak, soft edges pass from hp 3500. This runs it on a real speaker
// and a real microphone, then records the strokes for offline spectra. Page: /dev/lab.html?remote

import { defineScenario } from '../remote/scenario'

export default defineScenario('no-headphones', async (d, report) => {
  report.line('Lab page open, volume at max, headphones off. Tap Enable microphone when asked.')
  await d.say('Tap "Enable microphone"', 30)
  await d.waitFor('lab:ready', 120000)
  const matrix = await d.cmd('matrix', { preset: 'hp' }, { until: 'lab:matrix:done', timeoutMs: 180000 })
  report.json('matrix hp done', matrix)
  await d.say('Play along: 4 loud strokes, then 4 soft ones', 5)
  await d.sleep(5000)
  await d.cmd(
    'live',
    { filter: 'hp:3500', metro: 'soft1000', seconds: 30 },
    { until: 'lab:live:done', timeoutMs: 45000 },
  )
  await d.say('Again, with no filter: 4 loud, 4 soft', 5)
  await d.sleep(5000)
  await d.cmd('live', { filter: 'off', metro: 'soft1000', seconds: 30 }, { until: 'lab:live:done', timeoutMs: 45000 })
  await d.say('Recording 20 s: 4 loud, 4 soft, then silence', 3)
  const audio = await d.cmd('record', { seconds: 20, label: 'strokes' }, { until: 'audio', timeoutMs: 40000 })
  report.json('audio', audio)
  report.line(
    'Read `.remote/<device>.ndjson`: lab:matrix rows, lab:onset lines (peakDb, afterClickMs), the WAV for spectra.',
  )
})
