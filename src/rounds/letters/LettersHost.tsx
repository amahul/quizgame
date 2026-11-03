import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { playFlipSound, playRevealSound } from '../../audio'
import type { Player } from '../../game/lobby'
import { useHostStore } from '../../host/hostStore'
import { strings } from '../../i18n'
import type { RoundTitleKey } from '..'
import { AvatarBadge } from '../../ui/AvatarBadge'
import { formatPoints, formatSeconds } from '../../ui/format'
import { HostButton } from '../../ui/HostButton'
import { useNow } from '../../ui/useNow'
import { isHideable, pointsAt, revealedPositions, statusOf, type LettersState } from './logic'

export function LettersHost({
  state,
  players,
  titleKey,
}: {
  state: LettersState
  players: Player[]
  titleKey: RoundTitleKey
}) {
  const act = useHostStore((s) => s.act)
  const now = useNow(200)
  const item = state.items[state.index]
  const playing = state.stage === 'playing'
  const isLast = state.index === state.items.length - 1

  useEffect(() => {
    if (state.revealedCount > 0 && playing) playFlipSound()
  }, [state.revealedCount, playing])

  useEffect(() => {
    if (!playing) playRevealSound(true)
  }, [playing])

  return (
    <main className="flex h-dvh flex-col gap-8 p-12">
      <header className="flex items-baseline justify-between text-3xl text-indigo-200">
        <span className="font-bold">{strings.rounds[titleKey].title}</span>
        <span>{strings.game.questionOf(state.index + 1, state.items.length)}</span>
      </header>

      <motion.div
        key={state.index}
        className="flex flex-col items-center gap-4 text-center"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <span className="rounded-full bg-fuchsia-500/30 px-6 py-2 text-2xl font-bold tracking-widest text-fuchsia-100 uppercase">
          {item.theme}
        </span>
        <h1 className={`leading-tight font-black ${item.prompt.length > 45 ? 'text-5xl' : item.prompt.length > 28 ? 'text-6xl' : 'text-7xl'}`}>
          {item.prompt}
        </h1>
      </motion.div>

      <section className="flex flex-1 items-center justify-center">
        <TileBoard key={state.index} answer={item.answer} state={state} />
      </section>

      <AnimatePresence mode="wait">
        {playing ? (
          <motion.footer key="playing" className="flex items-center justify-between gap-8" exit={{ opacity: 0 }}>
            <ul className="flex flex-wrap gap-4">
              {players.map((p) => (
                <PlayerStatus key={p.id} player={p} status={statusOf(state, p.id)} />
              ))}
            </ul>
            <div className="flex items-center gap-8">
              <motion.span key={pointsAt(state, now)} className="text-5xl font-black text-yellow-300 tabular-nums">
                {strings.letters.pointsNow(pointsAt(state, now))}
              </motion.span>
              <HostButton variant="neutral" onClick={() => act({ type: 'letters-reveal' })}>
                {strings.letters.reveal}
              </HostButton>
            </div>
          </motion.footer>
        ) : (
          <motion.footer
            key="reveal"
            className="flex items-end justify-between gap-8"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Solvers state={state} players={players} />
            <HostButton onClick={() => act({ type: 'letters-next' })}>
              {isLast ? strings.letters.toStandings : strings.letters.next}
            </HostButton>
          </motion.footer>
        )}
      </AnimatePresence>
    </main>
  )
}

/** Tile sizes by answer length, so a whole proverb still fits on one screen. */
const TILE_SIZES = [
  { maxTiles: 18, box: 'h-28 w-20', text: 'text-7xl', gap: 'gap-x-12' },
  { maxTiles: 30, box: 'h-24 w-16', text: 'text-6xl', gap: 'gap-x-10' },
  { maxTiles: Infinity, box: 'h-20 w-14', text: 'text-5xl', gap: 'gap-x-8' },
] as const

type TileSize = (typeof TILE_SIZES)[number]

