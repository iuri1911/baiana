// Ajustes e recordes do treino por audio, no localStorage.
//
// Chave propria, separada da configuracao do braço: o instrumento e a afinacao
// valem para o app inteiro, isto aqui e so deste modo.

import { DEFAULT_RAMP } from '../shred/ramp'
import { DEFAULT_TRACKER } from '../shred/pitch/tracker'

const CHAVE_CFG = 'baiana.shred.v1'
const CHAVE_STATS = 'baiana.shred.stats.v1'

export interface ShredSettings {
  shapeId: string
  rootPc: number
  octaves: number
  direction: 'up' | 'down' | 'updown'
  subdivision: number
  mode: 'ladder' | 'burst' | 'accel' | 'free'
  bpm: number
  minBpm: number
  /** Repeticoes limpas para subir. 0 = travado, avalia mas nao mexe no andamento. */
  advanceReps: number
  clickVolume: number
  /** Toca a forma junto enquanto voce toca, para quem ainda nao decorou. */
  guide: boolean
  guideVolume: number
  /** Atraso do caminho de entrada, em ms, subtraido de todo instante. */
  latencyMs: number
  /** Piso de ruido do microfone, calibrado na tela de conferencia. */
  noiseFloor: number
  /** Ja passou pela conferencia de microfone. */
  micOk: boolean
}

export const PADRAO_SHRED: ShredSettings = {
  shapeId: 'maior',
  rootPc: 0,
  octaves: 2,
  direction: 'updown',
  subdivision: 4,
  mode: 'ladder',
  bpm: 60,
  minBpm: DEFAULT_RAMP.minBpm,
  advanceReps: 2,
  clickVolume: 0.8,
  guide: false,
  guideVolume: 0.5,
  latencyMs: 0,
  noiseFloor: DEFAULT_TRACKER.noiseFloor,
  micOk: false,
}

export function loadShredSettings(): ShredSettings {
  try {
    const cru = localStorage.getItem(CHAVE_CFG)
    if (!cru) return PADRAO_SHRED
    return { ...PADRAO_SHRED, ...(JSON.parse(cru) as Partial<ShredSettings>) }
  } catch {
    return PADRAO_SHRED
  }
}

export function saveShredSettings(cfg: ShredSettings): ShredSettings {
  try {
    localStorage.setItem(CHAVE_CFG, JSON.stringify(cfg))
  } catch {
    // cota cheia ou modo anonimo: perder o ajuste nao pode derrubar o treino
  }
  return cfg
}

// --- recordes -------------------------------------------------------------

export interface ShredStats {
  /** Maior BPM aprovado, por "forma:tonica". */
  best: Record<string, number>
  /** Desvio medio acumulado por indice de nota, por forma. Diz onde voce tropeça. */
  drift: Record<string, { sum: number; n: number }[]>
}

const VAZIO: ShredStats = { best: {}, drift: {} }

export function loadShredStats(): ShredStats {
  try {
    const cru = localStorage.getItem(CHAVE_STATS)
    if (!cru) return VAZIO
    return { ...VAZIO, ...(JSON.parse(cru) as Partial<ShredStats>) }
  } catch {
    return VAZIO
  }
}

function persist(stats: ShredStats): ShredStats {
  try {
    localStorage.setItem(CHAVE_STATS, JSON.stringify(stats))
  } catch {
    // idem
  }
  return stats
}

export function clearShredStats(): ShredStats {
  try {
    localStorage.removeItem(CHAVE_STATS)
  } catch {
    // idem
  }
  return VAZIO
}

export function keyOf(shapeId: string, rootPc: number): string {
  return `${shapeId}:${rootPc}`
}

/**
 * Registra uma repeticao. O recorde so sobe com repeticao aprovada; o desvio por
 * nota acumula sempre, porque saber onde a mao trava vale mesmo quando reprovou.
 */
export function recordRep(
  stats: ShredStats,
  shapeId: string,
  rootPc: number,
  bpm: number,
  passed: boolean,
  perNoteDevMs: (number | null)[],
): ShredStats {
  const chave = keyOf(shapeId, rootPc)
  const best = { ...stats.best }
  if (passed) best[chave] = Math.max(best[chave] ?? 0, bpm)

  const drift = { ...stats.drift }
  const lista = [...(drift[shapeId] ?? [])]
  perNoteDevMs.forEach((d, i) => {
    if (d === null) return
    const atual = lista[i] ?? { sum: 0, n: 0 }
    lista[i] = { sum: atual.sum + Math.abs(d), n: atual.n + 1 }
  })
  drift[shapeId] = lista

  return persist({ best, drift })
}

/** Maior BPM aprovado nesta forma, em qualquer tonica. */
export function bestFor(stats: ShredStats, shapeId: string): number {
  return Object.entries(stats.best)
    .filter(([k]) => k.startsWith(`${shapeId}:`))
    .reduce((m, [, v]) => Math.max(m, v), 0)
}

export interface Fumble {
  index: number
  devMs: number
}

/**
 * As notas em que a mao mais tropeça, da pior para a melhor. Exige algumas
 * passadas: uma repeticao ruim isolada nao e diagnostico, e ruido.
 */
export function worstNotes(stats: ShredStats, shapeId: string, minPasses = 3): Fumble[] {
  const lista = stats.drift[shapeId] ?? []
  return lista
    .map((d, index) => (d && d.n >= minPasses ? { index, devMs: d.sum / d.n } : null))
    .filter((x): x is Fumble => x !== null)
    .sort((a, b) => b.devMs - a.devMs)
    .slice(0, 5)
}
