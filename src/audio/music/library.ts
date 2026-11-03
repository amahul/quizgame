// Loads clips ahead of time so a question can start without delay. Each clip is a
// fully downloaded object URL plus where in the file the 30 s excerpt starts.
import { CLIP_MS, type MusicTrack } from '../../rounds/music/track'
import { deezerPreviewUrl } from './deezer'
import { getLocalFile } from './local'

export interface LoadedClip {
  url: string
  /** Seconds into the file where the clip starts. */
  startOffset: number
}

/** A local track whose file isn't available (e.g. the host page was reloaded). */
export class MissingLocalFileError extends Error {
  constructor() {
    super('Local music file not available')
    this.name = 'MissingLocalFileError'
  }
}

const cache = new Map<string, Promise<LoadedClip>>()

function probeDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const probe = new Audio()
    probe.preload = 'metadata'
    probe.onloadedmetadata = () => resolve(Number.isFinite(probe.duration) ? probe.duration : 0)
    probe.onerror = () => resolve(0)
    probe.src = url
  })
}

async function load(track: MusicTrack): Promise<LoadedClip> {
  if (track.source.kind === 'local') {
    const file = getLocalFile(track.source.fileKey)
    if (!file) throw new MissingLocalFileError()
    const url = URL.createObjectURL(file)
    // Skip the intro of full-length songs; short files play from the start.
    const duration = await probeDuration(url)
    const clipSeconds = CLIP_MS / 1000
    return { url, startOffset: duration >= clipSeconds * 2 ? Math.min(30, duration - clipSeconds) : 0 }
  }
  const response = await fetch(await deezerPreviewUrl(track))
  if (!response.ok) throw new Error(`Preview download failed (${response.status})`)
  return { url: URL.createObjectURL(await response.blob()), startOffset: 0 }
}

/** Starts (or reuses) loading a track. Failed loads are forgotten so they can be retried. */
export function loadClip(track: MusicTrack): Promise<LoadedClip> {
  let pending = cache.get(track.id)
  if (!pending) {
    pending = load(track)
    cache.set(track.id, pending)
    pending.catch(() => cache.delete(track.id))
  }
  return pending
}

/** Frees every cached clip except the given tracks. */
export function keepClips(trackIds: readonly string[]): void {
  for (const [id, pending] of cache) {
    if (trackIds.includes(id)) continue
    cache.delete(id)
    pending.then((clip) => URL.revokeObjectURL(clip.url)).catch(() => {})
  }
}
