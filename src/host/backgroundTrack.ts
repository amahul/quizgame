// Which background tune the big screen should play right now, if any. Pure, so the
// rules can be tested: the lobby tune while waiting for players, the question tune
// while people are answering in the first three rounds, and silence everywhere
// else (intros and standings have jingles, music rounds have their own music, and
// a reveal has its drumroll).
import type { BackgroundTrack } from '../audio/backgroundMusic'
import type { RoomState } from '../game/lobby'

export function backgroundTrackFor(room: RoomState | null, building: boolean): BackgroundTrack | null {
  if (!room || building) return null
  const { game } = room
  if (!game) return room.phase === 'lobby' ? 'lobby' : null
  if (game.pausedAt != null || game.stage !== 'round' || !game.round) return null
  const { round } = game
  switch (round.type) {
    case 'trivia':
    case 'closest':
      return round.state.stage === 'question' && round.state.revealAt === null ? 'question' : null
    case 'pass':
      return round.state.stage === 'choosing' || round.state.stage === 'answering' ? 'question' : null
    default:
      return null
  }
}
