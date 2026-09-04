// Treino de velocidade ouvindo o instrumento.
//
// O laco: o transporte agenda os tempos, o microfone entrega as notas com o
// instante do ataque, e no fim de cada repeticao a avaliacao compara o que veio
// com a forma esperada. Duas repeticoes limpas sobem o BPM, duas reprovadas
// descem — mesma escada do treino de teclado, so que a entrada e som.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Fretboard, type FretMark } from '../../components/Fretboard'
import { Painel, Segmentado } from '../../components/ui'
import { noteName, pitchClassName } from '../../core/music'
import { ARPEGGIOS, SCALES, findShape } from '../../core/shapes'
import { useOrientation, useSettings } from '../../store/settings'
import {
  bestFor,
  clearShredStats,
  loadShredSettings,
  loadShredStats,
  recordRep,
  saveShredSettings,
  worstNotes,
  type ShredSettings,
} from '../../store/shredSettings'
import { Transport, type Beat } from '../../shred/clock'
import { boundaryBeats, grade, type Grade, type PlayedNote } from '../../shred/grade'
import { expandPattern, DIRECTION_LABEL, type Direction } from '../../shred/pattern'
import {
  ABS_MIN_BPM,
  DEFAULT_RAMP,
  LOCKED,
  MODE_HELP,
  MODE_LABEL,
  bpmAtBeat,
  newRamp,
  nextRamp,
  rampTargets,
  type Mode,
} from '../../shred/ramp'
import { Mic } from '../../shred/pitch/mic'
import { MicCheck } from './MicCheck'

/**
 * Folga em cada ponta da repeticao, como fracao de tempo. Fracao e nao ms fixos:
 * a 60 BPM um tempo dura um segundo, e 120 ms fixos jogariam fora nota que caiu
 * no lugar certo.
 */
const GRACE_BEATS = 0.25
/** Quantas repeticoes o modo acelerando leva do inicial ao alvo. */
const ACCEL_REPS = 8
const BEATS_PER_BAR = 4

type Fase = 'parado' | 'contagem' | 'tocando' | 'descanso' | 'demo'

/** Lista curta de alturas, sem despejar sessenta nomes na barra. */
function nomes(midis: number[], opts: Parameters<typeof noteName>[1]): string {
  const unicas = [...new Set(midis)]
  const mostra = unicas
    .slice(0, 6)
    .map((m) => noteName(m, { ...opts, octave: true }))
    .join(' ')
  return unicas.length > 6 ? `${mostra} +${unicas.length - 6}` : mostra
}

const DIRECOES: Direction[] = ['up', 'down', 'updown']
const SUBDIVISOES = [2, 3, 4]

