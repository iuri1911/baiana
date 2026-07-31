// O que voce ja sabe, posicao por posicao.
//
// Fica separado por afinacao: a mesma corda×casa vira outra nota quando a
// afinacao muda, e misturar as duas historias estragaria o sorteio.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { posKey, type Position } from '../core/fretboard'
import { updateStat, type Stats } from '../core/scheduler'
import type { Instrument } from '../core/tuning'
import { useSettings } from './settings'

const CHAVE = 'baiana.progresso.v1'

type Guardado = Record<string, Stats>

export function assinatura(inst: Instrument): string {
  return inst.strings.join(',')
}

function carregar(): Guardado {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? '{}') as Guardado
  } catch {
    return {}
  }
}

interface Ctx {
  stats: Stats
  registrar: (pos: Position, acertou: boolean, ms: number) => void
  limpar: () => void
  exportar: () => string
  importar: (json: string) => boolean
  total: { vistas: number; respostas: number; acertos: number }
}

const ProgressCtx = createContext<Ctx | null>(null)

export function ProgressProvider({ children }: { children: ReactNode }) {
  const { inst } = useSettings()
  const sig = assinatura(inst)
  const [tudo, setTudo] = useState<Guardado>(carregar)

  useEffect(() => {
    localStorage.setItem(CHAVE, JSON.stringify(tudo))
  }, [tudo])

  const stats = useMemo(() => tudo[sig] ?? {}, [tudo, sig])

  const registrar = useCallback(
    (pos: Position, acertou: boolean, ms: number) => {
      const agora = Date.now()
      setTudo((prev) => {
        const atual = prev[sig] ?? {}
        return {
          ...prev,
          [sig]: { ...atual, [posKey(pos)]: updateStat(atual[posKey(pos)], acertou, ms, agora) },
        }
      })
    },
    [sig],
  )

  const valor = useMemo<Ctx>(() => {
    const vistas = Object.keys(stats).length
    let respostas = 0
    let acertos = 0
    for (const s of Object.values(stats)) {
      respostas += s.seen
      acertos += s.correct
    }
    return {
      stats,
      registrar,
      limpar: () => setTudo((prev) => ({ ...prev, [sig]: {} })),
      exportar: () => JSON.stringify(tudo, null, 2),
      importar: (json: string) => {
        try {
          const dados = JSON.parse(json) as Guardado
          if (typeof dados !== 'object' || dados === null) return false
          setTudo(dados)
          return true
        } catch {
          return false
        }
      },
      total: { vistas, respostas, acertos },
    }
  }, [stats, registrar, sig, tudo])

  return <ProgressCtx.Provider value={valor}>{children}</ProgressCtx.Provider>
}

export function useProgress(): Ctx {
  const ctx = useContext(ProgressCtx)
  if (!ctx) throw new Error('useProgress fora do ProgressProvider')
  return ctx
}
