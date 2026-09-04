// A forma vira notas no tempo.
//
// Mesma ideia da tabela de escalas: descrever a FORMA e derivar as notas, em vez
// de escrever nota por nota. O exercicio e a escala ou o arpejo de `core/shapes`
// mais a direcao, quantas oitavas e em que subdivisao — e sai em qualquer tonica.
//
// Diferente do teclado, aqui cada nota tambem carrega ONDE tocar. Numa afinacao
// em quintas a mesma altura cai em varias cordas, e mostrar o braço sem escolher
// uma delas nao ajudaria ninguem.

import { midiAt, positionsOfMidi, type Position, type Zone } from '../core/fretboard'
import { INTERVALS, pitchClass } from '../core/music'
import type { ShapeDef } from '../core/shapes'
import type { Instrument } from '../core/tuning'

export type Direction = 'up' | 'down' | 'updown'

export const DIRECTION_LABEL: Record<Direction, string> = {
  up: 'subindo',
  down: 'descendo',
  updown: 'sobe e desce',
}

export type PatternSpec = {
  shape: ShapeDef
  /** Classe de altura da tonica, 0..11. */
  rootPc: number
  octaves: number
  direction: Direction
  /** Notas por tempo. 4 = semicolcheia, 3 = tercina. */
  subdivision: number
  /** Quantas vezes a forma inteira roda numa repeticao. Forma curta precisa. */
  reps?: number
}

export type ExpectedNote = {
  index: number
  midi: number
  /** Posicao em tempos desde o inicio da repeticao. O BPM entra so depois. */
  beat: number
  /** Onde por o dedo. Null quando a nota nao cabe na janela escolhida. */
  pos: Position | null
  /** "1", "b3", "5"... distancia da tonica. */
  degree: string
}

export type Expansion = {
  notes: ExpectedNote[]
  /** Tamanho da repeticao em tempos. */
  beats: number
  warning?: string
}

/**
 * Alturas da forma, da tonica ate `octaves` oitavas acima, incluindo a tonica de
 * cima — escala que para no setimo grau nao fecha, e ninguem estuda assim.
 */
export function shapeMidis(spec: PatternSpec, lowest: number): number[] {
  const out: number[] = []
  for (let o = 0; o < spec.octaves; o++) {
    for (const i of spec.shape.intervals) out.push(lowest + i + 12 * o)
  }
  out.push(lowest + 12 * spec.octaves)
  return out
}

/**
 * A volta e o ESPELHO em torno do topo, nao a forma tocada de tras para frente.
 *
 * Para forma simetrica (escala, arpejo) da no mesmo. O que muda de verdade e a
 * emenda: nem o pico nem o vale se repetem, porque o exercicio roda em laco e a
 * ultima nota da descida encosta na primeira da subida seguinte.
 */
export function applyDirection(seq: number[], direction: Direction): number[] {
  if (direction === 'up') return seq
  if (direction === 'down') return [...seq].reverse()

  const volta = [...seq].reverse()
  let start = 0
  while (start < volta.length && volta[start] === seq[seq.length - 1]) start++
  let end = volta.length
  while (end > start && volta[end - 1] === seq[0]) end--
  return [...seq, ...volta.slice(start, end)]
}

/**
 * Escolhe onde tocar cada altura.
 *
 * O criterio e a MAO FICAR PARADA, nao a nota ficar perto da anterior — e a
 * diferenca importa justamente numa afinacao em quintas. Comparando com a nota
 * anterior, a escala de Dó subia a corda grave inteira ate a 12ª casa, porque de
 * casa em casa cada passo parecia barato. Quem toca faz o contrario: quatro
 * notas numa corda, cruza para a vizinha, e o braço esquerdo nao sai do lugar.
 *
 * Por isso o custo mede a distancia ate a ANCORA — onde a mao esta — e nao ate a
 * nota anterior. Cruzar corda e quase de graca; sair da posicao e que custa.
 */
