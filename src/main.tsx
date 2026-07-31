import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { SettingsProvider } from './store/settings.tsx'
import { ProgressProvider } from './store/progress.tsx'
// mesma fonte do iuri.io, embutida: o app tem que abrir offline. Só o subset
// latino — o pacote inteiro traz cirílico, grego e vietnamita, que aqui iriam
// direto para o cache offline sem nunca desenhar um caractere.
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/jetbrains-mono/latin-700.css'
import './estilo.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <ProgressProvider>
        <App />
      </ProgressProvider>
    </SettingsProvider>
  </StrictMode>,
)
