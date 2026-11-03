// Turns a GameSetup plus the pack catalog into the concrete rounds of one game.
// Pure: randomness, the used-question history and player count are passed in.
import type { RoundSetup } from '../rounds'
import { normalizeAnswer } from '../game/matcher'
import type { ClosestQuestion } from '../rounds/closest/logic'
import type { LettersItem } from '../rounds/letters/logic'
import { MAX_OPTIONS, type MusicChoiceQuestion, type MusicField } from '../rounds/music-race/logic'
import type { MusicTrack } from '../rounds/music/track'
import type { PassQuestion } from '../rounds/pass/logic'
import type { TriviaQuestion } from '../rounds/trivia/logic'
import type { ClosestItem, LettersPackItem, MusicItem, Pack, PackItem, PassItem, TriviaItem } from './schema'
import { ROUND_INFO, type GameSetup, type RoundConfig } from './setup'

/** What the used-question history stores per item. */
export const usageKey = (packId: string, itemId: string) => `${packId}/${itemId}`

export interface PlanContext {
  packs: readonly Pack[]
  /** usageKeys of questions played in earlier games. */
  used: ReadonlySet<string>
  playerCount: number
  random: () => number
  /** "Lokal musik": replaces the music packs when set. */
  localTracks?: readonly MusicTrack[]
}

export interface GamePlan {
  rounds: RoundSetup[]
  /** usageKeys of every pack item picked, to mark as used. */
  picked: string[]
}

export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Packs a round can draw from: right type (and letters variant), and the chosen pack if any. */
export function eligiblePacks(config: RoundConfig, packs: readonly Pack[]): Pack[] {
  const info = ROUND_INFO[config.key]
  return packs.filter(
    (p) =>
      p.roundType === info.packType &&
      (p.roundType !== 'letters' || p.variant === info.variant) &&
      (config.packId === null || p.id === config.packId),
  )
}

/** An item's own region/difficulty, falling back to its pack's. */
export function matchesFilters(item: PackItem, pack: Pack, setup: Pick<GameSetup, 'region' | 'difficulty'>): boolean {
  const region = item.region ?? pack.region
  const difficulty = item.difficulty ?? pack.difficulty
  return (setup.region === 'alla' || region === setup.region) && (setup.difficulty === 'alla' || difficulty === setup.difficulty)
}

export function availableCount(config: RoundConfig, setup: GameSetup, packs: readonly Pack[]): number {
  return eligiblePacks(config, packs).reduce(
    (sum, pack) => sum + pack.items.filter((item) => matchesFilters(item, pack, setup)).length,
    0,
  )
}

export function wantedCount(config: RoundConfig, playerCount: number): number {
  return ROUND_INFO[config.key].perPlayer ? config.count * Math.max(1, playerCount) : config.count
}

interface Picked {
  pack: Pack
  item: PackItem
}

/**
 * Picks `count` items, unused ones first (in random order), then previously used
 * ones. With several packs it alternates between them so themes get mixed.
 */
export function pickItems(packs: readonly Pack[], count: number, filter: (item: PackItem, pack: Pack) => boolean, ctx: PlanContext): Picked[] {
  const queues = shuffle(packs, ctx.random)
    .map((pack) => {
      const items = pack.items.filter((item) => filter(item, pack))
      const fresh = items.filter((item) => !ctx.used.has(usageKey(pack.id, item.id)))
      const stale = items.filter((item) => ctx.used.has(usageKey(pack.id, item.id)))
      return {
        fresh: shuffle(fresh, ctx.random).map((item) => ({ pack, item })),
        stale: shuffle(stale, ctx.random).map((item) => ({ pack, item })),
      }
    })
    .filter((q) => q.fresh.length + q.stale.length > 0)

  const picked: Picked[] = []
  // Fresh items from all packs first, then the stale ones, each round-robin.
  for (const kind of ['fresh', 'stale'] as const) {
    let progress = true
    while (picked.length < count && progress) {
      progress = false
      for (const queue of queues) {
        const next = queue[kind].shift()
        if (!next) continue
        picked.push(next)
        progress = true
        if (picked.length === count) break
      }
    }
  }
  return picked
}

const toTrivia = ({ question, options, correct, fact }: TriviaItem): TriviaQuestion => ({ question, options, correct, fact })
const toClosest = ({ question, answer, unit, year, fact }: ClosestItem): ClosestQuestion => ({ question, answer, unit, year, fact })
const toPass =({ category, question, answers, fact }: PassItem): PassQuestion => ({ category, question, answers, fact })
const toLetters = (pack: Pack & { roundType: 'letters' }, item: LettersPackItem): LettersItem => ({
  prompt: item.prompt,
  answer: item.answer,
  aliases: item.aliases,
  theme: item.theme ?? pack.theme,
})
const toTrack = (pack: Pack, item: MusicItem): MusicTrack => ({
  id: usageKey(pack.id, item.id),
  artist: item.artist,
  title: item.title,
  artistAliases: item.artistAliases,
  titleAliases: item.titleAliases,
  year: item.year,
  region: item.region ?? pack.region,
  source: { kind: 'deezer', deezerId: item.deezerId, search: item.search },
})

/**
 * How believable `other` is as a wrong option for `track`: same region (Swedish or
 * international) matters most, then a similar era, then — for titles — a similar
 * length. Tracks without year/region (local files) score on length alone.
 */
