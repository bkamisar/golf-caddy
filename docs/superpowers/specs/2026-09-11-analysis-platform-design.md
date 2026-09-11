# Golf Caddy — Analysis Platform Design

**Date:** 2026-09-11
**Status:** Draft for review
**Deliverable:** Shared storage, source tagging, a conclusion layer (findings +
recommendations), a rewritten coach prompt, hole-level scorecard capture, and a
companion video-analysis skill.

## Purpose

Five requests, which resolve into two problems.

**Input fidelity.** The app cannot currently tell a Trackman session from a
Toptracer one, so every trend it computes may be measuring the launch monitor
rather than the swing. Round-level aggregates collapse hole-by-hole detail that
would separate a putting problem from a chipping problem.

**Conclusion memory.** The app is a stateless calculator. It recomputes
everything from raw shots on every render and discards every conclusion it
reaches. That single gap explains why the coach prompt is unproductive (it
starts cold each time, with no baseline and no continuity), why video analysis
does not accumulate, and why "save indefinitely" matters — the thing worth
preserving is not the raw shots, it is the history of what was concluded and
whether it held up.

Fidelity work comes first. A findings log built on source-mixed data records
confident nonsense.

## Design principles

1. **Never mix measurement sources inside a comparison.** Segregate and label
   rather than calibrate — a calibration offset needs paired same-day data that
   will not realistically be collected, and a wrong offset is worse than two
   honest separate numbers.
2. **Conclusions are data.** Recommendations and findings persist, get checked
   against later evidence, and carry their own provenance and confidence.
3. **Video gives positions and mechanism; the launch monitor gives ball
   flight.** Never let a video-derived finding claim ball flight. Where the two
   corroborate independently, that is signal.
4. **Say "not enough data" rather than fill a section.** Applies to the prompt's
   output contract and to the app's own verdicts.
5. **No build step, no bundler, no API keys in client code.** The repo is
   public; anything embedded in a page is public with it.

## Storage architecture

Canonical data lives as committed JSON in this repo, served by GitHub Pages
alongside the three pages.

| File | Contents |
|---|---|
| `data/range.json` | Club-sessions (range/launch monitor) |
| `data/rounds.json` | Rounds, with optional hole-level detail |
| `data/findings.json` | Standing swing findings |
| `data/recommendations.json` | Dated recommendation log |

**Load path.** Each page fetches its committed JSON as a baseline, then merges
local un-pushed entries from localStorage on top. `mergeClubSessions` is already
idempotent, so re-merging is free and safe. localStorage stops being the source
of truth and becomes a staging layer for changes not yet committed.

**Write path.** Desktop is the only write surface. "Save to file" writes the
merged dataset back to `data/<file>.json` — via the File System Access API on
Chrome/Edge where available, falling back to a download the user saves over the
file. The user then commits and pushes in GitHub Desktop.

**Phone.** `course.html` on Pages fetches `data/range.json` directly. No import
step. Current as of the last push.

**What push does and does not do.** Pushing is the sync step, not the save step.
Data pasted on desktop is saved to localStorage immediately and is not at risk
if the user forgets to push; only the phone view goes stale.

**Deletion needs tombstones.** If a session is deleted locally but still exists
in the committed file, the next merge resurrects it. localStorage therefore
carries a `deleted` list of `(date, club, source)` keys applied *after* the
merge. Tombstones clear once a save has been written that omits those records.

## Data model

### `data/range.json` — club-sessions

Existing shape plus `source`:

```
{ date, dateAssumed, clubCode, club: {code, name, order, klass},
  source: 'trackman' | 'toptracer' | 'other',
  tags: {}, shots: [...] }
```

Identity key becomes `date + club.name + source`. Two systems used on the same
day stay as two rows rather than averaging into one. Sessions remain stored per
date, so trends compare across dates as they do today — within a single source.

Existing sessions carry no source. They are tagged manually (only three days of
data exist) rather than migrated heuristically.

### `data/rounds.json` — rounds

Existing shape (`date, course, rating, slope, score, holes, putts, gir, fir,
diff, suspect`) plus:

```
holeDetail: null | [ { hole, par, score, putts, gir, fir } × 18 ]
```

`null` for every round already recorded. Two-tier by construction: the
31-round differential trend uses the round-level corpus and is unaffected;
hole-level rollups use only rounds where `holeDetail` is present, and report
their own smaller sample size.

`rating` and `slope` are already parsed and stored — no capture change needed,
only surfacing.

