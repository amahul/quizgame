import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { getHashParam } from '../app/router'
import { strings } from '../i18n'
import type { PhoneView } from '../game/game'
import { ClosestPhone } from '../rounds/closest/ClosestPhone'
import { LettersPhone } from '../rounds/letters/LettersPhone'
import { BuzzerPhone } from '../rounds/music-buzzer/BuzzerPhone'
import { MusicRacePhone } from '../rounds/music-race/MusicRacePhone'
import { PassPhone } from '../rounds/pass/PassPhone'
import { TriviaPhone } from '../rounds/trivia/TriviaPhone'
import { AvatarBadge } from '../ui/AvatarBadge'
import { formatScore } from '../ui/format'
import { HelpContent } from '../ui/HelpContent'
import { Overlay } from '../ui/Overlay'
import { useWakeLock } from '../ui/useWakeLock'
import { JoinForm } from './JoinForm'
import { usePlayerStore } from './playerStore'

// Phone UI: mobile-first, big touch targets.
export function PlayerScreen() {
  const screen = usePlayerStore((s) => s.screen)
  const reconnecting = usePlayerStore((s) => s.reconnecting)
  const init = usePlayerStore((s) => s.init)
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    init({ room: getHashParam('room'), slot: getHashParam('player') })
  }, [init])

  // Keep the phone from locking mid-game (a locked screen drops the connection).
  useWakeLock(screen === 'joined' || screen === 'connecting')

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-6 landscape:max-w-2xl landscape:py-3">
      <button
        type="button"
        onClick={() => setHelpOpen(true)}
        aria-label={strings.help.open}
        title={strings.help.open}
        className="absolute top-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-xl font-black"
      >
        ?
      </button>
      <AnimatePresence>
        {helpOpen && (
          <Overlay title={strings.help.title} onClose={() => setHelpOpen(false)}>
            <HelpContent />
          </Overlay>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {reconnecting && (
          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            role="status"
            className="mb-4 rounded-2xl bg-amber-400 px-4 py-3 text-center font-bold text-amber-950"
          >
            {strings.player.reconnecting}
          </motion.div>
        )}
      </AnimatePresence>
      {screen === 'form' && <JoinForm />}
      {screen === 'connecting' && <Connecting />}
      {screen === 'joined' && <Joined />}
      {screen === 'ended' && <Ended />}
    </main>
  )
}

function Connecting() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <motion.div
        className="h-16 w-16 rounded-full border-8 border-white/20 border-t-white"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
      />
      <p className="text-2xl font-bold">{strings.player.connecting}</p>
    </div>
  )
}

function Joined() {
  const me = usePlayerStore((s) => s.me)
  const view = usePlayerStore((s) => s.view)
  const score = usePlayerStore((s) => s.score)
  const lateJoin = usePlayerStore((s) => s.lateJoin)
  if (!me) return null
  if (!view || view.kind === 'lobby') return <Welcome />

  return (
    <div className="flex flex-1 flex-col gap-4">
      <header className="flex items-center gap-3 pr-12">
        <AvatarBadge avatar={me.avatar} size={44} />
        <span className="flex-1 truncate text-xl font-bold">{me.name}</span>
        <motion.span key={score} initial={{ scale: 1.5 }} animate={{ scale: 1 }} className="text-2xl font-black">
          {formatScore(score)}
        </motion.span>
      </header>
      {lateJoin && <p className="rounded-2xl bg-white/10 px-4 py-3 text-center text-lg">{strings.player.lateJoin}</p>}
      <PhoneViewBody view={view} />
    </div>
  )
}

function PhoneViewBody({ view }: { view: PhoneView }) {
  switch (view.kind) {
    case 'lobby':
      return <Watch />
    case 'paused':
      return <Watch heading={`⏸ ${strings.phone.paused}`} hint={strings.phone.pausedHint} />
    case 'intro':
      return <Watch heading={`${strings.phone.nextRound} ${strings.rounds[view.titleKey].title}`} />
    case 'standings':
      return <Watch heading={view.final ? strings.phone.finalRank(view.rank) : strings.phone.rank(view.rank)} />
    case 'trivia-question':
    case 'trivia-reveal':
      return <TriviaPhone view={view} />
    case 'closest-question':
    case 'closest-result':
      return <ClosestPhone view={view} />
    case 'letters-guess':
    case 'letters-result':
      return <LettersPhone view={view} />
    case 'music-choice':
    case 'music-choice-result':
      return <MusicRacePhone view={view} />
    case 'buzzer':
    case 'buzzer-answer':
    case 'buzzer-result':
      return <BuzzerPhone view={view} />
    default:
      return <PassPhone view={view} watch={<Watch />} />
  }
}

/** "Look at the big screen", with an optional headline. */
function Watch({ heading, hint }: { heading?: string; hint?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      {heading && <p className="text-4xl font-black">{heading}</p>}
      <motion.p
        className="text-2xl text-indigo-200"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ repeat: Infinity, duration: 2 }}
      >
        {hint ?? strings.player.watchScreen}
      </motion.p>
    </div>
  )
}

function Welcome() {
  const me = usePlayerStore((s) => s.me)!
  const lateJoin = usePlayerStore((s) => s.lateJoin)

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.6 }}>
        <AvatarBadge avatar={me.avatar} size={160} />
      </motion.div>
      <p className="text-3xl font-bold">{me.name}</p>
      <h1 className="text-5xl font-black">{strings.player.joined}</h1>
      <p className="text-2xl text-indigo-200">{strings.player.watchScreen}</p>
      {lateJoin && <p className="rounded-2xl bg-white/10 px-4 py-3 text-lg">{strings.player.lateJoin}</p>}
    </div>
  )
}

function Ended() {
  const endReason = usePlayerStore((s) => s.endReason)
  const backToForm = usePlayerStore((s) => s.backToForm)

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
      <p className="text-2xl font-bold">{endReason === 'replaced' ? strings.player.replaced : strings.player.kicked}</p>
      <button onClick={backToForm} className="w-full rounded-3xl bg-white/15 py-5 text-2xl font-bold active:scale-95">
        {strings.player.joinAgain}
      </button>
    </div>
  )
}
