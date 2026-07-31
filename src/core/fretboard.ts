// Posicao no braco <-> altura. Toda resposta certa de exercicio sai daqui.

import { pitchClass } from './music'
import type { Instrument } from './tuning'

export interface Position {
  /** Indice da corda, 0 = mais grave. */
  string: number
  /** 0 = corda solta. */
  fret: number
}

export interface Zone {
  from: number
  to: number
}

export interface Filter {
  zone?: Zone
  /** Indices das cordas em jogo. Ausente = todas. */
  strings?: number[]
}

export function midiAt(inst: Instrument, pos: Position): number {
  return inst.strings[pos.string] + pos.fret
}

export function posKey(pos: Position): string {
  return `${pos.string}:${pos.fret}`
}

export function parsePosKey(key: string): Position {
  const [s, f] = key.split(':').map(Number)
  return { string: s, fret: f }
}

export function samePos(a: Position, b: Position): boolean {
  return a.string === b.string && a.fret === b.fret
}

export function fullZone(inst: Instrument): Zone {
  return { from: 0, to: inst.frets }
}

function inFilter(inst: Instrument, pos: Position, filter: Filter): boolean {
  const zone = filter.zone ?? fullZone(inst)
  if (pos.fret < zone.from || pos.fret > zone.to) return false
  if (filter.strings && !filter.strings.includes(pos.string)) return false
  return true
}

/** Toda posicao do braco dentro do filtro, do grave para o agudo. */
export function allPositions(inst: Instrument, filter: Filter = {}): Position[] {
  const out: Position[] = []
  for (let s = 0; s < inst.strings.length; s++) {
    for (let f = 0; f <= inst.frets; f++) {
      const pos = { string: s, fret: f }
      if (inFilter(inst, pos, filter)) out.push(pos)
    }
  }
  return out
}

/** Onde essa nota aparece, ignorando oitava. */
export function positionsOfPitchClass(inst: Instrument, pc: number, filter: Filter = {}): Position[] {
  const target = pitchClass(pc)
  return allPositions(inst, filter).filter((p) => pitchClass(midiAt(inst, p)) === target)
}

/** Onde essa altura exata aparece — o mesmo Lá4 mora em varias cordas. */
export function positionsOfMidi(inst: Instrument, midi: number, filter: Filter = {}): Position[] {
  return allPositions(inst, filter).filter((p) => midiAt(inst, p) === midi)
}

/** Menor e maior altura alcancavel dentro do filtro. */
export function rangeOf(inst: Instrument, filter: Filter = {}): { low: number; high: number } | null {
  const all = allPositions(inst, filter).map((p) => midiAt(inst, p))
  if (all.length === 0) return null
  return { low: Math.min(...all), high: Math.max(...all) }
}

/**
 * O deslocamento entre duas posicoes. Numa afinacao regular esse par de numeros
 * e a forma do intervalo, e ela se repete identica em qualquer corda — e o que
 * o exercicio de intervalos mostra depois do acerto.
 */
export interface Shift {
  strings: number
  frets: number
}

export function shiftBetween(a: Position, b: Position): Shift {
  return { strings: b.string - a.string, frets: b.fret - a.fret }
}

export function applyShift(inst: Instrument, pos: Position, shift: Shift): Position | null {
  const next = { string: pos.string + shift.strings, fret: pos.fret + shift.frets }
  if (next.string < 0 || next.string >= inst.strings.length) return null
  if (next.fret < 0 || next.fret > inst.frets) return null
  return next
}

/** Descreve o deslocamento em portugues: "1 corda acima, 2 casas atrás". */
export function describeShift(shift: Shift): string {
  const parts: string[] = []
  if (shift.strings !== 0) {
    const n = Math.abs(shift.strings)
    parts.push(`${n} corda${n > 1 ? 's' : ''} ${shift.strings > 0 ? 'acima' : 'abaixo'}`)
  }
  if (shift.frets !== 0) {
    const n = Math.abs(shift.frets)
    parts.push(`${n} casa${n > 1 ? 's' : ''} ${shift.frets > 0 ? 'à frente' : 'atrás'}`)
  }
  return parts.length ? parts.join(', ') : 'mesma posição'
}
