import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { playBuzzSound, playRevealSound } from '../../audio'
import type { Player } from '../../game/lobby'
import { useHostStore } from '../../host/hostStore'
import { strings } from '../../i18n'
import { AvatarBadge } from '../../ui/AvatarBadge'
import { formatPoints } from '../../ui/format'
import { HostButton } from '../../ui/HostButton'
import { useNow } from '../../ui/useNow'
import { TrackCard } from '../music-race/MusicRaceHost'
import { MusicDeck, type DeckMode } from '../music/MusicDeck'
import { clipElapsed } from '../music/track'
import { ANSWER_MS, attemptPoints, BUZZER_CLIP_MS, type MusicBuzzerState } from './logic'

const deckMode: Record<MusicBuzzerState['stage'], DeckMode> = {
  loading: 'loading',
  playing: 'playing',
  buzzed: 'paused',
  reveal: 'stopped',
  done: 'stopped',
}

export function BuzzerHost({ state, players }: { state: MusicBuzzerState; players: Player[] }) {
  const act = useHostStore((s) => s.act)
  const now = useNow(200)
  const track = state.tracks[state.index]
  const byId = (id: string | null) => players.find((p) => p.id === id)
  const buzzer = byId(state.buzzerId)
  const revealed = state.stage === 'reveal'
  const isLast = state.index === state.tracks.length - 1
  const anySolved = state.solvedBy.artist !== null || state.solvedBy.title !== null

  useEffect(() => {
    if (state.buzzedAt) playBuzzSound()
  }, [state.buzzedAt])

  useEffect(() => {
    if (revealed) playRevealSound(anySolved)
  }, [revealed, anySolved])

  return (
    <main className="relative flex h-dvh flex-col gap-8 p-12">
      <header className="flex items-baseline justify-between text-3xl text-indigo-200">
        <span className="font-bold">{strings.rounds.musicBuzzer.title}</span>
        <span>{strings.music.trackOf(state.index + 1, state.tracks.length)}</span>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-8">
        {revealed ? (
          <>
            <TrackCard artist={track.artist} title={track.title} />
            {!anySolved && <p className="text-5xl font-black text-yellow-300">{strings.music.nobodyAnswered}</p>}
          </>
        ) : (
          <>
            <MusicDeck
              index={state.index}
              track={track}
              nextTrack={state.tracks[state.index + 1]}
              mode={deckMode[state.stage]}
              clip={state.clip}
            />
            {state.stage === 'playing' && (
              <p className="text-4xl font-bold">
                {strings.music.buzzNow} ·{' '}
                <span className="text-yellow-300 tabular-nums">
                  {strings.music.secondsLeft(Math.max(0, Math.ceil((BUZZER_CLIP_MS - clipElapsed(state.clip, now)) / 1000)))}
                </span>
              </p>
            )}
          </>
        )}
        <SolvedParts state={state} players={players} revealed={revealed} />
      </section>

      <footer className="flex items-end justify-between gap-8">
        <ul className="flex flex-wrap gap-4">
          {players.map((p) => {
            const attempt = state.attempts.find((a) => a.playerId === p.id)
            return (
              <li key={p.id} className={`flex items-center gap-3 rounded-2xl bg-white/10 py-2 pr-4 pl-2 ${p.connected ? '' : 'opacity-40'}`}>
                <div className={`relative ${attempt ? 'grayscale-[60%]' : ''}`}>
                  <AvatarBadge avatar={p.avatar} size={56} />
                  {attempt && (
                    <span aria-hidden className="absolute -right-1 -bottom-1 text-xl">
                      🔒
                    </span>
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="max-w-40 truncate text-xl font-bold">{p.name}</span>
                  {attempt && (
                    <span className={`text-lg font-black ${attemptPoints(attempt) > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {formatPoints(attemptPoints(attempt))}
                      {!attempt.artist && !attempt.title && !attempt.artistCorrect && !attempt.titleCorrect && (
                        <span className="ml-2 font-normal">({strings.music.timedOut})</span>
                      )}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        {revealed ? (
          <HostButton onClick={() => act({ type: 'music-next' })}>{isLast ? strings.music.toStandings : strings.music.next}</HostButton>
        ) : (
          state.stage !== 'buzzed' && (
            <HostButton variant="neutral" onClick={() => act({ type: 'music-reveal' })}>
              {strings.music.reveal}
            </HostButton>
          )
        )}
      </footer>

      <AnimatePresence>
        {state.stage === 'buzzed' && buzzer && state.buzzedAt && (
          <BuzzedOverlay
            key={state.buzzedAt}
            player={buzzer}
            msLeft={ANSWER_MS - (now - state.buzzedAt)}
            needArtist={state.solvedBy.artist === null}
            needTitle={state.solvedBy.title === null}
            onJudge={(artist, title) => act({ type: 'music-judge', artist, title })}
          />
        )}
      </AnimatePresence>
    </main>
  )
}

/** Artist and title: "???" while open, the answer and who solved it once solved. */
function SolvedParts({ state, players, revealed }: { state: MusicBuzzerState; players: Player[]; revealed: boolean }) {
  const track = state.tracks[state.index]
  const parts = [
    { label: strings.music.artist, solver: state.solvedBy.artist, value: track.artist },
    { label: strings.music.title, solver: state.solvedBy.title, value: track.title },
  ]
  return (
    <div className="flex gap-6">
      {parts.map(({ label, solver, value }) => {
        const who = players.find((p) => p.id === solver)
        const shown = solver !== null || revealed
        return (
          <motion.div
            key={label}
            animate={solver ? { scale: [1, 1.12, 1] } : {}}
            className={`flex items-center gap-4 rounded-3xl px-8 py-4 text-3xl ${solver ? 'bg-emerald-700' : 'bg-white/10'}`}
          >
            <span className="text-indigo-100">{label}:</span>
            <span className="font-black">{shown ? value : strings.music.unsolved}</span>
            {solver && <span aria-hidden>✓</span>}
            {who && <span className="text-2xl text-emerald-100">{strings.music.solvedBy(who.name)}</span>}
          </motion.div>
        )
      })}
    </div>
  )
}

function BuzzedOverlay({
  player,
  msLeft,
  needArtist,
  needTitle,
  onJudge,
}: {
  player: Player
  msLeft: number
  needArtist: boolean
  needTitle: boolean
  onJudge: (artist: boolean, title: boolean) => void
}) {
  const seconds = Math.max(0, Math.ceil(msLeft / 1000))
  const fraction = Math.max(0, Math.min(1, msLeft / ANSWER_MS))
  const circumference = 2 * Math.PI * 190
  const prompt = needArtist && needTitle ? strings.music.typeBoth : needArtist ? strings.music.typeArtist : strings.music.typeTitle
  const j = strings.music.judge

  return (
    <motion.div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-7 bg-red-950/85 backdrop-blur"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="relative flex items-center justify-center"
        initial={{ scale: 0.2, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', bounce: 0.6 }}
      >
        <svg viewBox="0 0 400 400" className="absolute h-[380px] w-[380px] -rotate-90" aria-hidden>
          <circle cx="200" cy="200" r="190" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="14" />
          <circle
            cx="200"
            cy="200"
            r="190"
            fill="none"
            stroke="#facc15"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - fraction)}
          />
        </svg>
        <AvatarBadge avatar={player.avatar} size={300} />
      </motion.div>
      <p className="text-8xl font-black">{strings.music.answers(player.name)}</p>
      <p className="text-4xl text-red-100">
        {prompt} · <span className="font-black text-yellow-300 tabular-nums">{seconds} s</span>
      </p>
      <div className="flex gap-5">
        {needArtist && needTitle ? (
          <>
            <HostButton variant="danger" onClick={() => onJudge(false, false)}>
              {j.none}
            </HostButton>
            <HostButton variant="neutral" onClick={() => onJudge(true, false)}>
              {j.artist}
            </HostButton>
            <HostButton variant="neutral" onClick={() => onJudge(false, true)}>
              {j.title}
            </HostButton>
            <HostButton onClick={() => onJudge(true, true)}>{j.both}</HostButton>
          </>
        ) : (
          <>
            <HostButton variant="danger" onClick={() => onJudge(false, false)}>
              {j.wrong}
            </HostButton>
            <HostButton onClick={() => onJudge(needArtist, needTitle)}>{j.right}</HostButton>
          </>
        )}
      </div>
    </motion.div>
  )
}
