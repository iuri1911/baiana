// Escalas e arpejos no braco, com grau em cada nota.

import { useMemo, useState } from 'react'
import { Fretboard, type FretMark } from '../components/Fretboard'
import { JanelaDeCasas, Painel, Segmentado } from '../components/ui'
import { ARPEGGIOS, SCALES, shapePositions, shapeSequence } from '../core/shapes'
import { pitchClassName } from '../core/music'
import { isRegular, stringStep } from '../core/tuning'
import { pluckSequence, stopAll, strum } from '../audio/engine'
import { useOrientation, useSettings } from '../store/settings'

type Rotulo = 'grau' | 'nome'

export function ShapesView() {
  const { cfg, set, inst, nameOpts } = useSettings()
  const orientation = useOrientation()
  const [tonica, setTonica] = useState(0)
  const [formaId, setFormaId] = useState('maj')
  const [rotulo, setRotulo] = useState<Rotulo>('grau')
  const [bpm, setBpm] = useState(100)

  const forma = [...ARPEGGIOS, ...SCALES].find((f) => f.id === formaId)!
  const notas = useMemo(
    () => shapePositions(inst, tonica, forma, { zone: cfg.zone }),
    [cfg.zone, forma, inst, tonica],
  )
  const sequencia = useMemo(() => shapeSequence(notas), [notas])

  const marks: FretMark[] = notas.map((n) => ({
    pos: n.pos,
    label: rotulo === 'grau' ? n.degree : pitchClassName(n.midi, nameOpts),
    variant: n.isRoot ? 'tonica' : 'nota',
  }))

  const tocar = (reverso = false) => {
    stopAll()
    const midis = sequencia.map((n) => n.midi)
    pluckSequence(reverso ? [...midis].reverse() : midis, bpm)
  }

  const passo = stringStep(inst)

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
            const n = notas.find((x) => x.pos.string === pos.string && x.pos.fret === pos.fret)
            if (n) strum([n.midi])
          }}
        />
      </div>

      <div className="tela__painel">
        <div className="tocador">
          <button type="button" className="botao botao--principal" onClick={() => tocar(false)}>
            ▶ tocar
          </button>
          <button type="button" className="botao" onClick={() => tocar(true)}>
            ◀ descendo
          </button>
          <button type="button" className="botao" onClick={() => strum(sequencia.slice(0, 5).map((n) => n.midi))}>
            acorde
          </button>
          <label className="bpm">
            <small>{bpm} bpm</small>
            <input type="range" min={40} max={200} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} />
          </label>
        </div>

        <Painel>
          <div className="campo">
            <span className="campo__titulo">Tônica</span>
            <div className="segmentado segmentado--grade">
              {Array.from({ length: 12 }, (_, pc) => (
                <button
                  key={pc}
                  type="button"
                  className={`segmentado__item ${pc === tonica ? 'is-ativo' : ''}`}
                  onClick={() => setTonica(pc)}
                >
                  {pitchClassName(pc, nameOpts)}
                </button>
              ))}
            </div>
          </div>

          <label className="campo">
            <span className="campo__titulo">Forma</span>
            <select className="seletor" value={formaId} onChange={(e) => setFormaId(e.target.value)}>
              <optgroup label="Arpejos">
                {ARPEGGIOS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Escalas">
                {SCALES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <Segmentado
            titulo="Escrever nas notas"
            valor={rotulo}
            opcoes={[
              { valor: 'grau', rotulo: 'grau' },
              { valor: 'nome', rotulo: 'nome' },
            ]}
            onChange={setRotulo}
          />

          <JanelaDeCasas zona={cfg.zone} frets={inst.frets} onChange={(zone) => set({ zone })} />

          {isRegular(inst) && passo === 7 && (
            <p className="dica dica--destaque">
              Afinação em quintas: a forma que você decorar entre duas cordas vale igual em qualquer par de cordas
              vizinhas. Uma digitação, o braço inteiro.
            </p>
          )}
        </Painel>
      </div>
    </div>
  )
}
