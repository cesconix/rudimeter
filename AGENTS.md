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
- Four roots, imports one way. `src/` is the app and its pure modules; `api/` is the production API (one Bun server, one Vercel Function); `dashboard/` is the session dashboard page, which ships; `dev/` is dev-only tooling and never reaches a bundle. `src/**` imports nothing from `api/`, `dashboard/` or `dev/`. `api/**` imports only `api/**` and `src/telemetry/feedback-text.ts` — never React, the DOM or `dev/**`; it stores lines and hands them back, and computes nothing else. `dashboard/**` imports `src/analysis`, `src/telemetry/feedback-text.ts` and `src/data/exercises.ts`, never `dev/**`. `dev/**` may import anything.
- `api/server.ts` is the only file directly under `api/`; every other module lives in `api/_lib/`. Vercel turns each file directly under `api/` into its own Function and matches the filesystem before the rewrites in `vercel.json`, so a module sitting there becomes a public endpoint and shadows the route of the same name — `api/feedback.ts` really did answer 500 to `POST /api/feedback` on a preview. The underscore also hides a directory, which is why `api/_lib/` builds nothing. Adding a file directly under `api/` is a deployment change, not a refactor.
- `src/dev` is the page side of the remote debug channel (SSE commands, WAV upload) and is dev-only: inside `src`, only `src/ui/App.tsx` imports it — `remote-name.ts` statically (pure; its one call sits under `import.meta.env.DEV`) and `remote.ts` only through `import()` inside an `if (import.meta.env.DEV)` block; the guard must wrap the `import()` itself, a runtime condition does not keep the chunk out. `dev/lab.ts` uses both. `src/telemetry` is the part that ships: `client.ts` (the queue the dev channel builds on; App loads it as its own chunk only on a page with a tester key), `tester.ts`, `app-info.ts`, `feedback.tsx` and `feedback-text.ts`. `bun run build` must leave no `__remote` in `dist/`, and the string `api/log?key=` in exactly one chunk of `dist/assets/`, never in the app's entry chunk (derive its name from `dist/index.html`, do not guess it).
- One store for telemetry lines (`api/_lib/store.ts`): Postgres on Neon in production, SQLite in `.remote/dev.db` under the dev server, memory in the tests — one `Bun.sql` implementation, dialect-neutral SQL (TEXT/INTEGER, the line kept as the JSON text it arrived as, `seq` and `receivedAt` inside, never queried inside). The raw lines are the truth: `src/analysis/analysis.ts` re-judges them with the app's own `judge` and the runner's correction, so its numbers are the app's numbers, and it stays pure (no `node:fs`, no DOM) because the CLI, the dashboard page and `bun test` share it. A change to what `hello`, `session:start`, `session:truth`, `session:feedback`, `hit` or `output` log is a change to this module and its tests. `.remote/` (the dev store, WAVs, scenario reports, NDJSON exports, the four fixture logs `iphone`, `mac`, `synth`, `synth2`) is git-ignored and never committed; NDJSON is the interchange format (`bun run remote export | import | sync`), no longer the storage.
- Secrets live in `.env.local` (`DATABASE_URL`, `DASHBOARD_TOKEN`, `RUDIMETER_URL`) and in Vercel's environment; never in the repo, never in a log line. `api/server.ts` refuses to start without `DASHBOARD_TOKEN`.

## Commits

Conventional prefix (`feat`, `fix`, `chore`, `docs`, `test`, `style`, `refactor`), English, no trailers.
