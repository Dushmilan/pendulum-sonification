# Pendulum Sonification — Design

**Date:** 2026-10-17
**Status:** approved (three design sections reviewed and accepted in session)
**Author:** Dushmilan, with an agent

## 1. Purpose

A public, self-contained web page that shows a single pendulum being sonified: physical
oscillation → sampled signal → frequency estimate → music. It exists to demonstrate,
visibly and audibly, that a pendulum bank's motion and an audio signal are the same
mathematics. The audience is a research lab or PhD admissions reader evaluating
technical rigour in audio/AI, plus anyone who lands on the author's GitHub profile.

The page runs forever without interaction. It is not a tool and not a tutorial.

## 2. Success criteria

1. Opening the page shows the animation running immediately, silently, with no input.
2. One click (or keypress) enables sound; the page then plays indefinitely in sync.
3. The pitch that is heard is derived from the drawn motion — the waveform on screen
   and the note in the air are provably the same function, not two things drawn to
   look alike.
4. The page renders correctly for at least 24 hours unattended with flat memory and no
   audible drift between the animation and the audio.
5. A reader who knows DSP sees the resampling step stated explicitly rather than
   glossed over.
6. Unit tests cover all pure logic and run with zero installed dependencies.

## 3. Non-goals

- No user-facing controls beyond a sound toggle. Not a sandbox, not an interactive lab.
- No narrative, no scroll story, no explanatory copy beyond short labels.
- No damping, air resistance, or driving force modelled (see §14).
- No backend, no analytics, no external services, no runtime dependencies.
- The author's GitHub profile cleanup (dead links, empty sidebar fields, pinned repos)
  is a separate piece of bounded work and is not specified here.

## 4. The physics

Small-angle pendulum. Angular displacement:

    θ(t) = θ₀ · cos(ωt),      ω = √(g/L),      f = ω / 2π = (1/2π)·√(g/L)

Inverted, the rod length required for a given frequency:

    L = g / (2πf)²

Constants: `g = 9.81 m/s²`, amplitude `θ₀ = 0.36 rad` (≈ 20.6°), which keeps the
small-angle approximation honest.

A real pendulum of a workable size swings at roughly 0.6–1.7 Hz. Audio is 20 Hz–20 kHz.
A 24 cm rod swings at 1.0175 Hz; reaching the lowest piano note (27.5 Hz) would need a
0.33 mm rod. A physical pendulum therefore cannot emit audio directly, and this is
stated on the page rather than hidden.

## 5. The mapping

The signal is resampled by a factor of **256**: the pendulum's real frequency, played
back 256× faster, becomes audible. This is ordinary sample-rate change / tape speed,
and it preserves pitch *ratios* exactly, which is why a melody survives the trip.

    f_audio = 256 × f_pendulum
    f_pendulum = f_audio / 256
    one full swing  ==  one note, of duration 1 / f_pendulum

Consequence, stated openly on the page: what is heard is a **sonification of sampled
motion**, not a recording of a swinging rod.

The score is written in just intonation relative to A3 = 220 Hz, so the intervals are
exact whole-number ratios rather than equal-tempered approximations:

| Note | Ratio | f_audio (Hz) | f_pendulum (Hz) | One swing (s) | Rod (cm) |
|------|-------|--------------|-----------------|---------------|----------|
| A3 | 1/1 | 220.00 | 0.8594 | 1.164 | 33.6 |
| B3 | 9/8 | 247.50 | 0.9668 | 1.034 | 26.6 |
| C4 | 6/5 | 264.00 | 1.0313 | 0.970 | 23.4 |
| D4 | 4/3 | 293.33 | 1.1458 | 0.873 | 18.9 |
| E4 | 3/2 | 330.00 | 1.2891 | 0.776 | 15.0 |
| G4 | 9/5 | 396.00 | 1.5469 | 0.646 | 10.4 |
| A4 | 2/1 | 440.00 | 1.7188 | 0.582 | 8.4 |

Rod lengths span 8.4–33.6 cm: desk-sized and buildable in principle. Nothing in the
page claims the apparatus is built.

## 6. The material

A 16-note line, all pitches drawn from the table above, held inside one octave so the
physics-imposed tempo variation reads as rubato rather than as wobble. Note duration
ranges 0.582–1.164 s across the score.

