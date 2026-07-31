// O instrumento: cordas soltas em MIDI, do grave para o agudo.
//
// A guitarra baiana e afinada em quintas, igual bandolim e violino. Uma de cinco
// cordas comecando no Dó da o intervalo constante de 7 semitons entre vizinhas —
// e e dai que sai a propriedade que o app inteiro explora: qualquer forma de
// intervalo vale igual em qualquer par de cordas.

import { noteName } from './music'

export interface Instrument {
  id: string
  name: string
  /** MIDI de cada corda solta, indice 0 = mais grave. */
  strings: number[]
  frets: number
  /** Trastes com marcador de casa. */
  markers: number[]
}

/** Bandolim/mandolin marca 5, 7, 10, 12...; violao marca 3, 5, 7, 9, 12... */
const MARKERS_BANDOLIM = [5, 7, 10, 12, 15, 17, 19, 22, 24]

export const PRESETS: readonly Instrument[] = [
  {
    id: 'baiana5',
    name: 'Baiana 5 cordas (Dó Sol Ré Lá Mi)',
    strings: [48, 55, 62, 69, 76], // Dó3 Sol3 Ré4 Lá4 Mi5
    frets: 24,
    markers: MARKERS_BANDOLIM,
  },
  {
    id: 'baiana4',
    name: 'Baiana 4 cordas (Sol Ré Lá Mi)',
    strings: [55, 62, 69, 76],
    frets: 24,
    markers: MARKERS_BANDOLIM,
  },
  {
    id: 'bandolim',
    name: 'Bandolim (Sol Ré Lá Mi)',
    strings: [55, 62, 69, 76],
    frets: 20,
    markers: MARKERS_BANDOLIM,
  },
  {
    id: 'cavaco',
    name: 'Cavaquinho (Ré Sol Si Ré)',
    strings: [62, 67, 71, 74],
    frets: 17,
    markers: [5, 7, 10, 12, 15, 17],
  },
]

export const DEFAULT_INSTRUMENT = PRESETS[0]

export function transpose(inst: Instrument, semitones: number): Instrument {
  if (semitones === 0) return inst
  return {
    ...inst,
    id: `${inst.id}${semitones > 0 ? '+' : ''}${semitones}`,
    strings: inst.strings.map((m) => m + semitones),
  }
}

/** Nomes das cordas soltas, do grave para o agudo. */
export function stringNames(inst: Instrument, octave = true): string[] {
  return inst.strings.map((m) => noteName(m, { octave }))
}

/**
 * Verdadeiro quando todas as cordas vizinhas guardam a mesma distancia. E o que
 * permite dizer "esta forma serve em qualquer corda" sem mentir: numa afinacao
 * irregular (violao, cavaquinho) a promessa cai.
 */
export function isRegular(inst: Instrument): boolean {
  if (inst.strings.length < 2) return true
  const step = inst.strings[1] - inst.strings[0]
  return inst.strings.every((m, i) => i === 0 || m - inst.strings[i - 1] === step)
}

/** Distancia entre cordas vizinhas, quando regular. 7 = quintas. */
export function stringStep(inst: Instrument): number | null {
  return isRegular(inst) && inst.strings.length > 1 ? inst.strings[1] - inst.strings[0] : null
}
