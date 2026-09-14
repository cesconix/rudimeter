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
      // The poller pages until a response is empty, so answer the follow-up read with nothing.
      if (calls > 1) return Promise.resolve<LogLine[]>([])
      return new Promise<LogLine[]>((resolve) => {
        resolveFirst = resolve
      })
    }
    const poller = createPoller(fetchLines)
    const first = poller.pull('synth')
    const second = poller.pull('synth')
    expect(await second).toBe(false)
    expect(calls).toBe(1)
    resolveFirst([l(1)])
    expect(await first).toBe(true)
    expect(poller.held('synth').map((x) => x.seq)).toEqual([1])
  })

  it('a superseded response reporting only already-held seqs cannot roll the held lines backward', async () => {
    const responses: LogLine[][] = [[l(1), l(2), l(3)], [], [l(1), l(2)], []]
    const fetchLines = () => Promise.resolve(responses.shift() ?? [])
    const poller = createPoller(fetchLines)
    await poller.pull('synth')
    expect(poller.held('synth').map((x) => x.seq)).toEqual([1, 2, 3])
    // As if a reordered or retried request answered with an older view: nothing here is past seq 3.
    await poller.pull('synth')
    expect(poller.held('synth').map((x) => x.seq)).toEqual([1, 2, 3])
  })

  it('pages until the store answers with nothing, not until a page is short', async () => {
    // What `/api/lines` does with a `limit` it will not serve: it clamps, quietly. Every page here is
    // shorter than the one the caller asked for, and none of them is the end of the log.
    const pages: LogLine[][] = [[l(1), l(2)], [l(3)], [l(4), l(5)], []]
    const poller = createPoller(() => Promise.resolve(pages.shift() ?? []))
    expect(await poller.pull('synth')).toBe(true)
    expect(poller.held('synth').map((x) => x.seq)).toEqual([1, 2, 3, 4, 5])
  })
})
