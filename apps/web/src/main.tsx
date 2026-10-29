import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { preloadApps } from './apps/registry'
import { watchGlobalErrors } from './devtools/report'
import { startEventSources } from './events/sources'
import { ConnectProvider, defaultEngine } from './connect/ConnectContext'
import { ErrorBoundary } from './devtools/ErrorBoundary'
import { startFlowRunner } from './flows/runner'
import { startFlowsSync } from './flows/sync'
import { startFilesSync } from './files/sync'
import { startFocusTicker } from './study/timer'
import { startDeadlineAlerts } from './life/alerts'
import { startDagstart } from './life/dagstart'
import { startGradesSync } from './grades/store'
import { startHabitAlerts } from './habits/alerts'
import { startWeekReview } from './review/week'
import { openCaptureFromUrl } from './capture/open'
import { startHabitsSync } from './habits/store'
import { startFlashcardsSync } from './flashcards/store'
import { startExamsSync } from './study/exams'
import { startGroupSync } from './study/group'
import { startJournalSync } from './journal/store'
import { startSpacesSync } from './spaces/store'
import { startInboxSync } from './inbox/store'
import { startTimeMachine } from './timemachine/store'
import { isFeatureOn, onFeaturesChange } from './features/store'
import { startFinanceAlerts, startFinanceSync } from './finance/store'
import { startLifeSync } from './life/sync'
import { isDesktopApp } from './platform/desktop'
import { startCalendarSync } from './profiles/calendar'
import { startProfileClock } from './profiles/store'
import { startProfilesSync } from './profiles/sync'
import { reminderDelivery } from './reminders/deliver'
import { startWebPush } from './push/subscribe'
import { startSafetyNet } from './safety/plan'
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
// The phone gets the notifications of the coming days ahead, so it can show them itself when the pc is off.
startSafetyNet(defaultEngine)
// A phone with NEXUS in Chrome and push on keeps the server's push address up to date.
startWebPush(defaultEngine)
// The Windows app looks for a newer version itself; the browser version updates through its service worker.
startUpdateChecks()
// School Mode and the other profiles follow their schedule while NEXUS runs.
startProfileClock()
startCalendarSync()
// With an account, profiles and the calendar link follow you to every device.
startProfilesSync(supabase)
// Flows, their settings and run history too; each event still runs on one device only.
startFlowsSync(supabase)
// NEXUS Life: deadlines and projects, on every device, with notifications before a deadline.
startLifeSync(supabase)
startDeadlineAlerts(defaultEngine)
// Dagstart: every morning the day ahead, on this device and (through the plan above) the phone.
startDagstart(defaultEngine)
// Cijfers: your marks per course, on every device with an account.
startGradesSync(supabase)
// Gewoontes: ticked off on every device, with a reminder when one is still open.
startHabitsSync(supabase)
startFlashcardsSync(supabase)
startExamsSync(supabase)
startGroupSync(supabase)
startJournalSync(supabase)
startSpacesSync(supabase, () => isFeatureOn('spaces'), onFeaturesChange)
startInboxSync(supabase, () => isFeatureOn('inbox'), onFeaturesChange)
// Time Machine: restore points of profiles, flows and Spaces, on this device.
startTimeMachine(() => isFeatureOn('timeMachine'), onFeaturesChange)
startFinanceSync(supabase)
// Financiën: budget notices at their threshold and 100%, and subscription reminders, here and on the phone.
startFinanceAlerts(defaultEngine)
startHabitAlerts(defaultEngine)
// Weekoverzicht: on Sunday evening NEXUS AI reviews the week and plans the next one.
startWeekReview(defaultEngine)
// Bestanden: your own files, also in your private storage when signed in.
startFilesSync(supabase)
// The focus timer's notifications, also with the Studie window closed.
startFocusTicker(defaultEngine)

watchGlobalErrors()
startEventSources()

// Snelle notitie from the phone's app shortcut or share sheet.
openCaptureFromUrl()

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

// Once NEXUS has started, fetch the apps' code in the background so opening one is instant.
window.setTimeout(() => void preloadApps(), 4000)
