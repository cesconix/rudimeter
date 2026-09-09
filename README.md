# stick-coach

Practice-pad coach for drummers. It plays a metronome, shows the exercise on a staff with a moving cursor, listens to your strokes through the microphone and grades every one of them for timing and dynamics.

Runs in the browser as a PWA. Built for an iPad on a music stand (Safari); works on desktop Chrome too.

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

## Deploy

Push to `main` → GitHub Actions runs the checks, builds with `--mode pages` and publishes to GitHub Pages (`Settings → Pages → Source: GitHub Actions`, once).

## License

MIT