function TileBoard({ answer, state }: { answer: string; state: LettersState }) {
  const revealed = revealedPositions(state)
  const final = state.stage !== 'playing'
  const size = TILE_SIZES.find((s) => state.flipOrder.length <= s.maxTiles)!
  const words: { char: string; index: number }[][] = [[]]
  ;[...answer].forEach((char, index) => {
    if (char === ' ') words.push([])
    else words[words.length - 1].push({ char, index })
  })

  return (
    <div className={`flex flex-wrap justify-center gap-y-5 ${size.gap}`} style={{ perspective: 800 }}>
      {words.map((word, w) => (
        <div key={w} className="flex gap-2">
          {word.map(({ char, index }) =>
            isHideable(char) ? (
              <Tile key={index} char={char} open={revealed.has(index)} final={final} size={size} />
            ) : (
              <span key={index} className={`self-end font-black ${size.text}`}>
                {char}
              </span>
            ),
          )}
        </div>
      ))}
    </div>
  )
}

function Tile({ char, open, final, size }: { char: string; open: boolean; final: boolean; size: TileSize }) {
  return (
    <div className={`relative ${size.box}`}>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="open"
            initial={{ rotateY: -180, scale: 1.2 }}
            animate={{ rotateY: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            style={{ backfaceVisibility: 'hidden' }}
            className={`absolute inset-0 flex items-center justify-center rounded-2xl font-black uppercase shadow-xl transition-colors duration-500 ${size.text} ${
              final ? 'bg-emerald-400 text-emerald-950' : 'bg-white text-indigo-950'
            }`}
          >
            {char}
          </motion.div>
        ) : (
          <motion.div
            key="closed"
            exit={{ rotateY: 90, transition: { duration: 0.15 } }}
            className="absolute inset-0 rounded-2xl border-b-8 border-indigo-900 bg-gradient-to-b from-indigo-400 to-indigo-600 shadow-xl"
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function PlayerStatus({ player, status }: { player: Player; status: 'open' | 'correct' | 'locked' }) {
  return (
    <motion.li
      animate={status === 'open' ? { opacity: player.connected ? 0.6 : 0.25 } : { opacity: 1, scale: [1, 1.25, 1] }}
      className="relative"
    >
      <div className={status === 'locked' ? 'grayscale' : ''}>
        <AvatarBadge avatar={player.avatar} size={64} />
      </div>
      {status !== 'open' && (
        <span
          aria-hidden
          className={`absolute -right-1 -bottom-1 flex h-8 w-8 items-center justify-center rounded-full text-lg shadow ${
            status === 'correct' ? 'bg-emerald-600' : 'bg-slate-700'
          }`}
        >
          {status === 'correct' ? '✓' : '🔒'}
        </span>
      )}
    </motion.li>
  )
}

/** Who got it, fastest first. */
function Solvers({ state, players }: { state: LettersState; players: Player[] }) {
  const solvers = Object.entries(state.guesses)
    .filter(([, g]) => g.correct)
    .sort(([, a], [, b]) => a.at - b.at)
    .flatMap(([id, guess]) => {
      const player = players.find((p) => p.id === id)
      return player ? [{ player, guess }] : []
    })
  const locked = Object.values(state.guesses).filter((g) => !g.correct).length

  if (solvers.length === 0) {
    return <p className="text-4xl font-bold text-indigo-200">{strings.letters.nobodySolved}</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-2xl tracking-widest text-indigo-200 uppercase">
        {strings.letters.solvedBy}
        {locked > 0 && <span className="ml-4 normal-case">· {strings.letters.lockedCount(locked)}</span>}
      </p>
      <ol className="flex flex-wrap gap-4">
        {solvers.map(({ player, guess }, i) => (
          <motion.li
            key={player.id}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 + i * 0.12, type: 'spring', bounce: 0.5 }}
            className="flex items-center gap-4 rounded-2xl bg-white/10 py-2 pr-6 pl-2"
          >
            <AvatarBadge avatar={player.avatar} size={56} />
            <div>
              <p className="text-2xl font-bold">{player.name}</p>
              <p className="text-xl text-indigo-200 tabular-nums">
                {strings.letters.seconds(formatSeconds(guess.at - state.startedAt))} ·{' '}
                <span className="font-black text-yellow-300">{formatPoints(guess.points)}</span>
              </p>
            </div>
          </motion.li>
        ))}
      </ol>
    </div>
  )
}
