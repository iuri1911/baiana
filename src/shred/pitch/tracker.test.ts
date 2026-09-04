import { describe, expect, it } from 'vitest'
import { frequency } from '../../core/music'
import { DEFAULT_TRACKER, NoteTracker, velocityFrom, type Hop } from './tracker'

const HOP_S = 512 / 48000 // ~10,7 ms
const BLOCK_S = 128 / 48000 // ~2,7 ms
const QUIET = 0.002
const LOUD = 0.2

/**
 * Os quatro blocos de um hop de nota SUSTENTADA: volume parado e agudo ja
 * gasto. Corda em decaimento perde o brilho muito antes de perder o volume, e e
 * essa diferenca que deixa a proxima palhetada aparecer.
 */
function blocks(t: number, rms: number, hf = rms * 0.05) {
  return [0, 1, 2, 3].map((i) => ({ time: t + i * BLOCK_S, rms, hf }))
}

/** Um hop de silencio. */
function silence(t: number): Hop {
  return { blocks: blocks(t, QUIET), time: t + HOP_S, freq: null, clarity: 0 }
}

/** Um hop com nota soando, sem ataque (energia constante). */
function sustain(t: number, midi: number, rms = LOUD): Hop {
  return {
    blocks: blocks(t, rms),
    time: t + HOP_S,
    freq: frequency(midi),
    clarity: 0.99,
  }
}

/**
 * Toca uma nota: um hop com o ataque (energia salta no primeiro bloco) e os
 * seguintes sustentando, ate a altura se firmar.
 */
function play(tracker: NoteTracker, t: number, midi: number, hops = 3, rms = LOUD) {
  const out = []
  // O ataque cai no primeiro bloco deste hop.
  const ataque: Hop = {
    blocks: [
      // O estalo da palheta: agudo muito acima do que a corda sustenta depois.
      { time: t, rms, hf: rms },
      { time: t + BLOCK_S, rms, hf: rms * 0.3 },
      { time: t + 2 * BLOCK_S, rms, hf: rms * 0.1 },
      { time: t + 3 * BLOCK_S, rms, hf: rms * 0.05 },
    ],
    time: t + HOP_S,
    // Logo no ataque o detector ainda nao se firmou: so transiente.
    freq: null,
    clarity: 0,
  }
  out.push(...tracker.push(ataque))
  for (let i = 1; i < hops; i++) {
    out.push(...tracker.push(sustain(t + i * HOP_S, midi, rms)))
  }
  return out
}

describe('velocityFrom', () => {
  it('fica dentro de 1..127', () => {
    expect(velocityFrom(0, 0.01)).toBe(1)
    expect(velocityFrom(1000, 0.01)).toBe(127)
  })

  it('ataque mais forte dá velocity maior', () => {
    const fraco = velocityFrom(0.05, 0.01)
    const forte = velocityFrom(0.5, 0.01)
    expect(forte).toBeGreaterThan(fraco)
  })
})

