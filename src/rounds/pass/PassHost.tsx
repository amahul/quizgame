import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { playRevealSound } from '../../audio'
import type { Player } from '../../game/lobby'
import { useHostStore } from '../../host/hostStore'
import { strings } from '../../i18n'
import { AvatarBadge } from '../../ui/AvatarBadge'
import { formatPoints, formatScore } from '../../ui/format'
import { HostCountdown } from '../../ui/Countdown'
import { HostButton } from '../../ui/HostButton'
import { ANSWER_MS, isKept, stakeOf, type PassState } from './logic'
import { PASS_ANIMATION_MS, PassAnimation } from './PassAnimation'

const KEEP_SPLASH_MS = 1_600

export function PassHost({ state, players }: { state: PassState; players: Player[] }) {
  const act = useHostStore((s) => s.act)
  const byId = (id: string | null) => players.find((p) => p.id === id)
  const active = byId(state.activeId)
  const answerer = byId(state.answererId)
  const question = state.questions[state.index]
  const isLast = state.index === state.questions.length - 1
  const highlightId = state.stage === 'choosing' ? state.activeId : state.answererId

  return (
    <main className="flex h-dvh flex-col gap-8 p-12">
      <header className="flex items-baseline justify-between text-3xl text-indigo-200">
        <span className="font-bold">{strings.rounds.pass.title}</span>
        <span>{strings.game.questionOf(state.index + 1, state.questions.length)}</span>
      </header>

      <section className="flex min-h-0 flex-1 items-center justify-center">
        <AnimatePresence mode="wait">
          {state.stage === 'choosing' && active && (
            <motion.div
              key={`choose-${state.index}-${active.id}`}
              className="flex flex-col items-center gap-12 text-center"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
            >
              <CategoryCard category={question.category} />
              <div className="flex items-center gap-8">
                <AvatarBadge avatar={active.avatar} size={120} />
                <p className="text-5xl font-bold">{strings.pass.choosing(active.name)}</p>
              </div>
            </motion.div>
          )}
          {state.stage === 'answering' && active && answerer && (
            <Answering key={`answer-${state.index}`} state={state} active={active} answerer={answerer} />
          )}
          {state.stage === 'reveal' && answerer && (
            <Reveal key={`reveal-${state.index}`} state={state} answerer={answerer} />
          )}
        </AnimatePresence>
      </section>

      <footer className="flex items-end justify-between gap-8">
        <ul className="flex flex-wrap gap-5">
          {players.map((p) => (
            <motion.li
              key={p.id}
              layout
              animate={{ scale: p.id === highlightId ? 1.15 : 1, opacity: p.connected ? 1 : 0.35 }}
              className="flex flex-col items-center gap-1"
            >
              <div className={`rounded-full ${p.id === highlightId ? 'ring-4 ring-yellow-300' : ''}`}>
                <AvatarBadge avatar={p.avatar} size={64} />
              </div>
              <span className="max-w-28 truncate text-xl font-bold">{p.name}</span>
              <span className="text-2xl font-black text-indigo-200">{formatScore(p.score)}</span>
            </motion.li>
          ))}
        </ul>

        <div className="flex shrink-0 gap-6">
          {state.stage === 'choosing' && (
            <HostButton variant="neutral" onClick={() => act({ type: 'pass-skip' })}>
              {strings.pass.skip}
            </HostButton>
          )}
          {state.stage === 'answering' && (
            <>
              <HostButton variant="danger" onClick={() => act({ type: 'pass-judge', correct: false })}>
                {strings.pass.judgeWrong}
              </HostButton>
              <HostButton onClick={() => act({ type: 'pass-judge', correct: true })}>{strings.pass.judgeCorrect}</HostButton>
            </>
          )}
          {state.stage === 'reveal' && (
            <>
              <HostButton variant="neutral" onClick={() => act({ type: 'pass-override' })}>
                {state.correct ? strings.pass.overrideToWrong : strings.pass.overrideToCorrect}
              </HostButton>
              <HostButton onClick={() => act({ type: 'pass-next' })}>
                {isLast ? strings.pass.toStandings : strings.pass.next}
              </HostButton>
            </>
          )}
        </div>
      </footer>
    </main>
  )
}

