// bun run scenario <name> [--to device]
import { runScenario, type Scenario } from './scenario'

const [name, ...rest] = process.argv.slice(2)
if (!name) throw new Error('usage: scenario <name> [--to device]')
const toIndex = rest.indexOf('--to')
const to = toIndex >= 0 ? (rest[toIndex + 1] ?? null) : null
for (const a of rest) if (a.startsWith('--') && a !== '--to') throw new Error(`unknown flag "${a}"; flags: --to`)
const mod = (await import(`../scenarios/${name}.ts`)) as { default: Scenario }
await runScenario(mod.default, to)
