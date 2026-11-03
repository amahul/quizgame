import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { HelpContent } from '../ui/HelpContent'
import { Overlay } from '../ui/Overlay'
import { unlockAudio } from '../audio'
import { strings } from '../i18n'
import { routeHref } from './router'

const buttons = [
  {
    href: routeHref.host,
    label: strings.landing.host,
    hint: strings.landing.hostHint,
    className: 'from-fuchsia-500 to-pink-600 shadow-pink-900/50',
  },
  {
    href: routeHref.play,
    label: strings.landing.join,
    hint: strings.landing.joinHint,
    className: 'from-amber-300 to-orange-400 text-orange-950 shadow-orange-900/50',
  },
]

export function Landing() {
  const [helpOpen, setHelpOpen] = useState(false)
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 px-4 py-10 text-center">
      <motion.header
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', bounce: 0.5 }}
      >
        <h1 className="text-5xl font-black tracking-tight drop-shadow-lg sm:text-7xl">{strings.app.title}</h1>
        <p className="mt-3 text-lg text-indigo-200 sm:text-2xl">{strings.app.tagline}</p>
      </motion.header>

      <div className="flex w-full max-w-3xl flex-col gap-5 sm:flex-row">
        {buttons.map((b, i) => (
          <motion.a
            key={b.href}
            href={b.href}
            onClick={b.href === routeHref.host ? unlockAudio : undefined}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', bounce: 0.5, delay: 0.15 + i * 0.1 }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            className={`flex flex-1 flex-col items-center justify-center rounded-3xl bg-gradient-to-br px-6 py-8 shadow-2xl sm:py-12 ${b.className}`}
          >
            <span className="text-3xl font-extrabold sm:text-4xl">{b.label}</span>
            <span className="mt-2 text-base opacity-90 sm:text-lg">{b.hint}</span>
          </motion.a>
        ))}
      </div>

      <nav className="flex gap-6 text-lg">
        <button type="button" onClick={() => setHelpOpen(true)} className="underline underline-offset-4 hover:text-yellow-300">
          {strings.landing.help}
        </button>
        <a href={routeHref.about} className="underline underline-offset-4 hover:text-yellow-300">
          {strings.landing.about}
        </a>
      </nav>
      <AnimatePresence>
        {helpOpen && (
          <Overlay title={strings.help.title} onClose={() => setHelpOpen(false)}>
            <HelpContent />
          </Overlay>
        )}
      </AnimatePresence>
    </main>
  )
}