function choosePositions(
  inst: Instrument,
  midis: number[],
  zone: Zone | undefined,
): (Position | null)[] {
  const out: (Position | null)[] = []
  let ancora: number | null = null
  let cordaAnterior: number | null = null

  for (const midi of midis) {
    const opcoes = positionsOfMidi(inst, midi, zone ? { zone } : {})
    if (!opcoes.length) {
      out.push(null)
      continue
    }

    let escolhida: Position = opcoes[0]
    if (ancora !== null) {
      for (const p of opcoes) {
        if (custo(p, ancora, cordaAnterior) < custo(escolhida, ancora, cordaAnterior)) {
          escolhida = p
        }
      }
    } else {
      // A primeira nota funda a posicao: entre os lugares possiveis, o de casa
      // mais baixa, que e de onde a mao parte.
      for (const p of opcoes) if (p.fret < escolhida.fret) escolhida = p
    }

    out.push(escolhida)
    cordaAnterior = escolhida.string
    // Corda solta nao diz onde a mao esta — o dedo nem encosta —, entao nao
    // move a ancora. Sem essa ressalva, um Sol solto no meio da escala puxava a
    // ancora para a casa 0 e a mao "voltava" para a pestana.
    if (escolhida.fret > 0) {
      ancora = ancora === null ? escolhida.fret : ancora * 0.7 + escolhida.fret * 0.3
    }
  }
  return out
}

/**
 * Custo de tocar `p` com a mao ancorada na casa `ancora`.
 *
 * Sair da posicao pesa; trocar de corda quase nao pesa, e e so desempate.
 * Corda solta e neutra: nao exige nada da mao e serve em qualquer posicao.
 */
function custo(p: Position, ancora: number, cordaAnterior: number | null): number {
  const daPosicao = p.fret === 0 ? 0 : Math.abs(p.fret - ancora) * 3
  const troca = cordaAnterior === null ? 0 : Math.abs(p.string - cordaAnterior)
  return daPosicao + troca
}

/**
 * Espalha a forma em notas com altura, instante e lugar no braço.
 *
 * A tonica sai na oitava mais grave em que a forma INTEIRA cabe no instrumento:
 * comecar embaixo demais deixaria a metade de cima fora do braço.
 */
export function expandPattern(
  spec: PatternSpec,
  inst: Instrument,
  zone?: Zone,
): Expansion {
  let octaves = Math.max(1, spec.octaves)
  let warning: string | undefined
  const teto = midiAt(inst, { string: inst.strings.length - 1, fret: inst.frets })

  for (;;) {
    const lowest = lowestRoot(inst, spec.rootPc)
    const midis = shapeMidis({ ...spec, octaves }, lowest)

    if (Math.max(...midis) <= teto) {
      const uma = applyDirection(midis, spec.direction)
      const seq = Array.from({ length: Math.max(1, spec.reps ?? 1) }, () => uma).flat()
      const posicoes = choosePositions(inst, seq, zone)

      const notes: ExpectedNote[] = seq.map((midi, index) => ({
        index,
        midi,
        beat: index / spec.subdivision,
        pos: posicoes[index],
        degree: INTERVALS[pitchClass(midi - spec.rootPc)].degree,
      }))

      if (zone && notes.some((n) => n.pos === null)) {
        warning = 'Parte da forma não cabe na janela de casas escolhida.'
      }
      return { notes, beats: seq.length / spec.subdivision, warning }
    }

    if (octaves <= 1) {
      // Nem uma oitava cabe: entrega assim mesmo, com o aviso.
      const uma = applyDirection(midis, spec.direction)
      const posicoes = choosePositions(inst, uma, zone)
      return {
        notes: uma.map((midi, index) => ({
          index,
          midi,
          beat: index / spec.subdivision,
          pos: posicoes[index],
          degree: INTERVALS[pitchClass(midi - spec.rootPc)].degree,
        })),
        beats: uma.length / spec.subdivision,
        warning: 'A forma não cabe no braço deste instrumento.',
      }
    }

    octaves -= 1
    warning = `Cortado para ${octaves} oitava${octaves > 1 ? 's' : ''}: não cabe no braço.`
  }
}

/** A tonica mais grave que existe no instrumento. */
function lowestRoot(inst: Instrument, rootPc: number): number {
  const grave = inst.strings[0]
  const delta = ((rootPc - pitchClass(grave)) % 12 + 12) % 12
  return grave + delta
}

