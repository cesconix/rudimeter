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

export function connectRemote(wanted: string, ua: string): Remote {
  const base = `${location.origin}/__remote`
  const handlers = new Map<string, CommandHandler>()
  const queue: string[] = []
  let name = wanted
  let ready = false
  let timer: number | null = null

  function flush(): void {
    timer = null
    if (!ready || queue.length === 0) return
    const body = queue.splice(0).join('\n')
    // keepalive: a flush fired from `visibilitychange` must survive the page going to the background.
    fetch(`${base}/log?device=${encodeURIComponent(name)}`, { method: 'POST', body, keepalive: true }).catch(() => {})
  }

  function log(event: string, data: Record<string, unknown> = {}): void {
    queue.push(JSON.stringify({ event, at: new Date().toISOString(), perf: Math.round(performance.now()), ...data }))
    if (timer === null) timer = window.setTimeout(flush, FLUSH_MS)
  }

  const onHide = () => {
    if (document.visibilityState === 'hidden') flush()
  }
  document.addEventListener('visibilitychange', onHide)

  const es = new EventSource(`${base}/events?device=${encodeURIComponent(wanted)}&ua=${encodeURIComponent(ua)}`)
  es.addEventListener('hello', (e) => {
    name = (JSON.parse((e as MessageEvent<string>).data) as { name: string }).name
    ready = true
    log('hello', { ua, url: location.href })
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
    node.port.onmessage = (e: MessageEvent<Float32Array>) => chunks.push(e.data)
    source.connect(node)
    await new Promise((r) => setTimeout(r, seconds * 1000))
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
    const { file } = (await res.json()) as { file: string }
    return file
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
    close() {
      flush()
      es.close()
      document.removeEventListener('visibilitychange', onHide)
    },
  }
}

/** Registers `ping` and `say`, the two commands every remote page answers. */
export function registerBasics(remote: Remote, say: (text: string, seconds: number) => void): void {
  remote.on('ping', () => ({ name: remote.name, at: new Date().toISOString() }))
  remote.on('say', (args) => {
    say(String(args.text ?? ''), Number(args.seconds ?? 5))
  })
}
