import { useEffect } from 'react'

/**
 * Keeps the screen awake while `active` (Screen Wake Lock API, where supported).
 * Browsers drop the lock when the tab is hidden, so it's re-requested on return.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false

    const request = async () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return
      try {
        const next = await navigator.wakeLock.request('screen')
        if (cancelled) void next.release()
        else lock = next
      } catch {
        // Not allowed right now (e.g. battery saver); the game works anyway.
      }
    }

    void request()
    document.addEventListener('visibilitychange', request)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', request)
      void lock?.release().catch(() => {})
    }
  }, [active])
}
