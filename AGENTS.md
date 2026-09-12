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
- `src/dev` is the page side of the remote debug channel and is dev-only. Inside `src`, only `src/ui/App.tsx` imports it: `remote-name.ts` statically (pure; its one call sits under `import.meta.env.DEV`, so the build tree-shakes it) and `remote.ts` only through `import()` inside an `if (import.meta.env.DEV)` block — the guard must wrap the `import()` itself, a runtime condition does not keep the chunk out. `dev/lab.ts` uses the same two modules. `dev/remote` is the server side and the CLI. `bun run build` must leave no `__remote` in `dist/`. `.remote/` (logs, WAVs, scenario reports) is git-ignored, append-only, never committed.
- `dev/remote/analysis.ts` re-judges the remote logs with the app's own `judge` and the runner's correction, so its numbers are the app's numbers; it stays pure (no `node:fs`, no DOM) because the CLI (`bun run remote report | verdict | calibrations`) and the dashboard page (`dev/dashboard.html`, through `/__remote/sessions`) share it. A change to what `session:start`, `session:truth`, `hit` or `output` log is a change to this module and its tests.

## Commits

Conventional prefix (`feat`, `fix`, `chore`, `docs`, `test`, `style`, `refactor`), English, no trailers.
