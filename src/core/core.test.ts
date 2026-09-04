import { describe, it, expect } from 'vitest'
import { pitchClass, octaveOf, noteName, frequency, midiFromFrequency, degreeOf, interval } from './music'
import { PRESETS, DEFAULT_INSTRUMENT, isRegular, stringStep, transpose, stringNames } from './tuning'
import {
  midiAt,
  positionsOfPitchClass,
  positionsOfMidi,
  allPositions,
  posKey,
  parsePosKey,
  shiftBetween,
  applyShift,
} from './fretboard'
import { ARPEGGIOS, SCALES, shapePositions, shapeSequence, findShape } from './shapes'
import { updateStat, weightOf, pickWeighted, emptyStat, accuracy, intervalFor } from './scheduler'

const baiana = DEFAULT_INSTRUMENT

describe('music', () => {
  it('numera oitava no padrão científico', () => {
    expect(octaveOf(60)).toBe(4)
    expect(octaveOf(48)).toBe(3)
    expect(noteName(48, { octave: true })).toBe('Dó3')
    expect(noteName(69, { octave: true })).toBe('Lá4')
    expect(noteName(76, { lang: 'en', octave: true })).toBe('E5')
  })

  it('nomeia bemol e sustenido', () => {
    expect(noteName(61)).toBe('Dó#')
    expect(noteName(61, { accidental: 'flat' })).toBe('Réb')
    expect(noteName(61, { lang: 'en', accidental: 'flat' })).toBe('Db')
  })

  it('afina o Lá4 em 440 Hz', () => {
    expect(frequency(69)).toBeCloseTo(440, 6)
    expect(frequency(48)).toBeCloseTo(130.813, 3)
    expect(frequency(81)).toBeCloseTo(880, 6)
  })

  it('volta da frequência para o semitom, com os cents', () => {
    // as cinco cordas soltas, ida e volta
    for (const m of baiana.strings) {
      const d = midiFromFrequency(frequency(m))!
      expect(d.midi).toBe(m)
      expect(d.cents).toBeCloseTo(0, 6)
    }
  })

  it('mede o desvio em cents com sinal', () => {
    // meio semitom acima do Lá4 fica a 50 cents, e ainda arredonda para o Lá
    expect(midiFromFrequency(frequency(69) * Math.pow(2, 0.4 / 12))!).toEqual({
      midi: 69,
      cents: expect.closeTo(40, 6),
    })
    expect(midiFromFrequency(frequency(69) * Math.pow(2, -0.4 / 12))!.cents).toBeCloseTo(-40, 6)
  })

  it('quadro sem som não é nota', () => {
    expect(midiFromFrequency(0)).toBeNull()
    expect(midiFromFrequency(-1)).toBeNull()
    expect(midiFromFrequency(Number.NaN)).toBeNull()
  })

  it('classe de altura funciona com negativo', () => {
    expect(pitchClass(-1)).toBe(11)
    expect(pitchClass(-12)).toBe(0)
  })

  it('dá o grau em relação à tônica', () => {
    expect(degreeOf(55, 48)).toBe('5') // Sol sobre Dó
    expect(degreeOf(51, 48)).toBe('b3')
    expect(degreeOf(60, 48)).toBe('1') // oitava é a mesma nota
    expect(interval(12).short).toBe('8J')
    expect(interval(7).name).toBe('quinta justa')
  })
})

describe('afinação', () => {
  it('a baiana de 5 cordas é Dó3 Sol3 Ré4 Lá4 Mi5', () => {
    expect(baiana.strings).toEqual([48, 55, 62, 69, 76])
    expect(stringNames(baiana)).toEqual(['Dó3', 'Sol3', 'Ré4', 'Lá4', 'Mi5'])
    expect(baiana.frets).toBe(24)
  })

  it('é regular, em quintas', () => {
    expect(isRegular(baiana)).toBe(true)
    expect(stringStep(baiana)).toBe(7)
  })

  it('cavaquinho não é regular — a promessa de forma transponível não vale lá', () => {
    const cavaco = PRESETS.find((p) => p.id === 'cavaco')!
    expect(isRegular(cavaco)).toBe(false)
    expect(stringStep(cavaco)).toBeNull()
  })

  it('transpõe o instrumento inteiro', () => {
    const oitavaAbaixo = transpose(baiana, -12)
    expect(oitavaAbaixo.strings).toEqual([36, 43, 50, 57, 64])
    expect(stringStep(oitavaAbaixo)).toBe(7)
    expect(transpose(baiana, 0)).toBe(baiana)
  })
})

