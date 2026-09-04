// De quadros de audio para notas tocadas.
//
// Este arquivo e puro de proposito: nao toca em microfone, em worklet nem em
// relogio. Recebe o que o worklet mediu e devolve `PlayedNote`, que e o mesmo
// que a avaliacao consome vindo de um teclado MIDI. Assim a parte dificil — em
// que instante a nota comecou, e se ela e nota mesmo — da para testar sem audio.
//
// Duas fontes de tempo, e a diferenca entre elas e o ponto todo:
//
//  - ENERGIA, a cada bloco de 128 amostras (~2,7 ms), diz QUANDO a nota comecou.
//    Corda pinçada tem ataque abrupto, e a subida de energia e o instante real.
//  - ALTURA, a cada janela de 2048 amostras (~10,7 ms), diz QUAL nota e. Ela
//    chega atrasada por natureza: o detector precisa de alguns periodos para se
//    firmar, e logo no ataque o que existe e transiente sem altura definida.
//
// Por isso a nota e emitida com o carimbo da ENERGIA e a altura confirmada
// DEPOIS. Usar o instante em que a altura se firmou jogaria a nota uns 30 ms
// para a frente — e 30 ms numa semicolcheia a 160 BPM e 30% do vao entre notas,
// ou seja, a medida de regularidade viraria ficcao.

import { midiFromFrequency } from '../../core/music'
import type { PlayedNote } from '../grade'

export type Block = {
  /** Segundos, no relogio de audio. */
  time: number
  /** Energia do bloco. Diz se ha alguem tocando. */
  rms: number
  /** Energia do agudo. Diz se houve palhetada AGORA. */
  hf: number
}

export type Hop = {
  /** Blocos de energia desde o hop anterior, em ordem. */
  blocks: Block[]
  /** Instante do FIM da janela analisada, em segundos do relogio de audio. */
  time: number
  /** Frequencia detectada na janela, ou null. */
  freq: number | null
  /** 0..1, o quanto o detector confia. */
  clarity: number
}

export type TrackerConfig = {
  /** Menor e maior nota que o instrumento produz. Fora disso nao e nota. */
  low: number
  high: number
  /**
   * Energia minima para considerar que alguem tocou. Abaixo disso e ruido de
   * sala. Calibravel: microfone de celular e de interface nao vivem na mesma escala.
   */
  noiseFloor: number
  /**
   * Quanto o AGUDO precisa saltar em relacao ao fundo recente para valer como
   * palhetada nova. Vai no agudo e nao no volume porque nota repetida no mesmo
   * volume — tremolo — nao mexe no volume, mas todo ataque de palheta traz
   * estalo de agudo que a corda em decaimento ja perdeu.
   */
  attackRatio: number
  /** Confianca minima do detector para a altura contar. */
  minClarity: number
  /**
   * Quantos hops seguidos precisam concordar na mesma nota para ela ser emitida.
   * E o que separa nota de tranco: o clique do metronomo e o transiente da
   * palheta nao sustentam altura estavel por tanto tempo.
   */
  stableHops: number
}

export const DEFAULT_TRACKER: TrackerConfig = {
  low: 48,
  high: 100,
  noiseFloor: 0.012,
  attackRatio: 1.8,
  minClarity: 0.92,
  stableHops: 2,
}

type Armed = {
  /** Instante do ataque, em segundos. E o que vira o onTime da nota. */
  time: number
  /** Maior energia vista desde o ataque, para virar velocity. */
  peak: number
  /** Nota candidata e ha quantos hops ela se repete. */
  midi: number | null
  agree: number
}

/**
 * Converte energia de pico em 1..127.
 *
 * A escala e logaritmica porque audicao e logaritmica: em linear, tudo que nao e
 * ataque violento se amontoa embaixo de 20 e o desvio de ataque que a avaliacao
 * mede nao diria nada.
 */
