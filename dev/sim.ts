// Prints the report the browser must produce for the same seed:
//   bun run sim --seed 42 --player human --exercise stone-1 --bpm 120 [--auto]
// Compare with the summary of https://localhost:5173/dev/session.html?synth=42&player=human (tab in the foreground: a hidden
// muted tab is throttled to one timer tick per second) after the same exercise at the same tempo: miss and
// extra counts exact, ms and dB within ±0.5; a stroke on a judge boundary may land one class or one slot away,
// and the hand and repeat tables move with it. The `Calibration:` line differs by design.
import { EXERCISES } from '../src/data/exercises'
import { DEFAULT_AUTO_INCREMENT } from '../src/engine/progression'
import { toMarkdown } from '../src/engine/report'
import { runOracle } from '../src/sim/oracle'
import { PLAYER_PRESETS, type PlayerPreset } from '../src/sim/player'

const FLAGS = ['seed', 'player', 'exercise', 'bpm', 'auto']

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

// A flag the script does not know used to be ignored in silence: `--preset sloppy` printed the human oracle.
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--') && !FLAGS.includes(a.slice(2))) {
    throw new Error(`unknown flag "${a}"; flags: ${FLAGS.map((f) => `--${f}`).join(', ')}`)
  }
}

const seed = Number(arg('seed', '42'))
const player = arg('player', 'human')
const exerciseId = arg('exercise', 'stone-1')
const bpm = Number(arg('bpm', '120'))
const auto = process.argv.includes('--auto')

// Without this, a typo'd --seed or --bpm turns into NaN, which makes the oracle's grid end at NaN
// and its `while (phase !== 'done')` loop never terminates — a hang, not a crash.
if (!Number.isInteger(seed) || seed < 0) {
  throw new Error(`--seed must be a non-negative integer, got "${arg('seed', '42')}"`)
}
if (!Number.isFinite(bpm) || bpm <= 0) {
  throw new Error(`--bpm must be a positive number, got "${arg('bpm', '120')}"`)
}
// `Object.hasOwn`, not `in`: `in` also matches inherited keys like `toString`, which would hand
// a function to `PLAYER_PRESETS[player]` for `--player toString`.
if (!Object.hasOwn(PLAYER_PRESETS, player)) {
  throw new Error(`unknown player "${player}"; players: ${Object.keys(PLAYER_PRESETS).join(', ')}`)
}
const exercise = EXERCISES.find((e) => e.id === exerciseId)
if (!exercise) throw new Error(`unknown exercise "${exerciseId}"; ids: ${EXERCISES.map((e) => e.id).join(', ')}`)

const stats = runOracle({
  exercise,
  bpm,
  preset: player as PlayerPreset,
  seed,
  autoIncrement: auto ? DEFAULT_AUTO_INCREMENT : undefined,
})
console.log(toMarkdown(stats, exercise, bpm, new Date(), null))
