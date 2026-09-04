// Como o andamento sobe, e os modos de sessao.

export type Mode = 'ladder' | 'burst' | 'accel' | 'free'

export const MODE_LABEL: Record<Mode, string> = {
  ladder: 'Escada',
  burst: 'Rajada',
  accel: 'Acelerando',
  free: 'Livre',
}

export const MODE_HELP: Record<Mode, string> = {
  ladder: 'N repeticoes limpas sobem o BPM; duas falhas descem. E o protocolo de sempre.',
  burst: 'Toca uma repeticao, descansa uma. Deixa passar do confortavel sem acumular tensao — e assim que barreira de velocidade cai.',
  accel: 'O clique acelera do andamento inicial ate o alvo ao longo da sessao. Mostra em que BPM voce quebra.',
  free: 'So o metronomo, sem avaliacao.',
}

export type RampConfig = {
  minBpm: number
  maxBpm: number
  /** Quanto sobe e desce, em BPM. Vale para a escada e para os botoes. */
  stepBpm: number
  /** Repeticoes limpas seguidas para subir. */
  repsToAdvance: number
  /** Falhas seguidas para descer. */
  repsToRetreat: number
}

/**
 * Piso do proprio piso. Estudar arpejo devagar quer ir bem abaixo dos 40 do
 * padrao — uma nota a cada dois segundos e jeito legitimo de estudar um salto —
 * entao o unico limite aqui e onde o clique deixa de ser pulso em que da para
 * se segurar.
 */
export const ABS_MIN_BPM = 10

/**
 * Valor de `repsToAdvance` que diz "nao mexa no andamento". A avaliacao segue;
 * so a escada para. Fica aqui para o ajuste e a escada concordarem num sentinela
 * so, em vez de cada um carregar a sua flag.
 */
export const LOCKED = 0

export const DEFAULT_RAMP: RampConfig = {
  minBpm: 40,
  maxBpm: 240,
  stepBpm: 10,
  repsToAdvance: 2,
  repsToRetreat: 2,
}

export type RampState = {
  bpm: number
  cleanStreak: number
  failStreak: number
  /** Maior BPM em que uma repeticao passou nesta sessao. */
  bestCleanBpm: number
}

export function newRamp(bpm: number): RampState {
  return { bpm, cleanStreak: 0, failStreak: 0, bestCleanBpm: 0 }
}

export type RampEvent = 'up' | 'down' | 'hold'

/**
 * Aplica o resultado de uma repeticao. Pura: decisao de andamento e exatamente o
 * tipo de coisa que da errado em silencio dentro de um efeito.
 */
export function nextRamp(
  state: RampState,
  passed: boolean,
  config: RampConfig = DEFAULT_RAMP,
): { state: RampState; event: RampEvent } {
  if (passed) {
    const bestCleanBpm = Math.max(state.bestCleanBpm, state.bpm)
    const cleanStreak = state.cleanStreak + 1
    if (cleanStreak >= config.repsToAdvance) {
      return {
        state: {
          bpm: Math.min(config.maxBpm, state.bpm + config.stepBpm),
          cleanStreak: 0,
          failStreak: 0,
          bestCleanBpm,
        },
        event: 'up',
      }
    }
    return { state: { ...state, cleanStreak, failStreak: 0, bestCleanBpm }, event: 'hold' }
  }

  const failStreak = state.failStreak + 1
  if (failStreak >= config.repsToRetreat) {
    // Desce um degrau, o mesmo que subiria: o andamento anda numa grade so, e
    // da para saber para onde vai antes de ir.
    return {
      state: {
        bpm: Math.max(config.minBpm, state.bpm - config.stepBpm),
        cleanStreak: 0,
        failStreak: 0,
        bestCleanBpm: state.bestCleanBpm,
      },
      event: 'down',
    }
  }
  return { state: { ...state, cleanStreak: 0, failStreak }, event: 'hold' }
}

/**
 * Curva de andamento do modo acelerando: o BPM sobe linearmente por TEMPO (nao
 * por segundo). Devolve onde cada tempo cai, em ms.
 *
 * Reproduz o transporte passo a passo — que agenda cada tempo com a duracao do
 * BPM daquele tempo — em vez da integral exata. Se as duas contas divergissem, a
 * avaliacao acusaria atraso onde quem tocou estava certo.
 */
export function accelCurve(
  startBpm: number,
  endBpm: number,
  totalBeats: number,
): (beat: number) => number {
  const n = Math.max(1, Math.ceil(totalBeats))
  const cum: number[] = [0]
  for (let i = 0; i < n; i++) {
    cum.push(cum[i] + 60000 / bpmAtBeat(startBpm, endBpm, totalBeats, i))
  }
  return (beat: number) => {
    if (beat <= 0) return 0
    const i = Math.floor(beat)
    if (i >= n) return cum[n] + (beat - n) * (60000 / endBpm)
    return cum[i] + (beat - i) * (cum[i + 1] - cum[i])
  }
}

export function bpmAtBeat(
  startBpm: number,
  endBpm: number,
  totalBeats: number,
  beat: number,
): number {
  if (totalBeats <= 0) return startBpm
  const t = Math.min(1, Math.max(0, beat / totalBeats))
  return startBpm + (endBpm - startBpm) * t
}

/** Para onde o andamento vai na proxima subida e na proxima descida. */
export function rampTargets(
  state: RampState,
  config: RampConfig = DEFAULT_RAMP,
): { up: number; down: number } {
  return {
    up: Math.min(config.maxBpm, state.bpm + config.stepBpm),
    down: Math.max(config.minBpm, state.bpm - config.stepBpm),
  }
}
