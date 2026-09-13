// Corda pincada por Karplus-Strong, gerada na hora.
//
// Por que nao usar amostras: a afinacao e configuravel e o braco vai ate a 24ª
// casa, entao seriam dezenas de arquivos so para cobrir a extensao — e o app
// precisa abrir offline no celular. O algoritmo cabe em vinte linhas, soa como
// corda e vale para qualquer altura.

import { frequency } from '../core/music'

let ctx: AudioContext | null = null
let master: GainNode | null = null
const cache = new Map<number, AudioBuffer>()
const CACHE_MAX = 48

interface Voz {
  src: AudioBufferSourceNode
  gain: GainNode
}
let live: Voz[] = []

/**
 * Precisa ser chamado de dentro de um gesto do usuario: no iOS (e no Chrome
 * desde 2018) contexto de audio criado fora de toque nasce suspenso e nunca
 * toca nada.
 */
export function unlockAudio(): void {
  if (!ctx) {
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = 0.9
    const corpo = ctx.createBiquadFilter() // tira o brilho de serra do ruido
    corpo.type = 'lowpass'
    corpo.frequency.value = 5000
    master.connect(corpo).connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
}

export function audioReady(): boolean {
  return ctx !== null && ctx.state === 'running'
}

/**
 * O contexto, para quem precisa agendar no mesmo relogio.
 *
 * O metronomo e a captacao do microfone TEM que viver aqui dentro: a avaliacao
 * compara o instante do clique com o instante da nota tocada, e dois contextos
 * dariam duas linhas do tempo que so por acaso batem.
 */
export function audioContext(): AudioContext {
  unlockAudio()
  return ctx as AudioContext
}

export function masterBus(): GainNode | null {
  return master
}

function buildBuffer(audio: AudioContext, midi: number): AudioBuffer {
  const sr = audio.sampleRate
  const freq = frequency(midi)
  const delay = Math.max(2, Math.round(sr / freq))
  // corda aguda morre mais rapido, igual no instrumento
  const seconds = Math.min(2.4, Math.max(0.9, 2.4 - (midi - 48) * 0.03))
  const len = Math.floor(sr * seconds)
  const buffer = audio.createBuffer(1, len, sr)
  const y = buffer.getChannelData(0)

  // palheta: ruido passado por uma media movel, senao o ataque sai estalando
  let anterior = 0
  for (let i = 0; i < delay; i++) {
    const ruido = Math.random() * 2 - 1
    anterior = (ruido + anterior) * 0.5
    y[i] = anterior
  }

  // o ganho do laco tem que ficar abaixo de 0,5: em 0,5 a corda nunca morre, e
  // acima disso ela cresce sozinha ate estourar. Afinacao grave (Dó2) chegava la.
  const brilho = Math.min(0.004, Math.max(0, (midi - 48) * 0.00012))
  const decay = 0.5 * (0.9995 - brilho)
  for (let i = delay; i < len; i++) {
    y[i] = (y[i - delay] + y[i - delay - 1 < 0 ? 0 : i - delay - 1]) * decay
  }

  // rabo de silencio: corta sem clique no fim do buffer
  const fade = Math.floor(sr * 0.08)
  for (let i = 0; i < fade; i++) {
    y[len - 1 - i] *= i / fade
  }
  return buffer
}

function bufferFor(audio: AudioContext, midi: number): AudioBuffer {
  const hit = cache.get(midi)
  if (hit) return hit
  const buffer = buildBuffer(audio, midi)
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as number)
  cache.set(midi, buffer)
  return buffer
}

export interface PluckOptions {
  /** Duração da nota na demonstração, em segundos. */
  duration?: number
  /** Segundos a partir de agora. */
  delay?: number
  gain?: number
  /** Cortar o que estiver soando antes de tocar. */
  corta?: boolean
}

/**
 * Corda soa ~2 s. Tocando o braco rapido, uma nota fica por cima da outra e
 * vira caldo: o padrao e a nota nova abafar a anterior, como a mao faz. Quem
 * quiser o contrario liga "deixar as notas soando" nos ajustes.
 */
let cortarAoTocar = true

export function setCorteAutomatico(corta: boolean): void {
  cortarAoTocar = corta
}

/** Abafa o que esta soando com um rabinho de fade, para nao estalar. */
export function silenciar(fade = 0.05): void {
  if (!ctx) return
  const agora = ctx.currentTime
  for (const voz of live) {
    try {
      voz.gain.gain.cancelScheduledValues(agora)
      voz.gain.gain.setValueAtTime(voz.gain.gain.value, agora)
      voz.gain.gain.linearRampToValueAtTime(0, agora + fade)
      voz.src.stop(agora + fade)
    } catch {
      // fonte que ja terminou nao aceita stop; nada a fazer
    }
  }
  live = []
}

export function pluck(midi: number, opts: PluckOptions = {}): void {
  unlockAudio()
  if (!ctx || !master) return
  const { delay = 0, gain = 1, corta = cortarAoTocar } = opts
  if (corta) silenciar()
  const src = ctx.createBufferSource()
  src.buffer = bufferFor(ctx, midi)
  const g = ctx.createGain()
  g.gain.value = gain
  const at = ctx.currentTime + Math.max(0, delay)
  let stopAt: number | undefined
  if (opts.duration !== undefined) {
    const end = at + Math.max(0.04, opts.duration)
    g.gain.setValueAtTime(gain, at)
    g.gain.setValueAtTime(gain, Math.max(at, end - 0.025))
    g.gain.linearRampToValueAtTime(0, end)
    stopAt = end + 0.01
  }
  src.connect(g).connect(master)
  src.start(at)
  if (stopAt !== undefined) src.stop(stopAt)
  const voz = { src, gain: g }
  live.push(voz)
  src.onended = () => {
    live = live.filter((v) => v !== voz)
  }
}

/** Toca uma sequencia no andamento pedido. Devolve a duracao total em ms. */
export function pluckSequence(midis: number[], bpm = 90): number {
  silenciar()
  const passo = 60 / bpm
  // as notas da sequencia ja estao agendadas: uma nao pode cortar a outra
  midis.forEach((m, i) => pluck(m, { delay: i * passo, corta: false }))
  return midis.length * passo * 1000
}

/** Acorde: tudo junto, com um fio de arpejo para nao virar bloco. */
export function strum(midis: number[], espalhar = 0.02): void {
  silenciar()
  midis.forEach((m, i) => pluck(m, { delay: i * espalhar, gain: 0.8, corta: false }))
}

export const stopAll = silenciar