describe('NoteTracker', () => {
  it('emite a nota uma vez só, não a cada hop que ela continua soando', () => {
    const t = new NoteTracker()
    const notas = play(t, 1, 60, 8)
    expect(notas).toHaveLength(1)
    expect(notas[0].midi).toBe(60)
  })

  it('carimba a nota no instante do ATAQUE, não no de a altura se firmar', () => {
    // E a razao de existir do arquivo: a altura so fecha uns 30 ms depois, e usar
    // esse instante jogaria toda a medida de regularidade para a frente.
    const t = new NoteTracker()
    const notas = play(t, 5, 60, 4)
    expect(notas[0].onTime).toBeCloseTo(5, 10)
  })

  it('reconhece uma escala corrida como notas separadas', () => {
    const t = new NoteTracker()
    const escala = [48, 50, 52, 53, 55]
    const notas = []
    let agora = 0
    for (const midi of escala) {
      notas.push(...play(t, agora, midi, 3))
      agora += 3 * HOP_S
    }
    expect(notas.map((n) => n.midi)).toEqual(escala)
  })

  it('nota repetida no mesmo tom conta duas vezes, porque houve dois ataques', () => {
    const t = new NoteTracker()
    const primeira = play(t, 0, 60, 3)
    const segunda = play(t, 3 * HOP_S, 60, 3)
    expect(primeira).toHaveLength(1)
    expect(segunda).toHaveLength(1)
    expect(segunda[0].onTime).toBeCloseTo(3 * HOP_S, 10)
  })

  it('silêncio não vira nota', () => {
    const t = new NoteTracker()
    const notas = []
    for (let i = 0; i < 20; i++) notas.push(...t.push(silence(i * HOP_S)))
    expect(notas).toEqual([])
  })

  it('descarta o que o detector não tem confiança de ter ouvido', () => {
    // E assim que o clique do metrônomo é filtrado: ruído em passa-faixa não
    // sustenta altura, então a confiança fica baixa e nada é emitido.
    const t = new NoteTracker()
    const notas = []
    let agora = 0
    for (let i = 0; i < 6; i++) {
      notas.push(
        ...t.push({
          blocks: blocks(agora, LOUD),
          time: agora + HOP_S,
          freq: 1500,
          clarity: 0.4, // ruído: o detector não se firma
        }),
      )
      agora += HOP_S
    }
    expect(notas).toEqual([])
  })

  it('descarta altura fora da extensão do instrumento', () => {
    const t = new NoteTracker({ low: 48, high: 100 })
    const notas = []
    let agora = 0
    // Voz aguda, ou o detector confundindo um harmônico: alto e confiante, mas
    // fora do que a baiana produz.
    for (let i = 0; i < 6; i++) {
      notas.push(...t.push(sustain(agora, 108)))
      agora += HOP_S
    }
    expect(notas).toEqual([])
  })

  it('exige hops concordando: um quadro solto não emite nota', () => {
    const t = new NoteTracker({ stableHops: 3 })
    const notas = play(t, 0, 60, 2) // ataque + 1 hop de altura só
    expect(notas).toEqual([])
  })

  it('altura oscilando entre dois semitons não fecha nota nenhuma', () => {
    const t = new NoteTracker({ stableHops: 3 })
    const notas = []
    let agora = 0
    for (let i = 0; i < 8; i++) {
      notas.push(...t.push(sustain(agora, i % 2 ? 60 : 61)))
      agora += HOP_S
    }
    expect(notas).toEqual([])
  })

  it('reset não deixa nota armada vazar para a repetição seguinte', () => {
    const t = new NoteTracker()
    // Ataque sem confirmação de altura ainda.
    t.push({ blocks: blocks(0, LOUD), time: HOP_S, freq: null, clarity: 0 })
    t.reset()
    // A altura chega agora, mas o ataque daquela repetição já não existe.
    const notas = t.push(sustain(HOP_S, 60))
    expect(notas).toEqual([])
  })

  it('a velocity acompanha a força do ataque', () => {
    const t = new NoteTracker()
    const forte = play(t, 0, 60, 3, 0.4)
    t.reset()
    const fraco = play(t, 10, 62, 3, 0.03)
    expect(forte[0].velocity).toBeGreaterThan(fraco[0].velocity)
  })

  it('nota tocada por cima da anterior ainda soando conta como ataque novo', () => {
    // Numa escala corrida a corda anterior ainda vibra. Se o ataque exigisse
    // silêncio antes, metade das notas sumiria.
    const t = new NoteTracker()
    const primeira = play(t, 0, 60, 3, 0.15)
    // A seguinte entra com energia bem acima do que restou da anterior.
    const segunda = play(t, 3 * HOP_S, 62, 3, 0.45)
    expect(primeira).toHaveLength(1)
    expect(segunda).toHaveLength(1)
    expect(segunda[0].midi).toBe(62)
  })
})

describe('extensão padrão', () => {
  it('cobre a baiana de 5 cordas do Dó3 até a 24ª casa', () => {
    expect(DEFAULT_TRACKER.low).toBeLessThanOrEqual(48)
    expect(DEFAULT_TRACKER.high).toBeGreaterThanOrEqual(76 + 24)
  })
})
