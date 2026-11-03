// The content pack format, as Zod schemas (runtime validation) with the TypeScript
// types inferred from them. One pack = one JSON file anywhere under src/content.
import { z } from 'zod'

export const REGIONS = ['sverige', 'internationellt', 'blandat'] as const
export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const
export const LANGUAGES = ['sv', 'en'] as const

export type Region = (typeof REGIONS)[number]
export type Difficulty = (typeof DIFFICULTIES)[number]

const text = z.string().trim().min(1)
const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ids are lowercase-with-dashes')

/** Fields every item has. Region and difficulty override the pack's when set. */
const itemBase = {
  id,
  region: z.enum(REGIONS).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  /** Set when a fact still needs a human check. */
  verify: z.boolean().optional(),
}

export const triviaItemSchema = z
  .object({
    ...itemBase,
    question: text,
    options: z.array(text).min(2).max(4),
    correct: z.number().int().min(0),
    category: text.optional(),
    fact: text.optional(),
  })
  .refine((q) => q.correct < q.options.length, { message: 'correct must point at an option', path: ['correct'] })
  .refine((q) => new Set(q.options.map((o) => o.toLowerCase())).size === q.options.length, {
    message: 'options must be unique',
    path: ['options'],
  })

export const passItemSchema = z.object({
  ...itemBase,
  category: text,
  question: text,
  /** Accepted answers; the first is shown on reveal. */
  answers: z.array(text).min(1),
  fact: text.optional(),
})

export const closestItemSchema = z.object({
  ...itemBase,
  question: text,
  answer: z.number().finite(),
  /** Shown after numbers, e.g. "km" or "%". */
  unit: text.optional(),
  /** The answer is a year: printed without a thousands separator. */
  year: z.boolean().optional(),
  category: text.optional(),
  fact: text.optional(),
})

export const lettersItemSchema = z.object({
  ...itemBase,
  prompt: text,
  answer: text.refine((a) => /[\p{L}\p{N}]/u.test(a), 'answer needs at least one letter'),
  aliases: z.array(text).optional(),
  /** Overrides the pack theme, e.g. in mixed packs. */
  theme: text.optional(),
})

export const musicItemSchema = z
  .object({
    ...itemBase,
    artist: text,
    title: text,
    year: z.number().int().min(1900).max(2100).optional(),
    deezerId: z.number().int().positive().optional(),
    search: text.optional(),
    artistAliases: z.array(text).optional(),
    titleAliases: z.array(text).optional(),
  })
  .refine((t) => t.deezerId !== undefined || t.search !== undefined, {
    message: 'needs a deezerId or a search string',
  })

const packBase = {
  id,
  name: text,
  language: z.enum(LANGUAGES),
  region: z.enum(REGIONS),
  difficulty: z.enum(DIFFICULTIES),
  description: text.optional(),
}

export const packSchema = z.discriminatedUnion('roundType', [
  z.object({ ...packBase, roundType: z.literal('trivia'), items: z.array(triviaItemSchema).min(1) }),
  z.object({ ...packBase, roundType: z.literal('closest'), items: z.array(closestItemSchema).min(1) }),
  z.object({ ...packBase, roundType: z.literal('pass'), items: z.array(passItemSchema).min(1) }),
  z.object({
    ...packBase,
    roundType: z.literal('letters'),
    /** Which letters round the pack is for: "Gissa ordspråket" or "Gissa ordet – teman". */
    variant: z.enum(['proverbs', 'themes']),
    theme: text,
    items: z.array(lettersItemSchema).min(1),
  }),
  z.object({ ...packBase, roundType: z.literal('music'), items: z.array(musicItemSchema).min(1) }),
])

export type Pack = z.infer<typeof packSchema>
export type PackRoundType = Pack['roundType']
export type TriviaItem = z.infer<typeof triviaItemSchema>
export type ClosestItem = z.infer<typeof closestItemSchema>
export type PassItem = z.infer<typeof passItemSchema>
export type LettersPackItem = z.infer<typeof lettersItemSchema>
export type MusicItem = z.infer<typeof musicItemSchema>
export type PackItem = Pack['items'][number]
