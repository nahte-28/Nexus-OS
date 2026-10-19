import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_THEME, isThemeId, type ThemeId } from '@nexus/core'
import { readStorage, writeStorage } from '../state/storage'

const STORAGE_KEY = 'nexus.theme'
const THEME_COLORS: Record<ThemeId, string> = { focus: '#eef1f5', pulse: '#0b1020' }

interface ThemeContextValue {
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function initialTheme(): ThemeId {
  const stored = readStorage(STORAGE_KEY)
  return isThemeId(stored) ? stored : DEFAULT_THEME
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeId>(initialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
    writeStorage(STORAGE_KEY, theme)
  }, [theme])

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
