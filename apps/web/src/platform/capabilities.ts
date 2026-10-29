import type { Capabilities } from '@nexus/core'
import { isDesktopApp } from './desktop'

/** What this device can do, detected once (capability registry, blueprint fase 0). */
export function detectCapabilities(): Capabilities {
  const w = typeof window === 'undefined' ? undefined : window
  const nav = typeof navigator === 'undefined' ? undefined : navigator
  return {
    notifications: isDesktopApp || (!!w && 'Notification' in w),
    webPush: !isDesktopApp && !!w && 'PushManager' in w && !!nav && 'serviceWorker' in nav,
    folderAccess: !!w && 'showDirectoryPicker' in w,
    speech: !isDesktopApp && !!w && ('SpeechRecognition' in w || 'webkitSpeechRecognition' in w),
    clipboardWrite: !!nav?.clipboard?.writeText,
    clipboardRead: !!nav?.clipboard?.readText,
    native: isDesktopApp,
    connect: !!w?.crypto?.subtle && !!w && 'indexedDB' in w,
    // The Windows app's content policy also applies inside a srcdoc frame and blocks its scripts.
    sandbox: !isDesktopApp && typeof HTMLIFrameElement !== 'undefined' && 'srcdoc' in HTMLIFrameElement.prototype && 'sandbox' in HTMLIFrameElement.prototype,
  }
}

export const capabilities: Capabilities = detectCapabilities()
