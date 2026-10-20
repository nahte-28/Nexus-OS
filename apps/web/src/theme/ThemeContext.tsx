import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react'
import type { ThemeId } from '@nexus/core'
import { profilesStore, useProfiles } from '../profiles/store'
import { writeStorage } from '../state/storage'
import { applyAccent } from './accents'

const STORAGE_KEY = 'nexus.theme'
const THEME_COLORS: Record<ThemeId, string> = { focus: '#eef1f5', pulse: '#0b1020' }

interface ThemeContextValue {
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Each profile has its own theme; picking one changes the active profile's.
  const { active } = useProfiles()
  const theme = active.theme
  const setTheme = useCallback((next: ThemeId) => profilesStore.updateProfile(profilesStore.getSnapshot().active.id, { theme: next }), [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
    writeStorage(STORAGE_KEY, theme)
  }, [theme])
  useEffect(() => {
    applyAccent(active.accent, theme)
  }, [active.accent, theme])

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
