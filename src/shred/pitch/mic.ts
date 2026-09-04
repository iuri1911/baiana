// O microfone: permissao, worklet e deteccao de altura.
//
// A divisao de trabalho e de proposito. O worklet corta o audio em quadros e
// carimba o tempo — e a unica coisa que so ele sabe fazer. A altura sai aqui,
// com a `pitchy` (McLeod Pitch Method), porque aqui da para importar biblioteca
// e o custo e irrelevante: sao ~93 analises por segundo de uma janela de 2048,
// menos de 1% de um nucleo. O que NAO da para fazer aqui e medir tempo, e por
// isso o instante vem carimbado de la.

import { PitchDetector } from 'pitchy'
import { audioContext } from '../../audio/engine'
import { midiFromFrequency } from '../../core/music'
import type { PlayedNote } from '../grade'
import { NoteTracker, type Hop, type TrackerConfig } from './tracker'

const WORKLET_URL = `${import.meta.env.BASE_URL}pitch-worklet.js`

export type MicFrame = {
  /** Nota detectada agora, ou null. Para a calibracao mostrar ao vivo. */
  midi: number | null
  cents: number
  clarity: number
  rms: number
}

export type MicOptions = {
  tracker?: Partial<TrackerConfig>
  /** Nota fechada, pronta para a avaliacao. Tempo ja em performance.now(). */
  onNote?: (note: PlayedNote) => void
  /** Todo quadro, para medidor e calibracao. */
  onFrame?: (frame: MicFrame) => void
}

export class Mic {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private node: AudioWorkletNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private detector: PitchDetector<Float32Array> | null = null
  private tracker: NoteTracker
  private opts: MicOptions
  /**
   * Ponte do relogio de audio para o de performance.now(), em ms. A avaliacao
   * mede tudo na segunda regua, e o worklet so conhece a primeira.
   */
  private offsetMs = 0
  /** Atraso do caminho de entrada, subtraido de todo instante. */
  private latencyMs = 0

  constructor(opts: MicOptions = {}) {
    this.opts = opts
    this.tracker = new NoteTracker(opts.tracker)
  }

  get running(): boolean {
    return this.node !== null
  }

  configure(cfg: Partial<TrackerConfig>): void {
    this.tracker.configure(cfg)
  }

  setLatency(ms: number): void {
    this.latencyMs = ms
  }

  /** Zera o rastreador entre repeticoes. */
  reset(): void {
    this.tracker.reset()
  }

  /**
   * Pede o microfone e liga a cadeia. Tem que sair de um gesto do usuario.
   *
   * Os tres processamentos do navegador ficam DESLIGADOS de proposito: o
   * cancelamento de eco e a supressao de ruido sao afinados para voz e comem o
   * ataque da corda, que e justamente o que carimba o tempo aqui; o ganho
   * automatico mexeria no volume no meio do exercicio e faria a medida de
   * ataque mentir.
   */
  async start(): Promise<void> {
    if (this.node) return

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    })

    const ctx = audioContext()
    this.ctx = ctx
    if (ctx.state === 'suspended') await ctx.resume()
    await ctx.audioWorklet.addModule(WORKLET_URL)

    this.detector = PitchDetector.forFloat32Array(2048)
    this.source = ctx.createMediaStreamSource(this.stream)
    this.node = new AudioWorkletNode(ctx, 'pitch-frames')
    this.node.port.onmessage = (e) => this.onHop(e.data)

    // O worklet nao produz saida: ligar na saida devolveria o microfone para as
    // caixas, que e microfonia na certa.
    this.source.connect(this.node)
  }

  stop(): void {
    this.node?.port.close()
    this.node?.disconnect()
    this.source?.disconnect()
    for (const t of this.stream?.getTracks() ?? []) t.stop()
    this.node = null
    this.source = null
    this.stream = null
    this.tracker.reset()
  }

  private onHop(data: { samples: Float32Array; time: number; blocks: Hop['blocks'] }): void {
    const ctx = this.ctx
    const detector = this.detector
    if (!ctx || !detector) return

    this.syncOffset()

    const [freq, clarity] = detector.findPitch(data.samples, ctx.sampleRate)
    const hop: Hop = {
      blocks: data.blocks,
      time: data.time,
      freq: freq > 0 ? freq : null,
      clarity,
    }

    const notas = this.tracker.push(hop)
    for (const n of notas) {
      this.opts.onNote?.({ ...n, onTime: this.toPerf(n.onTime) - this.latencyMs })
    }

    if (this.opts.onFrame) {
      const rms = data.blocks.length ? data.blocks[data.blocks.length - 1].rms : 0
      const d = midiFromFrequency(freq)
      this.opts.onFrame({
        midi: d ? d.midi : null,
        cents: d ? d.cents : 0,
        clarity,
        rms,
      })
    }
  }

  /** Instante do relogio de audio na regua do performance.now(). */
  private toPerf(audioTime: number): number {
    return audioTime * 1000 + this.offsetMs
  }

  private syncOffset(): void {
    const ctx = this.ctx
    if (!ctx) return
    const ts = ctx.getOutputTimestamp?.()
    const next =
      ts && ts.contextTime !== undefined && ts.performanceTime !== undefined
        ? ts.performanceTime - ts.contextTime * 1000
        : performance.now() - ctx.currentTime * 1000
    this.offsetMs = this.offsetMs === 0 ? next : this.offsetMs * 0.9 + next * 0.1
  }
}
