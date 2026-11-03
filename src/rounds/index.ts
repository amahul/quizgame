// Registry of round types. To add one: create src/rounds/<type>/logic.ts implementing
// RoundDefinition, then add it to every union below and to ROUNDS.
import type { RoundDefinition } from '../game/round'
import {
  closest,
  type ClosestAction,
  type ClosestIntent,
  type ClosestSetup,
  type ClosestState,
  type ClosestView,
} from './closest/logic'
import {
  letters,
  type LettersAction,
  type LettersIntent,
  type LettersSetup,
  type LettersState,
  type LettersView,
} from './letters/logic'
import {
  musicBuzzer,
  type MusicBuzzerAction,
  type MusicBuzzerIntent,
  type MusicBuzzerSetup,
  type MusicBuzzerState,
  type MusicBuzzerView,
} from './music-buzzer/logic'
import {
  musicRace,
  type MusicRaceAction,
  type MusicRaceIntent,
  type MusicRaceSetup,
  type MusicRaceState,
  type MusicRaceView,
} from './music-race/logic'
import { pass, type PassAction, type PassIntent, type PassSetup, type PassState, type PassView } from './pass/logic'
import {
  trivia,
  type TriviaAction,
  type TriviaIntent,
  type TriviaSetup,
  type TriviaState,
  type TriviaView,
} from './trivia/logic'

export type RoundType = 'trivia' | 'closest' | 'pass' | 'letters' | 'musicRace' | 'musicBuzzer'

/**
 * Which title and rules to show for a round (keys of `strings.rounds`). One round
 * type can appear under different names, e.g. letters as proverbs or themes.
 */
export type RoundTitleKey = 'trivia' | 'closest' | 'pass' | 'proverbs' | 'themes' | 'musicRace' | 'musicBuzzer'

export type RoundSetup = { titleKey: RoundTitleKey } & (
  | ({ type: 'trivia' } & TriviaSetup)
  | ({ type: 'closest' } & ClosestSetup)
  | ({ type: 'pass' } & PassSetup)
  | ({ type: 'letters' } & LettersSetup)
  | ({ type: 'musicRace' } & MusicRaceSetup)
  | ({ type: 'musicBuzzer' } & MusicBuzzerSetup)
)

export type ActiveRound =
  | { type: 'trivia'; state: TriviaState }
  | { type: 'closest'; state: ClosestState }
  | { type: 'pass'; state: PassState }
  | { type: 'letters'; state: LettersState }
  | { type: 'musicRace'; state: MusicRaceState }
  | { type: 'musicBuzzer'; state: MusicBuzzerState }
export type RoundIntent = TriviaIntent | ClosestIntent | PassIntent | LettersIntent | MusicRaceIntent | MusicBuzzerIntent
export type RoundAction = TriviaAction | ClosestAction | PassAction | LettersAction | MusicRaceAction | MusicBuzzerAction
export type RoundView = TriviaView | ClosestView | PassView | LettersView | MusicRaceView | MusicBuzzerView

// Each entry has its own type parameters; the engine treats them uniformly and
// relies on ActiveRound.type to pair a state with the definition that made it.
export type AnyRound = RoundDefinition<any, any, any, any, any>

export const ROUNDS: Record<RoundType, AnyRound> = { trivia, closest, pass, letters, musicRace, musicBuzzer }
