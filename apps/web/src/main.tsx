import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { ConnectProvider } from './connect/ConnectContext'
import { isDesktopApp } from './platform/desktop'
import { SyncProvider } from './sync/SyncContext'
import { ThemeProvider } from './theme/ThemeContext'
import './index.css'

// The Windows app ships its files with it; the offline service worker is only for the browser.
if (!isDesktopApp) registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <SyncProvider>
        <ConnectProvider>
          <App />
        </ConnectProvider>
      </SyncProvider>
    </ThemeProvider>
  </StrictMode>,
)
