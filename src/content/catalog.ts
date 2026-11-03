// Every content pack under src/content, bundled at build time and validated.
// Invalid packs are left out (and reported); `npm run validate-content` catches them first.
import { validatePacks } from './validate'
import type { Pack } from './schema'

const modules = import.meta.glob('./**/*.json', { eager: true, import: 'default' })

const report = validatePacks(Object.entries(modules).map(([source, data]) => ({ source, data })))
if (report.errors.length > 0) console.error('[content] problems in content packs:', report.errors)

export const catalog: readonly Pack[] = report.packs
