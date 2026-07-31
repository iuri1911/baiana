// O treino. Os tres exercicios dividem a mesma moldura: mesma janela de casas,
// mesmo sorteio, mesmo resumo — muda o enunciado e o que conta como resposta.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Fretboard, type FretMark } from '../../components/Fretboard'
import { CordasAtivas, JanelaDeCasas, Painel, Segmentado, Alternar } from '../../components/ui'
import { midiAt, posKey, type Position } from '../../core/fretboard'
import { INTERVALS, interval, noteName, pitchClassName } from '../../core/music'
import { describeShift, shiftBetween } from '../../core/fretboard'
import { isRegular, stringNames } from '../../core/tuning'
import { pluck } from '../../audio/engine'
import { useOrientation, useSettings } from '../../store/settings'
import { useProgress } from '../../store/progress'
import { CONFIG_PADRAO, conferir, gerarPergunta, type DrillConfig, type Modo, type Pergunta } from './engine'

type Fase = 'config' | 'perguntando' | 'certo' | 'errado' | 'fim'

const ESPERA_CERTO = 700
const ESPERA_ERRADO = 2200

const MODOS: { valor: Modo; rotulo: string; dica: string }[] = [
  { valor: 'achar', rotulo: 'Achar a nota', dica: 'o app diz a nota, você aponta no braço' },
  { valor: 'nomear', rotulo: 'Nomear', dica: 'o app acende a casa, você diz que nota é' },
  { valor: 'intervalo', rotulo: 'Intervalos', dica: 'a partir de uma raiz, ache a quinta, a oitava...' },
]

