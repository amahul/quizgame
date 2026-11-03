import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { playDrumroll, playFanfare, playIntroSting, playRoundIntro } from '../audio'
import { loadClip } from '../audio/music/library'
import { isFinalRound, standings } from '../game/game'
import type { RoomState } from '../game/lobby'
import { strings } from '../i18n'
import { ClosestHost } from '../rounds/closest/ClosestHost'
import { LettersHost } from '../rounds/letters/LettersHost'
import { BuzzerHost } from '../rounds/music-buzzer/BuzzerHost'
import { MusicRaceHost } from '../rounds/music-race/MusicRaceHost'
import { PassHost } from '../rounds/pass/PassHost'
import { TriviaHost } from '../rounds/trivia/TriviaHost'
import { AvatarBadge } from '../ui/AvatarBadge'
import { formatScore } from '../ui/format'
import { HostButton } from '../ui/HostButton'
import { HostControls } from './HostControls'
import { useHostStore } from './hostStore'

/** Big-screen view once the game has started. */
export function GameScreen() {
  const room = useHostStore((s) => s.room!)
  const game = room.game!

  // Start downloading the first clip of an upcoming music round during the intro/standings.
  const upcoming = game.rounds[game.stage === 'standings' ? game.roundIndex + 1 : game.roundIndex]
  const firstTrack =
    game.stage === 'round' || !upcoming
      ? undefined
      : upcoming.type === 'musicRace'
        ? upcoming.questions[0]?.track
        : upcoming.type === 'musicBuzzer'
          ? upcoming.tracks[0]
          : undefined
  useEffect(() => {
    if (firstTrack) loadClip(firstTrack).catch(() => {})
  }, [firstTrack])

  return (
    <>
      <StageView room={room} />
      <HostControls />
      <AnimatePresence>{game.pausedAt != null && <PauseOverlay />}</AnimatePresence>
    </>
  )
}

function StageView({ room }: { room: RoomState }) {
  const game = room.game!
  switch (game.stage) {
    case 'intro':
      return <RoundIntro room={room} />
    case 'standings':
      return <Standings room={room} />
    case 'round': {
      const round = game.round!
      switch (round.type) {
        case 'trivia':
          return <TriviaHost state={round.state} players={room.players} />
        case 'closest':
          return <ClosestHost state={round.state} players={room.players} />
        case 'pass':
          return <PassHost state={round.state} players={room.players} />
        case 'letters':
          return (
            <LettersHost
              key={game.roundIndex}
              state={round.state}
              players={room.players}
              titleKey={game.rounds[game.roundIndex].titleKey}
            />
          )
        case 'musicRace':
          return <MusicRaceHost state={round.state} players={room.players} />
        case 'musicBuzzer':
          return <BuzzerHost state={round.state} players={room.players} />
      }
    }
  }
}

function PauseOverlay() {
  const act = useHostStore((s) => s.act)
  return (
    <motion.div
      className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-10 bg-indigo-950/90 text-center backdrop-blur"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <p aria-hidden className="text-9xl">⏸</p>
      <h1 className="text-9xl font-black">{strings.controls.paused}</h1>
      <p className="text-4xl text-indigo-200">{strings.controls.pausedHint}</p>
      <HostButton onClick={() => act({ type: 'resume' })}>{strings.controls.resumeButton}</HostButton>
    </motion.div>
  )
}

function RoundIntro({ room }: { room: RoomState }) {
  const act = useHostStore((s) => s.act)
  const game = room.game!
  const { title, rules } = strings.rounds[game.rounds[game.roundIndex].titleKey]

  // The big sting opens the game; later rounds get a shorter "ta-da".
  useEffect(() => {
    if (game.roundIndex === 0) playIntroSting()
    else playRoundIntro()
  }, [game.roundIndex])

  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-12 p-16 text-center">
      <motion.p className="text-4xl text-indigo-200" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        {strings.game.roundOf(game.roundIndex + 1, game.rounds.length)}
      </motion.p>
      <motion.h1
        key={game.roundIndex}
        className="text-[10rem] leading-none font-black drop-shadow-2xl"
        initial={{ scale: 0.2, rotate: -8, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.55, duration: 0.9 }}
      >
        {title}
      </motion.h1>
      <motion.p
        className="max-w-5xl text-4xl leading-snug"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        {rules}
      </motion.p>
      <HostButton onClick={() => act({ type: 'continue' })}>{strings.game.letsGo}</HostButton>
    </main>
  )
}

/** Drumroll before the winner is shown, then the fanfare. */
const WINNER_DRUMROLL_S = 1.6

function Standings({ room }: { room: RoomState }) {
  const act = useHostStore((s) => s.act)
  const final = isFinalRound(room.game!)
  const rows = standings(room.players)
  // Ten players have to fit on one screen.
  const compact = rows.length > 7

  useEffect(() => {
    if (!final) return
    playDrumroll(WINNER_DRUMROLL_S)
    const timer = setTimeout(playFanfare, WINNER_DRUMROLL_S * 1000)
    return () => clearTimeout(timer)
  }, [final])

  return (
    <main className="flex h-dvh flex-col items-center gap-8 px-12 pt-20 pb-12">
      <h1 className="text-8xl font-black">{final ? strings.game.finalStandings : strings.game.standings}</h1>
      {final && rows[0] && (
        <motion.p
          className="text-6xl font-black text-yellow-300"
          initial={{ scale: 0 }}
          animate={{ scale: [0, 1.2, 1] }}
          transition={{ delay: WINNER_DRUMROLL_S }}
        >
          👑 {strings.game.winner(rows[0].player.name)}
        </motion.p>
      )}
      <ol className={`flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-y-auto ${compact ? 'gap-2' : 'gap-3'}`}>
        {rows.map(({ player, rank }, i) => (
          <motion.li
            key={player.id}
            layout
            initial={{ opacity: 0, x: -60 }}
            animate={{ opacity: player.connected ? 1 : 0.5, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className={`flex items-center gap-6 rounded-3xl px-8 ${compact ? 'py-1.5' : 'py-3'} ${
              rank === 1 ? 'bg-yellow-400/25 ring-2 ring-yellow-300' : 'bg-white/10'
            }`}
          >
            <span className={`w-16 font-black text-indigo-200 ${compact ? 'text-4xl' : 'text-5xl'}`}>{rank}</span>
            <AvatarBadge avatar={player.avatar} size={compact ? 48 : 64} />
            <span className={`flex-1 truncate font-bold ${compact ? 'text-3xl' : 'text-4xl'}`}>{player.name}</span>
            <span className={`font-black tabular-nums ${compact ? 'text-4xl' : 'text-5xl'}`}>{formatScore(player.score)}</span>
          </motion.li>
        ))}
      </ol>
      {!final && <HostButton onClick={() => act({ type: 'continue' })}>{strings.game.nextRound}</HostButton>}
    </main>
  )
}
