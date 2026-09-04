import { describe, expect, it } from 'vitest'
import { DEFAULT_INSTRUMENT } from '../core/tuning'
import { ARPEGGIOS, SCALES } from '../core/shapes'
import { expandPattern, type Direction, type PatternSpec } from './pattern'
import { boundaryBeats, grade } from './grade'

const BEATS_PER_BAR = 4
const BPM = 90

/**
 * Toca N voltas em laco, todas perfeitas, e avalia cada uma como o app avalia:
 * janela [repStart - corte, repEnd - corte), e o que caiu na janela sai da fila.
 */
function playLoop(spec: PatternSpec, reps: number) {
  const x = expandPattern(spec, DEFAULT_INSTRUMENT)
  const repBeats = Math.max(1, Math.ceil(x.beats / BEATS_PER_BAR)) * BEATS_PER_BAR
  const lastBeat = x.notes.reduce((m, n) => Math.max(m, n.beat), 0)
  const beatMs = 60000 / BPM
  const corte = beatMs * boundaryBeats(repBeats, lastBeat)

  let fila = Array.from({ length: reps + 1 }, (_, c) =>
    x.notes.map((n) => ({
      midi: n.midi,
      velocity: 80,
      onTime: (c * repBeats + n.beat) * beatMs,
    })),
  ).flat()

  return Array.from({ length: reps }, (_, r) => {
    const repStart = r * repBeats * beatMs
    const fim = (r + 1) * repBeats * beatMs - corte
    const janela = fila.filter((n) => n.onTime >= repStart - corte && n.onTime < fim)
    fila = fila.filter((n) => n.onTime >= fim)
    return grade(x.notes, janela, {
      bpm: BPM,
      originMs: repStart,
      maxErrorRate: 0.03,
      maxIoiCv: 0.14,
      maxBpmDeviation: 0.05,
    })
  })
}

describe('boundaryBeats', () => {
  it('fica na metade do caminho entre a última nota e o fim da volta', () => {
    expect(boundaryBeats(4, 3.667)).toBeCloseTo(0.1665, 3)
    expect(boundaryBeats(40, 39.75)).toBeCloseTo(0.125, 3)
  })

  it('não passa do teto de um quarto de tempo, por mais folga que sobre', () => {
    expect(boundaryBeats(8, 6.75)).toBe(0.25)
  })

  it('é zero quando a forma enche a volta inteira', () => {
    expect(boundaryBeats(4, 4)).toBe(0)
    expect(boundaryBeats(4, 5)).toBe(0) // nunca negativo
  })
})

describe('fronteira entre repetições', () => {
  // O defeito que isto tranca: a primeira nota da volta seguinte caía dentro
  // desta janela e, como a janela também é o que se descarta, a volta seguinte
  // perdia a própria primeira nota. Dois erros garantidos por volta — mais que o
  // orçamento inteiro de uma forma curta, então um arpejo tocado perfeitamente
  // reprovava em toda repetição menos a primeira.
  const formas = [...SCALES, ...ARPEGGIOS]
  const direcoes: Direction[] = ['up', 'down', 'updown']

  it('tocar em laço perfeito passa em TODA volta, não só na primeira', () => {
    for (const shape of formas) {
      for (const direction of direcoes) {
        const spec: PatternSpec = {
          shape,
          rootPc: 0,
          octaves: 1,
          direction,
          subdivision: 4,
        }
        for (const g of playLoop(spec, 4)) {
          expect(g.missed, `${shape.id} ${direction}: faltando`).toBe(0)
          expect(g.extra, `${shape.id} ${direction}: sobrando`).toBe(0)
          expect(g.passed, `${shape.id} ${direction}: ${g.reasons.join(' · ')}`).toBe(true)
        }
      }
    }
  })

  it('o arpejo curto em particular, que é onde o orçamento é mais apertado', () => {
    const spec: PatternSpec = {
      shape: ARPEGGIOS.find((a) => a.id === 'maj')!,
      rootPc: 0,
      octaves: 1,
      direction: 'updown',
      subdivision: 4,
    }
    const gs = playLoop(spec, 5)
    expect(gs.every((g) => g.passed)).toBe(true)
    expect(gs.every((g) => g.errors === 0)).toBe(true)
  })
})
