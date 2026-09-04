// Metronomo e transporte.
//
// setTimeout/setInterval tem dezenas de ms de tremido — inaceitavel para um
// clique que alguem vai usar como referencia de tempo. O padrao aqui e o
// classico "A Tale of Two Clocks": um timer grosseiro (25 ms) so olha a frente e
// AGENDA os cliques no relogio de audio, que e preciso. Nada soa no instante em
// que o timer dispara.

import { audioContext, masterBus, pluck, unlockAudio } from '../audio/engine'

const LOOKAHEAD_MS = 25
const SCHEDULE_AHEAD_S = 0.1

export type StartOpts = {
  bpm: number
  beatsPerBar: number
  /** Compassos de contagem antes do tempo 0. */
  countInBars: number
}

export type Beat = {
  /** 0 = primeiro tempo do exercicio. Negativo = contagem. */
  index: number
  audioTime: number
  /** O mesmo instante na regua do performance.now(). E o que a avaliacao usa. */
  perfTime: number
  bar: number
  beatInBar: number
}

type Mark = { index: number; audio: number }

export class Transport {
  private ctx: AudioContext | null = null
  /** Ganho so do clique: o metronomo desce sem mexer na corda. */
  private clickGain: GainNode | null = null
  private ruido: AudioBuffer | null = null
  private volume = 0.8
  private timer: ReturnType<typeof setInterval> | null = null
  private nextAudio = 0
  private nextIndex = 0
  private bpm = 120
  private beatsPerBar = 4
  /** Ponte entre o relogio de audio e o de performance, em ms. */
  private offsetMs = 0
  /** Ultimos tempos agendados, para interpolar a posicao atual. */
  private marks: Mark[] = []

  /** Dispara quando um tempo e AGENDADO — ou seja, com perfTime no futuro. */
  onBeat: ((b: Beat) => void) | null = null

  get running(): boolean {
    return this.timer !== null
  }

  get currentBpm(): number {
    return this.bpm
  }