describe('braço', () => {
  it('a corda solta é o traste 0', () => {
    expect(midiAt(baiana, { string: 0, fret: 0 })).toBe(48)
    expect(midiAt(baiana, { string: 4, fret: 12 })).toBe(88)
  })

  it('cordas vizinhas guardam sempre uma quinta, em qualquer casa', () => {
    for (let s = 0; s < baiana.strings.length - 1; s++) {
      for (let f = 0; f <= baiana.frets; f++) {
        expect(midiAt(baiana, { string: s + 1, fret: f }) - midiAt(baiana, { string: s, fret: f })).toBe(7)
      }
    }
  })

  it('acha o Dó nas casas 0 a 7', () => {
    const found = positionsOfPitchClass(baiana, 0, { zone: { from: 0, to: 7 } })
    expect(found).toEqual([
      { string: 0, fret: 0 },
      { string: 1, fret: 5 },
      { string: 3, fret: 3 },
    ])
  })

  it('a mesma altura mora em mais de uma corda', () => {
    // Lá4 = 69: corda solta do Lá, 7ª casa do Ré, 14ª do Sol, 21ª do Dó
    const uníssonos = positionsOfMidi(baiana, 69)
    expect(uníssonos).toEqual([
      { string: 0, fret: 21 },
      { string: 1, fret: 14 },
      { string: 2, fret: 7 },
      { string: 3, fret: 0 },
    ])
  })

  it('respeita o filtro de cordas', () => {
    const so2 = allPositions(baiana, { zone: { from: 0, to: 3 }, strings: [0, 1] })
    expect(so2).toHaveLength(8)
    expect(so2.every((p) => p.string < 2)).toBe(true)
  })

  it('chave de posição vai e volta', () => {
    expect(parsePosKey(posKey({ string: 2, fret: 11 }))).toEqual({ string: 2, fret: 11 })
  })

  it('a forma do intervalo se repete em qualquer corda', () => {
    // a quinta justa em quintas: uma corda acima, mesma casa
    const de = { string: 0, fret: 3 }
    const para = { string: 1, fret: 3 }
    const forma = shiftBetween(de, para)
    expect(forma).toEqual({ strings: 1, frets: 0 })

    for (let s = 0; s < baiana.strings.length - 1; s++) {
      const origem = { string: s, fret: 5 }
      const destino = applyShift(baiana, origem, forma)!
      expect(midiAt(baiana, destino) - midiAt(baiana, origem)).toBe(7)
    }
  })

  it('não deixa a forma sair do braço', () => {
    expect(applyShift(baiana, { string: 4, fret: 0 }, { strings: 1, frets: 0 })).toBeNull()
    expect(applyShift(baiana, { string: 0, fret: 24 }, { strings: 0, frets: 1 })).toBeNull()
  })
})

describe('escalas e arpejos', () => {
  it('toda fórmula começa na tônica e cabe numa oitava (fora as extensões)', () => {
    for (const def of [...SCALES, ...ARPEGGIOS]) {
      expect(def.intervals[0]).toBe(0)
      expect(new Set(def.intervals).size).toBe(def.intervals.length)
    }
  })

  it('o arpejo maior de Dó só tem Dó, Mi e Sol', () => {
    const notas = shapePositions(baiana, 0, findShape('maj')!, { zone: { from: 0, to: 12 } })
    const classes = new Set(notas.map((n) => pitchClass(n.midi)))
    expect([...classes].sort((a, b) => a - b)).toEqual([0, 4, 7])
    expect(notas.filter((n) => n.isRoot).every((n) => pitchClass(n.midi) === 0)).toBe(true)
  })

  it('rotula os graus do menor com sétima', () => {
    const notas = shapePositions(baiana, 2, findShape('m7')!, { zone: { from: 0, to: 4 } })
    const graus = new Set(notas.map((n) => n.degree))
    expect([...graus].sort()).toEqual(['1', '5', 'b3', 'b7'])
  })

  it('a sequência para tocar não repete altura', () => {
    const notas = shapePositions(baiana, 0, findShape('maior')!, { zone: { from: 0, to: 12 } })
    const seq = shapeSequence(notas)
    const alturas = seq.map((n) => n.midi)
    expect(new Set(alturas).size).toBe(alturas.length)
    expect([...alturas].sort((a, b) => a - b)).toEqual(alturas) // do grave ao agudo
  })
})

