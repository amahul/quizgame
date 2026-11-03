import { useRef } from 'react'
import { strings } from '../i18n'
import { useHostStore } from './hostStore'

const CLICKS = 5
const WITHIN_MS = 2_000

/**
 * Hidden switch for the test mode: five quick clicks in the top right corner of any
 * host screen. Deliberately invisible and not focusable — it's a tool for the host,
 * not a feature for players. A badge shows while test mode is on.
 */
export function TestModeHotspot() {
  const testMode = useHostStore((s) => s.testMode)
  const toggle = useHostStore((s) => s.toggleTestMode)
  const clicks = useRef<number[]>([])

  const onClick = () => {
    const now = Date.now()
    clicks.current = [...clicks.current.filter((t) => now - t < WITHIN_MS), now]
    if (clicks.current.length >= CLICKS) {
      clicks.current = []
      toggle()
    }
  }

  return (
    <>
      <div aria-hidden data-testid="test-mode-hotspot" onClick={onClick} className="fixed top-0 right-0 z-[60] h-16 w-16" />
      {testMode && (
        <div
          role="status"
          title={strings.testMode.hint}
          className="pointer-events-none fixed top-3 right-20 z-[60] rounded-full bg-amber-300 px-4 py-2 text-lg font-black text-amber-950 shadow-lg"
        >
          {strings.testMode.badge} <span className="font-semibold">· {strings.testMode.hint}</span>
        </div>
      )}
    </>
  )
}
