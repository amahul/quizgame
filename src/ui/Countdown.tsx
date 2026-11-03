import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { strings } from '../i18n'
import { useNow } from './useNow'

/** The last seconds are shown in red. */
const HURRY_SECONDS = 5

/**
 * Seconds left on a phone. The host sends `msLeft` with each view (phone and host
 * clocks differ), and the phone counts down from when that view arrived.
 */
export function useCountdown(msLeft: number): number {
  const [endsAt, setEndsAt] = useState(() => Date.now() + msLeft)
  useEffect(() => setEndsAt(Date.now() + msLeft), [msLeft])
  const now = useNow(250)
  return Math.max(0, Math.ceil((endsAt - now) / 1000))
}

/** Big-screen countdown: seconds plus a shrinking bar. `deadline` is host time. */
export function HostCountdown({ deadline, totalMs, stopped = false }: { deadline: number; totalMs: number; stopped?: boolean }) {
  const now = useNow(200)
  const msLeft = Math.max(0, deadline - now)
  const seconds = Math.ceil(msLeft / 1000)
  const hurry = !stopped && seconds <= HURRY_SECONDS
  return (
    <div role="timer" aria-label={strings.game.timeLeft(seconds)} className="flex items-center gap-5">
      <div className="h-5 w-72 overflow-hidden rounded-full bg-white/15">
        <div
          className={`h-full rounded-full transition-[width] duration-200 ease-linear ${hurry ? 'bg-rose-500' : 'bg-yellow-300'}`}
          style={{ width: `${(msLeft / totalMs) * 100}%` }}
        />
      </div>
      <motion.span
        key={hurry ? seconds : 'calm'}
        initial={hurry ? { scale: 1.4 } : false}
        animate={{ scale: 1 }}
        className={`w-24 text-right text-5xl font-black tabular-nums ${hurry ? 'text-rose-300' : 'text-yellow-300'}`}
      >
        {strings.game.timeLeft(seconds)}
      </motion.span>
    </div>
  )
}

/** Phone countdown pill. */
export function PhoneCountdown({ msLeft }: { msLeft: number }) {
  const seconds = useCountdown(msLeft)
  const hurry = seconds <= HURRY_SECONDS
  return (
    <p
      role="timer"
      aria-label={strings.game.timeLeft(seconds)}
      className={`self-center rounded-full px-5 py-1 text-2xl font-black tabular-nums ${
        hurry ? 'bg-rose-600 text-white' : 'bg-yellow-300 text-amber-950'
      }`}
    >
      ⏱ {strings.game.timeLeft(seconds)}
    </p>
  )
}
