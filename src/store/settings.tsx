// Configuracao do app, no localStorage. Inclui a afinacao efetiva: e o unico
// lugar de onde sai o `Instrument` que todas as telas usam.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Accidental, NoteLang } from '../core/music'
import { DEFAULT_INSTRUMENT, PRESETS, type Instrument } from '../core/tuning'
import type { Zone } from '../core/fretboard'
import type { Orientation } from '../components/geometry'

export interface Settings {
  presetId: string
  strings: number[]
  frets: number
  markers: number[]
  lang: NoteLang
  accidental: Accidental
  /** Corda grave em cima (horizontal) / à esquerda (vertical). */
  lowFirst: boolean
  orientation: 'auto' | Orientation
  zone: Zone
  som: boolean
  /** Ja passou pela conferencia de oitava. */
  calibrado: boolean
}

const CHAVE = 'baiana.config.v1'

export const PADRAO: Settings = {
  presetId: DEFAULT_INSTRUMENT.id,
  strings: [...DEFAULT_INSTRUMENT.strings],
  frets: DEFAULT_INSTRUMENT.frets,
  markers: [...DEFAULT_INSTRUMENT.markers],
  lang: 'pt',
  accidental: 'sharp',
  lowFirst: true,
  orientation: 'auto',
  zone: { from: 0, to: 7 },
  som: true,
  calibrado: false,
}

function carregar(): Settings {
  try {
    const cru = localStorage.getItem(CHAVE)
    if (!cru) return PADRAO
    const salvo = JSON.parse(cru) as Partial<Settings>
    return { ...PADRAO, ...salvo, zone: { ...PADRAO.zone, ...salvo.zone } }
  } catch {
    return PADRAO
  }
}

interface Ctx {
  cfg: Settings
  set: (patch: Partial<Settings>) => void
  reset: () => void
  inst: Instrument
  /** Nomear nota do jeito que o usuario escolheu. */
  nameOpts: { lang: NoteLang; accidental: Accidental }
}

const SettingsCtx = createContext<Ctx | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [cfg, setCfg] = useState<Settings>(carregar)

  useEffect(() => {
    localStorage.setItem(CHAVE, JSON.stringify(cfg))
  }, [cfg])

  const valor = useMemo<Ctx>(() => {
    const preset = PRESETS.find((p) => p.id === cfg.presetId) ?? DEFAULT_INSTRUMENT
    const inst: Instrument = {
      id: cfg.presetId,
      name: preset.name,
      strings: cfg.strings,
      frets: cfg.frets,
      markers: cfg.markers,
    }
    return {
      cfg,
      inst,
      nameOpts: { lang: cfg.lang, accidental: cfg.accidental },
      set: (patch) => setCfg((c) => ({ ...c, ...patch })),
      reset: () => setCfg(PADRAO),
    }
  }, [cfg])

  return <SettingsCtx.Provider value={valor}>{children}</SettingsCtx.Provider>
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsCtx)
  if (!ctx) throw new Error('useSettings fora do SettingsProvider')
  return ctx
}

/** Troca de preset traz junto trastes e marcadores dele. */
export function aplicarPreset(id: string): Partial<Settings> {
  const preset = PRESETS.find((p) => p.id === id) ?? DEFAULT_INSTRUMENT
  return {
    presetId: preset.id,
    strings: [...preset.strings],
    frets: preset.frets,
    markers: [...preset.markers],
  }
}

export function useOrientation(): Orientation {
  const { cfg } = useSettings()
  const [auto, setAuto] = useState<Orientation>(() =>
    typeof window !== 'undefined' && window.innerWidth > window.innerHeight * 1.15 ? 'horizontal' : 'vertical',
  )
  useEffect(() => {
    const ler = () => setAuto(window.innerWidth > window.innerHeight * 1.15 ? 'horizontal' : 'vertical')
    window.addEventListener('resize', ler)
    ler()
    return () => window.removeEventListener('resize', ler)
  }, [])
  return cfg.orientation === 'auto' ? auto : cfg.orientation
}