Rising and falling arch that resolves onto its own first note, so the loop point is a
cadence rather than a cut:

    A3 C4 D4 E4 G4 A4 G4 E4 D4 E4 G4 E4 D4 C4 B3 A3

**Loop length: 13.54 s.** At that length a page open for 24 hours completes 6,379
loops.

The score is a single data structure (one array in `src/score.js`). Replacing it is a
one-minute change and requires no other edit.

## 7. Composition

One dark stage. Four zones laid out left to right, joined by a flow line, and beneath
them **a transport strip on a single shared time base** — the 16 notes drawn in
proportion to their real durations, with one amber playhead crossing the whole width.
Each zone also carries its own local playhead, because each zone has its own time axis
(one period in ②, a ten-second window in ④); the transport strip is what makes the four
read as one instrument rather than four widgets.

All four zones advance in lockstep: one swing = one note = one FFT frame = one
piano-roll bar.

- **① Physical** — the rod drawn linearly from zero against a labelled centimetre ruler,
  so the lengths are proportional rather than decorative: a 33.6 cm pendulum really does
  draw four times as long as an 8.4 cm one. Labels `L = 23.4 cm`, `f = 1.031 Hz`.
  Amplitude drawn at θ₀.
- **② Oscillation → signal** — θ(t) for the current note drawn across exactly one
  period, with a sweeping playhead. The previous eight notes remain as faint traces at
  their own periods, so a change of pitch is visible as a change of wavelength.
- **③ Computer** — two steps. First the ×256 resample shown explicitly: the same
  waveform squeezed, with the time axis relabelled `0–1 s` → `0–4 ms`. Only then the
  FFT peak and the detected note name.
- **④ Music out** — a scrolling piano roll on a ~10 s window, the current key lit on a
  small keyboard, the note name large.

Accents: cyan = physical, amber = time, violet = computer, green = music. Nothing in
the layout depends on colour alone; zone labels and numeric readouts carry the meaning.

