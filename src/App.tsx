import { useEffect, useState } from 'react'
import { FreeBoard } from './features/FreeBoard'
import { Drill } from './features/drill/Drill'
import { ShapesView } from './features/ShapesView'
import { ProgressView } from './features/ProgressView'
import { SettingsView } from './features/SettingsView'
import { Calibration } from './features/Calibration'
import { unlockAudio } from './audio/engine'
import { useSettings } from './store/settings'

type Aba = 'braco' | 'treino' | 'formas' | 'progresso' | 'ajustes'

const ABAS: { id: Aba; rotulo: string; icone: string }[] = [
  { id: 'braco', rotulo: 'Braço', icone: '𝄞' },
  { id: 'treino', rotulo: 'Treino', icone: '◎' },
  { id: 'formas', rotulo: 'Formas', icone: '⋰' },
  { id: 'progresso', rotulo: 'Mapa', icone: '▦' },
  { id: 'ajustes', rotulo: 'Ajustes', icone: '⚙' },
]

export default function App() {
  const { cfg } = useSettings()
  const [aba, setAba] = useState<Aba>('braco')

  // o navegador so libera audio depois de um gesto do usuario; o primeiro serve
  useEffect(() => {
    const soltar = () => unlockAudio()
    window.addEventListener('pointerdown', soltar, { once: true })
    return () => window.removeEventListener('pointerdown', soltar)
  }, [])

  if (!cfg.calibrado) return <Calibration onPronto={() => setAba('braco')} />

  return (
    <div className="app">
      <main className="app__corpo">
        {aba === 'braco' && <FreeBoard />}
        {aba === 'treino' && <Drill />}
        {aba === 'formas' && <ShapesView />}
        {aba === 'progresso' && <ProgressView />}
        {aba === 'ajustes' && <SettingsView />}
      </main>

      <nav className="navegacao">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`navegacao__item ${aba === a.id ? 'is-ativo' : ''}`}
            onClick={() => setAba(a.id)}
          >
            <span className="navegacao__icone" aria-hidden>
              {a.icone}
            </span>
            {a.rotulo}
          </button>
        ))}
      </nav>
    </div>
  )
}
