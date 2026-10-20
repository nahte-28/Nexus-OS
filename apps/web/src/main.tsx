import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { ConnectProvider, defaultEngine } from './connect/ConnectContext'
import { ErrorBoundary } from './devtools/ErrorBoundary'
import { startFlowRunner } from './flows/runner'
import { isDesktopApp } from './platform/desktop'
import { startCalendarSync } from './profiles/calendar'
import { startProfileClock } from './profiles/store'
import { startProfilesSync } from './profiles/sync'
import { reminderDelivery } from './reminders/deliver'
import { startReminderScheduler } from './reminders/store'
import { startUpdateChecks } from './platform/update'
import { SyncProvider } from './sync/SyncContext'
import { supabase } from './sync/supabase'
import { ThemeProvider } from './theme/ThemeContext'
import './index.css'

// The Windows app ships its files with it; the offline service worker is only for the browser.
if (!isDesktopApp) registerSW({ immediate: true })

// Automations run as long as NEXUS is open somewhere on this device.
startReminderScheduler(reminderDelivery(defaultEngine))
// Flow Studio's automations, under the same rule: only while NEXUS is open on this device.
startFlowRunner(defaultEngine)
// The Windows app looks for a newer version itself; the browser version updates through its service worker.
startUpdateChecks()
// School Mode and the other profiles follow their schedule while NEXUS runs.
startProfileClock()
startCalendarSync()
// With an account, profiles and the calendar link follow you to every device.
startProfilesSync(supabase)

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
