# Rudimeter

Practice-pad coach for drummers. It plays a metronome, shows the exercise on a staff with a moving cursor, listens to your strokes through the microphone and grades every one of them for timing and dynamics.

Runs in the browser as a PWA. Built for an iPad on a music stand (Safari); works on desktop Chrome too.

Live: https://rudimeter.com

## How it works

1. **Calibrate once.** The app plays clicks through the speaker and listens for them, measuring the speaker → microphone round trip.
2. **Put headphones on**, pick an exercise and a tempo. Without headphones the click itself gets counted as a stroke.
3. **Play.** Each note lights up as you hit it (good / ok / off). The summary gives per-hand offsets, consistency, accent dynamics, and copies as Markdown for your practice log.

Options: click subdivision, gap training (bars with and without click), guide sound on every note, auto-increment of the tempo after clean repeats.

## Exercises

An exercise is one object in `src/data/exercises.ts`:

```ts
{ id: 'reading-4-4', name: 'Mixed reading', source: 'study', timeSignature: [4, 4], steps: '>R LR LRLR L- | >RLR -L R-LR -', repeats: 8 }
```

`steps` is a tiny sticking language:

| token | meaning |
|---|---|
| space | next beat |
| `\|` | next bar |
| `R` `L` | stroke with the right / left hand |
| `-` | rest |
| `>` prefix | accent |
| `f` `d` prefix | flam / drag (one / two grace notes) |
| `z` `t` prefix | buzz roll / tremolo (measured roll) |
| `(L)` `(R)` | hand of the grace notes; default is the opposite hand |

A beat is split evenly among its tokens: `RL` is two eighths, `RLRL` four sixteenths, `RLR` a triplet, `RLRLRLRL` eight thirty-seconds. Only x/4 time signatures, 1 to 8 tokens per beat. Tempo is not part of the exercise: the same score runs at any bpm.

## Architecture

```
src/engine     pure domain: sticking DSL, time grid, judging, stats, report. No DOM, no dependencies.
src/audio      Web Audio: click scheduling, microphone capture, onset-detection worklet, calibration.
src/notation   VexFlow rendering: exercise → staff, cursor geometry, per-note colouring.
src/session    the runner that ties grid, judge and progression together while you play.
src/ui         React screens.
src/data       the exercise library.
dev/           notation gallery: every figure the renderer can draw, for a manual visual check.
```

Imports flow one way: `engine` ← `audio` | `notation` | `session` ← `ui`. Tests run with `bun test` and no DOM.

Timing lives on the `AudioContext` clock. The cursor follows the *audible* clock (`src/audio/clock.ts`), and hits are corrected by the calibrated latency before they are judged.

## Development

Requires [Bun](https://bun.sh) (version pinned in `mise.toml` and `package.json`).

```bash
bun install
bun run dev        # https://<lan-ip>:5173 — self-signed certificate, accept it on the iPad
bun test
bun run check      # biome + tsc + knip + tests, the same gate as CI
```

HTTPS is mandatory: `getUserMedia` needs a secure context, and the iPad reaches your Mac over the LAN. Chrome on the same machine can use `https://localhost:5173`.

Notation gallery: with the dev server running, open `/dev/gallery.html`.

Synthetic input (no microphone, no sound): open `/?synth=42&player=human` and keep the tab in the foreground — the page is muted, so Chrome throttles its timers to one tick per second as soon as it is hidden and the drummer falls behind. A virtual drummer plays the exercise through a simulated 35 ms speaker → microphone path, seeded so the run is reproducible; `&player=steady|human|sloppy` picks the drummer. `&headphones=off` feeds the app's own click and guide back into the input at full level: with the guide on, the detector hears the guide on every slot and the report describes a flawless run that never happened — the case its ⚠️ line exists for. `bun run sim --seed 42 --player human --exercise stone-1 --bpm 120` prints the report that run must produce: miss and extra counts exact, ms and dB within ±0.5. A stroke sitting on a judge boundary may still land one class, or one slot, away — the detector sees it a few hundredths of a millisecond off the oracle — and the hand and repeat tables move with it. The `Calibration:` line differs by design.

Remote debug layer (dev server only): open the app or `/dev/lab.html` with `?remote` (or `?remote=<name>`) on any device on the LAN, then give it the one tap iOS needs to open the microphone — "Start" in the app, "Enable microphone" in the lab — and drive it from the terminal: `bun run remote ls`, `bun run remote calibrate`, `bun run remote start '{"exercise":"stone-1","bpm":60}'`, `bun run remote record '{"seconds":20,"label":"strokes"}'`. Everything the page does lands in `.remote/<name>.ndjson` (raw hits, calibration, session grids and reports, output latency once a second) and recordings land next to it as WAV; a batch the page could not ship at the first attempt is sent again behind a `flush:retry` line, so a stretch of the file that arrived late or was dropped says so instead of looking like a session that never started. That directory is git-ignored and append-only — one `output` line a second per connected page, WAVs at 96 KB/s at 48 kHz, and nothing prunes it — so delete it by hand when it grows. `bun run scenario <name>` runs a scripted sequence from `dev/scenarios/` with instructions shown on the device. With several devices connected, pass `--to <name>`. Nothing of this is in the production bundle.

Session dashboard (dev server only): open `/dev/dashboard.html` to read every `.remote/<device>.ndjson` as sessions — each note of the score against the hit assigned to it (offset, level, good/ok/off/miss, extras), the signals that say how far the detection can be trusted (hits that are the click's own echo, double triggers from the pad's tail, strokes at the floor, an offset σ no human produces, output latency jitter, hidden-tab gaps, an unusable ramp) and, per device, the calibration history with an error budget in ms against the judge windows. Synthetic runs (`?synth=`) also log the drummer's planned strokes, so the page grades the detector itself: strokes detected, missed, false, timing error, and the app's stats against `bun run sim`'s oracle. The same numbers in the terminal: `bun run remote report <device>`, `bun run remote verdict <device>`, `bun run remote calibrations <device>` (they read the file, no server needed). `bun run scenario calibration-check` measures how repeatable a device's calibration is.

## Deploy

Vercel builds and deploys every push: `main` goes to https://rudimeter.com, every other branch gets its own preview URL — the way to try a change on an iPad, where a real certificate is what lets the microphone work. `vercel.json` holds the build: the full `check` gate runs first, so a red test never ships. Vercel's build image ships an older Bun that cannot read this lockfile and ignores `packageManager`, so both commands go through `bunx bun@<version>`; bump that pin together with `packageManager` and `mise.toml`.

GitHub Actions runs the same gate on pull requests (`.github/workflows/ci.yml`).

## License

MIT
