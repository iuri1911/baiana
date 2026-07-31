// O braco. Um componente so, usado pelo visualizador, pelos exercicios e pelo
// mapa de calor — o que muda de um para o outro e o que chega em `marks` e o que
// acontece no toque.

import { useMemo, useRef } from 'react'
import type { Instrument } from '../core/tuning'
import { midiAt, posKey, type Position, type Zone } from '../core/fretboard'
import { noteName } from '../core/music'
import type { NameOptions } from '../core/music'
import { useSize } from '../hooks/useSize'
import { layout, visibleFrets, type Orientation } from './geometry'

export type MarkVariant = 'alvo' | 'certo' | 'errado' | 'tonica' | 'nota' | 'fantasma' | 'calor'

export interface FretMark {
  pos: Position
  label?: string
  variant?: MarkVariant
  /** So para o mapa de calor. */
  color?: string
  /** Anel piscando em volta, para chamar atencao sem preencher. */
  pulsa?: boolean
}

export interface FretboardProps {
  inst: Instrument
  zone: Zone
  orientation: Orientation
  lowFirst?: boolean
  marks?: FretMark[]
  /** Escreve o nome de toda nota do braco por baixo das marcas. */
  showAllNotes?: boolean
  nameOptions?: NameOptions
  onSelect?: (pos: Position) => void
  /** Cordas fora do exercicio ficam apagadas e nao respondem ao toque. */
  activeStrings?: number[]
}

const DOUBLE_MARKERS = [12, 24]

export function Fretboard({
  inst,
  zone,
  orientation,
  lowFirst = true,
  marks = [],
  showAllNotes = false,
  nameOptions,
  onSelect,
  activeStrings,
}: FretboardProps) {
  const box = useRef<HTMLDivElement>(null)
  const { width, height } = useSize(box)

  const L = useMemo(
    () => layout({ inst, zone, width, height, orientation, lowFirst }),
    [inst, zone, width, height, orientation, lowFirst],
  )
  const marcas = useMemo(() => {
    const m = new Map<string, FretMark>()
    for (const mark of marks) m.set(posKey(mark.pos), mark)
    return m
  }, [marks])

  const casas = visibleFrets(zone, inst)
  const cordas = inst.strings.map((_, i) => i)
  const ativa = (s: number) => !activeStrings || activeStrings.includes(s)
  const pronto = width > 40 && height > 40

  const raio = Math.max(9, Math.min(L.step * 0.42, 26))
  const fonte = raio * 0.86

  return (
    <div className="fretboard" ref={box}>
      {pronto && (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="fretboard__svg">
          {/* escala */}
          <rect
            {...rect(L, [L.openWidth, L.along], [0, L.across])}
            className="fb-escala"
            rx={Math.min(10, L.across * 0.03)}
          />

          {/* marcadores de casa */}
          {inst.markers
            .filter((n) => casas.includes(n))
            .map((n) => {
              const a = L.cellCenter(n)
              const r = Math.max(4, L.step * 0.17)
              const duplo = DOUBLE_MARKERS.includes(n)
              const cs = duplo
                ? [L.edge + L.step * (inst.strings.length - 1) * 0.28, L.edge + L.step * (inst.strings.length - 1) * 0.72]
                : [L.across / 2]
              return cs.map((c, i) => {
                const p = L.pt(a, c)
                return <circle key={`${n}-${i}`} cx={p.x} cy={p.y} r={r} className="fb-marcador" />
              })
            })}

          {/* fios de traste */}
          {L.frets.map((n) => {
            const a = L.cellSpan(n === 0 ? 1 : n)[n === 0 ? 0 : 1]
            const p1 = L.pt(a, 0)
            const p2 = L.pt(a, L.across)
            return <line key={n} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} className="fb-traste" />
          })}

          {/* pestana */}
          {L.openWidth > 0 && (
            <line
              {...line(L, L.openWidth, [0, L.across])}
              className="fb-pestana"
              strokeWidth={Math.max(5, L.step * 0.14)}
            />
          )}

          {/* cordas */}
          {cordas.map((s) => {
            const c = L.stringAt(s)
            const p1 = L.pt(0, c)
            const p2 = L.pt(L.along, c)
            return (
              <line
                key={s}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                className={`fb-corda ${ativa(s) ? '' : 'fb-corda--off'}`}
                strokeWidth={1.1 + (inst.strings.length - 1 - s) * 0.7}
              />
            )
          })}

          {/* nome da corda solta, fora do braco */}
          {L.openWidth > 0 &&
            cordas.map((s) => {
              const p = L.pt(L.openWidth * 0.42, L.stringAt(s))
              return (
                <text
                  key={s}
                  x={p.x}
                  y={p.y}
                  className={`fb-solta ${ativa(s) ? '' : 'fb-solta--off'}`}
                  fontSize={Math.max(9, L.step * 0.3)}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {noteName(inst.strings[s], nameOptions)}
                </text>
              )
            })}

          {/* notas */}
          {cordas.flatMap((s) =>
            casas.map((f) => {
              const pos = { string: s, fret: f }
              const mark = marcas.get(posKey(pos))
              if (!mark && !showAllNotes) return null
              if (!ativa(s)) return null
              const p = L.pt(L.cellCenter(f), L.stringAt(s))
              const texto = mark?.label ?? (showAllNotes ? noteName(midiAt(inst, pos), nameOptions) : '')
              const variante = mark?.variant ?? (mark ? 'nota' : 'fantasma')
              return (
                <g key={posKey(pos)} className={`fb-nota fb-nota--${variante}`}>
                  {mark?.pulsa && <circle cx={p.x} cy={p.y} r={raio * 1.35} className="fb-pulso" />}
                  <circle cx={p.x} cy={p.y} r={raio} fill={mark?.color} className="fb-nota__disco" />
                  {texto && (
                    <text
                      x={p.x}
                      y={p.y}
                      fontSize={texto.length > 3 ? fonte * 0.78 : fonte}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="fb-nota__texto"
                    >
                      {texto}
                    </text>
                  )}
                </g>
              )
            }),
          )}

          {/* alvos de toque, por cima de tudo */}
          {onSelect &&
            cordas.flatMap((s) =>
              casas.map((f) => {
                if (!ativa(s)) return null
                const pos = { string: s, fret: f }
                const [a1, a2] = L.cellSpan(f)
                const c = L.stringAt(s)
                const meia = L.step / 2 || L.across / 2
                return (
                  <rect
                    key={`t${s}:${f}`}
                    {...rect(L, [a1, a2], [c - meia, c + meia])}
                    className="fb-toque"
                    data-pos={posKey(pos)}
                    onPointerDown={(e) => {
                      e.preventDefault()
                      onSelect({ string: s, fret: f })
                    }}
                  />
                )
              }),
            )}
        </svg>
      )}
    </div>
  )
}

type L = ReturnType<typeof layout>

/** Retangulo definido em (ao longo do braco) x (no sentido das cordas). */
function rect(l: L, alongRange: [number, number], acrossRange: [number, number]) {
  const a = l.pt(alongRange[0], acrossRange[0])
  const b = l.pt(alongRange[1], acrossRange[1])
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  }
}

function line(l: L, along: number, acrossRange: [number, number]) {
  const a = l.pt(along, acrossRange[0])
  const b = l.pt(along, acrossRange[1])
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }
}
