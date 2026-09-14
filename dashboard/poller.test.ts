import { describe, expect, it } from 'bun:test'
import type { LogLine } from '../src/analysis/analysis'
import { createPoller } from './poller'

const l = (seq: number): LogLine => ({ event: 'e', at: 'a', seq })

describe('createPoller', () => {
  it('drops a pull for a device that already has one in flight, rather than queuing it', async () => {
    let calls = 0
    let resolveFirst: (lines: LogLine[]) => void = () => {}
    const fetchLines = () => {
      calls++
      return new Promise<LogLine[]>((resolve) => {
        resolveFirst = resolve
      })
    }
    const poller = createPoller(fetchLines, 20000)
    const first = poller.pull('synth')
    const second = poller.pull('synth')
    expect(await second).toBe(false)
    expect(calls).toBe(1)
    resolveFirst([l(1)])
    expect(await first).toBe(true)
    expect(poller.held('synth').map((x) => x.seq)).toEqual([1])
  })

  it('a superseded response reporting only already-held seqs cannot roll the held lines backward', async () => {
    const responses: LogLine[][] = [
      [l(1), l(2), l(3)],
      [l(1), l(2)],
    ]
    const fetchLines = () => Promise.resolve(responses.shift() ?? [])
    const poller = createPoller(fetchLines, 20000)
    await poller.pull('synth')
    expect(poller.held('synth').map((x) => x.seq)).toEqual([1, 2, 3])
    // As if a reordered or retried request answered with an older view: nothing here is past seq 3.
    await poller.pull('synth')
    expect(poller.held('synth').map((x) => x.seq)).toEqual([1, 2, 3])
  })
})
