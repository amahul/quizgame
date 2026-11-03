import { motion } from 'framer-motion'
import { strings } from '../../i18n'
import { usePlayerStore } from '../../player/playerStore'
import { formatPoints } from '../../ui/format'
import type { TriviaView } from './logic'
import { OPTION_STYLES, OptionShape } from './options'

export function TriviaPhone({ view }: { view: TriviaView }) {
  const send = usePlayerStore((s) => s.send)

  if (view.kind === 'trivia-reveal') {
    const text =
      view.answered === null ? strings.phone.trivia.noAnswer : view.correct ? strings.phone.trivia.correct : strings.phone.trivia.wrong
    return (
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.5 }}
        className={`flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl text-center ${
          view.correct ? 'bg-emerald-600' : 'bg-rose-600'
        }`}
      >
        <p className="text-6xl font-black">{text}</p>
        <p className="text-4xl font-bold">{formatPoints(view.points)}</p>
      </motion.div>
    )
  }

  if (view.answered !== null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className={`flex h-36 w-36 items-center justify-center rounded-3xl ${OPTION_STYLES[view.answered].bg} ${OPTION_STYLES[view.answered].text}`}
        >
          <OptionShape index={view.answered} className="h-20 w-20" />
        </motion.div>
        <p className="text-4xl font-black">{strings.phone.trivia.answered}</p>
        <p className="text-xl text-indigo-200">{strings.phone.trivia.waiting}</p>
      </div>
    )
  }

  return (
    <div className="grid flex-1 grid-cols-2 gap-3">
      {OPTION_STYLES.slice(0, view.optionCount).map((style, i) => (
        <motion.button
          key={`${view.questionIndex}-${i}`}
          aria-label={strings.trivia.optionNames[i]}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: i * 0.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => send({ type: 'trivia-answer', questionIndex: view.questionIndex, choice: i })}
          className={`flex items-center justify-center rounded-3xl shadow-lg ${style.bg} ${style.text}`}
        >
          <OptionShape index={i} className="h-20 w-20" />
        </motion.button>
      ))}
    </div>
  )
}
