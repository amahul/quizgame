import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { playDrumroll } from '../../audio'
import type { Player } from '../../game/lobby'
import { useHostStore } from '../../host/hostStore'
import { strings } from '../../i18n'
import { AvatarBadge } from '../../ui/AvatarBadge'
import { HostButton } from '../../ui/HostButton'
import { answerCounts, hasAnswered, type TriviaState } from './logic'
import { OPTION_STYLES, OptionShape } from './options'

export function TriviaHost({ state, players }: { state: TriviaState; players: Player[] }) {
  const act = useHostStore((s) => s.act)
  const question = state.questions[state.index]
  const revealed = state.stage === 'reveal'
  const counts = answerCounts(state)
  const maxCount = Math.max(1, ...counts)
  const isLast = state.index === state.questions.length - 1
  const connected = players.filter((p) => p.connected)
  const answeredCount = players.filter((p) => hasAnswered(state, p.id)).length

  // Drumroll while the reveal is pending (auto after everyone answered, or host's "Visa svar").
  const revealAt = state.revealAt
  useEffect(() => {
    if (revealAt !== null) playDrumroll(Math.max(0.3, (revealAt - Date.now()) / 1000))
  }, [revealAt])

  return (
    <main className="flex h-dvh flex-col gap-8 p-12">
      <header className="flex items-baseline justify-between text-3xl text-indigo-200">
        <span className="font-bold">{strings.rounds.trivia.title}</span>
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

      <ul className="grid flex-1 grid-cols-2 gap-6">
        {question.options.map((option, i) => {
          const correct = i === question.correct
          return (
            <motion.li
              key={`${state.index}-${i}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={
                revealed
                  ? correct
                    ? { opacity: 1, scale: [1, 1.04, 1], transition: { scale: { repeat: Infinity, duration: 1 } } }
                    : { opacity: 0.25, scale: 0.97 }
                  : { opacity: 1, scale: 1 }
              }
              transition={{ delay: revealed ? 0 : 0.1 * i }}
              className={`relative flex items-center gap-6 overflow-hidden rounded-3xl px-8 shadow-xl ${OPTION_STYLES[i].bg} ${
                OPTION_STYLES[i].text
              } ${revealed && correct ? 'ring-8 ring-white' : ''}`}
            >
              <OptionShape index={i} className="h-16 w-16 shrink-0" />
              <span className="z-10 flex-1 text-5xl font-extrabold">{option}</span>
              {revealed && correct && (
                <span aria-hidden className="z-10 text-6xl font-black">
                  ✓
                </span>
              )}
              {revealed && (
                <div className="z-10 flex w-48 shrink-0 items-center gap-3">
                  <div className="h-6 flex-1 overflow-hidden rounded-full bg-black/25">
                    <motion.div
                      className={`h-full rounded-full ${OPTION_STYLES[i].bar}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${(counts[i] / maxCount) * 100}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  </div>
                  <span className="w-12 text-right text-5xl font-black">{counts[i]}</span>
                </div>
              )}
            </motion.li>
          )
        })}
      </ul>

      <footer className="flex min-h-28 items-center gap-8">
        {revealed && question.fact ? (
          <motion.p
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex-1 rounded-3xl bg-white/10 px-8 py-5 text-3xl"
          >
            <strong>{strings.game.fact}</strong> {question.fact}
          </motion.p>
        ) : (
          <div className="flex flex-1 items-center gap-4">
            <span className="mr-2 text-3xl text-indigo-200">
              {strings.trivia.answeredCount(answeredCount, connected.length)}
            </span>
            {players.map((p) => (
              <motion.div
                key={p.id}
                animate={hasAnswered(state, p.id) ? { opacity: 1, scale: [1, 1.25, 1] } : { opacity: 0.25, scale: 1 }}
                className={p.connected ? '' : 'grayscale'}
              >
                <AvatarBadge avatar={p.avatar} size={64} />
              </motion.div>
            ))}
          </div>
        )}
        {revealed ? (
          <HostButton onClick={() => act({ type: 'trivia-next' })}>
            {isLast ? strings.trivia.toStandings : strings.trivia.next}
          </HostButton>
        ) : (
          <HostButton variant="neutral" disabled={revealAt !== null} onClick={() => act({ type: 'trivia-reveal' })}>
            {strings.trivia.reveal}
          </HostButton>
        )}
      </footer>
    </main>
  )
}
