import { describe, expect, it } from 'vitest'
import { DEFAULT_INSTRUMENT, PRESETS } from '../core/tuning'
import { ARPEGGIOS, SCALES } from '../core/shapes'
import { midiAt } from '../core/fretboard'
import { applyDirection, expandPattern, shapeMidis, type PatternSpec } from './pattern'

const maior = SCALES.find((s) => s.id === 'maior')!
const maj7 = ARPEGGIOS.find((a) => a.id === 'maj7')!
const baiana = DEFAULT_INSTRUMENT

const base: PatternSpec = {
  shape: maior,
  rootPc: 0,
  octaves: 1,
  direction: 'up',
  subdivision: 4,
}

describe('shapeMidis', () => {
  it('fecha na tônica de cima, senão a escala não termina', () => {
    expect(shapeMidis(base, 48)).toEqual([48, 50, 52, 53, 55, 57, 59, 60])
  })

  it('empilha oitavas sem repetir a emenda', () => {
    const duas = shapeMidis({ ...base, octaves: 2 }, 48)
    expect(duas).toHaveLength(15)
    expect(duas[7]).toBe(60)
    expect(duas[14]).toBe(72)
  })

  it('arpejo sai com as notas dele, não com as da escala', () => {
    expect(shapeMidis({ ...base, shape: maj7 }, 48)).toEqual([48, 52, 55, 59, 60])
  })
})

describe('applyDirection', () => {
  const seq = [0, 1, 2, 3]

  it('subindo é a forma como está', () => {
    expect(applyDirection(seq, 'up')).toEqual([0, 1, 2, 3])
  })

  it('descendo é a forma ao contrário', () => {
    expect(applyDirection(seq, 'down')).toEqual([3, 2, 1, 0])
  })

  it('sobe e desce não repete nem o pico nem o vale', () => {
    // O exercicio roda em laco: repetir o topo daria duas notas iguais seguidas
    // no meio, e repetir o vale emendaria a volta com a ida seguinte.
    expect(applyDirection(seq, 'updown')).toEqual([0, 1, 2, 3, 2, 1])
  })

  it('forma de uma nota só não vira nada estranho', () => {
    expect(applyDirection([5], 'updown')).toEqual([5])
  })
})

describe('expandPattern', () => {
  it('põe as notas na grade da subdivisão pedida', () => {
    const { notes, beats } = expandPattern(base, baiana)
    expect(notes[0].beat).toBe(0)
    expect(notes[1].beat).toBe(0.25) // semicolcheia
    expect(beats).toBe(notes.length / 4)
  })

  it('tercina divide o tempo em três', () => {
    const { notes } = expandPattern({ ...base, subdivision: 3 }, baiana)
    expect(notes[1].beat).toBeCloseTo(1 / 3, 10)
    expect(notes[3].beat).toBeCloseTo(1, 10)
  })

  it('começa na tônica mais grave que o instrumento alcança', () => {
    // A baiana comeca em Dó3 = 48, entao Dó sai na propria corda solta.
    expect(expandPattern(base, baiana).notes[0].midi).toBe(48)
    // Ré e dois semitons acima dela.
    expect(expandPattern({ ...base, rootPc: 2 }, baiana).notes[0].midi).toBe(50)
  })

  it('dá o grau de cada nota em relação à tônica', () => {
    const { notes } = expandPattern({ ...base, shape: maj7 }, baiana)
    expect(notes.map((n) => n.degree)).toEqual(['1', '3', '5', '7', '1'])
  })

  it('toda nota ganha um lugar no braço que realmente soa aquela altura', () => {
    const { notes } = expandPattern({ ...base, octaves: 2 }, baiana)
    for (const n of notes) {
      expect(n.pos).not.toBeNull()
      expect(midiAt(baiana, n.pos!)).toBe(n.midi)
    }
  })

  it('a mão fica na posição e cruza cordas, em vez de subir uma corda só', () => {
    // Numa afinacao em quintas, escala de uma oitava mora em duas cordas
    // vizinhas com a mao parada. Comparando cada nota com a anterior, a escala
    // subia a corda grave inteira ate a 12ª casa — barato passo a passo, e nada
    // do que alguem toca.
    const { notes } = expandPattern(base, baiana)
    const casas = notes.map((n) => n.pos!.fret).filter((f) => f > 0)
    const vao = Math.max(...casas) - Math.min(...casas)
    expect(vao).toBeLessThanOrEqual(4) // cabe debaixo dos quatro dedos
    expect(new Set(notes.map((n) => n.pos!.string)).size).toBeGreaterThan(1)
  })

  it('não salta casas longe entre notas com dedo', () => {
    // Corda solta fica de fora: ir da 5ª casa para uma solta nao mexe a mao,
    // apesar de parecer um salto de cinco casas na conta crua.
    const { notes } = expandPattern({ ...base, octaves: 2 }, baiana)
    const comDedo = notes.map((n) => n.pos!).filter((p) => p.fret > 0)
    const saltos = comDedo.slice(1).filter((p, i) => Math.abs(p.fret - comDedo[i].fret) > 4)
    expect(saltos).toHaveLength(0)
  })

  it('corda solta no meio da escala não puxa a mão de volta para a pestana', () => {
    // Sol solto (corda 1, casa 0) aparece no meio de Dó maior. Se ele movesse a
    // ancora, as notas seguintes voltariam para perto da pestana.
    const { notes } = expandPattern({ ...base, octaves: 2 }, baiana)
    const depoisDoSol = notes.slice(notes.findIndex((n) => n.midi === 55) + 1)
    expect(depoisDoSol.every((n) => n.pos !== null)).toBe(true)
  })

  it('corta oitava quando a forma não cabe no braço, e diz que cortou', () => {
    // O cavaquinho tem 17 trastes e corda grave em Ré4: tres oitavas nao cabem.
    const cavaco = PRESETS.find((p) => p.id === 'cavaco')!
    const r = expandPattern({ ...base, octaves: 3 }, cavaco)
    expect(r.warning).toMatch(/Cortado/)
    const teto = midiAt(cavaco, { string: cavaco.strings.length - 1, fret: cavaco.frets })
    expect(Math.max(...r.notes.map((n) => n.midi))).toBeLessThanOrEqual(teto)
  })

  it('repete a forma inteira quando pedem mais de uma volta', () => {
    const uma = expandPattern(base, baiana).notes
    const duas = expandPattern({ ...base, reps: 2 }, baiana).notes
    expect(duas).toHaveLength(uma.length * 2)
    expect(duas[uma.length].midi).toBe(uma[0].midi)
    // O tempo segue correndo: a segunda volta nao recomeca do zero.
    expect(duas[uma.length].beat).toBeGreaterThan(duas[uma.length - 1].beat)
  })

  it('avisa quando a janela de casas escolhida não cobre a forma', () => {
    const r = expandPattern({ ...base, octaves: 2 }, baiana, { from: 0, to: 2 })
    expect(r.warning).toMatch(/janela/)
    expect(r.notes.some((n) => n.pos === null)).toBe(true)
  })
})
