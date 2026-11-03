// Shared, pure building blocks for the music rounds. The round state is the clock:
// the host's audio element follows it (see MusicDeck), not the other way around.
import { matchAnswer } from '../../game/matcher'

/** Deezer previews are 30 s; local files are cut to the same length. */
export const CLIP_MS = 30_000

export type TrackSource =
  | { kind: 'deezer'; deezerId?: number; search?: string }
  /** A file the host picked from their own computer; it never leaves the browser. */
  | { kind: 'local'; fileKey: string }

export interface MusicTrack {
  id: string
  artist: string
  title: string
  artistAliases?: string[]
  titleAliases?: string[]
  /** Release year and region, when known: used to pick believable wrong options. */
  year?: number
  region?: string
  source: TrackSource
}

/** Playback time bookkeeping that survives pauses (buzzes). */
export interface Clip {
  playedMs: number
  /** When the current play segment started; null while loading or paused. */
  segmentStartedAt: number | null
}

export const idleClip: Clip = { playedMs: 0, segmentStartedAt: null }

export function clipElapsed(clip: Clip, now: number): number {
  return clip.playedMs + (clip.segmentStartedAt === null ? 0 : Math.max(0, now - clip.segmentStartedAt))
}

export const startClip = (now: number): Clip => ({ playedMs: 0, segmentStartedAt: now })
export const pauseClip = (clip: Clip, now: number): Clip => ({ playedMs: clipElapsed(clip, now), segmentStartedAt: null })
export const resumeClip = (clip: Clip, now: number): Clip => ({ ...clip, segmentStartedAt: now })
/** After a game pause: the time paused doesn't count as played. */
export const shiftClip = (clip: Clip, ms: number): Clip =>
  clip.segmentStartedAt === null ? clip : { ...clip, segmentStartedAt: clip.segmentStartedAt + ms }

/** Linear from `max` at the start of the clip to `min` at its end. */
export function speedPoints(elapsedMs: number, max: number, min: number, durationMs = CLIP_MS): number {
  const progress = Math.min(1, Math.max(0, elapsedMs / durationMs))
  return Math.round(max - (max - min) * progress)
}

export const matchesArtist = (text: string, track: MusicTrack) =>
  matchAnswer(text, [track.artist, ...(track.artistAliases ?? [])]).correct

export const matchesTitle = (text: string, track: MusicTrack) =>
  matchAnswer(text, [track.title, ...(track.titleAliases ?? [])]).correct

/** Host actions shared by both music rounds. `index` guards against stale callbacks. */
export type MusicPlaybackAction =
  /** The host's audio has started playing the track at `index`. */
  | { type: 'music-ready'; index: number }
  /** The track at `index` could not be loaded; skip it. */
  | { type: 'music-failed'; index: number }
