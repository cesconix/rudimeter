# Rudimeter

Practice-pad scores with a moving cursor. Pick a piece, set the tempo, press Play: the score is drawn the way the book prints it and a cursor glides over it at constant speed while the notes under it light up. The metronome and the microphone grading are coming back on top of it.

Runs in the browser as a PWA. Built for an iPad on a music stand (Safari); works on desktop Chrome too.

Live: https://rudimeter.com

## How it works

1. **Pick a piece** from the library: exercises written in the sticking language, pieces imported from MusicXML.
2. **Set the tempo** — the bpm counts the beat of the meter: a quarter in 4/4, a dotted quarter in 6/8 — and choose how the page follows the cursor — scrolling, or turning pages — and how many bars go on a row at most (automatic by default: as many as fit). The music is always drawn at the same size and stretched to the width of the screen: a rotation re-spaces it without re-sizing it.
3. **Play.** The cursor moves at constant speed on a time grid; every sounding event lights up as it passes; a tap on a bar starts from there.

The practice-pad session — calibration, click, and every stroke graded from the microphone — is parked on the dev page `/dev/session.html` while the score is rebuilt; it comes back as another layer on this score.

## Exercises

A piece is a JSON file in `src/data/scores/` — bars of events with their written value, one staff, one voice: strokes and rests, accents, flams and drags, rolls, sticking, ties, a text, repeats, meters — loaded through `src/data/scores.ts` and validated by its test. The format is `src/score/types.ts`; `src/score/validate.ts` lists what a valid piece is, and refuses any key it does not know. A piece written in MuseScore is imported:

```bash
bun run import path/to/piece.musicxml --id my-piece --title "My piece" --source "Book, p. 12"
```

The importer reads the first part of a partwise MusicXML file, voice 1 only: every note is a stroke on the snare, a second voice or a chord is refused, and dynamics, tempo marks, endings and noteheads are dropped with a warning. A file that does not validate is refused with its problems.

Exercises can also be written in the sticking language of `src/data/exercises.ts`; they are compiled into the same model by `src/score/sticking.ts`:

```ts
{ id: 'reading-4-4', name: 'Mixed reading', source: 'study', timeSignature: [4, 4], steps: '>R LR LRLR L- | >RLR -L R-LR -', repeats: 8 }
```

| token | meaning |
|---|---|
| space | next beat |
| `\|` | next bar |
| `R` `L` | stroke with the right / left hand |
| `-` | rest |
| `>` prefix | accent |
| `f` `d` prefix | flam / drag (one / two grace notes) |
| `z` `t` prefix | buzz roll / tremolo (measured roll) |
| `(L)` `(R)` | hand of the grace notes — accepted by the language, not part of the score |

A beat is split evenly among its tokens: `RL` is two eighths, `RLRL` four sixteenths, `RLR` a triplet, `RLRLRLRL` eight thirty-seconds. Only x/4 time signatures, 1 to 8 tokens per beat. `repeats` draws the piece that many times: the page is drawn out, with no repeat signs. Tempo is not part of the piece: the same score runs at any bpm.

## Architecture

```
src/engine     pure domain: sticking DSL, time grid, judging, stats, report. No DOM, no dependencies.
src/score      pure model of a pad piece: written durations, one staff, one voice, repeats; validation, playback unrolling, time map. No DOM, no dependencies.
src/audio      Web Audio: the transport on the audio clock; click scheduling, microphone capture, onset-detection worklet, calibration (the session flow).
src/notation   the score on screen: rows on a time grid, the fit to the viewport, the cursor and highlight geometry (pure); VexFlow engraving one SVG per row through a pool; plus the old exercise renderer the session flow still uses.
src/session    the runner that ties grid, judge and progression together while you play.
src/ui         React: the score screen (viewport, transport bar, picker, preferences); the session screens, mounted by dev/session.html.
src/data       the score library: JSON pieces and the sticking exercises compiled into them.
dev/           notation gallery, the old session flow (dev/session.html), the audio lab, the MusicXML importer, the remote debug CLI.
```

Imports flow one way: `engine` ← `score` | `audio` | `notation` | `session` ← `ui`. Tests run with `bun test` and no DOM.

Timing lives on the `AudioContext` clock. The cursor follows the *audible* clock (`src/audio/clock.ts`), and hits are corrected by the calibrated latency before they are judged.

## Development