export function optionSimilarity(track: MusicTrack, other: MusicTrack, field: MusicField): number {
  let score = 0
  if (track.region && other.region && track.region !== 'blandat') score += track.region === other.region ? 3 : 0
  if (track.year && other.year) score += 3 * Math.max(0, 1 - Math.abs(track.year - other.year) / 25)
  if (field === 'title') {
    // Swedish artists often sing in English, so compare the titles' language too.
    score += looksSwedish(track.title) === looksSwedish(other.title) ? 2 : 0
    score += Math.max(0, 1 - Math.abs(track.title.length - other.title.length) / 15)
  }
  return score
}

const SWEDISH_WORDS = new Set(['och', 'jag', 'är', 'för', 'mig', 'dig', 'vem', 'som', 'en', 'ett', 'på', 'till', 'det', 'du', 'vill', 'ha', 'kort', 'vet', 'min', 'din', 'sorg', 'ingen'])

/** A rough guess at whether a title is in Swedish. */
export function looksSwedish(text: string): boolean {
  return /[åäö]/i.test(text) || text.toLowerCase().split(/\s+/).some((w) => SWEDISH_WORDS.has(w))
}

/** Random spread added to the similarity, so a song doesn't get the same options every game. */
const OPTION_VARIETY = 1.5

/**
 * Turns tracks into four-option questions ("Vem är artisten?" / "Vad heter låten?",
 * alternating). Wrong options come from `pool` — other artists or titles, the most
 * similar ones first (see optionSimilarity) — never one that matches the right answer.
 */
export function musicChoiceQuestions(
  tracks: readonly MusicTrack[],
  pool: readonly MusicTrack[],
  random: () => number,
): MusicChoiceQuestion[] {
  const first: MusicField = random() < 0.5 ? 'artist' : 'title'
  return tracks.map((track, i) => {
    const field: MusicField = i % 2 === 0 ? first : first === 'artist' ? 'title' : 'artist'
    const right = track[field]
    const seen = new Set([normalizeAnswer(right)])
    const wrong: string[] = []
    const ranked = pool
      .map((other) => ({ other, score: optionSimilarity(track, other, field) + random() * OPTION_VARIETY }))
      .sort((a, b) => b.score - a.score)
      .map(({ other }) => other)
    for (const other of ranked) {
      const key = normalizeAnswer(other[field])
      if (seen.has(key)) continue
      seen.add(key)
      wrong.push(other[field])
      if (wrong.length === MAX_OPTIONS - 1) break
    }
    const options = shuffle([right, ...wrong], random)
    return { track, field, options, correct: options.indexOf(right) }
  })
}

export function buildGamePlan(setup: GameSetup, ctx: PlanContext): GamePlan {
  const rounds: RoundSetup[] = []
  const picked: string[] = []
  const taken = new Set<string>()
  const filter = (item: PackItem, pack: Pack) => !taken.has(usageKey(pack.id, item.id)) && matchesFilters(item, pack, setup)
  let localPool = ctx.localTracks?.length ? shuffle(ctx.localTracks, ctx.random) : null
  // Wrong options for the multiple-choice music round come from all the music there is.
  const optionPool: MusicTrack[] = ctx.localTracks?.length
    ? [...ctx.localTracks]
    : ctx.packs.flatMap((pack) => (pack.roundType === 'music' ? pack.items.map((item) => toTrack(pack, item)) : []))

  for (const config of setup.rounds) {
    if (!config.enabled) continue
    const count = wantedCount(config, ctx.playerCount)
    const titleKey = config.key

    if ((config.key === 'musicRace' || config.key === 'musicBuzzer') && localPool) {
      const tracks = localPool.slice(0, count)
      localPool = localPool.slice(count)
      if (tracks.length === 0) continue
      rounds.push(
        config.key === 'musicRace'
          ? { type: 'musicRace', titleKey, questions: musicChoiceQuestions(tracks, optionPool, ctx.random) }
          : { type: 'musicBuzzer', titleKey, tracks },
      )
      continue
    }

    const items = pickItems(eligiblePacks(config, ctx.packs), count, filter, ctx)
    if (items.length === 0) continue
    for (const { pack, item } of items) {
      taken.add(usageKey(pack.id, item.id))
      picked.push(usageKey(pack.id, item.id))
    }

    switch (config.key) {
      case 'trivia':
        rounds.push({ type: 'trivia', titleKey, questions: items.map(({ item }) => toTrivia(item as TriviaItem)) })
        break
      case 'closest':
        rounds.push({ type: 'closest', titleKey, questions: items.map(({ item }) => toClosest(item as ClosestItem)) })
        break
      case 'pass':
        rounds.push({
          type: 'pass',
          titleKey,
          questions: items.map(({ item }) => toPass(item as PassItem)),
          questionsPerPlayer: config.count,
        })
        break
      case 'proverbs':
      case 'themes':
        rounds.push({
          type: 'letters',
          titleKey,
          items: items.map(({ pack, item }) => toLetters(pack as Pack & { roundType: 'letters' }, item as LettersPackItem)),
        })
        break
      case 'musicRace':
        rounds.push({
          type: 'musicRace',
          titleKey,
          questions: musicChoiceQuestions(
            items.map(({ pack, item }) => toTrack(pack, item as MusicItem)),
            optionPool,
            ctx.random,
          ),
        })
        break
      case 'musicBuzzer':
        rounds.push({
          type: 'musicBuzzer',
          titleKey,
          tracks: items.map(({ pack, item }) => toTrack(pack, item as MusicItem)),
        })
        break
    }
  }
  return { rounds, picked }
}
