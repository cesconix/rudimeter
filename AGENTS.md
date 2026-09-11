# Notes for coding agents

## Commands

`bun install` · `bun run dev` · `bun test` · `bun run check` (biome + tsc + knip + tests). Never `npm`, `npx` or `node`: the project runs on Bun.

## Invariants

- `src/engine` never imports the DOM, React, VexFlow or Web Audio. It must keep running under `bun test` with no DOM.
- Imports flow one way: `engine` ← `audio` | `notation` | `session` ← `sim` ← `ui`. Nothing outside `src/ui` imports from it (the entry point `src/main.tsx` excepted).
- Every value export has an importer; knip enforces it. Tests count as importers.
- Comments explain *why*, not *what*, and keep measured numbers with their units. Do not delete a comment you did not understand.
- Everything in the repo is English. UI copy lives in the component that shows it.
- Timing lives on the `AudioContext` clock. The cursor uses the audible clock (`src/audio/clock.ts`). Never mix `Date.now()` in.
- Anything visible is verified in a real browser before it is called done. The target is iPad Safari.
- `src/sim` stands in for the microphone and the drummer, never for the judge: it feeds the worklet like a microphone would and reads the runner like the screen does. A synthetic run must produce the numbers `bun run sim` predicts for the same seed, within the tolerances the README states. Clicks and strokes cross the same simulated delay, so a green synthetic run proves the latency correction is applied, never that it is right on real hardware, where the output latency sits in the click path only.
- `src/dev` is the page side of the remote debug channel and is dev-only: `src/ui/App.tsx` is its only importer, behind `import.meta.env.DEV` and `?remote`, through `import()`. `dev/remote` is the server side and the CLI. `bun run build` must leave no `__remote` in `dist/`. `.remote/` (logs, WAVs, scenario reports) is never committed.

## Commits

Conventional prefix (`feat`, `fix`, `chore`, `docs`, `test`, `style`, `refactor`), English, no trailers.