  /** Precisa ser chamado dentro de um gesto do usuario: o navegador exige. */
  async start(opts: StartOpts): Promise<void> {
    this.stop()
    const ctx = this.ensureCtx()
    if (ctx.state === 'suspended') await ctx.resume()

    this.bpm = opts.bpm
    this.beatsPerBar = opts.beatsPerBar
    this.syncOffset()

    this.nextIndex = -opts.countInBars * opts.beatsPerBar
    this.nextAudio = ctx.currentTime + 0.15 // folga para a primeira passada
    this.marks = []

    this.tick()
    this.timer = setInterval(() => this.tick(), LOOKAHEAD_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.marks = []
  }

  /** Mudanca de andamento vale do proximo tempo em diante. */
  setBpm(bpm: number): void {
    this.bpm = bpm
  }

  /**
   * Posicao atual em tempos (fracionaria). Negativa durante a contagem.
   * Interpola entre os tempos agendados, entao segue certa com bpm variavel.
   */
  position(): number {
    const ctx = this.ctx
    if (!ctx || this.marks.length === 0) return Number.NaN
    const now = ctx.currentTime
    const m = this.marks
    for (let i = m.length - 1; i >= 0; i--) {
      if (m[i].audio <= now) {
        const next = m[i + 1]
        if (!next) return m[i].index + ((now - m[i].audio) * this.bpm) / 60
        const frac = (now - m[i].audio) / (next.audio - m[i].audio)
        return m[i].index + frac * (next.index - m[i].index)
      }
    }
    return m[0].index - ((m[0].audio - now) * this.bpm) / 60
  }

  /** Converte instante do relogio de audio para a regua do performance.now(). */
  audioToPerf(audioTime: number): number {
    return audioTime * 1000 + this.offsetMs
  }

  /** Duracao de um tempo em ms, no bpm atual. */
  beatMs(): number {
    return 60000 / this.bpm
  }

  /** 0 a 1. Vale na hora, mesmo com o transporte rodando. */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v))
    if (this.clickGain) this.clickGain.gain.value = this.volume
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      unlockAudio()
      // Compartilhado com a corda: a grade da avaliacao e construida neste
      // relogio, entao um segundo contexto poria o que voce toca numa linha do
      // tempo propria.
      this.ctx = audioContext()
      this.clickGain = this.ctx.createGain()
      this.clickGain.gain.value = this.volume
      this.clickGain.connect(masterBus() ?? this.ctx.destination)
    }
    return this.ctx
  }

  private syncOffset(): void {
    const ctx = this.ctx
    if (!ctx) return
    // getOutputTimestamp da os dois relogios no mesmo instante, que e exatamente
    // a ponte que precisamos. Nem todo navegador tem — ai amostramos na mao.
    const ts = ctx.getOutputTimestamp?.()
    const next =
      ts && ts.contextTime !== undefined && ts.performanceTime !== undefined
        ? ts.performanceTime - ts.contextTime * 1000
        : performance.now() - ctx.currentTime * 1000
    // A primeira medida entra inteira; depois suaviza, senao a grade treme.
    this.offsetMs = this.offsetMs === 0 ? next : this.offsetMs * 0.9 + next * 0.1
  }

  private tick(): void {
    const ctx = this.ctx
    if (!ctx) return
    this.syncOffset()

    while (this.nextAudio < ctx.currentTime + SCHEDULE_AHEAD_S) {
      this.scheduleBeat(this.nextIndex, this.nextAudio)
      this.nextAudio += 60 / this.bpm
      this.nextIndex += 1
    }
  }

  private scheduleBeat(index: number, audio: number): void {
    const beatInBar = ((index % this.beatsPerBar) + this.beatsPerBar) % this.beatsPerBar
    const isDownbeat = beatInBar === 0
    const isCountIn = index < 0

    // A contagem soa diferente do exercicio, para a entrada nao confundir.
    this.click(audio, isDownbeat ? 2600 : 1500, isCountIn ? 0.5 : isDownbeat ? 0.7 : 0.4)

    this.marks.push({ index, audio })
    if (this.marks.length > 64) this.marks.shift()

    this.onBeat?.({
      index,
      audioTime: audio,
      perfTime: this.audioToPerf(audio),
      bar: Math.floor(index / this.beatsPerBar),
      beatInBar,
    })
  }

  /** Nota sintetizada, para demonstrar o exercicio antes de voce tocar. */
  note(midi: number, atAudio: number, gain = 0.5): void {
    const ctx = this.ctx
    if (!ctx) return
    pluck(midi, { delay: atAudio - ctx.currentTime, gain, corta: false })
  }

  /**
   * O clique e um estalo de ruido filtrado, nao um bipe de oscilador.
   *
   * Isso nao e gosto: o microfone que avalia o exercicio esta ligado, e uma
   * senoide de 1200 Hz e uma nota — o detector de altura casa nela com confianca
   * altissima e a contaria como nota tocada, bem em cima do tempo, que e onde
   * mais estraga. Ruido em passa-faixa nao tem periodo, entao a confianca do
   * detector despenca e o filtro de estabilidade descarta sozinho. De quebra soa
   * mais como metronomo de verdade do que o bipe soava.
   */
  private click(time: number, freq: number, gain: number): void {
    const ctx = this.ctx
    if (!ctx) return
    const src = ctx.createBufferSource()
    src.buffer = this.ruidoBuffer(ctx)

    const banda = ctx.createBiquadFilter()
    banda.type = 'bandpass'
    banda.frequency.value = freq
    // Q baixo de proposito: banda estreita demais faz o ruido "cantar" uma
    // altura, que e justamente o que estamos evitando.
    banda.Q.value = 1.2

    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, time)
    env.gain.exponentialRampToValueAtTime(gain, time + 0.001)
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.035)

    src.connect(banda).connect(env).connect(this.clickGain ?? ctx.destination)
    src.start(time)
    src.stop(time + 0.05)
  }

  private ruidoBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.ruido) {
      const len = Math.ceil(ctx.sampleRate * 0.05)
      this.ruido = ctx.createBuffer(1, len, ctx.sampleRate)
      const y = this.ruido.getChannelData(0)
      for (let i = 0; i < len; i++) y[i] = Math.random() * 2 - 1
    }
    return this.ruido
  }
}
