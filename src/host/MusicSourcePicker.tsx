import { strings } from '../i18n'
import { FolderInput } from '../ui/FolderInput'
import { useHostStore, type MusicSource } from './hostStore'

/** Lobby setting: Deezer previews or the host's own music folder. */
export function MusicSourcePicker() {
  const source = useHostStore((s) => s.musicSource)
  const tracks = useHostStore((s) => s.localTracks)
  const skipped = useHostStore((s) => s.localSkipped)
  const setSource = useHostStore((s) => s.setMusicSource)
  const setFiles = useHostStore((s) => s.setLocalFiles)
  const t = strings.music.source

  const option = (value: MusicSource, label: string) => (
    <button
      type="button"
      aria-pressed={source === value}
      onClick={() => setSource(value)}
      className={`rounded-xl px-4 py-2 text-xl font-bold ${source === value ? 'bg-white text-indigo-950' : 'bg-white/10'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xl text-indigo-200">🎵 {t.heading}</span>
        {option('deezer', t.deezer)}
        {option('local', t.local)}
        {source === 'local' && <FolderInput label={t.pickFolder} onFiles={setFiles} />}
      </div>
      {source === 'local' && (
        <p className="text-lg text-indigo-200">
          {tracks.length > 0 ? t.found(tracks.length) : t.noneFound}
          {skipped > 0 && ` · ${t.skipped(skipped)}`} · {t.privacy}
        </p>
      )}
    </div>
  )
}
