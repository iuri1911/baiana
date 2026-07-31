// Pecinhas de interface reaproveitadas pelas telas.

import type { ReactNode } from 'react'
import type { Zone } from '../core/fretboard'

export interface Opcao<T> {
  valor: T
  rotulo: ReactNode
  dica?: string
}

export function Segmentado<T extends string | number>({
  valor,
  opcoes,
  onChange,
  titulo,
}: {
  valor: T
  opcoes: Opcao<T>[]
  onChange: (v: T) => void
  titulo?: string
}) {
  return (
    <div className="campo">
      {titulo && <span className="campo__titulo">{titulo}</span>}
      <div className="segmentado" role="group" aria-label={titulo}>
        {opcoes.map((o) => (
          <button
            key={String(o.valor)}
            type="button"
            title={o.dica}
            className={`segmentado__item ${o.valor === valor ? 'is-ativo' : ''}`}
            onClick={() => onChange(o.valor)}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Alternar({
  valor,
  onChange,
  titulo,
  dica,
}: {
  valor: boolean
  onChange: (v: boolean) => void
  titulo: string
  dica?: string
}) {
  return (
    <label className="alternar">
      <span>
        <strong>{titulo}</strong>
        {dica && <small>{dica}</small>}
      </span>
      <input type="checkbox" checked={valor} onChange={(e) => onChange(e.target.checked)} />
      <span className="alternar__trilho" aria-hidden />
    </label>
  )
}

const ZONAS: { rotulo: string; zona: Zone }[] = [
  { rotulo: '0–4', zona: { from: 0, to: 4 } },
  { rotulo: '0–7', zona: { from: 0, to: 7 } },
  { rotulo: '0–12', zona: { from: 0, to: 12 } },
  { rotulo: '5–12', zona: { from: 5, to: 12 } },
  { rotulo: '12–19', zona: { from: 12, to: 19 } },
]

export function JanelaDeCasas({
  zona,
  frets,
  onChange,
}: {
  zona: Zone
  frets: number
  onChange: (z: Zone) => void
}) {
  const ajustar = (patch: Partial<Zone>) => {
    const z = { ...zona, ...patch }
    if (z.to < z.from) {
      if (patch.from !== undefined) z.to = z.from
      else z.from = z.to
    }
    onChange({ from: Math.max(0, z.from), to: Math.min(frets, z.to) })
  }

  return (
    <div className="campo">
      <span className="campo__titulo">
        Casas <em>{zona.from}–{zona.to}</em>
      </span>
      <div className="segmentado">
        {ZONAS.filter((z) => z.zona.to <= frets).map((z) => (
          <button
            key={z.rotulo}
            type="button"
            className={`segmentado__item ${zona.from === z.zona.from && zona.to === z.zona.to ? 'is-ativo' : ''}`}
            onClick={() => onChange(z.zona)}
          >
            {z.rotulo}
          </button>
        ))}
        <button
          type="button"
          className={`segmentado__item ${zona.from === 0 && zona.to === frets ? 'is-ativo' : ''}`}
          onClick={() => onChange({ from: 0, to: frets })}
        >
          tudo
        </button>
      </div>
      <div className="deslizantes">
        <label>
          <small>da casa</small>
          <input
            type="range"
            min={0}
            max={frets}
            value={zona.from}
            onChange={(e) => ajustar({ from: Number(e.target.value) })}
          />
        </label>
        <label>
          <small>até a casa</small>
          <input
            type="range"
            min={0}
            max={frets}
            value={zona.to}
            onChange={(e) => ajustar({ to: Number(e.target.value) })}
          />
        </label>
      </div>
    </div>
  )
}

export function CordasAtivas({
  nomes,
  ativas,
  onChange,
}: {
  nomes: string[]
  ativas: number[]
  onChange: (v: number[]) => void
}) {
  const virar = (i: number) => {
    const nova = ativas.includes(i) ? ativas.filter((x) => x !== i) : [...ativas, i].sort()
    if (nova.length > 0) onChange(nova)
  }
  return (
    <div className="campo">
      <span className="campo__titulo">Cordas</span>
      <div className="segmentado">
        {nomes.map((n, i) => (
          <button
            key={i}
            type="button"
            className={`segmentado__item ${ativas.includes(i) ? 'is-ativo' : ''}`}
            onClick={() => virar(i)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Painel({ children, titulo }: { children: ReactNode; titulo?: string }) {
  return (
    <section className="painel">
      {titulo && <h2 className="painel__titulo">{titulo}</h2>}
      {children}
    </section>
  )
}
