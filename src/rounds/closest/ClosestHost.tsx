import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { playDrumroll } from '../../audio'
import type { Player } from '../../game/lobby'
import { useHostStore } from '../../host/hostStore'
import { strings } from '../../i18n'
import { AvatarBadge } from '../../ui/AvatarBadge'
import { formatNumber, formatPoints } from '../../ui/format'
import { HostButton } from '../../ui/HostButton'
import { hasGuessed, PLACE_POINTS, rankedGuesses, type ClosestState } from './logic'

const PLACE_STYLES = {
  exact: 'bg-yellow-400 text-amber-950 ring-4 ring-white',
  closest: 'bg-emerald-600 text-white',
  runnerUp: 'bg-sky-700 text-white',
} as const

export function ClosestHost({ state, players }: { state: ClosestState; players: Player[] }) {
  const act = useHostStore((s) => s.act)
  const question = state.questions[state.index]
  const revealed = state.stage === 'reveal'
  const isLast = state.index === state.questions.length - 1
  const connected = players.filter((p) => p.connected)
  const guessedCount = players.filter((p) => hasGuessed(state, p.id)).length
  const format = (value: number) => formatNumber(value, question)
  const byId = new Map(players.map((p) => [p.id, p]))
  const ranked = revealed ? rankedGuesses(state) : []
  // Fifteen players have to fit on one screen.
  const compact = ranked.length > 6

  // Drumroll while the reveal is pending (auto after everyone guessed, or the host's "Visa svar").
  const revealAt = state.revealAt
  useEffect(() => {
    if (revealAt !== null) playDrumroll(Math.max(0.3, (revealAt - Date.now()) / 1000))
  }, [revealAt])

  return (
    <main className="flex h-dvh flex-col gap-8 p-12">
      <header className="flex items-baseline justify-between text-3xl text-indigo-200">
        <span className="font-bold">{strings.rounds.closest.title}</span>
        <span>{strings.game.questionOf(state.index + 1, state.questions.length)}</span>
      </header>

      <motion.h1
        key={state.index}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[2.5rem] bg-white px-10 py-8 text-center text-6xl leading-tight font-black text-indigo-950 shadow-2xl"
      >
        {question.question}
      </motion.h1>

      {revealed ? (
        <section className="flex min-h-0 flex-1 gap-10">
          <motion.div
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', bounce: 0.5 }}
            className="flex w-2/5 shrink-0 flex-col items-center justify-center rounded-[2.5rem] bg-yellow-400 p-8 text-center text-amber-950 shadow-2xl"
          >
            <p className="text-4xl font-bold">{strings.closest.answer}</p>
            <p className="text-8xl leading-tight font-black break-all">{format(question.answer)}</p>
          </motion.div>
          <ol className={`flex min-h-0 flex-1 flex-col overflow-y-auto ${compact ? 'gap-2' : 'gap-3'}`}>
            {ranked.length === 0 && <li className="text-4xl text-indigo-200">{strings.closest.noGuesses}</li>}
            {ranked.map(({ playerId, guess, place }, i) => {
              const player = byId.get(playerId)
              return (
                <motion.li
                  key={playerId}
                  initial={{ opacity: 0, x: 60 }}
                  animate={{ opacity: place ? 1 : 0.6, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.08 }}
                  className={`flex items-center gap-5 rounded-3xl px-6 ${compact ? 'py-1.5' : 'py-3'} ${
                    place ? PLACE_STYLES[place] : 'bg-white/10'
                  }`}
                >
                  {player && <AvatarBadge avatar={player.avatar} size={compact ? 44 : 60} />}
                  <span className={`flex-1 truncate font-bold ${compact ? 'text-3xl' : 'text-4xl'}`}>{player?.name}</span>
                  <span className={`font-black tabular-nums ${compact ? 'text-3xl' : 'text-4xl'}`}>{format(guess)}</span>
                  <span className={`w-56 text-right font-bold ${compact ? 'text-2xl' : 'text-3xl'}`}>
                    {place
                      ? `${strings.closest.places[place]} ${formatPoints(PLACE_POINTS[place])}`
                      : strings.closest.off(formatNumber(Math.abs(guess - question.answer), { unit: question.unit }))}
                  </span>
                </motion.li>
              )
            })}
          </ol>
        </section>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          {question.unit && <p className="text-5xl font-bold text-indigo-200">({question.unit})</p>}
        </div>
      )}

      <footer className="flex min-h-28 items-center gap-8">
        {revealed && question.fact ? (
          <motion.p
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex-1 rounded-3xl bg-white/10 px-8 py-5 text-3xl"
          >
            <strong>{strings.game.fact}</strong> {question.fact}
          </motion.p>
        ) : revealed ? (
          <div className="flex-1" />
        ) : (
          <div className="flex flex-1 flex-wrap items-center gap-4">
            <span className="mr-2 text-3xl text-indigo-200">
              {strings.closest.answeredCount(guessedCount, connected.length)}
            </span>
            {players.map((p) => (
              <motion.div
                key={p.id}
                animate={hasGuessed(state, p.id) ? { opacity: 1, scale: [1, 1.25, 1] } : { opacity: 0.25, scale: 1 }}
                className={p.connected ? '' : 'grayscale'}
              >
                <AvatarBadge avatar={p.avatar} size={64} />
              </motion.div>
            ))}
          </div>
        )}
        {revealed ? (
          <HostButton onClick={() => act({ type: 'closest-next' })}>
            {isLast ? strings.closest.toStandings : strings.closest.next}
          </HostButton>
        ) : (
          <HostButton variant="neutral" disabled={revealAt !== null} onClick={() => act({ type: 'closest-reveal' })}>
            {strings.closest.reveal}
          </HostButton>
        )}
      </footer>
    </main>
  )
}
