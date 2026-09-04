import type { ExpectedNote } from './pattern'

// Avaliacao de uma repeticao.
//
// A pergunta nao e "voce grudou no clique" — e "voce tocou as notas certas, na
// ordem, IGUALMENTE espacadas, no andamento pedido". Escala corrida mal tocada
// quase sempre esta em cima do tempo na media e torta no detalhe, e e isso que
// esta medida pega.
//
// Vindo do microfone e nao de MIDI, uma diferenca importa: nao existe "duas
// notas ao mesmo tempo". A baiana e tocada com palheta, uma linha de cada vez,
// entao cada nota esperada e um grupo de uma nota so — e o conceito de
// sincronia entre maos, que no piano era metade da medida, some daqui.

export type PlayedNote = {
  midi: number
  /** 0..127, derivada da energia do ataque. Serve para ver ataque desigual. */
  velocity: number
  onTime: number
  offTime?: number
}

export type NoteStatus = 'matched' | 'missed'

export type GradeConfig = {
  bpm: number
  /** Instante do tempo 0, vindo do transporte. Sem ele a grade e estimada. */
  originMs?: number
  /** Fracao de erros tolerada. 0,02 = 2%. */
  maxErrorRate: number
  /** Teto do coeficiente de variacao dos intervalos entre ataques. */
  maxIoiCv: number
  /** Desvio de andamento tolerado, como fracao. 0,03 = 3%. */
  maxBpmDeviation: number
  /**
   * O tempo reprova? Com false, regularidade e andamento continuam medidos e
   * mostrados, mas nao seguram a aprovacao — e o modo de quem ainda esta
   * decorando a forma e nao tem por que brigar com o relogio ainda.
   */
  timingGates?: boolean
  /**
   * Onde cada tempo DEVERIA cair, em ms desde o inicio. O padrao e a grade
   * constante do bpm; o modo acelerando passa a curva dele. Tudo que depende de
   * tempo esperado sai daqui, entao andamento variavel nao e caso especial.
   */
  expectedMsAt?: (beat: number) => number
}

export type Grade = {
  /** Estado de cada nota esperada, por indice. */
  status: NoteStatus[]
  /** Indice em `played` de cada nota casada, ou -1. */
  matchOf: number[]
  missed: number
  /** Notas tocadas que nao casaram com nada: erradas ou sobrando. */
  extra: number
  errors: number
  accuracy: number
  /** Coeficiente de variacao dos IOI normalizados. E a medida que decide. */
  ioiCv: number
  /** Desvio em ms do intervalo que CHEGA em cada nota. Diz qual delas arrasta. */
  perNoteDevMs: (number | null)[]
  effectiveBpm: number
  /** Desvio absoluto medio da grade do metronomo, em ms. Informativo. */
  gridMadMs: number
  velocityStdev: number
  /**
   * Alguem tentou tocar essa repeticao? Repeticao vazia (afinando, lendo a tela,
   * saiu da sala) nao e erro de execucao e nao pode puxar o andamento para baixo.
   */
  attempted: boolean
  /** Alturas esperadas que nunca vieram, e tocadas que nao casaram. Para a tela. */
  missedNotes: number[]
  extraNotes: number[]
  /**
   * Se o que faltou e o que sobrou batem por um deslocamento constante, o
   * deslocamento em semitons. E o caso "toquei tudo uma oitava abaixo", que sem
   * isso aparece como erro cru enquanto quem tocou jura que acertou.
   */
  transposeHint: number | null
  passed: boolean
  /** Por que reprovou, para a tela dizer o que corrigir. */
  reasons: string[]
}

/** Quantas notas a frente o casamento olha no caso normal. */
const LOOKAHEAD = 3
/**
 * Busca larga para reencontrar a linha depois de um tropeco. Sem ela, pular mais
 * notas que LOOKAHEAD travava o cursor e transformava TODO o resto da repeticao
 * em "sobrando" — quem tocou estava certo e o app chamava tudo de errado. So
 * entra depois de dois ataques seguidos sem casar, senao uma nota errada isolada
 * ja mandaria o cursor pular sozinho.
 */
const RESYNC_LOOKAHEAD = 24
const RESYNC_AFTER = 2
/** Abaixo disso nao se fala em regularidade. */
const MIN_NOTES_FOR_TIMING = 4

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}

/**
 * Casa o tocado contra o esperado, em ordem, com uma janelinha de antecipacao.
 * Uma nota errada nao contamina o resto: o algoritmo reencontra a linha na nota
 * seguinte em vez de chamar tudo dali para a frente de errado.
 */
