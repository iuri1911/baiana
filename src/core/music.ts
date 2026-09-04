// Teoria musical em cima do numero MIDI. Nada aqui sabe o que e um traste.
//
// Convencao: Dó3 = 48, Lá4 = 69 = 440 Hz. E a mesma numeracao de oitava do
// padrao cientifico (C4 = 60 = dó central), que e a que os afinadores usam.

export type NoteLang = 'pt' | 'en'
export type Accidental = 'sharp' | 'flat'

export const PITCH_NAMES: Record<NoteLang, Record<Accidental, readonly string[]>> = {
  pt: {
    sharp: ['Dó', 'Dó#', 'Ré', 'Ré#', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Lá#', 'Si'],
    flat: ['Dó', 'Réb', 'Ré', 'Mib', 'Mi', 'Fá', 'Solb', 'Sol', 'Láb', 'Lá', 'Sib', 'Si'],
  },
  en: {
    sharp: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
    flat: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
  },
}

export interface NameOptions {
  lang?: NoteLang
  accidental?: Accidental
  /** Acrescenta o numero da oitava: "Dó3". */
  octave?: boolean
}

/** 0..11, com 0 = Dó. Funciona para MIDI negativo tambem. */
export function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12
}

/** Oitava cientifica: 60 -> 4. */
export function octaveOf(midi: number): number {
  return Math.floor(midi / 12) - 1
}

export function noteName(midi: number, opts: NameOptions = {}): string {
  const { lang = 'pt', accidental = 'sharp', octave = false } = opts
  const name = PITCH_NAMES[lang][accidental][pitchClass(midi)]
  return octave ? `${name}${octaveOf(midi)}` : name
}

/** So a classe de altura (0..11), sem oitava. */
export function pitchClassName(pc: number, opts: NameOptions = {}): string {
  const { lang = 'pt', accidental = 'sharp' } = opts
  return PITCH_NAMES[lang][accidental][pitchClass(pc)]
}

export function frequency(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12)
}

export interface Detected {
  /** Semitom mais proximo. */
  midi: number
  /** Distancia ate ele, -50..50. Negativo e bemol. */
  cents: number
}

/**
 * Inversa de `frequency`: de volta ao semitom, guardando o desvio.
 *
 * Os cents importam porque corda pinçada nao entrega altura exata — ataque puxa
 * agudo, corda velha puxa grave — e quem consome precisa poder decidir se
 * aceita. Frequencia nao positiva nao e nota: acontece em quadro de silencio,
 * e o log de Math.log2 devolveria -Infinity.
 */
export function midiFromFrequency(freq: number, a4 = 440): Detected | null {
  if (!(freq > 0)) return null
  const exato = 69 + 12 * Math.log2(freq / a4)
  const midi = Math.round(exato)
  return { midi, cents: (exato - midi) * 100 }
}

/** Toda nota preta e ambigua; a lista de nomes cobre so o que a UI precisa. */
export function isAccidental(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(pitchClass(midi))
}

// --- Intervalos ------------------------------------------------------------

export interface Interval {
  semitones: number
  /** Rotulo curto, para caber dentro de um ponto no braco: "5J", "3m". */
  short: string
  /** Nome por extenso, para enunciado de exercicio. */
  name: string
  /** Grau em contexto de escala/acorde: "1", "b3", "5". */
  degree: string
}

export const INTERVALS: readonly Interval[] = [
  { semitones: 0, short: 'T', name: 'uníssono', degree: '1' },
  { semitones: 1, short: '2m', name: 'segunda menor', degree: 'b2' },
  { semitones: 2, short: '2M', name: 'segunda maior', degree: '2' },
  { semitones: 3, short: '3m', name: 'terça menor', degree: 'b3' },
  { semitones: 4, short: '3M', name: 'terça maior', degree: '3' },
  { semitones: 5, short: '4J', name: 'quarta justa', degree: '4' },
  { semitones: 6, short: 'TT', name: 'trítono', degree: 'b5' },
  { semitones: 7, short: '5J', name: 'quinta justa', degree: '5' },
  { semitones: 8, short: '6m', name: 'sexta menor', degree: 'b6' },
  { semitones: 9, short: '6M', name: 'sexta maior', degree: '6' },
  { semitones: 10, short: '7m', name: 'sétima menor', degree: 'b7' },
  { semitones: 11, short: '7M', name: 'sétima maior', degree: '7' },
  { semitones: 12, short: '8J', name: 'oitava', degree: '8' },
]

export function interval(semitones: number): Interval {
  const norm = ((semitones % 12) + 12) % 12
  return semitones !== 0 && norm === 0 ? INTERVALS[12] : INTERVALS[norm]
}

/** Grau de `midi` em relacao a `root`, ignorando oitava: "b3", "5". */
export function degreeOf(midi: number, root: number): string {
  return INTERVALS[pitchClass(midi - root)].degree
}
