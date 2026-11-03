import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { unlockAudio } from '../../audio'
import { keepClips, loadClip, MissingLocalFileError, type LoadedClip } from '../../audio/music/library'
import { registerLocalFiles } from '../../audio/music/local'
import { getAnalyser, NeedsGestureError, pauseMusic, playClip } from '../../audio/music/player'
import { useHostStore } from '../../host/hostStore'
import { strings } from '../../i18n'
import { HostButton } from '../../ui/HostButton'
import { FolderInput } from '../../ui/FolderInput'
import { clipElapsed, type Clip, type MusicTrack } from './track'

/** What the audio should be doing, derived from the round state. */
export type DeckMode = 'loading' | 'playing' | 'paused' | 'stopped'

/**
 * Plays the current track on the host, following the round state, preloads the
 * next one, and shows the vinyl + equalizer. Keep it mounted for the whole track,
 * including pauses, so playback can resume where it stopped.
 */
export function MusicDeck({
  index,
  track,
  nextTrack,
  mode,
  clip,
  compact = false,
}: {
  index: number
  track: MusicTrack
  nextTrack: MusicTrack | undefined
  mode: DeckMode
  clip: Clip
  /** Smaller vinyl and equalizer, to leave room for answer options. */
  compact?: boolean
}) {
  const act = useHostStore((s) => s.act)
  // A game pause silences the music and holds back a pending start.
  const gamePaused = useHostStore((s) => s.room?.game?.pausedAt != null)
  const [loaded, setLoaded] = useState<{ id: string; clip: LoadedClip } | null>(null)
  const [problem, setProblem] = useState<'gesture' | 'missing-local' | null>(null)
  const [attempt, setAttempt] = useState(0)
  const clipRef = useRef(clip)
  clipRef.current = clip

  useEffect(() => {
    let cancelled = false
    setLoaded(null)
    loadClip(track)
      .then((loadedClip) => !cancelled && setLoaded({ id: track.id, clip: loadedClip }))
      .catch((err) => {
        if (cancelled) return
        if (err instanceof MissingLocalFileError) setProblem('missing-local')
        else {
          console.warn('[music] could not load', track.artist, track.title, err)
          act({ type: 'music-failed', index })
        }
      })
    return () => {
      cancelled = true
    }
    // track.id identifies the track; the object itself may be recreated.
  }, [track.id, index, attempt, act])

  // Preload the next clip while this one plays, and free older ones.
  useEffect(() => {
    keepClips(nextTrack ? [track.id, nextTrack.id] : [track.id])
    if (nextTrack) loadClip(nextTrack).catch(() => {})
  }, [track.id, nextTrack])

  useEffect(() => {
    if (!loaded || loaded.id !== track.id) return
    if (mode === 'paused' || mode === 'stopped' || gamePaused) {
      pauseMusic()
      return
    }
    let cancelled = false
    const offset = loaded.clip.startOffset + clipElapsed(clipRef.current, Date.now()) / 1000
    playClip(loaded.clip.url, offset)
      .then(() => {
        if (cancelled) return
        setProblem(null)
        if (mode === 'loading') act({ type: 'music-ready', index })
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof NeedsGestureError) setProblem('gesture')
        else act({ type: 'music-failed', index })
      })
    return () => {
      cancelled = true
    }
  }, [loaded, track.id, mode, clip.segmentStartedAt, attempt, index, act, gamePaused])

  useEffect(() => () => pauseMusic(), [])

  const spinning = mode === 'playing' && !gamePaused

  return (
    <div className={`relative flex items-center justify-center ${compact ? 'gap-10' : 'gap-16'}`}>
      <Vinyl spinning={spinning} compact={compact} />
      <Equalizer active={spinning} compact={compact} />

      {(mode === 'loading' || problem) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 rounded-[3rem] bg-indigo-950/80 text-center backdrop-blur">
          {problem === 'gesture' ? (
            <HostButton
              onClick={() => {
                unlockAudio()
                setAttempt((a) => a + 1)
              }}
            >
              {strings.music.startAudio}
            </HostButton>
          ) : problem === 'missing-local' ? (
            <>
              <p className="max-w-3xl text-3xl">{strings.music.missingLocal}</p>
              <FolderInput
                label={strings.music.pickFolderAgain}
                onFiles={(files) => {
                  registerLocalFiles(files)
                  setProblem(null)
                  setAttempt((a) => a + 1)
                }}
              />
            </>
          ) : (
            <motion.p
              className="text-5xl font-bold"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1.4 }}
            >
              {strings.music.loading}
            </motion.p>
          )}
        </div>
      )}
    </div>
  )
}

function Vinyl({ spinning, compact }: { spinning: boolean; compact: boolean }) {
  return (
    <div
      aria-hidden
      className={`relative shrink-0 animate-spin rounded-full shadow-[0_0_80px_rgba(236,72,153,0.35)] ${
        compact ? 'h-36 w-36' : 'h-80 w-80'
      }`}
      style={{
        animationDuration: '1.8s',
        animationPlayState: spinning ? 'running' : 'paused',
        background:
          'repeating-radial-gradient(circle, #111 0px, #111 3px, #222 4px, #111 6px), radial-gradient(circle, #333, #000)',
      }}
    >
      <div className="absolute inset-[34%] rounded-full bg-gradient-to-br from-pink-500 to-amber-400 shadow-inner" />
      <div className="absolute inset-[47%] rounded-full bg-black" />
      <div className="absolute top-[12%] left-[20%] h-1/3 w-2 rotate-[35deg] rounded-full bg-white/10 blur-sm" />
    </div>
  )
}

const BAR_COUNT = 28

/** Live frequency bars from the analyser; falls back to a synthetic dance. */
function Equalizer({ active, compact }: { active: boolean; compact: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    const canvas = canvasRef.current
    const g = canvas?.getContext('2d')
    if (!canvas || !g) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const levels = new Array<number>(BAR_COUNT).fill(0.05)
    const data = new Uint8Array(64)
    let frame = 0

    const draw = (t: number) => {
      const analyser = getAnalyser()
      if (activeRef.current && analyser) analyser.getByteFrequencyData(data)
      const { width, height } = canvas
      g.clearRect(0, 0, width, height)
      const barWidth = width / BAR_COUNT
      for (let i = 0; i < BAR_COUNT; i++) {
        let target = 0.04
        if (activeRef.current) {
          const fromAnalyser = analyser ? data[Math.floor((i / BAR_COUNT) * 48)] / 255 : 0
          const synthetic = reduceMotion ? 0.3 : 0.35 + 0.3 * Math.sin(t / 180 + i * 0.7) * Math.sin(t / 410 + i)
          target = fromAnalyser > 0.02 ? fromAnalyser : synthetic
        }
        // Reduced motion: let the bars drift slowly instead of jumping.
        levels[i] += (target - levels[i]) * (reduceMotion ? 0.03 : 0.3)
        const h = Math.max(6, levels[i] * height)
        const gradient = g.createLinearGradient(0, height, 0, height - h)
        gradient.addColorStop(0, '#ec4899')
        gradient.addColorStop(1, '#fbbf24')
        g.fillStyle = gradient
        g.beginPath()
        g.roundRect(i * barWidth + 4, height - h, barWidth - 8, h, 6)
        g.fill()
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      width={900}
      height={compact ? 140 : 300}
      aria-hidden
      className={`w-[900px] max-w-full ${compact ? 'h-[140px]' : 'h-[300px]'}`}
    />
  )
}
