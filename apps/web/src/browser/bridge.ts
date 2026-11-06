/**
 * The NEXUS Browser of the Windows app (apps/desktop/src-tauri/src/browser.rs): opening sites,
 * the tabs, and bookmarks saved from its toolbar. Only does something inside the Windows app.
 */
import { saveBookmark } from '@nexus/core'
import { logEvent } from '../devtools/log'
import { isDesktopApp } from '../platform/desktop'
import { profilesStore } from '../profiles/store'

export interface BrowserTab {
  id: number
  url: string
  title: string
  loading: boolean
}

export interface BrowserTabs {
  tabs: BrowserTab[]
  active: number | null
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

/** Opens [url] in a new tab of the NEXUS Browser window. */
export async function openInNexusBrowser(url: string): Promise<void> {
  try {
    await invoke('browser_open', { url })
  } catch (err) {
    logEvent('system', `Browser openen mislukt: ${String(err)}`, true)
  }
}

export const browserCommands = {
  tabs: () => invoke<BrowserTabs>('browser_tabs'),
  open: (url: string) => invoke<number>('browser_open', { url }),
  select: (id: number) => invoke<void>('browser_select', { id }),
  close: (id: number) => invoke<void>('browser_close_tab', { id }),
  navigate: (url: string) => invoke<void>('browser_navigate', { url }),
  go: (action: 'back' | 'forward' | 'reload') => invoke<void>('browser_go', { action }),
  bookmark: (url: string, title: string) => invoke<void>('browser_bookmark', { url, title }),
}

/** In the main window: saves the bookmarks the toolbar sends, so they sync with the account. */
export function startBrowserBookmarks(): () => void {
  if (!isDesktopApp) return () => {}
  let stop: (() => void) | null = null
  let stopped = false
  void import('@tauri-apps/api/event').then(({ listen }) =>
    listen<{ url: string; title: string }>('browser-bookmark', (e) => {
      const { state } = profilesStore.getSnapshot()
      const next = saveBookmark(state.browser, { id: crypto.randomUUID(), title: e.payload.title, url: e.payload.url }, Date.now())
      if ('error' in next) return logEvent('system', `Bladwijzer niet bewaard: ${next.error}`)
      profilesStore.update((s) => ({ ...s, browser: next }))
    }).then((off) => {
      if (stopped) off()
      else stop = off
    }),
  )
  return () => {
    stopped = true
    stop?.()
  }
}
