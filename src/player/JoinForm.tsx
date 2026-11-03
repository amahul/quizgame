import { motion } from 'framer-motion'
import { AVATAR_COLORS, AVATAR_EMOJIS, type AvatarColor } from '../game/avatars'
import { MAX_NAME_LENGTH } from '../game/lobby'
import { ROOM_CODE_LENGTH } from '../game/roomCode'
import { strings } from '../i18n'
import { AvatarBadge } from '../ui/AvatarBadge'
import { usePlayerStore } from './playerStore'

const COLOR_IDS = Object.keys(AVATAR_COLORS) as AvatarColor[]

export function JoinForm() {
  const draft = usePlayerStore((s) => s.draft)
  const error = usePlayerStore((s) => s.error)
  const setDraft = usePlayerStore((s) => s.setDraft)
  const join = usePlayerStore((s) => s.join)

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        join()
      }}
    >
      {error && (
        <motion.p
          role="alert"
          initial={{ x: -8 }}
          animate={{ x: [8, -6, 4, 0] }}
          className="mr-12 rounded-2xl bg-red-700 px-4 py-3 text-lg font-bold"
        >
          {strings.player.errors[error]}
        </motion.p>
      )}

      <div className="flex justify-center">
        <motion.div key={draft.avatar.emoji + draft.avatar.color} initial={{ scale: 0.7 }} animate={{ scale: 1 }}>
          <AvatarBadge avatar={draft.avatar} size={96} />
        </motion.div>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-lg font-bold">{strings.player.roomCode}</span>
        <input
          value={draft.roomCode}
          onChange={(e) => setDraft({ roomCode: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })}
          placeholder={strings.player.roomCodePlaceholder}
          maxLength={ROOM_CODE_LENGTH}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="rounded-2xl bg-white px-4 py-4 text-center text-4xl font-black tracking-[0.4em] text-indigo-950 uppercase placeholder:text-indigo-200"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-lg font-bold">{strings.player.nickname}</span>
        <input
          value={draft.name}
          onChange={(e) => setDraft({ name: e.target.value })}
          placeholder={strings.player.nicknamePlaceholder}
          maxLength={MAX_NAME_LENGTH * 2}
          autoComplete="nickname"
          enterKeyHint="go"
          className="rounded-2xl bg-white px-4 py-4 text-2xl font-bold text-indigo-950 placeholder:text-indigo-300"
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-lg font-bold">{strings.player.pickAvatar}</legend>
        <div className="grid grid-cols-8 gap-1.5">
          {AVATAR_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-pressed={draft.avatar.emoji === emoji}
              onClick={() => setDraft({ avatar: { ...draft.avatar, emoji } })}
              className={`aspect-square rounded-xl text-2xl transition active:scale-90 ${
                draft.avatar.emoji === emoji ? 'bg-white/40 ring-2 ring-white' : 'bg-white/10'
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-lg font-bold">{strings.player.pickColor}</legend>
        <div className="grid grid-cols-8 gap-1.5">
          {COLOR_IDS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={strings.avatarColors[color]}
              aria-pressed={draft.avatar.color === color}
              onClick={() => setDraft({ avatar: { ...draft.avatar, color } })}
              style={{ backgroundColor: AVATAR_COLORS[color] }}
              className={`aspect-square rounded-full transition active:scale-90 ${
                draft.avatar.color === color ? 'ring-4 ring-white' : ''
              }`}
            />
          ))}
        </div>
      </fieldset>

      <motion.button
        type="submit"
        whileTap={{ scale: 0.95 }}
        className="rounded-3xl bg-gradient-to-br from-amber-300 to-orange-400 text-orange-950 py-5 text-3xl font-black shadow-2xl shadow-orange-900/50"
      >
        {strings.player.join}
      </motion.button>
    </form>
  )
}
