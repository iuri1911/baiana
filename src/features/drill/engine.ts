// Sorteio das perguntas. Sem React aqui dentro: e testavel e e onde mora a
// unica regra sutil do treino — nunca perguntar algo que nao tem resposta
// dentro da janela de casas escolhida.

import {
  midiAt,
  positionsOfMidi,
  positionsOfPitchClass,
  allPositions,
  type Filter,
  type Position,
} from '../../core/fretboard'
import { pitchClass } from '../../core/music'
import type { Instrument } from '../../core/tuning'
import { pickWeighted, type Stats } from '../../core/scheduler'
import type { Zone } from '../../core/fretboard'

export type Modo = 'achar' | 'nomear' | 'intervalo'

export interface DrillConfig {
  modo: Modo
  zone: Zone
  strings: number[]
  /** null = sem fim. */
  total: number | null
  /** No modo achar: exigir todas as ocorrencias na janela. */
  todas: boolean
  /** Semitons habilitados no modo intervalo. */
  intervalos: number[]
  /** Deixar o intervalo cair para baixo tambem. */
  descendente: boolean
}

export const CONFIG_PADRAO: DrillConfig = {
  modo: 'achar',
  zone: { from: 0, to: 7 },
  strings: [],
  total: 20,
  todas: false,
  intervalos: [12, 7, 4, 3, 5],
  descendente: false,
}

export interface PerguntaAchar {
  tipo: 'achar'
  /** Posicao que o sorteio escolheu; e ela que paga o erro. */
  foco: Position
  midi: number
  pc: number
  /** Todas as ocorrencias dentro da janela. */
  posicoes: Position[]
}

export interface PerguntaNomear {
  tipo: 'nomear'
  pos: Position
  midi: number
}

export interface PerguntaIntervalo {
  tipo: 'intervalo'
  raiz: Position
  raizMidi: number
  semitons: number
  alvoMidi: number
  posicoes: Position[]
}

export type Pergunta = PerguntaAchar | PerguntaNomear | PerguntaIntervalo

export function filtroDe(cfg: DrillConfig): Filter {
  return { zone: cfg.zone, strings: cfg.strings.length ? cfg.strings : undefined }
}

export interface SorteioOpts {
  stats: Stats
  now: number
  anterior?: Position | null
  rng?: () => number
}

export function gerarPergunta(
  inst: Instrument,
  cfg: DrillConfig,
  { stats, now, anterior = null, rng = Math.random }: SorteioOpts,
): Pergunta | null {
  const filtro = filtroDe(cfg)
  const candidatas = allPositions(inst, filtro)
  if (candidatas.length === 0) return null

  if (cfg.modo === 'nomear') {
    const pos = pickWeighted(candidatas, { stats, now, exclude: anterior, rng })
    return pos ? { tipo: 'nomear', pos, midi: midiAt(inst, pos) } : null
  }

  if (cfg.modo === 'achar') {
    const foco = pickWeighted(candidatas, { stats, now, exclude: anterior, rng })
    if (!foco) return null
    const midi = midiAt(inst, foco)
    const pc = pitchClass(midi)
    return { tipo: 'achar', foco, midi, pc, posicoes: positionsOfPitchClass(inst, pc, filtro) }
  }

  // intervalo: a raiz sorteada pode nao ter o alvo dentro da janela; tenta de novo
  const escolhas = cfg.intervalos.length ? cfg.intervalos : CONFIG_PADRAO.intervalos
  for (let tentativa = 0; tentativa < 40; tentativa++) {
    const raiz = pickWeighted(candidatas, { stats, now, exclude: tentativa === 0 ? anterior : null, rng })
    if (!raiz) return null
    const base = escolhas[Math.floor(rng() * escolhas.length)]
    const semitons = cfg.descendente && rng() < 0.5 ? -base : base
    const alvoMidi = midiAt(inst, raiz) + semitons
    const posicoes = positionsOfMidi(inst, alvoMidi, filtro)
    if (posicoes.length > 0) {
      return { tipo: 'intervalo', raiz, raizMidi: midiAt(inst, raiz), semitons, alvoMidi, posicoes }
    }
  }
  return null
}

/** A resposta serve? Em `achar` vale qualquer ocorrencia da mesma nota. */
export function conferir(inst: Instrument, q: Pergunta, resposta: Position | number): boolean {
  if (q.tipo === 'nomear') {
    return typeof resposta === 'number' && pitchClass(resposta) === pitchClass(q.midi)
  }
  if (typeof resposta === 'number') return false
  const midi = midiAt(inst, resposta)
  return q.tipo === 'achar' ? pitchClass(midi) === q.pc : midi === q.alvoMidi
}
