import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { OvertimePromptProvider } from './components/OvertimePromptProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OvertimePromptProvider>
      <App />
    </OvertimePromptProvider>
  </StrictMode>,
)
