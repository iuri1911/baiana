// Braço livre: tocar para ouvir, ver o nome, e ver onde mais aquela nota mora.

import { useState } from 'react'
import { Fretboard, type FretMark } from '../components/Fretboard'
import { Alternar, JanelaDeCasas, Painel } from '../components/ui'
import { midiAt, posKey, positionsOfPitchClass, type Position } from '../core/fretboard'
import { noteName, pitchClass } from '../core/music'
import { pluck, pluckSequence } from '../audio/engine'
import { useOrientation, useSettings } from '../store/settings'

export function FreeBoard() {
  const { cfg, set, inst, nameOpts } = useSettings()
  const orientation = useOrientation()
  const [sel, setSel] = useState<Position | null>(null)
  const [nomes, setNomes] = useState(false)
  const [irmas, setIrmas] = useState(true)

  const tocar = (pos: Position) => {
    setSel(pos)
    if (cfg.som) pluck(midiAt(inst, pos))
  }

  const marks: FretMark[] = []
  if (sel) {
    const midi = midiAt(inst, sel)
    if (irmas) {
      for (const p of positionsOfPitchClass(inst, pitchClass(midi), { zone: cfg.zone })) {
        if (posKey(p) === posKey(sel)) continue
        marks.push({ pos: p, label: noteName(midiAt(inst, p), nameOpts), variant: 'fantasma' })
      }
    }
    marks.push({ pos: sel, label: noteName(midi, nameOpts), variant: 'alvo' })
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
          showAllNotes={nomes}
          nameOptions={nameOpts}
          onSelect={tocar}
        />
      </div>

      <div className="tela__painel">
        <p className="linha-nota">
          {sel ? (
            <>
              <strong>{noteName(midiAt(inst, sel), { ...nameOpts, octave: true })}</strong>
              <span>
                corda {inst.strings.length - sel.string}ª ({noteName(inst.strings[sel.string], nameOpts)}), casa{' '}
                {sel.fret}
              </span>
            </>
          ) : (
            <span>Toque o braço para ouvir a nota.</span>
          )}
        </p>

        <Painel>
          <JanelaDeCasas zona={cfg.zone} frets={inst.frets} onChange={(zone) => set({ zone })} />
          <Alternar titulo="Nome de todas as notas" valor={nomes} onChange={setNomes} />
          <Alternar
            titulo="Mostrar a mesma nota no resto do braço"
            dica="a nota que você tocou aparece em todas as cordas onde ela cai"
            valor={irmas}
            onChange={setIrmas}
          />
          <button
            type="button"
            className="botao"
            onClick={() => cfg.som && pluckSequence([...inst.strings], 150)}
          >
            Tocar as cordas soltas
          </button>
        </Painel>
      </div>
    </div>
  )
}
