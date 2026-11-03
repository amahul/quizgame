import { AnimatePresence, motion } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { canStart, type Player } from '../game/lobby'
import { strings } from '../i18n'
import { AvatarBadge } from '../ui/AvatarBadge'
import { HostControls } from './HostControls'
import { useHostStore } from './hostStore'
import { estimateMinutes } from '../content/setup'

const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]']

export function HostLobby() {
  const code = useHostStore((s) => s.room!.code)
  const players = useHostStore((s) => s.room!.players)
  const ready = useHostStore((s) => canStart(s.room!))
  const start = useHostStore((s) => s.start)

  const { origin, pathname, host, hostname } = window.location
  const joinUrl = `${origin}${pathname}#/play?room=${code}`
  const displayUrl = `${host}${pathname}`.replace(/\/$/, '')

  return (
    <main className="grid h-dvh grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-12 p-12">
      <HostControls />
      <section className="flex flex-col items-center justify-center gap-6 rounded-[3rem] bg-white/10 p-10 text-center">
        <p className="text-3xl">
          {strings.host.joinAt} <strong className="font-black">{displayUrl}</strong>
        </p>
        <div>
          <p className="text-2xl tracking-widest text-indigo-200 uppercase">{strings.host.roomCode}</p>
          <motion.p
            className="text-[10rem] leading-none font-black tracking-[0.12em]"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', bounce: 0.5 }}
          >
            {code}
          </motion.p>
        </div>
        <div className="rounded-3xl bg-white p-5">
          <QRCodeSVG value={joinUrl} size={260} />
        </div>
        <p className="text-2xl">{strings.host.scanToJoin}</p>
        {LOCAL_HOSTNAMES.includes(hostname) && (
          <p className="rounded-2xl bg-amber-400/20 p-4 text-lg text-amber-100">{strings.host.localhostWarning}</p>
        )}
      </section>

      <section className="flex min-h-0 flex-col gap-8">
        <header className="flex items-baseline justify-between">
          <h2 className="text-6xl font-black">{strings.host.players}</h2>
          <span className="text-5xl font-bold text-indigo-200">{strings.host.playerCount(players.length)}</span>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {players.length === 0 ? (
            <motion.p
              className="pt-24 text-center text-4xl text-indigo-200"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              {strings.host.waitingForPlayers}
            </motion.p>
          ) : (
            <ul className="grid grid-cols-4 gap-6 p-2">
              <AnimatePresence>
                {players.map((p) => (
                  <PlayerTile key={p.id} player={p} />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>

        <SetupSummary />

        <footer className="flex items-center justify-end gap-8">
          {!ready && <span className="text-3xl text-indigo-200">{strings.host.needPlayers}</span>}
          <motion.button
            onClick={start}
            disabled={!ready}
            whileHover={ready ? { scale: 1.05 } : undefined}
            whileTap={ready ? { scale: 0.95 } : undefined}
            className="rounded-3xl bg-gradient-to-br from-emerald-600 to-green-700 px-20 py-6 text-6xl font-black shadow-2xl shadow-green-900/50 disabled:opacity-30"
          >
            {strings.host.start}
          </motion.button>
        </footer>
      </section>
    </main>
  )
}

function PlayerTile({ player }: { player: Player }) {
  const kick = useHostStore((s) => s.kick)
  const label = strings.host.kick(player.name)

  return (
    <motion.li
      layout
      initial={{ scale: 0, opacity: 0, rotate: -15 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: 'spring', bounce: 0.6, duration: 0.6 }}
      className="group relative flex flex-col items-center gap-3 rounded-3xl bg-white/10 p-5"
    >
      <div className={`flex flex-col items-center gap-3 transition ${player.connected ? '' : 'opacity-35 grayscale'}`}>
        <AvatarBadge avatar={player.avatar} size={96} />
        <span className="max-w-full truncate text-3xl font-bold">{player.name}</span>
      </div>
      {!player.connected && <span className="text-xl text-indigo-200">{strings.host.disconnected}</span>}
      <button
        onClick={() => kick(player.id)}
        aria-label={label}
        title={label}
        className="absolute top-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-black/30 opacity-60 transition group-hover:opacity-100 hover:bg-red-600"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </motion.li>
  )
}

/** The chosen rounds, with a way back to the builder. */
function SetupSummary() {
  const setup = useHostStore((s) => s.setup)
  const playerCount = useHostStore((s) => s.room!.players.length)
  const edit = useHostStore((s) => s.editSetup)
  const enabled = setup.rounds.filter((r) => r.enabled)
  const name = setup.preset === 'custom' ? strings.builder.custom : strings.builder.presets[setup.preset].name

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white/5 p-4">
      <span className="text-2xl font-black">{name}</span>
      <span className="text-xl text-yellow-300">
        {strings.builder.minutes(estimateMinutes(setup, Math.max(playerCount, 2)))}
      </span>
      <span className="flex-1 text-lg text-indigo-200">{enabled.map((r) => strings.rounds[r.key].title).join(' · ')}</span>
      <button type="button" onClick={edit} className="rounded-xl bg-white/15 px-4 py-2 text-lg font-bold hover:bg-white/25">
        {strings.builder.edit}
      </button>
    </div>
  )
}
