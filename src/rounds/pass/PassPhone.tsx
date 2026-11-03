import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { strings } from '../../i18n'
import { usePlayerStore } from '../../player/playerStore'
import { AvatarBadge } from '../../ui/AvatarBadge'
import { formatPoints } from '../../ui/format'
import { MAX_ANSWER_LENGTH, type PassView } from './logic'

/** If an answer gets no reaction (lost during a reconnect), let the player send it again. */
const RESEND_AFTER_MS = 4_000

export function PassPhone({ view, watch }: { view: PassView; watch: ReactNode }) {
  switch (view.kind) {
    case 'pass-watch':
      return watch
    case 'pass-choose':
      return <Choose view={view} />
    case 'pass-answer':
      return <Answer key={view.questionIndex} view={view} />
    case 'pass-result':
      return (
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', bounce: 0.5 }}
          className={`flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl text-center ${
            view.correct ? 'bg-emerald-600' : 'bg-rose-600'
          }`}
        >
          <p className="text-6xl font-black">{view.correct ? strings.phone.pass.correct : strings.phone.pass.wrong}</p>
          <p className="text-4xl font-bold">{formatPoints(view.points)}</p>
        </motion.div>
      )
  }
}

function Choose({ view }: { view: Extract<PassView, { kind: 'pass-choose' }> }) {
  const send = usePlayerStore((s) => s.send)
  const decide = (target: string) => send({ type: 'pass-decide', questionIndex: view.questionIndex, target })

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="rounded-3xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 p-5 text-center">
        <p className="text-sm tracking-widest text-fuchsia-100 uppercase">{strings.phone.pass.category}</p>
        <p className="text-3xl font-black">{view.category}</p>
      </div>

      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => decide('self')}
        className="rounded-3xl bg-gradient-to-br from-amber-300 to-orange-400 text-orange-950 py-6 shadow-xl"
      >
        <span className="block text-3xl font-black">{strings.phone.pass.keep}</span>
        <span className="text-lg font-bold opacity-90">{strings.phone.pass.keepStake}</span>
      </motion.button>

      <div>
        <p className="text-xl font-bold">{strings.phone.pass.sendTo}</p>
        <p className="text-sm text-indigo-200">{strings.phone.pass.sendStake}</p>
      </div>
      {view.targets.length === 0 ? (
        <p className="text-indigo-200">{strings.phone.pass.noOneToSend}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {view.targets.map((t) => (
            <li key={t.id}>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => decide(t.id)}
                className="flex w-full items-center gap-4 rounded-2xl bg-white/10 p-3 text-left active:bg-white/25"
              >
                <AvatarBadge avatar={t.avatar} size={48} />
                <span className="truncate text-2xl font-bold">{t.name}</span>
              </motion.button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Answer({ view }: { view: Extract<PassView, { kind: 'pass-answer' }> }) {
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
      className="flex flex-1 flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!text.trim() || sent) return
        setSent(true)
        send({ type: 'pass-answer', questionIndex: view.questionIndex, text })
      }}
    >
      <p className="text-center text-3xl font-black text-yellow-300">{strings.phone.pass.yourQuestion}</p>
      <p className="text-center text-sm tracking-widest text-fuchsia-200 uppercase">{view.category}</p>
      <p className="rounded-3xl bg-white p-5 text-2xl font-bold text-indigo-950">{view.question}</p>
      <p className="text-center text-lg text-indigo-200">{strings.phone.pass.stake(view.stake)}</p>
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_ANSWER_LENGTH}
        placeholder={strings.phone.pass.answerPlaceholder}
        autoComplete="off"
        enterKeyHint="send"
        disabled={sent}
        className="rounded-2xl bg-white px-4 py-4 text-2xl font-bold text-indigo-950 placeholder:text-indigo-300"
      />
      <motion.button
        type="submit"
        whileTap={{ scale: 0.95 }}
        disabled={!text.trim() || sent}
        className="rounded-3xl bg-gradient-to-br from-emerald-600 to-green-700 py-5 text-3xl font-black shadow-xl disabled:opacity-40"
      >
        {strings.phone.pass.submit}
      </motion.button>
    </form>
  )
}