// gerador determinístico, para o sorteio ser testável
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('repetição espaçada', () => {
  const agora = 1_700_000_000_000

  it('acerto empilha streak, erro zera', () => {
    let s = updateStat(undefined, true, 1200, agora)
    expect(s).toMatchObject({ seen: 1, correct: 1, streak: 1, avgMs: 1200 })
    s = updateStat(s, true, 1000, agora + 1000)
    expect(s.streak).toBe(2)
    s = updateStat(s, false, 5000, agora + 2000)
    expect(s.streak).toBe(0)
    expect(accuracy(s)).toBeCloseTo(2 / 3)
  })

  it('posição nunca vista pesa mais que posição dominada', () => {
    let dominada = emptyStat()
    for (let i = 0; i < 5; i++) dominada = updateStat(dominada, true, 900, agora)
    expect(weightOf(undefined, agora)).toBeGreaterThan(weightOf(dominada, agora))
  })

  it('quem erra pesa mais que quem acerta', () => {
    let errada = emptyStat()
    let certa = emptyStat()
    for (let i = 0; i < 4; i++) {
      errada = updateStat(errada, false, 4000, agora - 60_000)
      certa = updateStat(certa, true, 900, agora - 60_000)
    }
    expect(weightOf(errada, agora)).toBeGreaterThan(weightOf(certa, agora) * 3)
  })

  it('o intervalo dobra a cada acerto e para de crescer numa semana', () => {
    let s = emptyStat()
    const intervalos: number[] = []
    for (let i = 0; i < 20; i++) {
      s = updateStat(s, true, 900, agora)
      intervalos.push(intervalFor(s))
    }
    expect(intervalos[1]).toBeGreaterThan(intervalos[0])
    expect(intervalos.at(-1)).toBe(7 * 24 * 3600_000)
  })

  it('o sorteio puxa para a posição fraca', () => {
    const candidatas = [
      { string: 0, fret: 1 },
      { string: 0, fret: 2 },
      { string: 0, fret: 3 },
    ]
    let fraca = emptyStat()
    let forte = emptyStat()
    for (let i = 0; i < 6; i++) {
      fraca = updateStat(fraca, false, 6000, agora - 3600_000)
      forte = updateStat(forte, true, 800, agora - 3600_000)
    }
    const stats = { '0:1': fraca, '0:2': forte, '0:3': forte }

    const rng = mulberry32(42)
    const conta: Record<string, number> = { '0:1': 0, '0:2': 0, '0:3': 0 }
    for (let i = 0; i < 3000; i++) {
      const p = pickWeighted(candidatas, { stats, now: agora, rng })!
      conta[posKey(p)]++
    }
    expect(conta['0:1']).toBeGreaterThan(conta['0:2'] * 3)
    expect(conta['0:2']).toBeGreaterThan(0) // dominada ainda cai de vez em quando
  })

  it('não repete a pergunta anterior quando há alternativa', () => {
    const candidatas = [
      { string: 0, fret: 1 },
      { string: 0, fret: 2 },
    ]
    const rng = mulberry32(7)
    for (let i = 0; i < 50; i++) {
      const p = pickWeighted(candidatas, { stats: {}, now: agora, exclude: candidatas[0], rng })!
      expect(p).toEqual(candidatas[1])
    }
  })

  it('com uma candidata só, repete mesmo', () => {
    const uma = [{ string: 0, fret: 1 }]
    expect(pickWeighted(uma, { stats: {}, now: agora, exclude: uma[0] })).toEqual(uma[0])
    expect(pickWeighted([], { stats: {}, now: agora })).toBeNull()
  })
})
