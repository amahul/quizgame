import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { playRevealSound } from '../../audio'
import type { Player } from '../../game/lobby'
import { useHostStore } from '../../host/hostStore'
import { strings } from '../../i18n'
import { AvatarBadge } from '../../ui/AvatarBadge'
import { HostButton } from '../../ui/HostButton'
import { useNow } from '../../ui/useNow'
import { OPTION_STYLES, OptionShape } from '../trivia/options'
import { MusicDeck, type DeckMode } from '../music/MusicDeck'
import { CLIP_MS, clipElapsed, speedPoints } from '../music/track'
import { CHOICE_MAX_POINTS, CHOICE_MIN_POINTS, choiceCounts, type MusicRaceState } from './logic'

const deckMode: Record<MusicRaceState['stage'], DeckMode> = {
  loading: 'loading',
  playing: 'playing',
  reveal: 'stopped',
  done: 'stopped',
}

export function MusicRaceHost({ state, players }: { state: MusicRaceState; players: Player[] }) {
  const act = useHostStore((s) => s.act)
  const now = useNow(200)
  const question = state.questions[state.index]
  const revealed = state.stage === 'reveal'
  const elapsed = clipElapsed(state.clip, now)
  const isLast = state.index === state.questions.length - 1
  const counts = choiceCounts(state)
  const maxCount = Math.max(1, ...counts)
  const answered = players.filter((p) => Object.hasOwn(state.answers, p.id))

  useEffect(() => {
    if (revealed) playRevealSound(true)
  }, [revealed])

  return (
    <main className="flex h-dvh flex-col gap-6 p-12">
      <header className="flex items-baseline justify-between text-3xl text-indigo-200">
        <span className="font-bold">{strings.rounds.musicRace.title}</span>
        <span>{strings.music.trackOf(state.index + 1, state.questions.length)}</span>
      </header>

      <motion.h1
        key={state.index}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center text-7xl font-black"
      >
        {strings.music.question[question.field]}
      </motion.h1>

      <section className="flex flex-col items-center gap-3">
        {/* Kept mounted through the reveal so the deck can stop the music cleanly. */}
        <MusicDeck
          compact
          index={state.index}
          track={question.track}
          nextTrack={state.questions[state.index + 1]?.track}
          mode={deckMode[state.stage]}
          clip={state.clip}
        />
        {state.stage === 'playing' && (
          <div className="flex w-full max-w-5xl items-center gap-6">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-pink-500 to-amber-400"
                style={{ width: `${Math.min(100, (elapsed / CLIP_MS) * 100)}%` }}
              />
            </div>
            <span className="text-3xl font-black text-yellow-300 tabular-nums">
              {strings.music.pointsNow(speedPoints(elapsed, CHOICE_MAX_POINTS, CHOICE_MIN_POINTS))} ·{' '}
              {strings.music.secondsLeft(Math.max(0, Math.ceil((CLIP_MS - elapsed) / 1000)))}
            </span>
          </div>
        )}
      </section>

      <ul className="grid flex-1 grid-cols-2 gap-5">
        {question.options.map((option, i) => {
          const correct = i === question.correct
          return (
            <motion.li
              key={`${state.index}-${i}`}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={
                revealed
                  ? correct
                    ? { opacity: 1, scale: [1, 1.04, 1], transition: { scale: { repeat: Infinity, duration: 1 } } }
                    : { opacity: 0.25, scale: 0.97 }
                  : { opacity: 1, scale: 1 }
              }
              transition={{ delay: revealed ? 0 : 0.08 * i }}
              className={`relative flex items-center gap-6 overflow-hidden rounded-3xl px-8 shadow-xl ${OPTION_STYLES[i].bg} ${
                OPTION_STYLES[i].text
              } ${revealed && correct ? 'ring-8 ring-white' : ''}`}
            >
              <OptionShape index={i} className="h-14 w-14 shrink-0" />
              <span className="flex-1 truncate text-5xl font-extrabold">{option}</span>
              {revealed && correct && (
                <span aria-hidden className="text-6xl font-black">
                  ✓
                </span>
              )}
              {revealed && (
                <div className="flex w-44 shrink-0 items-center gap-3">
                  <div className="h-5 flex-1 overflow-hidden rounded-full bg-black/25">
                    <motion.div
                      className={`h-full rounded-full ${OPTION_STYLES[i].bar}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${(counts[i] / maxCount) * 100}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  </div>
                  <span className="w-10 text-right text-4xl font-black">{counts[i]}</span>
                </div>
              )}
            </motion.li>
          )
        })}
      </ul>

      <footer className="flex min-h-24 items-center gap-8">
        {revealed ? (
          <motion.p
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex-1 truncate rounded-3xl bg-white/10 px-8 py-4 text-4xl"
          >
            🎵 <strong>{question.track.artist}</strong> – {question.track.title}
          </motion.p>
        ) : (
          <div className="flex flex-1 items-center gap-4">
            <span className="mr-2 text-3xl text-indigo-200">
              {strings.music.answeredCount(answered.length, players.filter((p) => p.connected).length)}
            </span>
            {players.map((p) => (
              <motion.div
                key={p.id}
                animate={Object.hasOwn(state.answers, p.id) ? { opacity: 1, scale: [1, 1.25, 1] } : { opacity: 0.25, scale: 1 }}
                className={p.connected ? '' : 'grayscale'}
              >
                <AvatarBadge avatar={p.avatar} size={56} />
              </motion.div>
            ))}
          </div>
        )}
        {revealed ? (
          <HostButton onClick={() => act({ type: 'music-next' })}>{isLast ? strings.music.toStandings : strings.music.next}</HostButton>
        ) : (
          <HostButton variant="neutral" onClick={() => act({ type: 'music-reveal' })}>
            {strings.music.reveal}
          </HostButton>
        )}
      </footer>
    </main>
  )
}

export function TrackCard({ artist, title }: { artist: string; title: string }) {
  return (
    <motion.div
      initial={{ rotateX: 90, scale: 0.8 }}
      animate={{ rotateX: 0, scale: 1 }}
      transition={{ type: 'spring', bounce: 0.45 }}
      className="rounded-[3rem] bg-gradient-to-br from-pink-500 to-amber-400 px-20 py-12 text-center text-pink-950 shadow-2xl"
    >
      <p className="text-5xl font-bold">{artist}</p>
      <p className="text-8xl font-black">{title}</p>
    </motion.div>
  )
}