### `data/findings.json` — standing findings, not a dated log

Findings are conditions that persist until resolved, not events on a date. This
is why video-session dates need not align with range-session dates.

```
{ id, finding: <taxonomy key>, clubs: [...],
  assessment: 'fault' | 'strength' | 'neutral',
  confidence: 'measured' | 'visual' | 'speculative',
  measurement: string | null,
  cameraAngle: 'down-the-line' | 'front-on' | 'other' | null,
  firstNoted: date, lastConfirmed: date,
  status: 'open' | 'improving' | 'resolved', note }
```

**Taxonomy** — fixed list so the same fault is trendable across sessions:
`early-extension`, `static-lower-body-transition`, `weight-transfer-quality`,
`backswing-width-turn`, `finish-balance`, `low-point-control`, `grip-setup`,
`tempo-sequencing`. Extended by editing the list, never by free text.

**Camera-angle gating.** Each taxonomy entry declares which angles can support
it — swing plane and shaft position require down-the-line; lateral weight shift
requires front-on. A finding recorded from an angle that cannot support it is
flagged and its confidence downgraded automatically. This encodes the lesson
from the retracted driver "stand up" claim: the front-on clip could not support
the assessment that was made from it.

### `data/recommendations.json` — one dated log

Unified across sources, because the continuity check needs a single
chronological list regardless of where a priority came from.

```
{ date, source: 'range' | 'round' | 'video',
  priority: string, criterion: string,
  outcome: 'met' | 'not-met' | 'insufficient-data' | 'pending',
  outcomeNote, outcomeDate }
```

## Phase 1 — Data foundation

Prerequisite for everything else.

- Add `source` to the club-session model; store the existing `#source`
  selector's value at parse time (currently read to choose a parser, then
  discarded).
- Extend the identity key to `date + club.name + source` across
  `mergeClubSessions`, `groupByClub`, and `doDeleteSession`.
- Suppress or caveat any trend whose window spans mixed sources, reusing the
  existing `caveat` mechanism built for untagged session conditions.
- Add a source filter to `range.html` gapping and to `course.html`.
- Stand up `data/*.json`, the fetch-and-merge load path, the save path, and
  deletion tombstones.
- Enable GitHub Pages; confirm `course.html` loads committed data on a phone
  with no import step.
- Tag the three existing days of data by hand.

**Note:** localStorage is per-origin. Data entered via `file:///` and via
`http://127.0.0.1:<port>` are in separate silos. Audit all origins before
migrating so nothing is stranded.

## Phase 2 — Conclusion layer

- Build the findings and recommendations stores, with read/write UI on
  `range.html` (management surface) and read-only display on `course.html`.
- Rewrite `coachPrompt` on both pages against the agreed output contract:
  continuity check, trend check, what's improving, what's not, biggest leak,
  one priority with a numeric success criterion.
- Supply the prompt what it currently lacks: sample size **and dispersion** per
  club (medians alone give the model no basis to separate a real move from
  noise), open findings, the previous recommendation and its outcome, and an
  explicit confounds block.
- Confounds to surface automatically: date gaps within the comparison window,
  course mix, missing fields in individual rounds, and mixed launch-monitor
  sources.
- Course difficulty is **partly** handled today: `slope5` vs `slopeAll` already
  fires a course-mix caveat verdict when the gap exceeds 6 points, and verdicts
  reach the prompt via its signals section. Two gaps remain — the caveat is
  silent below that threshold, and per-round `rating`/`slope` never appear in
  the prompt at all, so the model cannot weigh individual rounds. Add both to
  the confounds block and to the per-round lines.
- Instruct the model that a fused metric must be reported as fused. The current
  top leak, "putting + chip proximity," combines two skills; until hole-level
  data separates them, the correct output is to name the ambiguity and
  prescribe a diagnostic, not to guess at a fix.
- Record each debrief's priority and criterion back into the recommendations
  log so the next run can check it.

## Phase 3 — Hole-level scorecard

Largest scope, most workflow risk, independent of Phases 1–2 beyond storage.

**Entry workflow.** A static page cannot do vision extraction, and an API key
cannot be embedded in a public repo. Client-side OCR is rejected: a scorecard is
a dense grid of small digits, misreads are likely, and wrong scores are worse
than no scores. The workflow is therefore Claude extracts → JSON → paste into
the tool, supported by:

