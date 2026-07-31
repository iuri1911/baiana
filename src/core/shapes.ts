// Escalas e arpejos como formula de semitons a partir da tonica.

import { pitchClass, INTERVALS } from './music'
import type { Instrument } from './tuning'
import { allPositions, midiAt, type Filter, type Position } from './fretboard'

export type ShapeKind = 'scale' | 'arpeggio'

export interface ShapeDef {
  id: string
  name: string
  kind: ShapeKind
  /** Semitons a partir da tonica, sem repetir a oitava. */
  intervals: number[]
}

export const SCALES: readonly ShapeDef[] = [
  { id: 'maior', name: 'Maior (jônio)', kind: 'scale', intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'menor-nat', name: 'Menor natural (eólio)', kind: 'scale', intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'menor-harm', name: 'Menor harmônica', kind: 'scale', intervals: [0, 2, 3, 5, 7, 8, 11] },
  { id: 'menor-mel', name: 'Menor melódica', kind: 'scale', intervals: [0, 2, 3, 5, 7, 9, 11] },
  { id: 'dorio', name: 'Dórico', kind: 'scale', intervals: [0, 2, 3, 5, 7, 9, 10] },
  { id: 'frigio', name: 'Frígio', kind: 'scale', intervals: [0, 1, 3, 5, 7, 8, 10] },
  { id: 'lidio', name: 'Lídio', kind: 'scale', intervals: [0, 2, 4, 6, 7, 9, 11] },
  { id: 'mixolidio', name: 'Mixolídio', kind: 'scale', intervals: [0, 2, 4, 5, 7, 9, 10] },
  { id: 'locrio', name: 'Lócrio', kind: 'scale', intervals: [0, 1, 3, 5, 6, 8, 10] },
  { id: 'pent-maior', name: 'Pentatônica maior', kind: 'scale', intervals: [0, 2, 4, 7, 9] },
  { id: 'pent-menor', name: 'Pentatônica menor', kind: 'scale', intervals: [0, 3, 5, 7, 10] },
  { id: 'blues', name: 'Blues', kind: 'scale', intervals: [0, 3, 5, 6, 7, 10] },
  { id: 'cromatica', name: 'Cromática', kind: 'scale', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
]

export const ARPEGGIOS: readonly ShapeDef[] = [
  { id: 'maj', name: 'Maior', kind: 'arpeggio', intervals: [0, 4, 7] },
  { id: 'min', name: 'Menor', kind: 'arpeggio', intervals: [0, 3, 7] },
  { id: 'dim', name: 'Diminuto', kind: 'arpeggio', intervals: [0, 3, 6] },
  { id: 'aug', name: 'Aumentado', kind: 'arpeggio', intervals: [0, 4, 8] },
  { id: 'sus4', name: 'Sus4', kind: 'arpeggio', intervals: [0, 5, 7] },
  { id: '7', name: 'Dominante 7', kind: 'arpeggio', intervals: [0, 4, 7, 10] },
  { id: 'maj7', name: 'Maior 7', kind: 'arpeggio', intervals: [0, 4, 7, 11] },
  { id: 'm7', name: 'Menor 7', kind: 'arpeggio', intervals: [0, 3, 7, 10] },
  { id: 'm7b5', name: 'Meio-diminuto (m7b5)', kind: 'arpeggio', intervals: [0, 3, 6, 10] },
  { id: 'dim7', name: 'Diminuto 7', kind: 'arpeggio', intervals: [0, 3, 6, 9] },
  { id: '6', name: 'Sexta', kind: 'arpeggio', intervals: [0, 4, 7, 9] },
  { id: 'm6', name: 'Menor com sexta', kind: 'arpeggio', intervals: [0, 3, 7, 9] },
  { id: '9', name: 'Nona', kind: 'arpeggio', intervals: [0, 4, 7, 10, 14] },
  { id: 'm9', name: 'Menor com nona', kind: 'arpeggio', intervals: [0, 3, 7, 10, 14] },
]

export const ALL_SHAPES: readonly ShapeDef[] = [...ARPEGGIOS, ...SCALES]

export function findShape(id: string): ShapeDef | undefined {
  return ALL_SHAPES.find((s) => s.id === id)
}

export interface ShapeNote {
  pos: Position
  midi: number
  /** Distancia da tonica, 0..11. */
  semitones: number
  /** "1", "b3", "5"... */
  degree: string
  isRoot: boolean
}

/** Onde a forma cai no braco, dentro do filtro. */
export function shapePositions(
  inst: Instrument,
  root: number,
  def: ShapeDef,
  filter: Filter = {},
): ShapeNote[] {
  const wanted = new Set(def.intervals.map((i) => pitchClass(root + i)))
  const out: ShapeNote[] = []
  for (const pos of allPositions(inst, filter)) {
    const midi = midiAt(inst, pos)
    const pc = pitchClass(midi)
    if (!wanted.has(pc)) continue
    const semitones = pitchClass(pc - root)
    out.push({
      pos,
      midi,
      semitones,
      degree: INTERVALS[semitones].degree,
      isRoot: semitones === 0,
    })
  }
  return out
}

/**
 * Sequencia para tocar: uma nota por altura, do grave ao agudo. Duas cordas
 * podem dar o mesmo Lá4 — tocar as duas soaria como nota repetida sem motivo.
 */
export function shapeSequence(notes: ShapeNote[]): ShapeNote[] {
  const byMidi = new Map<number, ShapeNote>()
  for (const n of notes) {
    const prev = byMidi.get(n.midi)
    // na duvida, a corda mais grave: e a digitacao que a mao costuma escolher
    if (!prev || n.pos.string < prev.pos.string) byMidi.set(n.midi, n)
  }
  return [...byMidi.values()].sort((a, b) => a.midi - b.midi)
}
