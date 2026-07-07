import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/electron/renderer'
import './index.css'
import App from './App.tsx'
import { OvertimePromptProvider } from './components/OvertimePromptProvider.tsx'

Sentry.init()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OvertimePromptProvider>
      <App />
    </OvertimePromptProvider>
  </StrictMode>,
)
