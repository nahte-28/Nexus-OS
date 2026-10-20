import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { ConnectProvider, defaultEngine } from './connect/ConnectContext'
import { ErrorBoundary } from './devtools/ErrorBoundary'
import { isDesktopApp } from './platform/desktop'
import { startCalendarSync } from './profiles/calendar'
import { startProfileClock } from './profiles/store'
import { reminderDelivery } from './reminders/deliver'
import { startReminderScheduler } from './reminders/store'
import { startUpdateChecks } from './platform/update'
import { SyncProvider } from './sync/SyncContext'
import { ThemeProvider } from './theme/ThemeContext'
import './index.css'

// The Windows app ships its files with it; the offline service worker is only for the browser.
if (!isDesktopApp) registerSW({ immediate: true })

// Automations run as long as NEXUS is open somewhere on this device.
startReminderScheduler(reminderDelivery(defaultEngine))
// The Windows app looks for a newer version itself; the browser version updates through its service worker.
startUpdateChecks()
// School Mode and the other profiles follow their schedule while NEXUS runs.
startProfileClock()
startCalendarSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <SyncProvider>
        <ConnectProvider>
          <ErrorBoundary name="NEXUS">
            <App />
          </ErrorBoundary>
        </ConnectProvider>
      </SyncProvider>
    </ThemeProvider>
  </StrictMode>,
)