function CategoryCard({ category }: { category: string }) {
  return (
    <motion.div
      initial={{ rotateX: 90 }}
      animate={{ rotateX: 0 }}
      transition={{ type: 'spring', bounce: 0.4 }}
      className="rounded-[2.5rem] bg-gradient-to-br from-fuchsia-500 to-indigo-600 px-24 py-12 shadow-2xl"
    >
      <p className="text-3xl tracking-widest text-fuchsia-100 uppercase">{strings.pass.category}</p>
      <p className="text-9xl font-black">{category}</p>
    </motion.div>
  )
}

/** Shows the keep splash or pass animation first, then the question. */
function Answering({ state, active, answerer }: { state: PassState; active: Player; answerer: Player }) {
  const kept = isKept(state)
  const [intro, setIntro] = useState(true)
  const question = state.questions[state.index]

  useEffect(() => {
    const timer = setTimeout(() => setIntro(false), kept ? KEEP_SPLASH_MS : PASS_ANIMATION_MS)
    return () => clearTimeout(timer)
  }, [kept])

  if (intro) {
    return kept ? (
      <motion.div
        className="flex flex-col items-center gap-8"
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.6 }}
      >
        <AvatarBadge avatar={active.avatar} size={240} />
        <p className="text-8xl font-black text-yellow-300">{strings.pass.keeps(active.name)}</p>
      </motion.div>
    ) : (
      <PassAnimation from={active} to={answerer} />
    )
  }

  return (
    <motion.div
      className="flex w-full max-w-6xl flex-col items-center gap-10 text-center"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
    >
      <p className="text-3xl tracking-widest text-fuchsia-200 uppercase">{question.category}</p>
      <h1 className="rounded-[2.5rem] bg-white px-12 py-10 text-6xl leading-tight font-black text-indigo-950 shadow-2xl">
        {question.question}
      </h1>
      <div className="flex items-center gap-6">
        <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}>
          <AvatarBadge avatar={answerer.avatar} size={96} />
        </motion.div>
        <p className="text-4xl font-bold">{strings.pass.answering(answerer.name, stakeOf(state))}</p>
      </div>
      {state.answerDeadline !== null && <HostCountdown deadline={state.answerDeadline} totalMs={ANSWER_MS} />}
    </motion.div>
  )
}

function Reveal({ state, answerer }: { state: PassState; answerer: Player }) {
  const question = state.questions[state.index]
  const stake = stakeOf(state)
  const correct = state.correct === true

  useEffect(() => {
    playRevealSound(correct)
  }, [correct])

  return (
    <motion.div
      className="flex w-full max-w-6xl flex-col items-center gap-8 text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="flex items-center gap-6">
        <AvatarBadge avatar={answerer.avatar} size={96} />
        <div className="text-left">
          <p className="text-3xl text-indigo-200">{strings.pass.answered(answerer.name)}</p>
          <p className="text-6xl font-black">{state.answer !== null ? `”${state.answer}”` : state.timedOut ? strings.pass.timedOut : strings.pass.judgedByHost}</p>
        </div>
      </div>

      <motion.div
        key={String(correct)}
        initial={{ scale: 0.3, rotate: -10 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', bounce: 0.6 }}
        className={`rounded-[2.5rem] px-20 py-8 shadow-2xl ${correct ? 'bg-emerald-600' : 'bg-rose-600'}`}
      >
        <p className="text-9xl font-black">
          {correct ? strings.pass.correct : strings.pass.wrong} {formatPoints(correct ? stake : -stake)}
        </p>
        {state.overridden && state.answer !== null && <p className="text-2xl">{strings.pass.overridden}</p>}
      </motion.div>

      <p className="text-4xl">
        {strings.pass.correctAnswer}: <strong className="font-black">{question.answers[0]}</strong>
      </p>
      {question.fact && (
        <p className="rounded-3xl bg-white/10 px-8 py-5 text-3xl">
          <strong>{strings.game.fact}</strong> {question.fact}
        </p>
      )}
    </motion.div>
  )
}
