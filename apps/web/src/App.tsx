import { Desktop } from './desktop/Desktop'
import { MobileShell } from './mobile/MobileShell'
import { useMediaQuery } from './state/useMediaQuery'
import { WindowsProvider } from './state/WindowsContext'

/** Below 768px we switch from movable windows to full-screen mobile apps. */
export const MOBILE_QUERY = '(max-width: 767px)'

export function App() {
  const isMobile = useMediaQuery(MOBILE_QUERY)
  return isMobile ? (
    <MobileShell />
  ) : (
    <WindowsProvider>
      <Desktop />
    </WindowsProvider>
  )
}
