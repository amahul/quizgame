import { motion } from 'framer-motion'
import { strings } from '../../i18n'
import { usePlayerStore } from '../../player/playerStore'
import { formatPoints } from '../../ui/format'
import { OPTION_STYLES, OptionShape } from '../trivia/options'
import type { MusicRaceView } from './logic'

/** Kahoot-style: the question on top, four colored shape buttons below. */
export function MusicRacePhone({ view }: { view: MusicRaceView }) {
  const send = usePlayerStore((s) => s.send)

  if (view.kind === 'music-choice-result') {
    const text =
      view.answered === null ? strings.phone.music.noAnswer : view.correct ? strings.phone.music.correct : strings.phone.music.wrong
    return (
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.5 }}
        className={`flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl p-6 text-center ${
          view.correct ? 'bg-emerald-600' : 'bg-rose-600'
        }`}
      >
        <p className="text-5xl font-black">{text}</p>
        <p className="text-4xl font-bold">{formatPoints(view.points)}</p>
        <p className="mt-4 text-lg opacity-90">{strings.phone.music.itWas}</p>
        <p className="text-2xl font-bold">{view.artist}</p>
        <p className="text-3xl font-black">{view.title}</p>
      </motion.div>
    )
  }

  if (view.loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <motion.p className="text-3xl font-bold" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.4 }}>
          {strings.phone.music.loading}
        </motion.p>
      </div>
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
        <p className="text-4xl font-black">{strings.phone.music.answered}</p>
        <p className="text-xl text-indigo-200">{strings.phone.music.waiting}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      <p className="text-center text-3xl font-black">🎵 {strings.music.question[view.field]}</p>
      <div className="grid flex-1 grid-cols-2 gap-3">
        {OPTION_STYLES.slice(0, view.optionCount).map((style, i) => (
          <motion.button
            key={`${view.questionIndex}-${i}`}
            aria-label={strings.trivia.optionNames[i]}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: i * 0.05 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => send({ type: 'music-choice', questionIndex: view.questionIndex, choice: i })}
            className={`flex items-center justify-center rounded-3xl shadow-lg ${style.bg} ${style.text}`}
          >
            <OptionShape index={i} className="h-20 w-20" />
          </motion.button>
        ))}
      </div>
    </div>
  )
}
