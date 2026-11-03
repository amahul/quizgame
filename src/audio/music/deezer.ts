// Deezer's public API (no login). The API has no CORS headers, so lookups use JSONP;
// the preview MP3s are served with `Access-Control-Allow-Origin: *`, so those are
// fetched normally. Preview URLs are signed and expire, so they're looked up per game.
import type { MusicTrack } from '../../rounds/music/track'
import { pickBestTrack, type DeezerTrack } from './pick'

const API = 'https://api.deezer.com'
const JSONP_TIMEOUT_MS = 8_000

let callbackCounter = 0

function jsonp<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const name = `__quizgameDeezer${++callbackCounter}`
    const script = document.createElement('script')
    const callbacks = window as unknown as Record<string, unknown>
    const cleanup = () => {
      clearTimeout(timer)
      delete callbacks[name]
      script.remove()
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Deezer timeout'))
    }, JSONP_TIMEOUT_MS)
    callbacks[name] = (data: T & { error?: unknown }) => {
      cleanup()
      if (data && typeof data === 'object' && 'error' in data) reject(new Error('Deezer error'))
      else resolve(data)
    }
    script.onerror = () => {
      cleanup()
      reject(new Error('Deezer unreachable'))
    }
    script.src = `${url}${url.includes('?') ? '&' : '?'}output=jsonp&callback=${name}`
    document.head.appendChild(script)
  })
}

/** Finds a fresh preview URL: by track ID if the pack has one, otherwise by search. */
export async function deezerPreviewUrl(track: MusicTrack): Promise<string> {
  if (track.source.kind !== 'deezer') throw new Error('not a Deezer track')
  const { deezerId, search } = track.source
  if (deezerId) {
    try {
      const found = await jsonp<DeezerTrack>(`${API}/track/${deezerId}`)
      if (found.preview) return found.preview
    } catch {
      // Fall through to search: IDs can disappear when licensing changes.
    }
  }
  const query = encodeURIComponent(search ?? `${track.artist} ${track.title}`)
  const results = await jsonp<{ data: DeezerTrack[] }>(`${API}/search?q=${query}&limit=15`)
  const best = pickBestTrack(results.data ?? [], track.artist, track.title)
  if (!best) throw new Error(`No Deezer preview for ${track.artist} – ${track.title}`)
  return best.preview
}
