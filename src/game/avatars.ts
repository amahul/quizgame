export const AVATAR_EMOJIS = [
  '🦊', '🐼', '🐸', '🐙', '🦄', '🐯', '🐨', '🐵',
  '🦁', '🐧', '🐢', '🦖', '🐝', '🦉', '🐳', '🦩',
] as const

export const AVATAR_COLORS = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  teal: '#14b8a6',
  blue: '#3b82f6',
  purple: '#a855f7',
  pink: '#ec4899',
} as const

export type AvatarColor = keyof typeof AVATAR_COLORS

export interface Avatar {
  emoji: string
  color: AvatarColor
}

export function isValidAvatar(value: unknown): value is Avatar {
  if (typeof value !== 'object' || value === null) return false
  const { emoji, color } = value as Record<string, unknown>
  return (
    typeof emoji === 'string' &&
    (AVATAR_EMOJIS as readonly string[]).includes(emoji) &&
    typeof color === 'string' &&
    Object.hasOwn(AVATAR_COLORS, color)
  )
}

export function randomAvatar(random: () => number = Math.random): Avatar {
  const colors = Object.keys(AVATAR_COLORS) as AvatarColor[]
  return {
    emoji: AVATAR_EMOJIS[Math.floor(random() * AVATAR_EMOJIS.length)],
    color: colors[Math.floor(random() * colors.length)],
  }
}