export function velocityFrom(peak: number, noiseFloor: number): number {
  const rel = Math.max(1, peak / Math.max(noiseFloor, 1e-6))
  const v = Math.round((20 * Math.log10(rel)) / 40 * 126) + 1
  return Math.max(1, Math.min(127, v))
}

export class NoteTracker {
  private cfg: TrackerConfig
  /** Fundo de agudo recente, contra o qual o salto da palhetada e medido. */
  private hfFloor = 0
  private armed: Armed | null = null
  /** Nota que esta soando agora, para nao emitir de novo a cada hop. */
  private sounding: number | null = null

  constructor(cfg: Partial<TrackerConfig> = {}) {
    this.cfg = { ...DEFAULT_TRACKER, ...cfg }
  }

  configure(cfg: Partial<TrackerConfig>): void {
    this.cfg = { ...this.cfg, ...cfg }
  }

  /** Zera entre repeticoes: nota armada de uma nao vaza para a outra. */
  reset(): void {
    this.armed = null
    this.sounding = null
    this.hfFloor = 0
  }

  /**
   * Processa um hop. Devolve as notas que fecharam agora — normalmente nenhuma
   * ou uma, nunca mais de uma, porque a baiana e tocada uma nota por vez.
   */
  push(hop: Hop): PlayedNote[] {
    const out: PlayedNote[] = []
    const { noiseFloor, attackRatio } = this.cfg

    for (const b of hop.blocks) {
      const ataque = b.rms > noiseFloor && b.hf > this.hfFloor * attackRatio

      if (ataque) {
        // Ataque novo enquanto uma nota ainda esperava confirmacao: aquela nao
        // se firmou a tempo e nao existiu. Perder uma nota fraca e melhor do que
        // inventar uma que ninguem tocou.
        this.armed = { time: b.time, peak: b.rms, midi: null, agree: 0 }
        this.sounding = null
      } else if (this.armed) {
        this.armed.peak = Math.max(this.armed.peak, b.rms)
      }

      // O fundo sobe na hora e desce devagar. Subir na hora e o que impede o
      // proprio ataque de disparar duas vezes nos blocos seguintes; descer
      // devagar e o que impede a oscilacao da cauda de virar ataque.
      this.hfFloor = b.hf > this.hfFloor ? b.hf : this.hfFloor * 0.85 + b.hf * 0.15

      if (b.rms < noiseFloor) this.sounding = null
    }

    const nota = this.pitchOf(hop)

    if (nota === null) {
      if (this.armed) this.armed.agree = 0
      return out
    }

    if (this.armed) {
      this.armed.agree = this.armed.midi === nota ? this.armed.agree + 1 : 1
      this.armed.midi = nota

      if (this.armed.agree >= this.cfg.stableHops && nota !== this.sounding) {
        out.push({
          midi: nota,
          velocity: velocityFrom(this.armed.peak, this.cfg.noiseFloor),
          onTime: this.armed.time,
        })
        this.sounding = nota
        this.armed = null
      }
      return out
    }

    // Sem ataque detectado e a altura mudou mesmo assim: ligado, martelinho, ou
    // ataque suave demais para saltar do fundo. Vale como nota, mas o instante e
    // o do hop — mais frouxo que o do ataque, e nao ha o que fazer quanto a isso.
    if (nota !== this.sounding) {
      this.armed = { time: hop.time, peak: this.cfg.noiseFloor, midi: nota, agree: 1 }
    }
    return out
  }

  /** A altura do hop, se ela for confiavel e couber no instrumento. */
  private pitchOf(hop: Hop): number | null {
    if (hop.freq === null || hop.clarity < this.cfg.minClarity) return null
    const d = midiFromFrequency(hop.freq)
    if (!d) return null
    // Fora da extensao do instrumento nao e o instrumento: e voz, ar
    // condicionado, ou o harmonico que o detector confundiu com a fundamental.
    if (d.midi < this.cfg.low || d.midi > this.cfg.high) return null
    return d.midi
  }
}
