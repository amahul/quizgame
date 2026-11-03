import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { playPassSound } from '../../audio'
import type { Player } from '../../game/lobby'
import { strings } from '../../i18n'
import { AvatarBadge } from '../../ui/AvatarBadge'

export const PASS_ANIMATION_MS = 2_600

/** The dramatic moment: an arrow flies from the sender to the receiver. */
export function PassAnimation({ from, to }: { from: Player; to: Player }) {
  useEffect(() => {
    const timer = setTimeout(playPassSound, 300)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="flex w-full flex-col items-center gap-16">
      <div className="relative flex w-full max-w-6xl items-center justify-between">
        <motion.div
          className="flex flex-col items-center gap-4"
          initial={{ x: -200, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: 'spring', bounce: 0.4 }}
        >
          <AvatarBadge avatar={from.avatar} size={220} />
          <span className="text-5xl font-black">{from.name}</span>
        </motion.div>

        <motion.svg
          viewBox="0 0 120 40"
          aria-hidden
          className="absolute top-[90px] h-24 w-60 drop-shadow-[0_0_25px_rgba(250,204,21,0.8)]"
          initial={{ left: '12%', opacity: 0, scale: 0.4 }}
          animate={{ left: ['12%', '30%', '62%'], opacity: [0, 1, 1], scale: [0.4, 1.2, 1] }}
          transition={{ duration: 1.1, delay: 0.3, ease: 'easeIn', times: [0, 0.3, 1] }}
        >
          <path d="M0 14 H85 V2 L120 20 L85 38 V26 H0 Z" fill="#facc15" />
        </motion.svg>

        <motion.div
          className="flex flex-col items-center gap-4"
          initial={{ x: 200, opacity: 0 }}
          animate={{ x: 0, opacity: 1, scale: [1, 1, 1.3, 1], rotate: [0, 0, -8, 0] }}
          // Visible right away (so the arrow has a target); the pop comes when the arrow lands.
          transition={{ x: { type: 'spring', bounce: 0.4 }, opacity: { duration: 0.3 }, default: { duration: 0.6, delay: 1.3 } }}
        >
          <AvatarBadge avatar={to.avatar} size={220} />
          <span className="text-5xl font-black">{to.name}</span>
        </motion.div>
      </div>

      <motion.p
        className="text-8xl font-black text-yellow-300 drop-shadow-lg"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.6, delay: 1.4 }}
      >
        {strings.pass.sentTo(to.name)}
      </motion.p>
    </div>
  )
}
