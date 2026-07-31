// Mapa de calor: o mesmo braco, colorido pelo que voce acerta.

import { useMemo, useRef, useState } from 'react'
import { Fretboard, type FretMark } from '../components/Fretboard'
import { JanelaDeCasas, Painel } from '../components/ui'
import { allPositions, midiAt, parsePosKey, posKey } from '../core/fretboard'
import { noteName } from '../core/music'
import { accuracy, intervalFor, type PosStat } from '../core/scheduler'
import { useOrientation, useSettings } from '../store/settings'
import { useProgress } from '../store/progress'
import { pluck } from '../audio/engine'

/**
 * Do vermelho de erro ate o verde da marca (#9FE870 ≈ 92°), passando por
 * amarelo. Quanto mais respostas naquela casa, mais firme a cor.
 */
function cor(stat: PosStat): string {
  const a = accuracy(stat)
  const forca = Math.min(1, stat.seen / 6)
  const matiz = 10 + a * 82
  const sat = 60 + a * 13
  const luz = 42 + a * 16
  return `hsl(${matiz} ${sat}% ${luz}% / ${0.5 + forca * 0.5})`
}

export function ProgressView() {
  const { cfg, set, inst, nameOpts } = useSettings()
  const { stats, total, limpar, exportar, importar } = useProgress()
  const orientation = useOrientation()
  const [aviso, setAviso] = useState('')
  const arquivo = useRef<HTMLInputElement>(null)

  const marks: FretMark[] = useMemo(
    () =>
      Object.entries(stats).map(([k, s]) => {
        const pos = parsePosKey(k)
        return { pos, label: noteName(midiAt(inst, pos), nameOpts), variant: 'calor' as const, color: cor(s) }
      }),
    [inst, nameOpts, stats],
  )

  const agora = Date.now()
  const dominadas = Object.values(stats).filter((s) => s.streak >= 3 && accuracy(s) >= 0.8).length
  const vencidas = Object.entries(stats).filter(([, s]) => agora - s.lastAt >= intervalFor(s)).length
  const totalPosicoes = allPositions(inst).length

  const baixar = () => {
    const blob = new Blob([exportar()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'baiana-progresso.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="tela">
      <div className="tela__braco">
        <Fretboard
          inst={inst}
          zone={cfg.zone}
          orientation={orientation}
          lowFirst={cfg.lowFirst}
          marks={marks}
          nameOptions={nameOpts}
          onSelect={(pos) => {
            pluck(midiAt(inst, pos))
            const s = stats[posKey(pos)]
            setAviso(
              s
                ? `${noteName(midiAt(inst, pos), nameOpts)}: ${s.correct}/${s.seen} · ${(s.avgMs / 1000).toFixed(1)} s`
                : `${noteName(midiAt(inst, pos), nameOpts)}: ainda não caiu no treino`,
            )
          }}
        />
      </div>

      <div className="tela__painel">
        <p className="linha-nota">{aviso || 'Toque uma casa para ver o histórico dela.'}</p>
        <Painel titulo="Progresso">
          <p className="placar placar--linha">
            <span>
              <strong>
                {total.vistas}/{totalPosicoes}
              </strong>
              posições já vistas
            </span>
            <span>
              <strong>{dominadas}</strong>
              firmes
            </span>
            <span>
              <strong>{vencidas}</strong>
              pedindo revisão
            </span>
            <span>
              <strong>{total.respostas ? Math.round((total.acertos / total.respostas) * 100) : 0}%</strong>
              de acerto
            </span>
          </p>
          <JanelaDeCasas zona={cfg.zone} frets={inst.frets} onChange={(zone) => set({ zone })} />
          <p className="dica">
            O progresso é por afinação: mudar a afinação começa um mapa novo, porque a mesma casa passa a ser outra
            nota.
          </p>
          <div className="botoes">
            <button type="button" className="botao" onClick={baixar}>
              exportar
            </button>
            <button type="button" className="botao" onClick={() => arquivo.current?.click()}>
              importar
            </button>
            <button
              type="button"
              className="botao botao--perigo"
              onClick={() => {
                if (confirm('Apagar o progresso desta afinação?')) limpar()
              }}
            >
              apagar
            </button>
          </div>
          <input
            ref={arquivo}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              setAviso(importar(await f.text()) ? 'progresso importado' : 'arquivo não reconhecido')
              e.target.value = ''
            }}
          />
        </Painel>
      </div>
    </div>
  )
}
