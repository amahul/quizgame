import { useEffect, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { unlockAudio } from '../audio'
import { getHashParam } from '../app/router'
import { strings } from '../i18n'
import { HostButton } from '../ui/HostButton'
import { useWakeLock } from '../ui/useWakeLock'
import { GameBuilder } from './GameBuilder'
import { GameScreen } from './GameScreen'
import { TestModeHotspot } from './TestModeHotspot'
import { HostLobby } from './HostLobby'
import { useHostStore } from './hostStore'

// Big-screen UI: 16:9, readable from across the room.
export function HostScreen() {
  return (
    <>
      <HostContent />
      <TestModeHotspot />
    </>
  )
}

function HostContent() {
  const status = useHostStore((s) => s.status)
  const hasGame = useHostStore((s) => Boolean(s.room?.game))
  const building = useHostStore((s) => s.building)
  const open = useHostStore((s) => s.open)
  const setBotCount = useHostStore((s) => s.setBotCount)

  // Dev only: #/host?bots=8 adds fake players for testing alone.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const bots = Number(getHashParam('bots'))
    if (bots > 0) setBotCount(Math.min(15, Math.floor(bots)))
  }, [setBotCount])

  // The room opens once the host leaves the builder (or right away after a reload mid-game).
  useEffect(() => {
    if (!building) void open()
  }, [building, open])

  // The host computer must not sleep during the party.
  useWakeLock(status === 'open')

  // After a reload there was no click to unlock audio, so take the first one.
  useEffect(() => {
    window.addEventListener('pointerdown', unlockAudio, { once: true })
    return () => window.removeEventListener('pointerdown', unlockAudio)
  }, [])

  if (building && !hasGame) return <GameBuilder />

  if (status === 'error') {
    return (
      <Centered>
        <p aria-hidden className="text-8xl">📡</p>
        <h1 className="text-6xl font-black">{strings.host.errorTitle}</h1>
        <p className="max-w-4xl text-3xl leading-snug text-indigo-100">{strings.host.errorBody}</p>
        <p className="max-w-4xl text-2xl text-indigo-200">{strings.host.errorTips}</p>
        <HostButton onClick={() => void open()}>{strings.host.retry}</HostButton>
      </Centered>
    )
  }

  if (status !== 'open') {
    return (
      <Centered>
        <motion.p
          className="text-5xl font-bold"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ repeat: Infinity, duration: 1.6 }}
        >
          {strings.host.creatingRoom}
        </motion.p>
      </Centered>
    )
  }

  return hasGame ? <GameScreen /> : <HostLobby />
}

function Centered({ children }: { children: ReactNode }) {
  return <main className="flex h-dvh flex-col items-center justify-center gap-10 p-12 text-center">{children}</main>
}
