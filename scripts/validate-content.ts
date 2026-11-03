// npm run validate-content — checks every pack under src/content against the schema
// and flags duplicates. Exits with code 1 on errors.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { validatePacks, type RawPack } from '../src/content/validate'

const root = join(import.meta.dirname, '..', 'src', 'content')

function jsonFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return jsonFiles(path)
    return entry.name.endsWith('.json') ? [path] : []
  })
}

const raw: RawPack[] = []
const errors: string[] = []
for (const file of jsonFiles(root)) {
  const source = relative(root, file).replaceAll('\\', '/')
  try {
    raw.push({ source, data: JSON.parse(readFileSync(file, 'utf8')) })
  } catch (err) {
    errors.push(`${source}: invalid JSON (${(err as Error).message})`)
  }
}

const report = validatePacks(raw)
errors.push(...report.errors)

const byType = new Map<string, number>()
for (const pack of report.packs) {
  console.log(`  ${pack.id.padEnd(28)} ${pack.roundType.padEnd(8)} ${String(pack.items.length).padStart(3)} items  (${pack.name})`)
  byType.set(pack.roundType, (byType.get(pack.roundType) ?? 0) + pack.items.length)
}
console.log(`\n${report.packs.length} packs: ${[...byType].map(([t, n]) => `${t} ${n}`).join(', ')}`)

for (const warning of report.warnings) console.log(`warning: ${warning}`)
if (report.needsVerification.length > 0) {
  console.log(`\n${report.needsVerification.length} items marked "verify": true:`)
  for (const where of report.needsVerification) console.log(`  - ${where}`)
}

if (errors.length > 0) {
  console.error(`\n${errors.length} error(s):`)
  for (const error of errors) console.error(`  ✗ ${error}`)
  process.exit(1)
}
console.log('\n✓ All content is valid')
