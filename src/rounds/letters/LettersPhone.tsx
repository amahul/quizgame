import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { strings } from '../../i18n'
import { usePlayerStore } from '../../player/playerStore'
import { formatPoints } from '../../ui/format'
import { MAX_GUESS_LENGTH, type LettersView } from './logic'

/** If a guess gets no reaction (lost during a reconnect), let the player send it again. */
const RESEND_AFTER_MS = 4_000

export function LettersPhone({ view }: { view: LettersView }) {
  if (view.kind === 'letters-result') {
    const text =
      view.status === 'correct'
        ? strings.phone.letters.correct
        : view.status === 'locked'
          ? strings.phone.letters.wrong
          : strings.phone.letters.noGuess
    return (
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.5 }}
        className={`flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl p-4 text-center ${
          view.status === 'correct' ? 'bg-emerald-600' : 'bg-rose-600'
        }`}
      >
        <p className="text-5xl font-black">{text}</p>
        {view.status === 'correct' && <p className="text-4xl font-bold">{formatPoints(view.points)}</p>}
        <p className="mt-4 text-lg opacity-90">{strings.phone.letters.answerWas}</p>
        <p className="text-3xl font-black">{view.answer}</p>
      </motion.div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="text-center">
        <p className="text-sm tracking-widest text-fuchsia-200 uppercase">{view.theme}</p>
        <p className="text-2xl font-bold">{view.prompt}</p>
      </div>
      {view.status === 'open' && <GuessForm key={view.questionIndex} questionIndex={view.questionIndex} />}
      {view.status === 'correct' && (
        <motion.div
          initial={{ scale: 0.5 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', bounce: 0.6 }}
          className="flex flex-1 flex-col items-center justify-center gap-2 rounded-3xl bg-emerald-600"
        >
          <p className="text-6xl font-black">{strings.phone.letters.correct}</p>
          <p className="text-4xl font-bold">{formatPoints(view.points)}</p>
        </motion.div>
      )}
      {view.status === 'locked' && (
        <motion.div
          initial={{ rotate: -15, scale: 0.5 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: 'spring', bounce: 0.6 }}
          className="flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl bg-slate-800 p-6 text-center"
        >
          <span aria-hidden className="text-8xl">
            🔒
          </span>
          <p className="text-2xl font-bold">{strings.phone.letters.locked}</p>
        </motion.div>
      )}
    </div>
  )
}

function GuessForm({ questionIndex }: { questionIndex: number }) {
  const send = usePlayerStore((s) => s.send)
  const [text, setText] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (!sent) return
    const timer = setTimeout(() => setSent(false), RESEND_AFTER_MS)
    return () => clearTimeout(timer)
  }, [sent])

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!text.trim() || sent) return
        setSent(true)
        send({ type: 'letters-guess', questionIndex, text })
      }}
    >
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_GUESS_LENGTH}
        placeholder={strings.phone.letters.guessPlaceholder}
        autoComplete="off"
        enterKeyHint="send"
        disabled={sent}
        className="rounded-2xl bg-white px-4 py-4 text-2xl font-bold text-indigo-950 placeholder:text-indigo-300"
      />
      <motion.button
        type="submit"
        whileTap={{ scale: 0.95 }}
        disabled={!text.trim() || sent}
        className="rounded-3xl bg-gradient-to-br from-amber-300 to-orange-400 text-orange-950 py-5 text-3xl font-black shadow-xl disabled:opacity-40"
      >
        {strings.phone.letters.guess}
      </motion.button>
      <p className="text-center text-sm text-indigo-200">{strings.phone.letters.oneTry}</p>
    </form>
  )
}