export function Drill() {
  const { cfg: geral, inst, nameOpts } = useSettings()
  const { stats, registrar } = useProgress()
  const orientation = useOrientation()

  const [cfg, setCfg] = useState<DrillConfig>(() => ({ ...CONFIG_PADRAO, zone: geral.zone }))
  const [fase, setFase] = useState<Fase>('config')
  const [q, setQ] = useState<Pergunta | null>(null)
  const [acertadas, setAcertadas] = useState<string[]>([])
  const [errada, setErrada] = useState<Position | null>(null)
  const [feitas, setFeitas] = useState(0)
  const [acertos, setAcertos] = useState(0)
  const [sequencia, setSequencia] = useState(0)
  const [tempos, setTempos] = useState<number[]>([])
  const [falhas, setFalhas] = useState<Record<string, number>>({})

  const inicio = useRef(0)
  const anterior = useRef<Position | null>(null)
  const timer = useRef<number | null>(null)
  const statsRef = useRef(stats)
  statsRef.current = stats

  const limparTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => limparTimer, [])

  const proxima = useCallback(() => {
    limparTimer()
    const nova = gerarPergunta(inst, cfg, { stats: statsRef.current, now: Date.now(), anterior: anterior.current })
    if (!nova) {
      setFase('config')
      return
    }
    anterior.current = nova.tipo === 'achar' ? nova.foco : nova.tipo === 'nomear' ? nova.pos : nova.raiz
    setQ(nova)
    setAcertadas([])
    setErrada(null)
    setFase('perguntando')
    inicio.current = Date.now()
    if (geral.som && nova.tipo !== 'nomear') {
      pluck(nova.tipo === 'achar' ? nova.midi : nova.raizMidi)
    }
  }, [cfg, geral.som, inst])

  const encerrarOuSeguir = useCallback(
    (proximoFeitas: number) => {
      if (cfg.total !== null && proximoFeitas >= cfg.total) {
        timer.current = window.setTimeout(() => setFase('fim'), ESPERA_CERTO)
      } else {
        timer.current = window.setTimeout(proxima, ESPERA_CERTO)
      }
    },
    [cfg.total, proxima],
  )

  const marcarFalha = (pos: Position) =>
    setFalhas((f) => ({ ...f, [posKey(pos)]: (f[posKey(pos)] ?? 0) + 1 }))

  const errou = useCallback(
    (culpada: Position, tocada: Position | null) => {
      const ms = Date.now() - inicio.current
      registrar(culpada, false, ms)
      marcarFalha(culpada)
      setErrada(tocada)
      setSequencia(0)
      setFase('errado')
      const proximoFeitas = feitas + 1
      setFeitas(proximoFeitas)
      setTempos((t) => [...t, ms])
      if (geral.som && q) {
        const alvo = q.tipo === 'achar' ? q.midi : q.tipo === 'nomear' ? q.midi : q.alvoMidi
        window.setTimeout(() => pluck(alvo), 300)
      }
      limparTimer()
      if (cfg.total !== null && proximoFeitas >= cfg.total) {
        timer.current = window.setTimeout(() => setFase('fim'), ESPERA_ERRADO)
      } else {
        timer.current = window.setTimeout(proxima, ESPERA_ERRADO)
      }
    },
    [cfg.total, feitas, geral.som, proxima, q, registrar],
  )

  const acertou = useCallback(
    (pos: Position) => {
      const ms = Date.now() - inicio.current
      registrar(pos, true, ms)
      setSequencia((s) => s + 1)
      setAcertos((a) => a + 1)
      setTempos((t) => [...t, ms])
      setFase('certo')
      const proximoFeitas = feitas + 1
      setFeitas(proximoFeitas)
      if (geral.som) pluck(midiAt(inst, pos))
      limparTimer()
      encerrarOuSeguir(proximoFeitas)
    },
    [encerrarOuSeguir, feitas, geral.som, inst, registrar],
  )

  const responderPosicao = (pos: Position) => {
    if (!q || fase !== 'perguntando') return
    const certo = conferir(inst, q, pos)

    if (q.tipo === 'achar' && cfg.todas) {
      if (!certo) {
        for (const p of q.posicoes) if (!acertadas.includes(posKey(p))) registrar(p, false, Date.now() - inicio.current)
        errou(q.foco, pos)
        return
      }
      if (acertadas.includes(posKey(pos))) return
      const novas = [...acertadas, posKey(pos)]
      setAcertadas(novas)
      if (geral.som) pluck(midiAt(inst, pos))
      registrar(pos, true, Date.now() - inicio.current)
      if (novas.length >= q.posicoes.length) {
        const ms = Date.now() - inicio.current
        setSequencia((s) => s + 1)
        setAcertos((a) => a + 1)
        setTempos((t) => [...t, ms])
        setFase('certo')
        const proximoFeitas = feitas + 1
        setFeitas(proximoFeitas)
        limparTimer()
        encerrarOuSeguir(proximoFeitas)
      }
      return
    }

    if (certo) acertou(pos)
    else errou(q.tipo === 'achar' ? q.foco : q.tipo === 'intervalo' ? q.posicoes[0] : q.pos, pos)
  }

  const responderNome = (pc: number) => {
    if (!q || q.tipo !== 'nomear' || fase !== 'perguntando') return
    if (conferir(inst, q, pc)) acertou(q.pos)
    else errou(q.pos, null)
  }

  const comecar = () => {
    setFeitas(0)
    setAcertos(0)
    setSequencia(0)
    setTempos([])
    setFalhas({})
    anterior.current = null
    proxima()
  }

  // --- o que acende no braço ------------------------------------------------
  const marks: FretMark[] = useMemo(() => {
    if (!q) return []
    const m: FretMark[] = []
    const nome = (p: Position) => noteName(midiAt(inst, p), nameOpts)

    if (q.tipo === 'nomear') {
      m.push({
        pos: q.pos,
        label: fase === 'perguntando' ? '?' : nome(q.pos),
        variant: fase === 'certo' ? 'certo' : fase === 'errado' ? 'errado' : 'alvo',
        pulsa: fase === 'perguntando',
      })
      return m
    }

    if (q.tipo === 'intervalo') {
      m.push({ pos: q.raiz, label: nome(q.raiz), variant: 'tonica' })
    }

    for (const k of acertadas) {
      const [s, f] = k.split(':').map(Number)
      m.push({ pos: { string: s, fret: f }, label: nome({ string: s, fret: f }), variant: 'certo' })
    }

    if (fase === 'certo' || fase === 'errado') {
      for (const p of q.posicoes) {
        if (acertadas.includes(posKey(p))) continue
        m.push({ pos: p, label: nome(p), variant: fase === 'certo' ? 'certo' : 'alvo' })
      }
    }
    if (errada) m.push({ pos: errada, label: nome(errada), variant: 'errado' })
    return m
  }, [acertadas, errada, fase, inst, nameOpts, q])

  // --- telas ---------------------------------------------------------------
  const nomesCordas = stringNames(inst, false)

  if (fase === 'config') {
    return (
      <div className="tela tela--rolagem">
        <Painel titulo="Treino">
          <Segmentado
            titulo="Exercício"
            valor={cfg.modo}
            opcoes={MODOS.map((m) => ({ valor: m.valor, rotulo: m.rotulo, dica: m.dica }))}
            onChange={(modo) => setCfg((c) => ({ ...c, modo }))}
          />
          <p className="dica">{MODOS.find((m) => m.valor === cfg.modo)!.dica}</p>

          <JanelaDeCasas zona={cfg.zone} frets={inst.frets} onChange={(zone) => setCfg((c) => ({ ...c, zone }))} />
          <CordasAtivas
            nomes={nomesCordas}
            ativas={cfg.strings.length ? cfg.strings : inst.strings.map((_, i) => i)}
            onChange={(strings) =>
              setCfg((c) => ({ ...c, strings: strings.length === inst.strings.length ? [] : strings }))
            }
          />
          <Segmentado
            titulo="Perguntas"
            valor={cfg.total ?? 0}
            opcoes={[
              { valor: 10, rotulo: '10' },
              { valor: 20, rotulo: '20' },
              { valor: 40, rotulo: '40' },
              { valor: 0, rotulo: 'sem fim' },
            ]}
            onChange={(v) => setCfg((c) => ({ ...c, total: v === 0 ? null : v }))}
          />

          {cfg.modo === 'achar' && (
            <Alternar
              titulo="Achar todas as ocorrências"
              dica="não basta uma: aponte a nota em todas as cordas onde ela cai na janela"
              valor={cfg.todas}
              onChange={(todas) => setCfg((c) => ({ ...c, todas }))}
            />
          )}

          {cfg.modo === 'intervalo' && (
            <>
              <div className="campo">
                <span className="campo__titulo">Intervalos no sorteio</span>
                <div className="segmentado segmentado--grade">
                  {INTERVALS.filter((i) => i.semitones > 0).map((i) => (
                    <button
                      key={i.semitones}
                      type="button"
                      className={`segmentado__item ${cfg.intervalos.includes(i.semitones) ? 'is-ativo' : ''}`}
                      onClick={() =>
                        setCfg((c) => {
                          const tem = c.intervalos.includes(i.semitones)
                          const novos = tem
                            ? c.intervalos.filter((x) => x !== i.semitones)
                            : [...c.intervalos, i.semitones]
                          return novos.length ? { ...c, intervalos: novos } : c
                        })
                      }
                    >
                      {i.short}
                    </button>
                  ))}
                </div>
              </div>
              <Alternar
                titulo="Também para baixo"
                dica="pede o intervalo abaixo da raiz, não só acima"
                valor={cfg.descendente}
                onChange={(descendente) => setCfg((c) => ({ ...c, descendente }))}
              />
            </>
          )}

          <button type="button" className="botao botao--principal" onClick={comecar}>
            Começar
          </button>
        </Painel>
      </div>
    )
  }

  if (fase === 'fim') {
    const media = tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : 0
    const piores = Object.entries(falhas)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
    return (
      <div className="tela tela--rolagem">
        <Painel titulo="Fim da série">
          <p className="placar">
            <strong>
              {acertos}/{feitas}
            </strong>
            <span>{feitas ? Math.round((acertos / feitas) * 100) : 0}% de acerto</span>
            <span>{(media / 1000).toFixed(1)} s por pergunta</span>
          </p>
          {piores.length > 0 && (
            <>
              <h3 className="sub">O que escapou</h3>
              <ul className="lista">
                {piores.map(([k, n]) => {
                  const [s, f] = k.split(':').map(Number)
                  return (
                    <li key={k}>
                      <strong>{noteName(midiAt(inst, { string: s, fret: f }), nameOpts)}</strong> — corda{' '}
                      {nomesCordas[s]}, casa {f} · {n} erro{n > 1 ? 's' : ''}
                    </li>
                  )
                })}
              </ul>
              <p className="dica">Elas voltam mais cedo no próximo treino.</p>
            </>
          )}
          <button type="button" className="botao botao--principal" onClick={comecar}>
            De novo
          </button>
          <button type="button" className="botao" onClick={() => setFase('config')}>
            Mudar ajustes
          </button>
        </Painel>
      </div>
    )
  }

  return (
    <div className="tela">
      <div className="enunciado">
        <Enunciado q={q} fase={fase} nameOpts={nameOpts} inst={inst} acertadas={acertadas.length} />
      </div>

      <div className="tela__braco">
        <Fretboard
          inst={inst}
          zone={cfg.zone}
          orientation={orientation}
          lowFirst={geral.lowFirst}
          marks={marks}
          nameOptions={nameOpts}
          activeStrings={cfg.strings.length ? cfg.strings : undefined}
          onSelect={q?.tipo === 'nomear' ? undefined : responderPosicao}
        />
      </div>

      {q?.tipo === 'nomear' && (
        <div className="notas-grade">
          {Array.from({ length: 12 }, (_, pc) => (
            <button
              key={pc}
              type="button"
              className="nota-botao"
              disabled={fase !== 'perguntando'}
              onClick={() => responderNome(pc)}
            >
              {pitchClassName(pc, nameOpts)}
            </button>
          ))}
        </div>
      )}

      <div className="rodape-treino">
        <span>
          {feitas}
          {cfg.total !== null ? `/${cfg.total}` : ''} · {acertos} ✓
        </span>
        <span className={sequencia >= 3 ? 'chama' : ''}>{sequencia > 0 ? `${sequencia} seguidas` : ''}</span>
        <button type="button" className="botao botao--fantasma" onClick={() => setFase('fim')}>
          encerrar
        </button>
      </div>
    </div>
  )
}

