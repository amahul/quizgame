import { useEffect, useState, useSyncExternalStore } from 'react'
import { getVolume, setVolume, subscribeVolume } from '../audio'
import { isPaused } from '../game/game'
import { strings } from '../i18n'
import { AvatarBadge } from '../ui/AvatarBadge'
import { formatScore } from '../ui/format'
import { HelpContent } from '../ui/HelpContent'
import { Overlay } from '../ui/Overlay'
import { useFullscreen } from '../ui/useFullscreen'
import { useHostStore } from './hostStore'

const SKIP_CONFIRM_MS = 3_000
const SCORE_STEPS = [-100, -10, 10, 100]

/**
 * The host's small control bar (top center, the one spot every screen leaves free):
 * fullscreen, pause, skip, scores, volume and help. Faint until hovered so it
 * doesn't distract on the TV.
 */
export function HostControls() {
  const t = strings.controls
  const act = useHostStore((s) => s.act)
  const inGame = useHostStore((s) => Boolean(s.room?.game))
  const inRound = useHostStore((s) => s.room?.game?.stage === 'round')
  const paused = useHostStore((s) => (s.room ? isPaused(s.room) : false))
  const [isFullscreen, toggleFullscreen] = useFullscreen()
  const volume = useSyncExternalStore(subscribeVolume, getVolume)
  const [confirmSkip, setConfirmSkip] = useState(false)
  const [panel, setPanel] = useState<'scores' | 'help' | null>(null)

  const togglePause = () => act({ type: paused ? 'resume' : 'pause' })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey) return
      const key = e.key.toLowerCase()
      if (key === 'f') toggleFullscreen()
      else if (key === 'm') setVolume({ muted: !getVolume().muted })
      else if (key === 'p' && inGame) act({ type: useHostStore.getState().room && isPaused(useHostStore.getState().room!) ? 'resume' : 'pause' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleFullscreen, inGame, act])

  useEffect(() => {
    if (!confirmSkip) return
    const timer = setTimeout(() => setConfirmSkip(false), SKIP_CONFIRM_MS)
    return () => clearTimeout(timer)
  }, [confirmSkip])

  return (
    <>
      <nav
        aria-label={t.label}
        className="fixed top-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-black/30 p-2 opacity-40 backdrop-blur transition-opacity hover:opacity-100 focus-within:opacity-100"
      >
        {inGame && (
          <ControlButton label={paused ? t.resume : t.pause} onClick={togglePause} active={paused}>
            {paused ? '▶' : '⏸'}
          </ControlButton>
        )}
        {inRound && (
          <ControlButton
            label={confirmSkip ? t.skipConfirm : t.skip}
            active={confirmSkip}
            onClick={() => {
              if (!confirmSkip) return setConfirmSkip(true)
              setConfirmSkip(false)
              act({ type: 'skip' })
            }}
          >
            {confirmSkip ? '⏭?' : '⏭'}
          </ControlButton>
        )}
        {inGame && (
          <ControlButton label={t.scores} onClick={() => setPanel('scores')}>
            ±
          </ControlButton>
        )}
        <ControlButton label={volume.muted ? t.unmute : t.mute} onClick={() => setVolume({ muted: !volume.muted })} active={volume.muted}>
          {volume.muted ? '🔇' : '🔊'}
        </ControlButton>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume.volume}
          aria-label={t.volume}
          onChange={(e) => setVolume({ volume: Number(e.target.value), muted: false })}
          className="w-24 accent-yellow-300"
        />
        <ControlButton label={t.help} onClick={() => setPanel('help')}>
          ?
        </ControlButton>
        <ControlButton label={isFullscreen ? t.exitFullscreen : t.fullscreen} onClick={toggleFullscreen}>
          {isFullscreen ? '🗗' : '⛶'}
        </ControlButton>
      </nav>

      {panel === 'scores' && (
        <Overlay title={t.scores} size="large" onClose={() => setPanel(null)}>
          <ScoreEditor />
        </Overlay>
      )}
      {panel === 'help' && (
        <Overlay title={strings.help.title} size="large" onClose={() => setPanel(null)}>
          <HelpContent large forHost />
        </Overlay>
      )}
    </>
  )
}

function ControlButton({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string
  onClick: () => void
  active?: boolean
  children: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-11 min-w-11 items-center justify-center rounded-xl px-2 text-xl font-black ${
        active ? 'bg-yellow-300 text-indigo-950' : 'bg-white/15 hover:bg-white/30'
      }`}
    >
      {children}
    </button>
  )
}

function ScoreEditor() {
  const players = useHostStore((s) => s.room?.players ?? [])
  const act = useHostStore((s) => s.act)
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xl text-indigo-200">{strings.controls.scoresHint}</p>
      <ul className="flex flex-col gap-2">
        {players.map((p) => (
          <li key={p.id} className="flex items-center gap-4 rounded-2xl bg-white/5 p-3">
            <AvatarBadge avatar={p.avatar} size={48} />
            <span className="flex-1 truncate text-2xl font-bold">{p.name}</span>
            <span className="w-24 text-right text-3xl font-black tabular-nums">{formatScore(p.score)}</span>
            {SCORE_STEPS.map((delta) => (
              <button
                key={delta}
                type="button"
                aria-label={`${p.name} ${delta > 0 ? '+' : '−'}${Math.abs(delta)}`}
                onClick={() => act({ type: 'adjust-score', playerId: p.id, delta })}
                className={`w-20 rounded-xl py-2 text-xl font-black ${delta > 0 ? 'bg-emerald-700 hover:bg-emerald-600' : 'bg-rose-700 hover:bg-rose-600'}`}
              >
                {delta > 0 ? `+${delta}` : `−${-delta}`}
              </button>
            ))}
          </li>
        ))}
      </ul>
    </div>
  )
}
