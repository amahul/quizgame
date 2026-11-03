// "Lokal musik": audio files the host picks from their own computer. They are only
// ever held in memory as File objects and played via object URLs — never uploaded,
// sent to phones or stored.
import type { MusicTrack } from '../../rounds/music/track'
import { isAudioFileName, parseTrackFileName } from './pick'

const files = new Map<string, File>()

export interface LocalScan {
  tracks: MusicTrack[]
  /** Audio files whose names aren't "Artist - Title". */
  skipped: number
}

/** Registers the files from a folder picker and turns usable ones into tracks. */
export function registerLocalFiles(list: Iterable<File>): LocalScan {
  const tracks: MusicTrack[] = []
  let skipped = 0
  for (const file of list) {
    if (!isAudioFileName(file.name)) continue
    const parsed = parseTrackFileName(file.name)
    if (!parsed) {
      skipped++
      continue
    }
    const key = file.webkitRelativePath || file.name
    files.set(key, file)
    tracks.push({ id: `local:${key}`, ...parsed, source: { kind: 'local', fileKey: key } })
  }
  return { tracks, skipped }
}

export function getLocalFile(key: string): File | undefined {
  return files.get(key)
}