export function grade(
  expected: ExpectedNote[],
  played: PlayedNote[],
  config: GradeConfig,
): Grade {
  const status: NoteStatus[] = expected.map(() => 'missed')
  const matchOf: number[] = expected.map(() => -1)
  const notes = [...played].sort((a, b) => a.onTime - b.onTime)

  let cursor = 0
  let extra = 0
  let unmatched = 0

  const search = (note: PlayedNote, until: number): number => {
    for (let k = cursor; k < until; k++) {
      if (status[k] === 'missed' && expected[k].midi === note.midi) return k
    }
    return -1
  }

  for (let p = 0; p < notes.length; p++) {
    const note = notes[p]
    let hit = search(note, Math.min(expected.length, cursor + LOOKAHEAD + 1))

    if (hit < 0 && unmatched >= RESYNC_AFTER - 1) {
      // Perdeu a linha: abre a janela para reencontra-la em vez de chamar tudo
      // que vem depois de erro.
      hit = search(note, Math.min(expected.length, cursor + RESYNC_LOOKAHEAD + 1))
    }

    if (hit < 0) {
      extra++
      unmatched++
      continue
    }
    unmatched = 0

    status[hit] = 'matched'
    matchOf[hit] = p
    cursor = hit
    while (cursor < expected.length && status[cursor] === 'matched') cursor++
  }

  const missed = status.filter((s) => s === 'missed').length
  const errors = missed + extra
  const accuracy = expected.length ? (expected.length - missed) / expected.length : 0

  // --- tempo ---------------------------------------------------------------
  const beatMs = 60000 / config.bpm
  const expectedMsAt = config.expectedMsAt ?? ((beat: number) => beat * beatMs)

  const onsets: (number | null)[] = expected.map((_, i) =>
    status[i] === 'matched' ? notes[matchOf[i]].onTime : null,
  )

  const normalized: number[] = []
  const perNoteDevMs: (number | null)[] = expected.map(() => null)
  const rawIoi: { at: number; actual: number; expected: number }[] = []

  for (let k = 1; k < expected.length; k++) {
    const a = onsets[k - 1]
    const b = onsets[k]
    if (a === null || b === null) continue
    const expectedMs = expectedMsAt(expected[k].beat) - expectedMsAt(expected[k - 1].beat)
    if (expectedMs <= 0) continue
    // Normalizar pelo intervalo esperado deixa a mesma medida servir para ritmo
    // uniforme e para agrupamento irregular, sem caso especial.
    normalized.push((b - a) / expectedMs)
    rawIoi.push({ at: k, actual: b - a, expected: expectedMs })
  }

  const ioiMean = mean(normalized)
  const ioiCv = ioiMean > 0 ? stdev(normalized) / ioiMean : 0

  // Desvio em ms contra o espacamento medio DE QUEM TOCOU, nao contra o ideal: o
  // que interessa e qual nota destoa, nao que tudo esta devagar.
  for (const r of rawIoi) {
    perNoteDevMs[r.at] = r.actual - r.expected * ioiMean
  }

  const firstIdx = onsets.findIndex((o) => o !== null)
  const lastIdx = onsets.length - 1 - [...onsets].reverse().findIndex((o) => o !== null)
  // Andamento efetivo como a razao entre quanto ISSO deveria ter levado e quanto
  // levou. Com bpm constante da o bpm real; com curva, o bpm equivalente.
  let effectiveBpm = 0
  if (firstIdx >= 0 && lastIdx > firstIdx) {
    const elapsed = (onsets[lastIdx] as number) - (onsets[firstIdx] as number)
    const span = expectedMsAt(expected[lastIdx].beat) - expectedMsAt(expected[firstIdx].beat)
    if (elapsed > 0 && span > 0) effectiveBpm = (config.bpm * span) / elapsed
  }

  // Grade: se o transporte deu o instante do tempo 0, mede contra ele. Senao
  // ancora na primeira nota — vira medida de forma, nao de entrada.
  const origin =
    config.originMs ??
    (firstIdx >= 0 ? (onsets[firstIdx] as number) - expectedMsAt(expected[firstIdx].beat) : 0)
  const gridErrors: number[] = []
  expected.forEach((e, k) => {
    const o = onsets[k]
    if (o === null) return
    gridErrors.push(Math.abs(o - (origin + expectedMsAt(e.beat))))
  })

  const velocities: number[] = []
  for (let i = 0; i < expected.length; i++) {
    if (status[i] === 'matched') velocities.push(notes[matchOf[i]].velocity)
  }

  const missedNotes = expected.filter((_, i) => status[i] === 'missed').map((e) => e.midi)
  const matchedPlayed = new Set(matchOf.filter((i) => i >= 0))
  const extraNotes = notes.filter((_, i) => !matchedPlayed.has(i)).map((n) => n.midi)
  // Compara a execucao INTEIRA, nao o que sobrou do casamento: numa escala
  // transposta o casamento junta varias notas por coincidencia diatonica, e o
  // residuo nunca fecha — mesmo com tudo tocado na oitava errada.
  const transposeHint = detectTranspose(
    expected.map((e) => e.midi),
    notes.map((n) => n.midi),
  )

  // --- veredito ------------------------------------------------------------
  const reasons: string[] = []
  // Nunca zero: numa forma de 17 notas, 2% arredondado para baixo exigiria
  // execucao perfeita, e isso nao e estudo, e loteria.
  const errorBudget = Math.max(1, Math.round(config.maxErrorRate * expected.length))
  const attempted = expected.length - missed >= Math.max(3, expected.length * 0.25)

  if (!attempted) {
    return {
      status, matchOf, missed, extra, errors, accuracy, ioiCv, perNoteDevMs,
      effectiveBpm, gridMadMs: mean(gridErrors), velocityStdev: stdev(velocities),
      attempted, missedNotes, extraNotes, transposeHint,
      passed: false,
      reasons: ['repetição sem nada tocado'],
    }
  }
  const judgeable = normalized.length >= MIN_NOTES_FOR_TIMING - 1

  if (errors > errorBudget) {
    reasons.push(
      `${errors} erro${errors > 1 ? 's' : ''} (${missed} faltando, ${extra} sobrando) — limite ${errorBudget}`,
    )
    if (transposeHint !== null) {
      const oitavas = transposeHint % 12 === 0 ? Math.abs(transposeHint) / 12 : 0
      reasons.push(
        oitavas
          ? `você tocou tudo ${oitavas} oitava${oitavas > 1 ? 's' : ''} ${transposeHint < 0 ? 'abaixo' : 'acima'}`
          : `você tocou tudo ${Math.abs(transposeHint)} semitons ${transposeHint < 0 ? 'abaixo' : 'acima'}`,
      )
    }
  }
  const timingGates = config.timingGates ?? true

  if (!timingGates) {
    // Nenhuma medida de tempo entra no veredito.
  } else if (!judgeable) {
    reasons.push('notas de menos para medir regularidade')
  } else {
    if (ioiCv > config.maxIoiCv) {
      reasons.push(`desigual: CV ${(ioiCv * 100).toFixed(1)}% — limite ${(config.maxIoiCv * 100).toFixed(0)}%`)
    }
    const drift = Math.abs(effectiveBpm - config.bpm) / config.bpm
    if (drift > config.maxBpmDeviation) {
      reasons.push(
        `fora do andamento: ${Math.round(effectiveBpm)} BPM contra os ${Math.round(config.bpm)} pedidos`,
      )
    }
  }

  return {
    status,
    matchOf,
    missed,
    extra,
    errors,
    accuracy,
    ioiCv,
    perNoteDevMs,
    effectiveBpm,
    gridMadMs: mean(gridErrors),
    velocityStdev: stdev(velocities),
    attempted,
    missedNotes,
    extraNotes,
    transposeHint,
    passed: reasons.length === 0,
    reasons,
  }
}

