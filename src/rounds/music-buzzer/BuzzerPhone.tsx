import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { strings } from '../../i18n'
import { usePlayerStore } from '../../player/playerStore'
import { formatPoints } from '../../ui/format'
import { useNow } from '../../ui/useNow'
import { ANSWER_MS, MAX_ANSWER_LENGTH, type MusicBuzzerView } from './logic'

export function BuzzerPhone({ view }: { view: MusicBuzzerView }) {
  switch (view.kind) {
    case 'buzzer-answer':
      return <AnswerForm key={view.buzzedAt} view={view} />
    case 'buzzer-result': {
      const t = strings.phone.music
      const gotSomething = view.gotArtist || view.gotTitle
      const headline = !view.buzzed ? t.noBuzz : gotSomething ? t.correct : t.nothingRight
      return (
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl p-6 text-center ${
            !view.buzzed ? 'bg-white/10' : gotSomething ? 'bg-emerald-600' : 'bg-rose-600'
          }`}
        >
          <p className="text-4xl font-black">{headline}</p>
          {view.buzzed && <p className="text-4xl font-bold">{formatPoints(view.points)}</p>}
          {gotSomething && (
            <p className="text-xl font-bold">
              {[view.gotArtist && t.partRight(t.artist), view.gotTitle && t.partRight(t.title)].filter(Boolean).join(' · ')}
            </p>
          )}
          <p className="mt-4 text-lg opacity-90">{t.itWas}</p>
          <p className="text-2xl font-bold">{view.artist}</p>
          <p className="text-3xl font-black">{view.title}</p>
        </motion.div>
      )
    }
    case 'buzzer':
      if (view.locked) {
        return (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl bg-slate-800 p-6 text-center">
            <span aria-hidden className="text-8xl">
              🔒
            </span>
            <p className="text-2xl font-bold">{strings.phone.music.lockedOut}</p>
          </div>
        )
      }
      if (view.stage === 'buzzed') {
        return (
          <div className="flex flex-1 items-center justify-center text-center">
            <p className="text-4xl font-black">{strings.phone.music.someoneAnswers(view.buzzerName ?? '')}</p>
          </div>
        )
      }
      return <BuzzButton view={view} />
  }
}

/** Which parts are still up for grabs, as text (not only color). */
function PartStatus({ artistSolved, titleSolved }: { artistSolved: boolean; titleSolved: boolean }) {
  const t = strings.phone.music
  const chip = (label: string, solved: boolean) => (
    <span className={`rounded-full px-4 py-1 text-lg font-bold ${solved ? 'bg-emerald-700' : 'bg-white/15'}`}>
      {label}: {solved ? `✓ ${t.solved}` : t.open}
    </span>
  )
  return (
    <div className="flex justify-center gap-3">
      {chip(t.artist, artistSolved)}
      {chip(t.title, titleSolved)}
    </div>
  )
}

function BuzzButton({ view }: { view: Extract<MusicBuzzerView, { kind: 'buzzer' }> }) {
  const send = usePlayerStore((s) => s.send)
  const ready = view.stage === 'playing'
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <PartStatus artistSolved={view.artistSolved} titleSolved={view.titleSolved} />
      {!ready && <p className="text-2xl font-bold text-indigo-200">{strings.phone.music.getReady}</p>}
      <motion.button
        disabled={!ready}
        whileTap={{ scale: 0.88 }}
        onPointerDown={() => {
          if (!ready) return
          navigator.vibrate?.(60)
          send({ type: 'music-buzz', questionIndex: view.questionIndex })
        }}
        className="aspect-square w-[min(100%,24rem,55dvh)] rounded-full border-b-[14px] border-red-900 bg-gradient-to-b from-red-500 to-red-700 text-7xl font-black tracking-wider shadow-[0_0_60px_rgba(239,68,68,0.6)] select-none active:border-b-4 disabled:opacity-30"
      >
        {strings.phone.music.buzz}
      </motion.button>
    </div>
  )
}

function AnswerForm({ view }: { view: Extract<MusicBuzzerView, { kind: 'buzzer-answer' }> }) {
  const send = usePlayerStore((s) => s.send)
  const t = strings.phone.music
  // Count down from when this screen appeared; phone and host clocks may differ.
  const [shownAt] = useState(() => Date.now())
  const now = useNow(250)
  const [artist, setArtist] = useState('')
  const [title, setTitle] = useState('')
  const [sent, setSent] = useState(false)
  const seconds = Math.max(0, Math.ceil((ANSWER_MS - (now - shownAt)) / 1000))
  const hasText = (view.needArtist && artist.trim()) || (view.needTitle && title.trim())
  const prompt = view.needArtist && view.needTitle ? strings.music.typeBoth : view.needArtist ? strings.music.typeArtist : strings.music.typeTitle

  useEffect(() => {
    navigator.vibrate?.([80, 60, 80])
  }, [])

  const input = (value: string, set: (v: string) => void, label: string, placeholder: string, autoFocus: boolean) => (
    <label className="flex flex-col gap-1">
      <span className="text-lg font-bold">{label}</span>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => set(e.target.value)}
        maxLength={MAX_ANSWER_LENGTH}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="send"
        disabled={sent}
        className="rounded-2xl bg-white px-4 py-3 text-2xl font-bold text-indigo-950 placeholder:text-indigo-300"
      />
    </label>
  )

  return (
    <form
      className="flex flex-1 flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!hasText || sent) return
        setSent(true)
        send({
          type: 'music-buzz-answer',
          questionIndex: view.questionIndex,
          artist: view.needArtist ? artist : '',
          title: view.needTitle ? title : '',
        })
      }}
    >
      <div className="flex items-baseline justify-between">
        <p className="text-3xl font-black text-yellow-300">{t.yourTurn}</p>
        <p className="text-5xl font-black tabular-nums">{t.secondsLeft(seconds)}</p>
      </div>
      <p className="text-xl font-bold">{prompt}</p>
      {view.needArtist && input(artist, setArtist, t.artist, t.artistPlaceholder, true)}
      {view.needTitle && input(title, setTitle, t.title, t.titlePlaceholder, !view.needArtist)}
      <motion.button
        type="submit"
        whileTap={{ scale: 0.95 }}
        disabled={!hasText || sent}
        className="rounded-3xl bg-gradient-to-br from-emerald-600 to-green-700 py-4 text-3xl font-black shadow-xl disabled:opacity-40"
      >
        {t.answer}
      </motion.button>
    </form>
  )
}
