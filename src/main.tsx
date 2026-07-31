import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { SettingsProvider } from './store/settings.tsx'
import { ProgressProvider } from './store/progress.tsx'
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
