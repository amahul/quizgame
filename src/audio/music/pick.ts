// Pure helpers for finding tracks: choosing the right Deezer search hit and reading
// "Artist - Title" from a local file name.
import { normalizeAnswer } from '../../game/matcher'

export interface DeezerTrack {
  id: number
  title: string
  preview: string
  rank?: number
  artist: { name: string }
}

/** Versions we never want when the pack asks for the plain song. */
const ALTERNATE_VERSION = /\b(live|acoustic|unplugged|remix|karaoke|instrumental|cover|tribute|demo)\b/i

const compact = (s: string) => normalizeAnswer(s).replaceAll(' ', '')

/**
 * The best search hit for artist + title: same artist, a title that contains the
 * wanted one, not a live/acoustic/remix version, most popular first.
 */
export function pickBestTrack(results: readonly DeezerTrack[], artist: string, title: string): DeezerTrack | null {
  const wantedArtist = compact(artist)
  const wantedTitle = compact(title)
  const candidates = results.filter(
    (t) =>
      t.preview &&
      compact(t.artist.name) === wantedArtist &&
      compact(t.title).includes(wantedTitle) &&
      (ALTERNATE_VERSION.test(title) || !ALTERNATE_VERSION.test(t.title)),
  )
  if (candidates.length === 0) return null
  return candidates.reduce((best, t) => ((t.rank ?? 0) > (best.rank ?? 0) ? t : best))
}

const AUDIO_FILE = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i

export const isAudioFileName = (name: string) => AUDIO_FILE.test(name)

/** Reads "Artist - Title.mp3" (optionally with a leading track number). Null if it doesn't fit. */
export function parseTrackFileName(fileName: string): { artist: string; title: string } | null {
  const base = fileName
    .replace(/^.*[\\/]/, '')
    .replace(AUDIO_FILE, '')
    .replaceAll('_', ' ')
    // A track number needs a separator ("01. ", "01) ", "01 - "), so "50 Cent" survives.
    .replace(/^\d{1,3}(\s*[.)]\s*|\s+[-–]\s+)/, '')
  const separator = base.search(/\s[-–]\s/)
  if (separator < 0) return null
  const artist = base.slice(0, separator).trim()
  const title = base.slice(separator + 3).trim()
  return artist && title ? { artist, title } : null
}
