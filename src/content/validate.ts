// Validates raw pack data: schema errors, duplicate ids, duplicate questions and
// items marked `verify`. Pure, so both the tests and `npm run validate-content` use it.
import { normalizeAnswer } from '../game/matcher'
import { packSchema, type Pack, type PackItem } from './schema'

export interface RawPack {
  /** Where the data came from, for messages. */
  source: string
  data: unknown
}

export interface ValidationReport {
  packs: Pack[]
  errors: string[]
  warnings: string[]
  /** `packId/itemId` of every item marked `verify: true`. */
  needsVerification: string[]
}

/** The text that makes an item "the same question" as another. */
function itemKey(pack: Pack, item: PackItem): string {
  switch (pack.roundType) {
    case 'trivia':
    case 'closest':
    case 'pass':
      return normalizeAnswer((item as { question: string }).question)
    case 'letters': {
      const { prompt, answer } = item as { prompt: string; answer: string }
      return normalizeAnswer(`${prompt} ${answer}`)
    }
    case 'music': {
      const { artist, title } = item as { artist: string; title: string }
      return normalizeAnswer(`${artist} ${title}`)
    }
  }
}

export function validatePacks(raw: readonly RawPack[]): ValidationReport {
  const report: ValidationReport = { packs: [], errors: [], warnings: [], needsVerification: [] }
  const packIds = new Map<string, string>()
  // Per round type: normalized question → where it was seen.
  const seen = new Map<string, string>()
  const deezerIds = new Map<number, string>()

  for (const { source, data } of raw) {
    const parsed = packSchema.safeParse(data)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        report.errors.push(`${source}: ${issue.path.join('.') || '(pack)'}: ${issue.message}`)
      }
      continue
    }
    const pack = parsed.data
    report.packs.push(pack)

    if (packIds.has(pack.id)) report.errors.push(`${source}: pack id "${pack.id}" also used in ${packIds.get(pack.id)}`)
    packIds.set(pack.id, source)

    const itemIds = new Set<string>()
    for (const item of pack.items) {
      const where = `${pack.id}/${item.id}`
      if (itemIds.has(item.id)) report.errors.push(`${source}: duplicate item id "${item.id}"`)
      itemIds.add(item.id)
      if (item.verify) report.needsVerification.push(where)

      const key = `${pack.roundType}:${itemKey(pack, item)}`
      if (seen.has(key)) report.errors.push(`${source}: "${item.id}" duplicates ${seen.get(key)}`)
      else seen.set(key, where)

      if (pack.roundType === 'music') {
        const { deezerId } = item as { deezerId?: number }
        if (deezerId !== undefined) {
          if (deezerIds.has(deezerId)) report.errors.push(`${source}: deezerId ${deezerId} also used by ${deezerIds.get(deezerId)}`)
          deezerIds.set(deezerId, where)
        }
      }
      if (pack.roundType === 'trivia') {
        const { options } = item as { options: string[] }
        if (options.length !== 4) report.warnings.push(`${where}: has ${options.length} options (4 looks best)`)
      }
    }
  }
  return report
}
