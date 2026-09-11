import type { Hit } from '../engine/types'

export interface MeterReading {
  peakDb: number
  bgDb: number
}

export interface Thresholds {
  floorDb: number
  ratio: number
}

export const DEFAULT_THRESHOLDS: Thresholds = { floorDb: -40, ratio: 4 }

export interface CaptureInfo {
  deviceLabel: string
  settings: MediaTrackSettings
  supported: MediaTrackSupportedConstraints
}

/** What the worklet listens to instead of the microphone. */
export interface CaptureInput {
  node: AudioNode
  label: string
}

const toDb = (x: number): number => (x > 0 ? 20 * Math.log10(x) : -120)

/** Microphone (or an injected node) → AudioWorklet onset → Hit events (t in seconds of the audio clock, uncorrected) and meter. */
export class Capture {
  private stream: MediaStream | null = null
  private source: AudioNode | null = null
  private node: AudioWorkletNode | null = null
  private hitListeners = new Set<(hit: Hit) => void>()
  private meterListeners = new Set<(m: MeterReading) => void>()
  info: CaptureInfo | null = null

  constructor(
    private ctx: AudioContext,
    private workletUrl: string,
  ) {}

  /** With `input`, no microphone is opened: the node feeds the worklet in its place. */
  async start(thresholds: Thresholds = DEFAULT_THRESHOLDS, input?: CaptureInput): Promise<void> {
    if (!this.ctx.audioWorklet) throw new Error('AudioWorklet is not supported by this browser')
    try {
      let source: AudioNode
      if (input) {
        this.info = { deviceLabel: input.label, settings: {}, supported: {} }
        source = input.node
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
          video: false,
        })
        this.stream = stream
        const track = stream.getAudioTracks()[0]
        this.info = {
          deviceLabel: track.label,
          settings: track.getSettings(),
          supported: navigator.mediaDevices.getSupportedConstraints(),
        }
        source = this.ctx.createMediaStreamSource(stream)
      }
      await this.ctx.audioWorklet.addModule(this.workletUrl)
      this.node = new AudioWorkletNode(this.ctx, 'onset-processor', { numberOfInputs: 1, numberOfOutputs: 0 })
      this.node.port.onmessage = (e: MessageEvent<{ type: string; frame?: number; peak?: number; bg?: number }>) => {
        const d = e.data
        if (d.type === 'onset' && d.frame !== undefined && d.peak !== undefined) {
          const hit: Hit = { t: d.frame / this.ctx.sampleRate, peakDb: toDb(d.peak) }
          this.hitListeners.forEach((l) => {
            l(hit)
          })
        } else if (d.type === 'meter' && d.peak !== undefined && d.bg !== undefined) {
          const m: MeterReading = { peakDb: toDb(d.peak), bgDb: toDb(d.bg) }
          this.meterListeners.forEach((l) => {
            l(m)
          })
        }
      }
      this.source = source
      this.source.connect(this.node)
      this.setThresholds(thresholds)
    } catch (err) {
      this.stream?.getTracks().forEach((t) => {
        t.stop()
      })
      this.stream = null
      this.info = null
      this.node = null
      throw err
    }
  }

  setThresholds(t: Thresholds): void {
    this.node?.port.postMessage({ floor: 10 ** (t.floorDb / 20), ratio: t.ratio })
  }

  /**
   * Feeds `node` with the same signal the worklet gets: the raw microphone, or the injected input.
   * For recordings that must show what the detector sees, before any analysis filter. Returns the disconnect.
   */
  tap(node: AudioNode): () => void {
    this.source?.connect(node)
    return () => {
      this.source?.disconnect(node)
    }
  }

  onHit(l: (hit: Hit) => void): () => void {
    this.hitListeners.add(l)
    return () => {
      this.hitListeners.delete(l)
    }
  }

  onMeter(l: (m: MeterReading) => void): () => void {
    this.meterListeners.add(l)
    return () => {
      this.meterListeners.delete(l)
    }
  }

  stop(): void {
    this.source?.disconnect()
    this.source = null
    if (this.node) {
      this.node.port.onmessage = null
      this.node.disconnect()
      this.node = null
    }
    this.stream?.getTracks().forEach((t) => {
      t.stop()
    })
    this.stream = null
  }
}
