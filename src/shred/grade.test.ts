import { describe, expect, it } from 'vitest'
import { DEFAULT_INSTRUMENT } from '../core/tuning'
import { SCALES } from '../core/shapes'
import { expandPattern, type PatternSpec } from './pattern'
import { grade, type GradeConfig, type PlayedNote } from './grade'

const BPM = 120
const ORIGIN = 10_000

const spec: PatternSpec = {
  shape: SCALES.find((s) => s.id === 'maior')!,
  rootPc: 0,
  octaves: 2,
  direction: 'up',
  subdivision: 4,
}

// Dó maior em duas oitavas: 15 semicolcheias subindo.
const expected = expandPattern(spec, DEFAULT_INSTRUMENT).notes

const config: GradeConfig = {
  bpm: BPM,
  originMs: ORIGIN,
  maxErrorRate: 0.02,
  maxIoiCv: 0.08,
  maxBpmDeviation: 0.03,
}

/** Execucao perfeita: cada nota exatamente na sua casa da grade. */
function perfect(offset: (i: number) => number = () => 0): PlayedNote[] {
  const beatMs = 60000 / BPM
  return expected.map((e, i) => ({
    midi: e.midi,
    velocity: 80,
    onTime: ORIGIN + e.beat * beatMs + offset(i),
  }))
}

describe('a forma que serve de base', () => {
  it('sobe duas oitavas de Dó maior, fechando na tônica de cima', () => {
    expect(expected).toHaveLength(15)
    expect(expected[0].midi).toBe(48)
    expect(expected[14].midi).toBe(72)
  })
})

describe('grade', () => {
  it('execução perfeita passa', () => {
    const g = grade(expected, perfect(), config)
    expect(g.missed).toBe(0)
    expect(g.extra).toBe(0)
    expect(g.accuracy).toBe(1)
    expect(g.ioiCv).toBeCloseTo(0, 6)
    expect(Math.round(g.effectiveBpm)).toBe(BPM)
    expect(g.gridMadMs).toBeCloseTo(0, 6)
    expect(g.passed).toBe(true)
    expect(g.reasons).toEqual([])
  })

  it('tolera o tremido humano pequeno', () => {
    // Desvio sem padrao, ate 4 ms numa semicolcheia de 125 ms.
    const jitter = [0, 3, -2, 4, -3, 1, 2, -4, 0, 3, -1, 2, -3, 1, 0]
    const g = grade(expected, perfect((i) => jitter[i]), config)
    expect(g.ioiCv).toBeLessThan(config.maxIoiCv)
    expect(g.passed).toBe(true)
  })

  it('pega o mancar sistemático que o tremido aleatório não dispara', () => {
    // Alternar +-6 ms nao e ruido, e manqueira: vira 12 ms de oscilacao no IOI,
    // ~10% da semicolcheia, e da para ouvir. Tem que reprovar.
    const g = grade(expected, perfect((i) => (i % 2 ? 6 : -6)), config)
    expect(g.ioiCv).toBeGreaterThan(config.maxIoiCv)
    expect(g.passed).toBe(false)
  })

  it('nota comida conta como faltando e não contamina o resto', () => {
    const played = perfect().filter((_, i) => i !== 5)
    const g = grade(expected, played, config)
    expect(g.missed).toBe(1)
    expect(g.extra).toBe(0)
    expect(g.status[5]).toBe('missed')
    expect(g.status.filter((s) => s === 'matched')).toHaveLength(14)
    // Uma nota comida cabe no orcamento: exigir execucao perfeita em 15 notas
    // nao e estudo.
    expect(g.passed).toBe(true)
  })

  it('duas notas comidas já estouram o orçamento', () => {
    const played = perfect().filter((_, i) => i !== 5 && i !== 9)
    const g = grade(expected, played, config)
    expect(g.missed).toBe(2)
    expect(g.passed).toBe(false)
  })

  it('nota a mais conta como sobrando e não contamina o resto', () => {
    const played = perfect()
    played.splice(6, 0, { midi: 61, velocity: 80, onTime: played[5].onTime + 60 })
    const g = grade(expected, played, config)
    expect(g.extra).toBe(1)
    expect(g.missed).toBe(0)
    expect(g.status.every((s) => s === 'matched')).toBe(true)
  })

  it('nota trocada dá uma faltando e uma sobrando, o resto intacto', () => {
    const played = perfect()
    played[7] = { ...played[7], midi: played[7].midi + 1 }
    const g = grade(expected, played, config)
    expect(g.missed).toBe(1)
    expect(g.extra).toBe(1)
    expect(g.status[7]).toBe('missed')
    expect(g.status.filter((s) => s === 'matched')).toHaveLength(14)
  })

  it('regular mas 20% mais devagar reprova no andamento, não na regularidade', () => {
    const beatMs = 60000 / BPM
    const played = expected.map((e) => ({
      midi: e.midi,
      velocity: 80,
      onTime: ORIGIN + e.beat * beatMs * 1.2,
    }))
    const g = grade(expected, played, config)
    expect(g.ioiCv).toBeCloseTo(0, 6) // regular, so devagar
    expect(Math.round(g.effectiveBpm)).toBe(100)
    expect(g.passed).toBe(false)
    expect(g.reasons.join(' ')).toMatch(/andamento/)
  })

  it('no andamento certo mas porco reprova na regularidade', () => {
    const g = grade(expected, perfect((i) => (i % 2 ? -40 : 0)), config)
    expect(g.ioiCv).toBeGreaterThan(config.maxIoiCv)
    expect(Math.abs(g.effectiveBpm - BPM) / BPM).toBeLessThan(config.maxBpmDeviation)
    expect(g.passed).toBe(false)
    expect(g.reasons.join(' ')).toMatch(/desigual/)
  })

  it('aponta qual nota arrasta', () => {
    const g = grade(expected, perfect((i) => (i === 9 ? 45 : 0)), config)
    const dev = g.perNoteDevMs
    expect(dev[9]).toBeGreaterThan(30)
    // E a seguinte aparece "adiantada", porque o vao encurtou.
    expect(dev[10]).toBeLessThan(-30)
    expect(dev[3] ?? 0).toBeLessThan(15)
  })

  it('não finge medir regularidade com corrente de ataques curta demais', () => {
    const played = perfect().filter((_, i) => [0, 1, 4, 5].includes(i))
    const g = grade(expected, played, config)
    expect(g.attempted).toBe(true)
    expect(g.reasons.join(' ')).toMatch(/notas de menos/)
  })

  it('mede ataque desigual sem reprovar por isso', () => {
    const played = perfect().map((n, i) => ({ ...n, velocity: i % 4 === 3 ? 40 : 100 }))
    const g = grade(expected, played, config)
    expect(g.velocityStdev).toBeGreaterThan(20)
    expect(g.passed).toBe(true) // diagnostico, nao porteira
  })

  it('não engasga sem nada tocado', () => {
    const g = grade(expected, [], config)
    expect(g.missed).toBe(15)
    expect(g.accuracy).toBe(0)
    expect(g.passed).toBe(false)
    expect(Number.isFinite(g.ioiCv)).toBe(true)
  })
})

