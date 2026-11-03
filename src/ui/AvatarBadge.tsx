import { AVATAR_COLORS, type Avatar } from '../game/avatars'

export function AvatarBadge({ avatar, size }: { avatar: Avatar; size: number }) {
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full shadow-lg ring-4 ring-white/20"
      style={{ backgroundColor: AVATAR_COLORS[avatar.color], width: size, height: size, fontSize: size * 0.55 }}
    >
      {avatar.emoji}
    </div>
  )
}
