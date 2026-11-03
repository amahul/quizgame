import { useRef } from 'react'

/** A button that opens the browser's folder picker. Files stay on this computer. */
export function FolderInput({ label, onFiles }: { label: string; onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="rounded-2xl bg-white/15 px-6 py-3 text-2xl font-bold hover:bg-white/25"
      >
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        // Non-standard but supported by Chrome, Edge, Firefox and Safari.
        {...{ webkitdirectory: '' }}
        onChange={(e) => {
          if (e.target.files) onFiles([...e.target.files])
          e.target.value = ''
        }}
      />
    </>
  )
}