Requires [Bun](https://bun.sh) (version pinned in `mise.toml` and `package.json`).

```bash
bun install
bun run dev        # https://<lan-ip>:5173 — self-signed certificate, accept it on the iPad
bun run api        # the production API on http://localhost:3000, against DATABASE_URL from .env.local
bun test
bun run check      # biome + tsc + knip + tests, the same gate as CI
```

`.env.local` (git-ignored) holds `DATABASE_URL` (a Neon branch), `DASHBOARD_TOKEN` (the dashboard's and the CLI's admin token) and `RUDIMETER_URL`; none of them is needed for `bun run dev`, `bun test` or `bun run build`.

HTTPS is mandatory: `getUserMedia` needs a secure context, and the iPad reaches your Mac over the LAN. Chrome on the same machine can use `https://localhost:5173`.

Notation gallery: with the dev server running, open `/dev/gallery.html` — one section per notation with the sentence it must match, every piece of the library whole, and a Measurements block (head widths, the band, the cursor band, ms per engraved row, dropped frames over 30 s of motion) that the constants in `src/notation/layout.ts` are set from.

Old session flow: `/dev/session.html` is the microphone app as it was — start, calibration, exercise picker, session, summary — kept running on the dev server until the judge comes back on top of the score. Everything below that mentions a session (synthetic input, the remote `arm`/`calibrate`/`start` commands, scenarios, testers' session sharing) runs on that page now: `/dev/session.html?synth=42&player=human`, `/dev/session.html?remote`. The app page (`/`) answers `ping` and `say` on the remote channel and, with a tester key, logs `hello`.

MusicXML import: `bun run import <file> --id <id>` writes `src/data/scores/<id>.json`; the fixtures under `dev/fixtures/musicxml/` show what the importer reads.

Synthetic input (no microphone, no sound): open `/dev/session.html?synth=42&player=human` and keep the tab in the foreground — the page is muted, so Chrome throttles its timers to one tick per second as soon as it is hidden and the drummer falls behind. A virtual drummer plays the exercise through a simulated 35 ms speaker → microphone path, seeded so the run is reproducible; `&player=steady|human|sloppy` picks the drummer. `&headphones=off` feeds the app's own click and guide back into the input at full level: with the guide on, the detector hears the guide on every slot and the report describes a flawless run that never happened — the case its ⚠️ line exists for. `bun run sim --seed 42 --player human --exercise stone-1 --bpm 120` prints the report that run must produce: miss and extra counts exact, ms and dB within ±0.5. A stroke sitting on a judge boundary may still land one class, or one slot, away — the detector sees it a few hundredths of a millisecond off the oracle — and the hand and repeat tables move with it. The `Calibration:` line differs by design.

Remote debug layer (dev server only): open `/dev/session.html` or `/dev/lab.html` with `?remote` (or `?remote=<name>`) on any device on the LAN, then give it the one tap iOS needs to open the microphone — "Start" on the session page, "Enable microphone" in the lab — and drive it from the terminal: `bun run remote ls`, `bun run remote calibrate`, `bun run remote start '{"exercise":"stone-1","bpm":60}'`, `bun run remote record '{"seconds":20,"label":"strokes"}'`. Everything the page does goes to `/api/log` and lands in the dev store, `.remote/dev.db` (raw hits, calibration, session grids and reports, output latency once a second); recordings land next to it as WAV; a batch the page could not ship at the first attempt is sent again behind a `flush:retry` line. `.remote/` is git-ignored and nothing prunes it. `bun run scenario <name>` runs a scripted sequence from `dev/scenarios/` with instructions shown on the device. With several devices connected, pass `--to <name>`. None of the command channel is in the production bundle.

Sharing from anywhere: `bun run remote devices add <name> --remote` prints a link, `https://www.rudimeter.com/?tester=<key>`. A page opened with it logs what it does to the store behind rudimeter.com — today only a `hello` line from the score app; the session lines (stroke timing and levels, the session grid, the calibration, the output latency, the comments typed in the "How did it go?" box) come from `/dev/session.html` opened with the same link on the dev server — never audio — and shows a badge saying so, with a Stop. The key stays in the browser's storage and leaves the address bar at once. The same link on `https://localhost:5173` (without `--remote`) writes to the dev store.

Session dashboard: `/dashboard/` — on the dev server and on rudimeter.com, behind `DASHBOARD_TOKEN` — reads every device's lines as sessions, live (polled every 3 s while the tab is visible): each note of the score against the hit assigned to it (offset, level, good/ok/off/miss, extras), the signals that say how far the detection can be trusted (echoes of the click, double triggers, strokes at the floor, an offset σ no human produces, output latency jitter, hidden-tab gaps, an unusable ramp) and, per device, the calibration history with an error budget in ms against the judge windows. Synthetic runs (`?synth=`) also log the drummer's planned strokes, so the page grades the detector itself. A comment can be added to any session there. The same numbers in the terminal: `bun run remote report <device>`, `verdict <device>`, `calibrations <device>`, `feedback [device] [--n N] [--export path]` read the dev store without a server, or rudimeter.com with `--remote`; `bun run remote sync` mirrors the production store into the dev one, `bun run remote export <device> [path]` writes a device as NDJSON (the archive that survives emptying `.remote/`), `bun run remote import <file> --as <name> [--renumber]` loads one. `bun run scenario calibration-check` measures how repeatable a device's calibration is.

## Deploy

Vercel builds and deploys every push: `main` goes to https://rudimeter.com, every other branch gets its own preview URL — the way to try a change on an iPad, where a real certificate is what lets the microphone work. The site is static; `/api/*` is one Vercel Function on the Bun runtime (`api/server.ts`, `bunVersion` in `vercel.json`), backed by a Neon Postgres named in `DATABASE_URL` (Production and Preview point at two Neon branches). `vercel.json` holds the build: the full `check` gate runs first, so a red test never ships. Vercel's build image ships an older Bun that cannot read this lockfile and ignores `packageManager`, so both commands go through `bunx bun@<version>`; bump that pin together with `packageManager` and `mise.toml`.

GitHub Actions runs the same gate on pull requests (`.github/workflows/ci.yml`).

## License

MIT