/**
 * O que foi tocado e a forma esperada deslocada por uma constante?
 * Compara como conjunto ordenado, entao nao depende da ordem de chegada.
 * Devolve o deslocamento em semitons, ou null.
 */
export function detectTranspose(expected: number[], played: number[]): number | null {
  if (expected.length < 3 || expected.length !== played.length) return null
  const a = [...expected].sort((x, y) => x - y)
  const b = [...played].sort((x, y) => x - y)
  const shift = b[0] - a[0]
  if (shift === 0) return null
  return a.every((n, i) => b[i] - n === shift) ? shift : null
}

/**
 * Folga em cada ponta da repeticao, como fracao de tempo. Fracao e nao ms fixos:
 * a 60 BPM um tempo dura um segundo, e 120 ms fixos jogariam fora nota que caiu
 * no lugar certo.
 */
export const GRACE_BEATS = 0.25

/**
 * Onde fica a divisa com a repeticao seguinte, em tempos antes do fim.
 *
 * O exercicio roda em laco, entao a primeira nota da proxima repeticao cai
 * exatamente no fim desta. Uma folga solta no fim engoliria essa nota: contada
 * como sobra aqui e, porque a janela tambem e o que se descarta, como faltando
 * la. Dois erros garantidos por repeticao — mais que o orcamento inteiro de uma
 * forma curta, entao um arpejo tocado perfeitamente reprovaria toda vez.
 *
 * O corte vai na metade do caminho entre o ultimo ataque desta repeticao e o
 * primeiro da proxima, nunca alem de GRACE_BEATS. As duas usam o mesmo corte,
 * entao cada nota e avaliada exatamente uma vez.
 */
export function boundaryBeats(repBeats: number, lastBeat: number): number {
  return Math.min(GRACE_BEATS, Math.max(0, (repBeats - lastBeat) / 2))
}
