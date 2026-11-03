import { useCallback, useSyncExternalStore } from 'react'

const subscribe = (fn: () => void) => {
  document.addEventListener('fullscreenchange', fn)
  return () => document.removeEventListener('fullscreenchange', fn)
}

/** Whether the page is fullscreen, and a toggle (no-op where unsupported). */
export function useFullscreen(): [boolean, () => void] {
  const isFullscreen = useSyncExternalStore(subscribe, () => document.fullscreenElement !== null)
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void document.documentElement.requestFullscreen?.().catch(() => {})
  }, [])
  return [isFullscreen, toggle]
}
