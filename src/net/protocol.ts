// Wire protocol between host and players. Every message is a plain JSON object
// discriminated by its `type` field. Phones only send intents; the host decides
// what happens and sends each phone the screen it should show.
import { isValidAvatar, type Avatar } from '../game/avatars'
import type { PhoneView } from '../game/game'
import type { JoinRejection, Phase, PlayerView } from '../game/lobby'
import { ROUNDS, type RoundIntent } from '../rounds'

/** Phone → host. Intents only: "I want to…", never "this happened". */
export type ClientMessage =
  /** Join, or rejoin after a dropped connection: a known playerId resumes its player. */
  | { type: 'join'; playerId: string; name: string; avatar: Avatar }
  | { type: 'ping' }
  /** Round-specific intents, e.g. 'trivia-answer'. Defined in src/rounds/<type>/logic.ts. */
  | RoundIntent

/** Host → phone. The host is the single source of truth. */
export type HostMessage =
  | { type: 'welcome'; player: PlayerView; phase: Phase; resumed: boolean }
  | { type: 'rejected'; reason: JoinRejection }
  | { type: 'kicked' }
  /** The same playerId connected from another tab or device; this connection is closed. */
  | { type: 'replaced' }
  /** What this phone should show now, plus its current score. Sent whenever either changes. */
  | { type: 'view'; view: PhoneView; score: number }
  | { type: 'pong' }

const PLAYER_ID = /^[a-z0-9-]{1,64}$/i
const MAX_RAW_NAME_LENGTH = 64

/** Validates untrusted data from a phone. Returns null for anything malformed. */
export function parseClientMessage(data: unknown): ClientMessage | null {
  if (typeof data !== 'object' || data === null) return null
  const msg = data as Record<string, unknown>
  switch (msg.type) {
    case 'join': {
      const { playerId, name, avatar } = msg
      if (typeof playerId !== 'string' || !PLAYER_ID.test(playerId)) return null
      if (typeof name !== 'string' || name.length > MAX_RAW_NAME_LENGTH) return null
      if (!isValidAvatar(avatar)) return null
      return { type: 'join', playerId, name, avatar: { emoji: avatar.emoji, color: avatar.color } }
    }
    case 'ping':
      return { type: 'ping' }
    default:
      for (const round of Object.values(ROUNDS)) {
        const intent = round.parseIntent(msg) as RoundIntent | null
        if (intent) return intent
      }
      return null
  }
}