## 8. Architecture

    index.html
    src/physics.js     pure maths: L↔f, ω, θ(t), note→rod length, resample constant
    src/ring.js        fixed-capacity ring buffer used by every history trace
    src/score.js       the note line; note events; durations derived from physics
    src/scheduler.js   the clock (see §9)
    src/audio.js       Web Audio: gesture unlock, synthesis, lookahead scheduling
    src/render.js      canvas 2D: draws the four zones from a state object
    src/main.js        wiring only
    tools/build-hero.mjs   generates assets/hero.svg from physics.js
    test/*.test.mjs
    assets/hero.svg
    assets/hero-light.svg

`physics.js` and `score.js` touch no DOM, no audio, no canvas — pure functions,
testable in plain Node. `render.js` receives state and draws it, owning no time logic.
The animation uses canvas 2D rather than DOM, because per-frame waveforms and history
traces at 60 fps are not a job for styled elements.

**Single source of truth.** `physics.js` is imported by both the page and
`tools/build-hero.mjs`. The hero SVG is *computed* from the same functions the demo
runs on, not hand-drawn, so the hero cannot drift from the live page. Change a
constant, regenerate, and the numbers in the hero stay true.

## 9. Long-run correctness

The page is intended to run unattended for days, so note timing is treated as an
engineering problem.

- **Naive approach rejected.** Driving notes from `performance.now()` in a rAF loop
  jitters, and `performance.now()` and `AudioContext.currentTime` are different clocks
  that diverge over hours.
- **Design.** Once audio is unlocked, the note timeline is driven by
  `AudioContext.currentTime` through a lookahead scheduler: a 25 ms interval that
  schedules every note falling inside the next 100 ms directly onto the audio clock.
  Visuals then *read* the audio clock rather than owning the timeline. Note boundaries
  are sample-accurate and do not drift.
- **Before unlock** the page is silent, and `performance.now()` drives visuals. On
  unlock the timeline is re-anchored once, so the first click does not make the
  animation jump.
- **Backgrounded tab.** Browsers clamp hidden-tab timers to roughly one wake-up a
  second, so the scheduler is pumped by a timer with a 1.5 s lookahead rather than by
  rAF, which buys continuous audio across that clamp. If a tab is hidden longer than the
  lookahead covers, the missed notes are **dropped and the line resumes at the present** —
  never fired at once with start times in the past. Note boundaries are sums of the real
  note periods, so nothing accumulates.
- **Memory.** 6,379 loops a day means the pitch-history, piano-roll, and spectrum
  histories must be fixed-size ring buffers, never growing arrays.

## 10. Audio

One sine oscillator at the note frequency, plus a second sine at 2× and 0.2 amplitude
for a music-box timbre. Envelope: ~12 ms linear attack, exponential decay shaped to the
note's physical swing duration. No reverb — a room would imply a place, and the tone is
meant to be the bare pendulum.

Master gain fixed at 0.45 with a soft-clip guard, so a tab left open overnight cannot
blast. Sound is only ever initiated by a user gesture; the page is silent on load by
browser policy, not by preference.

## 11. Hero SVG

A miniature of the same four zones, looping on the same 13.54 s score as the page so
the hero and the demo cannot disagree, silent, linking to the live page URL. Implemented as **CSS animation inside a real `.svg` file**, referenced from
the profile README with `<img src>`.

Verified constraints (tested against GitHub's own markdown renderer, 2026-10-17):

- Inline `<svg>` in a README is **stripped entirely**. The hero must be a separate
  `.svg` file referenced by `<img src>`.
- `<img src>` pointing at `raw.githubusercontent.com` survives, and that host serves
  `.svg` as `content-type: image/svg+xml`, so the browser renders it as an image and
  CSS animations inside it run.
- `<audio>` is **stripped**. Sound is impossible in a README; the hero is silent and
  links to the live page.
- `<script>` is escaped to inert text and `onload` is stripped — no code runs.
- `<picture>` survives (wrapped as `themed-picture`), so **light and dark hero variants
  are shipped and selected by the reader's theme** rather than a bright rectangle on a
  dark profile.
- `<details>` survives, and is used to collapse the caveats in §14.

**Fallback.** If the profile fails to animate the SVG, generate a GIF/APNG from the
same computed frames. This is a contingency, not the plan.

## 12. Repository and deployment

- Public repo `pendulum-sonification`, MIT licence covering code and generated media.
- GitHub Pages served from `main` at the repository root. No GitHub Action: the hero is
  regenerated locally and committed.
- `package.json` with **zero dependencies**, exposing `npm test` (`node --test`) and
  `npm run hero` (`node tools/build-hero.mjs`).
- The repo `README.md` is a first-class deliverable, not an afterthought: it is what a
  lab reader actually reads. It states the physics, the mapping, how to run it, and the
  caveats in §14.

## 13. Accessibility

- Audio only ever starts on a gesture; the toggle visibly reports its state.
- No meaning is carried by colour alone — zone labels and numeric readouts do.
- On the page (not the SVG) `prefers-reduced-motion` is honoured: a static frame with
  the numbers, with motion as an opt-in.
- The stage has a text alternative summarising what it shows.

## 14. Stated caveats

These appear on the page and in the repo README. A technical reader will look for them;
finding them unstated is worse than the approximation itself.

1. **Damping is not modelled.** A pendulum that swings forever has no energy source.
   Real pendulums decay, which is why clock pendulums need an escapement. This is an
   ideal, undamped oscillator, shown for clarity.
2. **The audio is a resampling.** ×256 is sample-rate change. What is heard is a
   sonification of sampled motion, not a recording.
3. **Small-angle approximation.** θ₀ = 0.36 rad. Beyond roughly 0.4 rad the true period
   lengthens and the pure sinusoidal model breaks down.
4. **The apparatus is not built.** Rod lengths are those a physical build would need.

## 15. Risks

| Risk | Response |
|------|----------|
| Profile will not animate the SVG (camo/sanitiser behaviour on the profile page differs from the renderer test) | Verified by pushing and viewing before announcing; GIF/APNG fallback from the same frames |
| Audio and visuals drift over hours | Audio-clock timeline with lookahead scheduling (§9) |
| Left-open tab leaks memory | Ring buffers, with a test asserting bounded length |
| Left-open tab is loud | Fixed master gain with soft-clip guard |
| Physics constants drift between page and hero | Hero generated from the same module; regeneration is one command |

## 16. Out of scope

- The GitHub profile cleanup (three dead `Dushmilan-Jeyanathan` links, empty sidebar
  fields, pinned repos showing an undescribed fork). Separate bounded work.
- Damping, escapement, multiple pendulums, chords, spectrogram panels, user-loaded
  audio, and a written maths appendix. Each is a possible future addition; none is
  needed for the success criteria.
