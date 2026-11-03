// Uppercase letters only, minus I and O, so codes are easy to read off a TV
// across the room and can't be confused with 1 and 0.
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
export const ROOM_CODE_LENGTH = 4

/** Generates a room code. `random` is injectable so tests are deterministic. */
export function generateRoomCode(random: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)]
  }
  return code
}

/** Normalizes what a player typed into a canonical code, or null if it can't be valid. */
export function normalizeRoomCode(input: string): string | null {
  const code = input.trim().toUpperCase()
  if (code.length !== ROOM_CODE_LENGTH) return null
  return [...code].every((c) => ROOM_CODE_ALPHABET.includes(c)) ? code : null
}
