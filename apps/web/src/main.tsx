import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { preloadApps } from './apps/registry'
import { watchGlobalErrors } from './devtools/report'
import { startEventSources } from './events/sources'
import { ConnectProvider } from './connect/ConnectContext'
import { ErrorBoundary } from './devtools/ErrorBoundary'
import { openCaptureFromUrl } from './capture/open'
import { openJoinFromUrl } from './teams/joinLink'
import { openFriendFromUrl } from './friends/friends'
import { isDesktopApp } from './platform/desktop'
import { CHECK_EVERY_MS, connectServiceWorker, updateReady } from './shell/swUpdate'
import { startProfileClock } from './profiles/store'
import { SyncProvider } from './sync/SyncContext'
import { ThemeProvider } from './theme/ThemeContext'
import './index.css'

// The Windows app ships its files with it; the offline service worker is only for the browser.
// A new version waits until you choose "Bijwerken" in the popup, so nothing reloads under your hands.
if (!isDesktopApp) {
  connectServiceWorker(
    registerSW({
      immediate: true,
      onNeedRefresh: updateReady,
      onRegisteredSW: (_url, registration) => {
        if (registration) setInterval(() => void registration.update(), CHECK_EVERY_MS)
      },
    }),
  )
}
// School Mode and the other profiles follow their schedule while NEXUS runs.
startProfileClock()

watchGlobalErrors()
startEventSources()

// Snelle notitie from the phone's app shortcut or share sheet.
openCaptureFromUrl()
// An invitation link (/join/<code>) opens Teams with the code filled in.
openJoinFromUrl()
// A friend link (/vriend/<code>) opens Vrienden with the code filled in.
openFriendFromUrl()
// Back from logging in to Spotify (/spotify?code=…): finish the link and show Instellingen.
if (window.location.pathname === '/spotify') {
  void Promise.all([import('./spotify/spotify'), import('./shell/openApp')]).then(([{ finishSpotifyLogin }, { openApp }]) =>
    finishSpotifyLogin().then(() => {
      let tries = 40
      const open = () => {
        if (!openApp('settings') && --tries > 0) setTimeout(open, 250)
      }
      open()
    }),
  )
}

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

// Syncing, reminders and notices start right after the first screen; they are not needed to draw it.
const startBackground = () => void import('./background')
if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(startBackground, { timeout: 1500 })
else setTimeout(startBackground, 200)

// Once NEXUS has started, fetch the apps' code in the background so opening one is instant.
window.setTimeout(() => void preloadApps(), 4000)