describe('permissividade na entrada de nota', () => {
  it('um escorregão numa repetição curta não reprova', () => {
    const semUma = perfect().filter((_, i) => i !== 6)
    expect(grade(expected, semUma, { ...config, maxErrorRate: 0.03 }).passed).toBe(true)
  })

  it('o orçamento de erro nunca é zero, por menor que seja a forma', () => {
    // 15 notas a 3% arredondaria para 0. O piso de 1 tem que aparecer no limite.
    const played = perfect()
    played[3] = { ...played[3], midi: played[3].midi + 1 }
    played[11] = { ...played[11], midi: played[11].midi + 1 }
    const g = grade(expected, played, { ...config, maxErrorRate: 0.03 })
    expect(g.attempted).toBe(true)
    expect(g.reasons.join(' ')).toMatch(/limite 1/)
  })
})

describe('oitava errada', () => {
  it('tudo uma oitava abaixo vira explicação, não erro cru', () => {
    const played = perfect().map((n) => ({ ...n, midi: n.midi - 12 }))
    const g = grade(expected, played, config)
    expect(g.transposeHint).toBe(-12)
    expect(g.reasons.join(' ')).toMatch(/1 oitava abaixo/)
  })

  it('tudo 2 semitons acima também', () => {
    const played = perfect().map((n) => ({ ...n, midi: n.midi + 2 }))
    expect(grade(expected, played, config).transposeHint).toBe(2)
  })

  it('não inventa transposição quando os erros são espalhados', () => {
    const played = perfect()
    played[3] = { ...played[3], midi: played[3].midi + 1 }
    played[9] = { ...played[9], midi: played[9].midi + 7 }
    expect(grade(expected, played, config).transposeHint).toBeNull()
  })

  it('não reporta transposição quando a contagem de notas não bate', () => {
    const played = perfect().slice(0, 10).map((n) => ({ ...n, midi: n.midi - 12 }))
    expect(grade(expected, played, config).transposeHint).toBeNull()
  })

  it('lista o que faltou e o que sobrou', () => {
    const played = perfect().filter((_, i) => i !== 4)
    const g = grade(expected, played, config)
    expect(g.missedNotes).toEqual([expected[4].midi])
    expect(g.extraNotes).toEqual([])
  })
})

describe('repetição sem nada tocado', () => {
  it('não tocar nada não é falha de execução', () => {
    const g = grade(expected, [], config)
    expect(g.attempted).toBe(false)
    expect(g.reasons).toEqual(['repetição sem nada tocado'])
    expect(g.passed).toBe(false)
  })

  it('duas notas soltas ainda contam como nada tocado', () => {
    expect(grade(expected, perfect().slice(0, 2), config).attempted).toBe(false)
  })

  it('de um quarto da forma em diante já é tentativa de verdade', () => {
    const g = grade(expected, perfect().slice(0, 8), config)
    expect(g.attempted).toBe(true)
    expect(g.reasons.join(' ')).toMatch(/erro/)
  })

  it('execução completa é sempre tentativa', () => {
    expect(grade(expected, perfect(), config).attempted).toBe(true)
  })
})

describe('reencontrar a linha depois do tropeço', () => {
  it('pular seis notas no meio não condena o resto da repetição', () => {
    const played = perfect().filter((_, i) => i < 4 || i >= 10)
    const g = grade(expected, played, config)
    expect(g.missed).toBe(7)
    expect(g.extra).toBe(1)
    // O que importa: da nota 11 em diante volta a casar, em vez de tudo virar
    // sobra ate o fim da repeticao.
    expect(g.status.slice(11).every((s) => s === 'matched')).toBe(true)
  })

  it('uma nota errada isolada não manda o cursor pular à frente', () => {
    const played = perfect()
    played[5] = { ...played[5], midi: 127 } // altura que nao existe na forma
    const g = grade(expected, played, config)
    expect(g.missed).toBe(1)
    expect(g.extra).toBe(1)
    expect(g.status.filter((s) => s === 'matched')).toHaveLength(14)
  })
})
