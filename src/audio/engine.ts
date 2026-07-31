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
let live: AudioBufferSourceNode[] = []

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

  const decay = 0.5 * (0.9995 - Math.min(0.004, (midi - 48) * 0.00012))
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
  /** Segundos a partir de agora. */
  delay?: number
  gain?: number
}

export function pluck(midi: number, opts: PluckOptions = {}): void {
  unlockAudio()
  if (!ctx || !master) return
  const { delay = 0, gain = 1 } = opts
  const src = ctx.createBufferSource()
  src.buffer = bufferFor(ctx, midi)
  const g = ctx.createGain()
  g.gain.value = gain
  src.connect(g).connect(master)
  src.start(ctx.currentTime + delay)
  live.push(src)
  src.onended = () => {
    live = live.filter((s) => s !== src)
  }
}

/** Toca uma sequencia no andamento pedido. Devolve a duracao total em ms. */
export function pluckSequence(midis: number[], bpm = 90): number {
  const passo = 60 / bpm
  midis.forEach((m, i) => pluck(m, { delay: i * passo }))
  return midis.length * passo * 1000
}

/** Acorde: tudo junto, com um fio de arpejo para nao virar bloco. */
export function strum(midis: number[], espalhar = 0.02): void {
  midis.forEach((m, i) => pluck(m, { delay: i * espalhar, gain: 0.8 }))
}

export function stopAll(): void {
  for (const src of live) {
    try {
      src.stop()
    } catch {
      // ja terminou sozinho
    }
  }
  live = []
}
