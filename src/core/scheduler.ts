// Repeticao espacada por posicao do braco.
//
// A regra e simples de propósito: cada corda×traste guarda o que voce fez ali, e
// o sorteio da mais peso ao que voce erra, ao que voce demora e ao que ja faz
// tempo que nao cai. Acertou rapido varias vezes seguidas, a posicao some por um
// intervalo que dobra a cada acerto — que e o que faz o treino render em vez de
// sortear as mesmas notas para sempre.

import type { Position } from './fretboard'
import { posKey } from './fretboard'

export interface PosStat {
  seen: number
  correct: number
  /** Acertos seguidos; zera no erro. Define o intervalo ate a posicao voltar. */
  streak: number
  /** Media movel do tempo de resposta, em ms. */
  avgMs: number
  lastAt: number
}

export type Stats = Record<string, PosStat>

/** Resposta rapida o bastante para contar como sabida de cor. */
const FAST_MS = 2500
const FIRST_INTERVAL_MS = 45_000
const MAX_INTERVAL_MS = 7 * 24 * 3600_000

export function emptyStat(): PosStat {
  return { seen: 0, correct: 0, streak: 0, avgMs: 0, lastAt: 0 }
}

export function updateStat(prev: PosStat | undefined, correct: boolean, ms: number, now: number): PosStat {
  const s = prev ?? emptyStat()
  return {
    seen: s.seen + 1,
    correct: s.correct + (correct ? 1 : 0),
    streak: correct ? s.streak + 1 : 0,
    avgMs: s.seen === 0 ? ms : Math.round(s.avgMs * 0.7 + ms * 0.3),
    lastAt: now,
  }
}

/** Quanto tempo essa posicao deve ficar de molho antes de voltar. */
export function intervalFor(stat: PosStat): number {
  if (stat.streak <= 0) return 0
  const slow = stat.avgMs > FAST_MS ? 0.5 : 1 // demorou, volta na metade do tempo
  return Math.min(FIRST_INTERVAL_MS * Math.pow(2, stat.streak - 1) * slow, MAX_INTERVAL_MS)
}

export function accuracy(stat: PosStat): number {
  return stat.seen === 0 ? 0 : stat.correct / stat.seen
}

/**
 * Peso no sorteio. Nunca zero: posicao dominada ainda pode cair de vez em quando,
 * senao o treino vira so a lista dos erros e a memoria do resto apodrece.
 */
export function weightOf(stat: PosStat | undefined, now: number): number {
  if (!stat || stat.seen === 0) return 6 // nunca vista: prioridade alta

  const errorFactor = 1 + 5 * (1 - accuracy(stat))
  const slowFactor = stat.avgMs > FAST_MS ? 1.5 : 1

  const elapsed = now - stat.lastAt
  const interval = intervalFor(stat)
  // antes de vencer o intervalo o peso cai; depois de vencer, cresce devagar
  const dueFactor = interval === 0 ? 2 : Math.min(2, 0.1 + (elapsed / interval) * 0.9)

  return Math.max(0.05, errorFactor * slowFactor * dueFactor)
}

export interface PickOptions {
  stats: Stats
  now: number
  /** Nao repetir a pergunta anterior quando houver alternativa. */
  exclude?: Position | null
  rng?: () => number
}

export function pickWeighted(candidates: Position[], opts: PickOptions): Position | null {
  const { stats, now, exclude, rng = Math.random } = opts
  const pool =
    exclude && candidates.length > 1
      ? candidates.filter((p) => posKey(p) !== posKey(exclude))
      : candidates
  if (pool.length === 0) return null

  const weights = pool.map((p) => weightOf(stats[posKey(p)], now))
  const total = weights.reduce((a, b) => a + b, 0)
  let r = rng() * total
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]
    if (r <= 0) return pool[i]
  }
  return pool[pool.length - 1]
}