function Enunciado({
  q,
  fase,
  nameOpts,
  inst,
  acertadas,
}: {
  q: Pergunta | null
  fase: Fase
  nameOpts: { lang: 'pt' | 'en'; accidental: 'sharp' | 'flat' }
  inst: import('../../core/tuning').Instrument
  acertadas: number
}) {
  if (!q) return null
  const status = fase === 'certo' ? 'is-certo' : fase === 'errado' ? 'is-errado' : ''

  if (q.tipo === 'achar') {
    return (
      <div className={`pergunta ${status}`}>
        <span className="pergunta__rotulo">Onde está</span>
        <strong className="pergunta__nota">{pitchClassName(q.pc, nameOpts)}</strong>
        {q.posicoes.length > 1 && acertadas < q.posicoes.length && (
          <span className="pergunta__extra">
            {acertadas > 0 ? `${acertadas} de ${q.posicoes.length}` : `${q.posicoes.length} lugares na janela`}
          </span>
        )}
        <button type="button" className="botao botao--fantasma" onClick={() => pluck(q.midi)}>
          ouvir
        </button>
      </div>
    )
  }

  if (q.tipo === 'nomear') {
    return (
      <div className={`pergunta ${status}`}>
        <span className="pergunta__rotulo">Que nota é essa?</span>
        {fase !== 'perguntando' && (
          <strong className="pergunta__nota">{noteName(q.midi, { ...nameOpts, octave: true })}</strong>
        )}
      </div>
    )
  }

  const info = interval(Math.abs(q.semitons))
  const forma = fase === 'certo' ? shiftBetween(q.raiz, q.posicoes[0]) : null
  return (
    <div className={`pergunta ${status}`}>
      <span className="pergunta__rotulo">
        A partir de <strong>{noteName(q.raizMidi, nameOpts)}</strong>, ache
      </span>
      <strong className="pergunta__nota">
        {info.name} {q.semitons < 0 ? 'abaixo' : 'acima'}
      </strong>
      {forma && (
        <span className="pergunta__extra">
          {describeShift(forma)}
          {isRegular(inst) ? ' — mesma forma em qualquer corda' : ''}
        </span>
      )}
    </div>
  )
}
