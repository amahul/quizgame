import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { strings } from '../../i18n'
import { usePlayerStore } from '../../player/playerStore'
import { formatNumber, formatPoints } from '../../ui/format'
import { parseGuess, type ClosestView } from './logic'

/** If a guess gets no reaction (lost during a reconnect), let the player send it again. */
const RESEND_AFTER_MS = 4_000

const PLACE_BG = { exact: 'bg-yellow-400 text-amber-950', closest: 'bg-emerald-600', runnerUp: 'bg-sky-700' } as const

export function ClosestPhone({ view }: { view: ClosestView }) {
  if (view.kind === 'closest-result') {
    const t = strings.phone.closest
    const text = view.guessed === null ? t.noGuess : view.place ? t.places[view.place] : t.noPlace
    return (
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.5 }}
        className={`flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl p-4 text-center ${
          view.place ? PLACE_BG[view.place] : 'bg-white/10'
        }`}
      >
        <p className="text-5xl font-black">{text}</p>
        <p className="text-4xl font-bold">{formatPoints(view.points)}</p>
        <p className="text-xl">
          {t.answerWas}: <strong>{formatNumber(view.answer, view)}</strong>
        </p>
        {view.guessed !== null && (
          <p className="text-xl">
            {t.yourGuess}: <strong>{formatNumber(view.guessed, view)}</strong>
          </p>
        )}
      </motion.div>
    )
  }

  if (view.guessed !== null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <p className="text-xl text-indigo-200">{strings.phone.closest.yourGuess}</p>
        <motion.p initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-6xl font-black break-all">
          {formatNumber(view.guessed, view)}
        </motion.p>
        <p className="text-xl text-indigo-200">{strings.phone.closest.waiting}</p>
      </div>
    )
  }

  return <GuessForm key={view.questionIndex} view={view} />
}

function GuessForm({ view }: { view: Extract<ClosestView, { kind: 'closest-question' }> }) {
  const send = usePlayerStore((s) => s.send)
  const [text, setText] = useState('')
  const [sent, setSent] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const t = strings.phone.closest

  useEffect(() => {
    if (!sent) return
    const timer = setTimeout(() => setSent(false), RESEND_AFTER_MS)
    return () => clearTimeout(timer)
  }, [sent])

  return (
    <form
      className="flex flex-1 flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        const value = parseGuess(text)
        if (value === null) {
          setInvalid(true)
          return
        }
        if (sent) return
        setSent(true)
        send({ type: 'closest-guess', questionIndex: view.questionIndex, value })
      }}
    >
      {invalid && (
        <p role="alert" className="rounded-2xl bg-amber-400 px-4 py-3 text-center font-bold text-amber-950">
          {t.notANumber}
        </p>
      )}
      <p className="rounded-3xl bg-white p-5 text-2xl font-bold text-indigo-950">{view.question}</p>
      <div className="flex items-center gap-3">
        <input
          autoFocus
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setInvalid(false)
          }}
          inputMode="decimal"
          maxLength={20}
          placeholder={t.guessPlaceholder}
          aria-label={t.guessPlaceholder}
          autoComplete="off"
          enterKeyHint="send"
          disabled={sent}
          className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-4 text-3xl font-black text-indigo-950 tabular-nums placeholder:text-indigo-300"
        />
        {view.unit && <span className="text-2xl font-bold">{view.unit}</span>}
      </div>
      <motion.button
        type="submit"
        whileTap={{ scale: 0.95 }}
        disabled={!text.trim() || sent}
        className="rounded-3xl bg-gradient-to-br from-emerald-600 to-green-700 py-5 text-3xl font-black shadow-xl disabled:opacity-40"
      >
        {t.guess}
      </motion.button>
    </form>
  )
}
