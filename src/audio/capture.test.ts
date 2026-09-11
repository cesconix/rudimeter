import { describe, expect, it } from 'bun:test'
import { Capture } from './capture'

/** Just enough AudioContext for `start` with an injected input: no worklet module is really loaded. */
function fakeCtx() {
  const connected: unknown[] = []
  const source = {
    connect: (n: unknown) => {
      connected.push(n)
      return n
    },
    disconnect: (n?: unknown) => {
      const i = connected.indexOf(n)
      if (i >= 0) connected.splice(i, 1)
    },
  }
  const ctx = {
    sampleRate: 48000,
    audioWorklet: { addModule: async () => {} },
  }
  return { ctx: ctx as unknown as AudioContext, source: source as unknown as AudioNode, connected }
}

describe('Capture.tap', () => {
  it('feeds the node with the same signal the worklet gets and disconnects it on return', async () => {
    const { ctx, source, connected } = fakeCtx()
    const worklet = { port: { onmessage: null, postMessage() {} }, disconnect() {} }
    // biome-ignore lint/complexity/useArrowFunction: must stay a real function so `new AudioWorkletNode(...)` in Capture.start can construct it.
    ;(globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode = function () {
      return worklet
    }
    const capture = new Capture(ctx, '/worklets/onset-processor.js')
    await capture.start(undefined, { node: source, label: 'test' })
    const tap = { id: 'tap' } as unknown as AudioNode
    const off = capture.tap(tap)
    expect(connected).toContain(tap)
    off()
    expect(connected).not.toContain(tap)
  })
})
