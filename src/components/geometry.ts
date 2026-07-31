// Geometria do braco: onde cai cada fio de traste e cada corda, em pixels.
//
// O espacamento e o de verdade (a casa vai encurtando conforme sobe), porque e
// isso que a memoria visual usa para reconhecer o braco. Em janela larga a
// regra proporcional espreme as casas agudas ate sumirem, entao acima de oito
// casas o desenho vai derretendo para o espacamento uniforme.

import type { Instrument } from '../core/tuning'
import type { Zone } from '../core/fretboard'

export type Orientation = 'horizontal' | 'vertical'

export interface LayoutInput {
  inst: Instrument
  zone: Zone
  width: number
  height: number
  orientation: Orientation
  /** Corda grave em cima (horizontal) ou à esquerda (vertical). */
  lowFirst: boolean
}

export interface Layout {
  width: number
  height: number
  orientation: Orientation
  /** Extensao ao longo do braco, em px. */
  along: number
  /** Extensao no sentido das cordas, em px. */
  across: number
  /** Faixa da corda solta, antes da pestana. 0 quando a janela nao comeca no 0. */
  openWidth: number
  step: number
  edge: number
  frets: number[]
  /** Centro da casa n ao longo do braco. */
  cellCenter: (fret: number) => number
  /** Inicio e fim da casa n. */
  cellSpan: (fret: number) => [number, number]
  /** Posicao da corda i no sentido transversal. */
  stringAt: (index: number) => number
  /** Coordenada de tela. */
  pt: (along: number, across: number) => { x: number; y: number }
}

/** Distancia do fio n ate a pestana, na regra do 17,817. */
function wireDistance(n: number): number {
  return 1 - Math.pow(2, -n / 12)
}

export function layout({ inst, zone, width, height, orientation, lowFirst }: LayoutInput): Layout {
  const vertical = orientation === 'vertical'
  const along = vertical ? height : width
  const across = vertical ? width : height

  const nStrings = inst.strings.length
  const edge = Math.min(30, across * 0.11)
  const step = nStrings > 1 ? (across - 2 * edge) / (nStrings - 1) : 0

  const from = Math.max(0, zone.from)
  const to = Math.min(inst.frets, Math.max(from, zone.to))
  const first = Math.max(from - 1, 0) // fio onde a janela comeca
  const openWidth = from === 0 ? Math.min(along * 0.13, 84) : 0
  const util = along - openWidth

  // proporcional na janela curta, uniforme na janela longa
  const span = to - first
  const mistura = Math.min(1, Math.max(0, (span - 8) / 10))
  const d0 = wireDistance(first)
  const escala = wireDistance(to) - d0 || 1

  const posicao = (n: number): number => {
    const real = (wireDistance(n) - d0) / escala
    const uniforme = span === 0 ? 0 : (n - first) / span
    return openWidth + (real * (1 - mistura) + uniforme * mistura) * util
  }

  const frets: number[] = []
  for (let n = first; n <= to; n++) frets.push(n)

  const cellSpan = (fret: number): [number, number] =>
    fret === 0 ? [0, openWidth] : [posicao(fret - 1), posicao(fret)]

  return {
    width,
    height,
    orientation,
    along,
    across,
    openWidth,
    step,
    edge,
    frets,
    cellSpan,
    cellCenter: (fret) => {
      const [a, b] = cellSpan(fret)
      return (a + b) / 2
    },
    stringAt: (index) => edge + (lowFirst ? index : nStrings - 1 - index) * step,
    pt: (a, c) => (vertical ? { x: c, y: a } : { x: a, y: c }),
  }
}

/** Casas visiveis na janela, incluindo a corda solta quando ela aparece. */
export function visibleFrets(zone: Zone, inst: Instrument): number[] {
  const out: number[] = []
  for (let n = Math.max(0, zone.from); n <= Math.min(inst.frets, zone.to); n++) out.push(n)
  return out
}
