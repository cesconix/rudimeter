// Page side of the remote debug channel (see dev/remote/plugin.ts). Loaded only in dev, only with
// `?remote`: App.tsx imports it dynamically behind `import.meta.env.DEV`.

export type CommandHandler = (args: Record<string, unknown>) => unknown | Promise<unknown>

export interface Remote {
  /** The name the server settled on: `iphone`, or `iphone-2` if a first page took it. */
  name: string
  log(event: string, data?: Record<string, unknown>): void
  on(cmd: string, handler: CommandHandler): () => void
  /** Records `seconds` of `source` and ships it as a WAV. Resolves with the file name. */
  record(ctx: AudioContext, source: AudioNode, seconds: number, label: string): Promise<string>
  close(): void
}

const FLUSH_MS = 250

export function connectRemote(
  wanted: string,
  ua: string,
  /**
   * `onName` fires when the server's `hello` settles the name, which may not be `wanted` (`mac-2` when a
   * first page holds `mac`). `name` below is a getter and nothing re-renders on its own: a caller that
   * shows the name on screen needs this to show the settled one. Optional, so existing callers stand.
   */
  opts: { onName?: (name: string) => void } = {},
): Remote {
  const base = `${location.origin}/__remote`
  const handlers = new Map<string, CommandHandler>()
  const queue: string[] = []
  let name = wanted
  let ready = false
  let timer: number | null = null
  // Set once `close()` has run its final flush: `log`/`flush` become no-ops so a call arriving after
  // close (e.g. a late `cmd:done`) cannot resurrect the queue or schedule a stray `fetch` to `/log`.
  let closed = false

  function flush(): void {
    timer = null
    if (closed || !ready || queue.length === 0) return
    const body = queue.splice(0).join('\n')
    // keepalive: a flush fired from `visibilitychange` must survive the page going to the background.
    fetch(`${base}/log?device=${encodeURIComponent(name)}`, { method: 'POST', body, keepalive: true }).catch(() => {})
  }

  function log(event: string, data: Record<string, unknown> = {}): void {
    if (closed) return
    queue.push(JSON.stringify({ event, at: new Date().toISOString(), perf: Math.round(performance.now()), ...data }))
    if (timer === null) timer = window.setTimeout(flush, FLUSH_MS)
  }

  const onHide = () => {
    if (document.visibilityState === 'hidden') flush()
  }
  document.addEventListener('visibilitychange', onHide)

  // A document that survives a navigation (bfcache-style) keeps this EventSource OPEN and goes on
  // holding its name on the server, so the next page connects as `mac-2` instead of `mac`. The
  // server-side reap cannot help: it drops streams that are dead, and this one is alive. Hang up here
  // instead — `close()` does its final synchronous flush and is inert afterwards, so nothing is lost.
  const onPageHide = () => {
    close()
  }
  window.addEventListener('pagehide', onPageHide)

  const es = new EventSource(`${base}/events?device=${encodeURIComponent(wanted)}&ua=${encodeURIComponent(ua)}`)
  es.addEventListener('hello', (e) => {
    name = (JSON.parse((e as MessageEvent<string>).data) as { name: string }).name
    ready = true
    log('hello', { ua, url: location.href })
    opts.onName?.(name)
  })
  es.addEventListener('cmd', async (e) => {
    const { id, cmd, args } = JSON.parse((e as MessageEvent<string>).data) as {
      id: number
      cmd: string
      args: Record<string, unknown>
    }
    const handler = handlers.get(cmd)
    if (!handler) {
      log('cmd:error', { id, cmd, error: `no handler for "${cmd}"` })
      return
    }
    try {
      const result = await handler(args)
      log('cmd:done', { id, cmd, result: result ?? null })
    } catch (err) {
      log('cmd:error', { id, cmd, error: (err as Error).message })
    }
  })

  let recorderLoaded: Promise<void> | null = null

  async function record(ctx: AudioContext, source: AudioNode, seconds: number, label: string): Promise<string> {
    recorderLoaded ??= ctx.audioWorklet.addModule('/worklets/recorder-processor.js')
    await recorderLoaded
    const node = new AudioWorkletNode(ctx, 'recorder-processor', { numberOfInputs: 1, numberOfOutputs: 0 })
    const chunks: Float32Array[] = []
    // The worklet batches in 4096-frame chunks and only flushes its partial tail (up to 85 ms at 48 kHz)
    // on request: ask for it once the window elapses, and wait for the 'end' marker before reading
    // `chunks`, so that tail isn't dropped. A dead worklet must not hang this forever, hence the 500 ms cap.
    const flushed = new Promise<void>((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        resolve()
      }
      node.port.onmessage = (e: MessageEvent<Float32Array | 'end'>) => {
        if (e.data === 'end') finish()
        else chunks.push(e.data)
      }
      setTimeout(finish, 500)
    })
    source.connect(node)
    await new Promise((r) => setTimeout(r, seconds * 1000))
    node.port.postMessage('flush')
    await flushed
    source.disconnect(node)
    node.port.onmessage = null
    const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0))
    let at = 0
    for (const c of chunks) {
      all.set(c, at)
      at += c.length
    }
    const res = await fetch(
      `${base}/audio?device=${encodeURIComponent(name)}&label=${encodeURIComponent(label)}&sampleRate=${ctx.sampleRate}`,
      { method: 'POST', body: all },
    )
    // A 400 or 500 from `/audio` leaves no `file` in the body: resolving with `undefined` would log
    // `cmd:done { result: null }` and the CLI waiting for the `audio` line would sit out its whole
    // timeout instead of failing. Throwing turns it into the `cmd:error` the handler already reports.
    if (!res.ok) {
      const { error } = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(error ?? `${res.status} ${res.statusText}`)
    }
    const { file } = (await res.json()) as { file: string }
    return file
  }

  function close(): void {
    // Cancel the debounce timer by its real id before `flush()` (which unconditionally nulls the
    // `timer` variable itself) would lose it: an uncancelled native timeout still fires later.
    if (timer !== null) {
      window.clearTimeout(timer)
      timer = null
    }
    flush() // final synchronous drain, while `closed` is still false so it actually sends
    closed = true
    es.close()
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('pagehide', onPageHide)
  }

  return {
    get name() {
      return name
    },
    log,
    on(cmd, handler) {
      handlers.set(cmd, handler)
      return () => {
        if (handlers.get(cmd) === handler) handlers.delete(cmd)
      }
    },
    record,
    close,
  }
}

/** Registers `ping` and `say`, the two commands every remote page answers. */
export function registerBasics(remote: Remote, say: (text: string, seconds: number) => void): void {
  remote.on('ping', () => ({ name: remote.name, at: new Date().toISOString() }))
  remote.on('say', (args) => {
    say(String(args.text ?? ''), Number(args.seconds ?? 5))
  })
}