- A documented, reusable extraction prompt emitting exactly the schema above.
- A **paste-and-confirm** import: parse, render all 18 holes as a table, and
  require visual confirmation against the screenshot before saving. Vision
  extraction will occasionally misread a digit, and a silently wrong 7 poisons
  every rollup built on it.

**Schema is deliberately minimal** — par, score, putts, GIR, FIR per hole.
Driving-miss severity and penalty flags are deferred: they depend on recalling
how bad a miss was after the fact, which is unreliable and self-serving.

**Rollups unlocked:** putts after a green hit vs putts after a miss (the
compounding-vs-standalone split that separates putting from chipping);
double-bogey-or-worse count; par-3 approach performance isolated from
FIR-driven approach performance.

**Blow-up holes need a self-relative baseline.** "Four holes accounted for 45%
of strokes over par" is close to arithmetic for any high-handicap round — the
distribution is skewed by construction. Define the metric concretely
(double-bogey-or-worse count) and trend it against the user's own history, not
an absolute standard.

**Consistency risk.** If logging is not near-frictionless it will happen only
for memorable rounds — great ones and disasters — biasing every rollup. If the
confirm-and-paste flow proves annoying in practice, dropping this phase is
better than collecting a biased sample.

## Companion — video analysis skill

Separate from the app; shares only the findings schema.

An Artifact cannot do this work: published artifacts are static pages behind a
strict CSP, with no ffmpeg, no pose estimation, and no outbound API calls. The
analysis stays in a Claude Code session, where the repo, Python, and the
filesystem are available. A skill, invoked by name, is the right container — it
makes the method reproducible instead of re-derived each session.

**Method to encode** (from the 2026-09-11 session notes):

1. Read video metadata before processing.
2. Crop to the ~2–3s swing window; do not extract frames across the whole clip.
3. Extract at 6–12fps, build a labeled contact sheet to locate address / top /
   impact / finish, then pull full-res frames only for those phases.
4. **Any claim about a position changing between frames must be backed by a
   pixel or landmark measurement, not a visual read**, and must report the
   measured delta. Eyeballing produced a wrong conclusion once; pixel
   measurement resolved it. A sub-pixel delta is reported as no signal.
5. Emit findings as JSON matching `data/findings.json`, with confidence and
   camera angle set honestly.

**Prerequisites:** ffmpeg is not currently installed on this machine. Python
3.14.3 is available for the contact-sheet step. MediaPipe Pose would be more
rigorous than ad hoc color-region cropping, but wheel availability for Python
3.14 must be verified before depending on it — this is a possible later
refinement, not a v1 requirement.

**Steps 1–3 should be a checked-in script**, not prose instructions, so frame
extraction is deterministic run to run.

## Out of scope

- Cross-source calibration offsets.
- Client-side OCR or any embedded API key.
- Video analysis inside the app or inside an Artifact.
- Driving-miss severity and penalty capture (deferred from Phase 3).
- Backfilling hole detail for the existing 31 rounds.
- Writing data from the phone; it remains read-only.

## Open questions

1. Does the Grint scorecard screenshot reliably show putts per hole, or only
   score per hole? Putts-per-hole is what unlocks the compounding-vs-standalone
   split — if it is unavailable, Phase 3's value drops substantially and the
   phase should be reconsidered.
2. Does `course.html` need findings and the current priority on the phone, or
   is the yardage ladder still the whole job on-course?
3. Should `index.html` (rounds) and `range.html` (shots) share one
   recommendations view, or does each show only its own source?

## Testing

Phases 1–3 extend the existing `test-engine.js` / `test-range-engine.js` /
`test-course-engine.js` harnesses, following the established
`/*ENGINE-START*/`–`/*ENGINE-END*/` extraction pattern and the `var`-not-`const`
convention for any new binding referenced by bare name in tests.

New coverage required:

- Source-aware identity: same club, same date, two sources stays two rows;
  merge and delete both respect source.
- Mixed-source trend windows are caveated or suppressed.
- Fetch-and-merge produces the same result as a single load when local staging
  is empty, and is idempotent across repeated merges.
- Tombstones survive a merge — a deleted session does not resurrect.
- Hole-level rollups: putts-after-GIR vs putts-after-miss on constructed
  fixtures; rounds without `holeDetail` are excluded from hole-level rollups but
  retained in the round-level trend.
- Camera-angle gating downgrades confidence on an unsupported angle.
- Findings taxonomy rejects values outside the fixed list.

Live browser verification covers the Pages load path, the phone view, and the
scorecard confirm step, consistent with prior UI-wiring work in this project.