export function Shred() {
  const { inst, nameOpts, cfg: geral } = useSettings()
  const orientation = useOrientation()

  const [cfg, setCfg] = useState<ShredSettings>(loadShredSettings)
  const persist = useCallback((patch: Partial<ShredSettings>) => {
    setCfg((prev) => saveShredSettings({ ...prev, ...patch }))
  }, [])

  const [fase, setFase] = useState<Fase>('parado')
  const [veredito, setVeredito] = useState<Grade | null>(null)
  const [historico, setHistorico] = useState<{ bpm: number; passed: boolean }[]>([])
  const [stats, setStats] = useState(loadShredStats)
  const [erro, setErro] = useState<string | null>(null)
  const [anuncio, setAnuncio] = useState<string | null>(null)
  /** Ultima nota ouvida, para o braço reagir enquanto voce toca. */
  const [ouvida, setOuvida] = useState<number | null>(null)

  const shape = findShape(cfg.shapeId) ?? SCALES[0]
  const [ramp, setRamp] = useState(() => newRamp(cfg.bpm))

  const expansion = useMemo(
    () =>
      expandPattern(
        {
          shape,
          rootPc: cfg.rootPc,
          octaves: cfg.octaves,
          direction: cfg.direction,
          subdivision: cfg.subdivision,
        },
        inst,
      ),
    [shape, cfg.rootPc, cfg.octaves, cfg.direction, cfg.subdivision, inst],
  )

  const repBars = Math.max(1, Math.ceil(expansion.beats / BEATS_PER_BAR))
  const repBeats = repBars * BEATS_PER_BAR
  const cycleBeats = cfg.mode === 'burst' ? repBeats * 2 : repBeats
  const lastBeat = useMemo(
    () => expansion.notes.reduce((m, n) => Math.max(m, n.beat), 0),
    [expansion],
  )

  // --- refs de execucao ------------------------------------------------------
  // A avaliacao roda dentro de timers e nao pode ler estado velho: tudo que ela
  // precisa passa por aqui.
  const transportRef = useRef<Transport | null>(null)
  const micRef = useRef<Mic | null>(null)
  const playedRef = useRef<PlayedNote[]>([])
  const beatsRef = useRef<{ index: number; perf: number }[]>([])
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const demoRef = useRef(false)
  const rampRef = useRef(ramp)
  rampRef.current = ramp

  const rampConfig = useMemo(
    () => ({
      ...DEFAULT_RAMP,
      repsToAdvance: Math.max(1, cfg.advanceReps),
      minBpm: cfg.minBpm,
    }),
    [cfg.advanceReps, cfg.minBpm],
  )
  const rampConfigRef = useRef(rampConfig)
  rampConfigRef.current = rampConfig

  const travado = cfg.advanceReps === LOCKED

  const cfgRef = useRef({
    expansion,
    repBeats,
    cycleBeats,
    mode: cfg.mode,
    lastBeat,
    travado,
    shapeId: shape.id,
    rootPc: cfg.rootPc,
    guide: cfg.guide,
    guideVolume: cfg.guideVolume,
  })
  cfgRef.current = {
    expansion,
    repBeats,
    cycleBeats,
    mode: cfg.mode,
    lastBeat,
    travado,
    shapeId: shape.id,
    rootPc: cfg.rootPc,
    guide: cfg.guide,
    guideVolume: cfg.guideVolume,
  }

  const later = (fn: () => void, delayMs: number) => {
    const id: ReturnType<typeof setTimeout> = setTimeout(
      () => {
        timersRef.current = timersRef.current.filter((t) => t !== id)
        fn()
      },
      Math.max(0, delayMs),
    )
    timersRef.current.push(id)
  }

  /** Instante do tempo `beat`, interpolando entre os ja agendados. */
  const perfAtBeat = useCallback((beat: number): number => {
    const list = beatsRef.current
    const i = Math.floor(beat)
    const a = list.find((b) => b.index === i)
    if (!a) return Number.NaN
    if (beat === i) return a.perf
    const b2 = list.find((b) => b.index === i + 1)
    return b2 ? a.perf + (beat - i) * (b2.perf - a.perf) : a.perf
  }, [])

  // --- avaliar uma repeticao -------------------------------------------------
  const evaluateRep = useCallback(
    (r: number) => {
      const c = cfgRef.current
      const startBeat = r * c.cycleBeats
      const repStart = perfAtBeat(startBeat)
      if (!Number.isFinite(repStart)) return
      const repEnd = perfAtBeat(startBeat + c.repBeats)

      // O tempo esperado sai dos instantes que o transporte realmente agendou,
      // em vez de recalcular a grade: assim o modo acelerando nao e caso
      // especial e as duas contas nao tem como divergir.
      const localMsAt = (beat: number) => {
        const t = perfAtBeat(startBeat + beat)
        return Number.isFinite(t)
          ? t - repStart
          : beat * (60000 / (transportRef.current?.currentBpm ?? 120))
      }
      const umTempo = localMsAt(1)
      const bpm = umTempo > 0 ? 60000 / umTempo : (transportRef.current?.currentBpm ?? 120)

      const corte = (60000 / bpm) * boundaryBeats(c.repBeats, c.lastBeat)
      const fim = Number.isFinite(repEnd) ? repEnd - corte : Number.POSITIVE_INFINITY
      const notas = playedRef.current
        .filter((n) => n.onTime >= repStart - corte && n.onTime < fim)
        .sort((a, b) => a.onTime - b.onTime)

      const g = grade(c.expansion.notes, notas, {
        bpm,
        originMs: repStart,
        maxErrorRate: 0.03,
        maxIoiCv: 0.14,
        maxBpmDeviation: 0.05,
        expectedMsAt: localMsAt,
      })
      setVeredito(g)

      // Repeticao sem nada tocado nao e falha de execucao: nao entra na sessao,
      // nao vira estatistica e, principalmente, nao baixa o andamento.
      if (!g.attempted) return

      setHistorico((prev) => [...prev.slice(-11), { bpm: Math.round(bpm), passed: g.passed }])
      setStats((s) => recordRep(s, c.shapeId, c.rootPc, Math.round(bpm), g.passed, g.perNoteDevMs))

      if ((c.mode === 'ladder' || c.mode === 'burst') && !c.travado) {
        const prox = nextRamp(rampRef.current, g.passed, rampConfigRef.current)
        rampRef.current = prox.state
        setRamp(prox.state)
        if (prox.event === 'hold') {
          transportRef.current?.setBpm(prox.state.bpm)
        } else {
          setAnuncio(`${prox.event === 'up' ? '↑' : '↓'} ${prox.state.bpm} BPM`)
          void restartAtTempoRef.current(prox.state.bpm)
        }
      }

      // Tudo dentro da janela ja foi resolvido. Guardar parte para a proxima
      // repeticao era o que fazia a mesma nota contar duas vezes.
      playedRef.current = playedRef.current.filter((n) => n.onTime >= fim)
      micRef.current?.reset()
    },
    [perfAtBeat],
  )

  /** Toca as notas do exercicio que caem no proximo tempo. */
  const scheduleGuide = useCallback((b: Beat, gain: number) => {
    const t = transportRef.current
    if (!t || b.index < 0 || gain <= 0) return
    const c = cfgRef.current
    const porTempo = 60 / (t.currentBpm || 120)
    const local = ((b.index % c.cycleBeats) + c.cycleBeats) % c.cycleBeats
    for (const n of c.expansion.notes) {
      if (n.beat >= local && n.beat < local + 1) {
        t.note(n.midi, b.audioTime + (n.beat - local) * porTempo, gain)
      }
    }
  }, [])

  const stopRef = useRef<() => void>(() => {})
  const restartAtTempoRef = useRef<(bpm: number) => Promise<void>>(async () => {})

  const handleBeat = useCallback(
    (b: Beat) => {
      beatsRef.current.push({ index: b.index, perf: b.perfTime })
      if (beatsRef.current.length > 256) beatsRef.current.splice(0, 64)

      const c = cfgRef.current
      const atraso = b.perfTime - performance.now()

      if (demoRef.current) {
        scheduleGuide(b, c.guideVolume)
        if (b.index >= c.repBeats) later(() => stopRef.current(), atraso)
        return
      }

      if (c.mode === 'accel' && b.index >= 0) {
        const total = c.cycleBeats * ACCEL_REPS
        transportRef.current?.setBpm(
          bpmAtBeat(rampRef.current.bpm, DEFAULT_RAMP.maxBpm, total, b.index + 1),
        )
      }

      if (c.guide) scheduleGuide(b, c.guideVolume)

      if (b.index === 0) {
        later(() => {
          setFase('tocando')
          setAnuncio(null)
        }, atraso)
      }

      // Fim de uma janela tocada: avalia depois de uma folga, senao a ultima
      // nota ainda nao chegou.
      if (b.index >= c.repBeats && (b.index - c.repBeats) % c.cycleBeats === 0) {
        const r = (b.index - c.repBeats) / c.cycleBeats
        const espera = (60000 / (transportRef.current?.currentBpm ?? 120)) * GRACE_BEATS + 40
        later(() => {
          evaluateRep(r)
          if (c.mode === 'burst') setFase('descanso')
        }, atraso + espera)
      }

      if (b.index > 0 && b.index % c.cycleBeats === 0) {
        later(() => setFase('tocando'), atraso)
      }
    },
    [evaluateRep, scheduleGuide],
  )

  /** Garante microfone ligado e configurado para este instrumento. */
  const ensureMic = useCallback(async () => {
    const baixo = inst.strings[0]
    const alto = inst.strings[inst.strings.length - 1] + inst.frets
    const mic = (micRef.current ??= new Mic({
      onNote: (n) => {
        playedRef.current.push(n)
        if (playedRef.current.length > 2000) playedRef.current.splice(0, 1000)
        setOuvida(n.midi)
      },
    }))
    // Folga de um semitom nas pontas: corda um tico desafinada continua sendo o
    // instrumento, e cortar exatamente na borda comeria a nota mais aguda.
    mic.configure({
      low: baixo - 1,
      high: alto + 1,
      noiseFloor: cfg.noiseFloor,
    })
    mic.setLatency(cfg.latencyMs)
    await mic.start()
  }, [inst, cfg.noiseFloor, cfg.latencyMs])

  const restartAtTempo = useCallback(async (bpm: number) => {
    const t = transportRef.current
    if (!t) return
    t.stop()
    for (const id of timersRef.current) clearTimeout(id)
    timersRef.current = []
    playedRef.current = []
    beatsRef.current = []
    micRef.current?.reset()
    setFase('contagem')
    try {
      await t.start({ bpm, beatsPerBar: BEATS_PER_BAR, countInBars: 1 })
    } catch (e) {
      setFase('parado')
      setErro(`Não consegui iniciar o áudio: ${(e as Error).message}`)
    }
  }, [])
  restartAtTempoRef.current = restartAtTempo

  const stop = useCallback(() => {
    demoRef.current = false
    setAnuncio(null)
    transportRef.current?.stop()
    for (const t of timersRef.current) clearTimeout(t)
    timersRef.current = []
    setFase('parado')
  }, [])
  stopRef.current = stop

  const listen = useCallback(async () => {
    setErro(null)
    const t = (transportRef.current ??= new Transport())
    t.onBeat = handleBeat
    t.setVolume(cfg.clickVolume)
    demoRef.current = true
    beatsRef.current = []
    setVeredito(null)
    setFase('demo')
    try {
      await t.start({
        bpm: ramp.bpm,
        beatsPerBar: BEATS_PER_BAR,
        countInBars: 1,
      })
    } catch (e) {
      demoRef.current = false
      setFase('parado')
      setErro(`Não consegui iniciar o áudio: ${(e as Error).message}`)
    }
  }, [handleBeat, cfg.clickVolume, ramp.bpm])

  const start = useCallback(async () => {
    setErro(null)
    try {
      await ensureMic()
    } catch (e) {
      setErro(
        (e as Error).name === 'NotAllowedError'
          ? 'Sem permissão de microfone não dá para avaliar. Libere e tente de novo.'
          : `Não consegui abrir o microfone: ${(e as Error).message}`,
      )
      return
    }

    const t = (transportRef.current ??= new Transport())
    t.onBeat = handleBeat
    t.setVolume(cfg.clickVolume)

    playedRef.current = []
    beatsRef.current = []
    micRef.current?.reset()
    setVeredito(null)
    setHistorico([])
    demoRef.current = false
    setAnuncio(null)
    setFase('contagem')

    try {
      await t.start({
        bpm: ramp.bpm,
        beatsPerBar: BEATS_PER_BAR,
        countInBars: 1,
      })
    } catch (e) {
      setFase('parado')
      setErro(`Não consegui iniciar o áudio: ${(e as Error).message}`)
    }
  }, [ensureMic, handleBeat, cfg.clickVolume, ramp.bpm])

  // Sair da aba ou trocar de forma no meio nao pode deixar o clique rodando.
  useEffect(
    () => () => {
      stop()
      micRef.current?.stop()
    },
    [stop],
  )

  useEffect(() => {
    if (fase !== 'parado') stop()
    setRamp(newRamp(cfg.bpm))
    setVeredito(null)
    setHistorico([])
    // Trocar de forma zera a escada: o BPM de uma nao vale para a outra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.shapeId, cfg.rootPc, cfg.octaves, cfg.direction, cfg.subdivision])

  const setTempo = useCallback(
    (bpm: number) => {
      if (!Number.isFinite(bpm)) return
      const alvo = Math.max(cfg.minBpm, Math.min(DEFAULT_RAMP.maxBpm, Math.round(bpm)))
      setRamp((prev) => ({
        ...prev,
        bpm: alvo,
        cleanStreak: 0,
        failStreak: 0,
      }))
      persist({ bpm: alvo })
      transportRef.current?.setBpm(alvo)
    },
    [cfg.minBpm, persist],
  )

  /**
   * A janela de casas segue o exercicio, em vez de mostrar o braço inteiro.
   *
   * Vinte e quatro casas espremidas na largura de um celular deixam as casas do
   * tamanho do dedo e as notas empilhadas umas por cima das outras. O exercicio
   * mora num trecho; e esse trecho que precisa caber na tela.
   */
  const zone = useMemo(() => {
    const casas = expansion.notes.map((n) => n.pos?.fret).filter((f): f is number => f !== undefined)
    if (!casas.length) return { from: 0, to: Math.min(7, inst.frets) }
    const from = Math.max(0, Math.min(...casas) - 1)
    // Piso de cinco casas: uma forma que cabe em duas casas num braço de duas
    // casas vira um desenho gigante e sem referencia nenhuma.
    const to = Math.min(inst.frets, Math.max(Math.max(...casas) + 1, from + 5))
    return { from, to }
  }, [expansion, inst.frets])

  // --- o que acende no braço -------------------------------------------------
  const marks: FretMark[] = useMemo(() => {
    const m: FretMark[] = []
    const vistas = new Set<string>()
    for (const n of expansion.notes) {
      if (!n.pos) continue
      const k = `${n.pos.string}:${n.pos.fret}`
      if (vistas.has(k)) continue
      vistas.add(k)
      m.push({
        pos: n.pos,
        label: n.degree,
        variant: n.degree === '1' ? 'tonica' : 'nota',
      })
    }
    // So acende o que faltou se alguem tentou tocar. Numa repeticao em que voce
    // parou para ler a tela, TODA nota conta como faltando — e o braço inteiro
    // vermelho diria que voce errou tudo, quando voce so nao tocou.
    if (veredito?.attempted) {
      for (const midi of veredito.missedNotes) {
        const alvo = expansion.notes.find((n) => n.midi === midi && n.pos)
        if (alvo?.pos)
          m.push({
            pos: alvo.pos,
            label: noteName(midi, nameOpts),
            variant: 'errado',
          })
      }
    }
    if (ouvida !== null && fase === 'tocando') {
      const alvo = expansion.notes.find((n) => n.midi === ouvida && n.pos)
      if (alvo?.pos) {
        m.push({
          pos: alvo.pos,
          label: noteName(ouvida, nameOpts),
          variant: 'certo',
          pulsa: true,
        })
      }
    }
    return m
  }, [expansion, veredito, ouvida, fase, nameOpts])

  const alvos = rampTargets(ramp, rampConfig)
  const recorde = bestFor(stats, shape.id)
  const tropecos = worstNotes(stats, shape.id)
  const bpmAgora =
    fase === 'parado' ? ramp.bpm : Math.round(transportRef.current?.currentBpm ?? ramp.bpm)

  if (!cfg.micOk) {
    return (
      <MicCheck
        noiseFloor={cfg.noiseFloor}
        onNoiseFloor={(noiseFloor) => persist({ noiseFloor })}
        onPronto={() => persist({ micOk: true })}
      />
    )
  }

  return (
    <div className="tela">
      <div className="tela__braco">
        <Fretboard
          inst={inst}
          zone={zone}
          orientation={orientation}
          lowFirst={geral.lowFirst}
          marks={marks}
          nameOptions={nameOpts}
        />
      </div>
      {anuncio && <div className="anuncio">{anuncio}</div>}
      <div className="rodape-treino">
        {fase === 'parado' ? (
          <>
            <button type="button" className="botao" onClick={listen}>
              ouvir a forma
            </button>
            <button type="button" className="botao botao--principal" onClick={start}>
              Começar
            </button>
          </>
        ) : (
          <button type="button" className="botao botao--principal" onClick={stop}>
            Parar
          </button>
        )}
      </div>

      {/* O braço e o transporte ficam parados; a configuração é que rola.
          Mesma divisão das outras telas — no meio do exercício o que importa
          é ver o braço e alcançar o Parar, não o seletor de tônica. */}
      <div className="tela__painel">
        <Painel titulo="Treino por áudio">
          <Segmentado
            titulo="Forma"
            valor={cfg.shapeId}
            opcoes={[...SCALES, ...ARPEGGIOS].map((s) => ({
              valor: s.id,
              rotulo: s.name,
            }))}
            onChange={(shapeId) => persist({ shapeId })}
          />
          <div className="campo">
            <span className="campo__titulo">Tônica</span>
            <div className="segmentado segmentado--grade">
              {Array.from({ length: 12 }, (_, pc) => (
                <button
                  key={pc}
                  type="button"
                  className={`segmentado__item ${cfg.rootPc === pc ? 'is-ativo' : ''}`}
                  onClick={() => persist({ rootPc: pc })}
                >
                  {pitchClassName(pc, nameOpts)}
                </button>
              ))}
            </div>
          </div>

          <Segmentado
            titulo="Direção"
            valor={cfg.direction}
            opcoes={DIRECOES.map((d) => ({
              valor: d,
              rotulo: DIRECTION_LABEL[d],
            }))}
            onChange={(direction) => persist({ direction })}
          />
          <Segmentado
            titulo="Oitavas"
            valor={cfg.octaves}
            opcoes={[1, 2, 3].map((o) => ({ valor: o, rotulo: String(o) }))}
            onChange={(octaves) => persist({ octaves })}
          />
          <Segmentado
            titulo="Subdivisão"
            valor={cfg.subdivision}
            opcoes={SUBDIVISOES.map((s) => ({
              valor: s,
              rotulo: s === 2 ? 'colcheia' : s === 3 ? 'tercina' : 'semicolcheia',
            }))}
            onChange={(subdivision) => persist({ subdivision })}
          />
          <Segmentado
            titulo="Modo"
            valor={cfg.mode}
            opcoes={(Object.keys(MODE_LABEL) as Mode[]).map((m) => ({
              valor: m,
              rotulo: MODE_LABEL[m],
              dica: MODE_HELP[m],
            }))}
            onChange={(mode) => persist({ mode })}
          />
          <p className="dica">{MODE_HELP[cfg.mode]}</p>

          <Segmentado
            titulo="Sobe após"
            valor={cfg.advanceReps}
            opcoes={[
              { valor: 1, rotulo: '1 limpa' },
              { valor: 2, rotulo: '2 limpas' },
              { valor: 3, rotulo: '3 limpas' },
              { valor: LOCKED, rotulo: 'nunca' },
            ]}
            onChange={(advanceReps) => persist({ advanceReps })}
          />
        </Painel>

        <Painel titulo="Andamento">
          <div className="tempo-linha">
            <button type="button" className="botao" onClick={() => setTempo(ramp.bpm - 10)}>
              −
            </button>
            <strong className="bpm-grande">{bpmAgora}</strong>
            <span className="dica">BPM</span>
            <button type="button" className="botao" onClick={() => setTempo(ramp.bpm + 10)}>
              +
            </button>
          </div>
          <input
            type="range"
            min={cfg.minBpm}
            max={DEFAULT_RAMP.maxBpm}
            value={ramp.bpm}
            onChange={(e) => setTempo(Number(e.target.value))}
            aria-label="andamento"
          />
          <label className="campo">
            <span className="campo__titulo">
              Piso <em>{cfg.minBpm} BPM</em>
            </span>
            <input
              type="range"
              min={ABS_MIN_BPM}
              max={120}
              value={cfg.minBpm}
              onChange={(e) => {
                const minBpm = Number(e.target.value)
                persist({ minBpm })
                if (ramp.bpm < minBpm) setTempo(minBpm)
              }}
            />
          </label>
          <label className="campo">
            <span className="campo__titulo">
              Clique <em>{Math.round(cfg.clickVolume * 100)}%</em>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(cfg.clickVolume * 100)}
              onChange={(e) => {
                const v = Number(e.target.value) / 100
                persist({ clickVolume: v })
                transportRef.current?.setVolume(v)
              }}
            />
          </label>
          <label className="campo">
            <span className="campo__titulo">
              Atraso da entrada <em>{cfg.latencyMs} ms</em>
            </span>
            <input
              type="range"
              min={-50}
              max={250}
              step={5}
              value={cfg.latencyMs}
              onChange={(e) => {
                const latencyMs = Number(e.target.value)
                persist({ latencyMs })
                micRef.current?.setLatency(latencyMs)
              }}
            />
            <small className="dica">
              Suba até o número <strong>grade</strong> do veredito cair. Desvio constante não
              reprova, só desloca a nota contra a grade.
            </small>
          </label>
        </Painel>

        {expansion.warning && <p className="aviso">{expansion.warning}</p>}
        {erro && <p className="erro">{erro}</p>}

        <Painel titulo="Veredito">
          {fase === 'demo' && <p className="dica">tocando a forma — só escute</p>}
          {fase === 'contagem' && <p className="dica">contando…</p>}
          {fase === 'descanso' && <p className="dica">descanso — solte a mão</p>}
          {fase === 'tocando' && !veredito && <p className="dica">tocando</p>}

          {/* Repeticao sem nada tocado nao ganha placar: "0% certas, 0 BPM real"
            le como fracasso, e nao houve execucao nenhuma para julgar. */}
          {veredito && !veredito.attempted && (
            <p className="dica">{veredito.reasons.join(' · ')}</p>
          )}

          {veredito?.attempted && (
            <>
              <p
                className={`placar placar--linha veredito ${veredito.passed ? 'is-certo' : 'is-errado'}`}
              >
                <strong>{veredito.passed ? 'limpa' : 'ainda não'}</strong>
                <span>{Math.round(veredito.accuracy * 100)}% certas</span>
                <span>regularidade {(veredito.ioiCv * 100).toFixed(1)}%</span>
                <span>{Math.round(veredito.effectiveBpm)} BPM real</span>
                <span>grade {veredito.gridMadMs.toFixed(0)} ms</span>
              </p>
              {!veredito.passed && <p className="dica">{veredito.reasons.join(' · ')}</p>}
              {(veredito.missedNotes.length > 0 || veredito.extraNotes.length > 0) && (
                <p className="nota-diff">
                  {veredito.missedNotes.length > 0 && (
                    <>faltou {nomes(veredito.missedNotes, nameOpts)}</>
                  )}
                  {veredito.missedNotes.length > 0 && veredito.extraNotes.length > 0 && ' · '}
                  {veredito.extraNotes.length > 0 && (
                    <>sobrou {nomes(veredito.extraNotes, nameOpts)}</>
                  )}
                </p>
              )}
            </>
          )}

          {cfg.mode !== 'accel' && cfg.mode !== 'free' && (
            <p className="dica">
              {travado ? (
                <>
                  andamento travado em <strong>{ramp.bpm}</strong> BPM — as repetições continuam
                  avaliadas, só a escada não anda
                </>
              ) : ramp.failStreak > 0 ? (
                <>
                  mais {DEFAULT_RAMP.repsToRetreat - ramp.failStreak} falha e desce para{' '}
                  <strong>{alvos.down}</strong> BPM
                </>
              ) : (
                <>
                  mais {rampConfig.repsToAdvance - ramp.cleanStreak} limpa
                  {rampConfig.repsToAdvance - ramp.cleanStreak > 1 ? 's' : ''} e sobe para{' '}
                  <strong>{alvos.up}</strong> BPM
                </>
              )}
            </p>
          )}

          {historico.length > 0 && (
            <p className="historico">
              {historico.map((h, i) => (
                <span key={i} className={h.passed ? 'is-certo' : 'is-errado'}>
                  {h.bpm}
                </span>
              ))}
            </p>
          )}

          <p className="dica">
            {recorde > 0 ? `recorde nesta forma: ${recorde} BPM` : 'ainda sem recorde'}
          </p>

          {tropecos.length > 0 && (
            <>
              <h3 className="sub">Onde a mão tropeça</h3>
              <ul className="lista">
                {tropecos.map((t) => {
                  const nota = expansion.notes[t.index]
                  return (
                    <li key={t.index}>
                      nota {t.index + 1}
                      {nota && ` (${noteName(nota.midi, nameOpts)})`}: ±{t.devMs.toFixed(0)} ms
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          <button
            type="button"
            className="botao botao--fantasma"
            onClick={() => setStats(clearShredStats())}
          >
            zerar recordes
          </button>
        </Painel>
      </div>
    </div>
  )
}
