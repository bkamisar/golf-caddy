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

**Entry workflow — revised 2026-09-11, simpler than originally specced.** A
static page cannot do vision extraction, and an API key cannot be embedded in a
public repo, so the extraction step always required a Claude session. The
original design still routed the result back through an in-app paste-and-confirm
UI. The user instead asked Claude to write the extracted data straight into the
repo and commit it — no round-trip through the app at all.

Workflow: user sends scorecard screenshots in a Claude Code session → Claude
extracts the data, cross-checks it against the card's own printed subtotals
(par/score/putts/GIR sums, exactly as done for the first sample capture) →
writes `data/hole-detail/<date>-<course-slug>.json` → commits. The user pushes.

This replaces the in-app confirm step's purpose (catching a misread before it
poisons a rollup) with the subtotal cross-check, which is arguably stronger — it
verifies against numbers Grint itself computed, not against the user's own
re-reading of a screenshot they already looked at once. No paste-and-confirm UI
is built. The cost: hole-level entry only happens inside a Claude session, not
standalone — accepted, since that is the workflow the user actually wants.

**Schema** — per hole: par, score, putts, first-putt distance (feet), GIR (with
miss type), FIR, tee club, and drive-miss direction/severity. Field names
follow the existing sample capture's convention
(`data/hole-detail/2026-09-05-pinehurst-10.json`): `firstPuttFt`, `girMiss`,
`teeClub`, `driveMiss`.

Driving-miss severity was originally deferred here on the grounds that it
depends on unreliable after-the-fact recall. **Screenshots reviewed 2026-09-11
show that was wrong** — Grint records it natively, as directional arrow glyphs
distinguishing a normal miss from a severe one, alongside the tee club used on
every hole. It is recorded, not recalled, so it is in scope.

Grint's **DISTANCE (ft)** row is **first-putt distance** (confirmed
2026-09-11). It was empty on the sample round; the user will record it going
forward. This is the single most valuable field available here, because it
splits the current top leak — "putting + chip proximity," 8.3 strokes/round —
into its two component skills:

- **Putting**, isolated: how often a putt is 3-putted *from a given distance*.
  Three-putting from 40 feet is unremarkable; three-putting from 12 feet is a
  putting problem. Round-level putts/hole cannot tell these apart.
- **Short game**, isolated: how far the first putt is left following a green
  miss. Chips finishing 25 feet away produce "bad putting" numbers that are
  actually a chipping failure.

**How the split is measured — resolved 2026-09-11, after one false start.**

Two approaches were considered and rejected before landing on the third.

*Rejected: an imported expected-putts-by-distance curve.* Published curves are
scratch- or tour-calibrated; scoring a bogey-plus golfer against one makes
putting look catastrophic regardless of true performance. No legitimately
bogey-golfer-calibrated curve is available to import, and inventing one would be
a guess wearing a baseline's clothes — the exact mistake the existing
bogey-golfer GIR norms (2.15 / 1.95) were built to avoid.

*Rejected: a self-calibrating expected-putts table built from the user's own
data.* This was approved first and is **circular**: if expected putts from 12
feet is defined as the user's own average from 12 feet, then putts-vs-expected
sums to exactly zero by construction. It measures nothing. It would work for
trend if the baseline period and comparison period were split temporally, but
not for the thing this data was collected to do — decomposing a leak.

*Adopted: two directly-interpretable rates, neither needing a baseline curve.*

- **Chipping quality** — the distribution of first-putt distance following a
  green miss. "Chips finish beyond 30 feet 60% of the time" is actionable with
  no external reference at all; it is a description, not a comparison.
- **Putting quality** — **3-putt rate conditional on distance bucket** (and
  1-putt rate alongside it). This has the one legitimate non-arbitrary anchor
  available: two putts is regulation, by definition of the game, not by
  reference to any population of golfers. A 3-putt rate from inside 10 feet is
  damning without needing to know what anyone else shoots.

Together these answer the actionable question — *practice putting or chipping?*
— which the fused 8.3-stroke figure cannot. What they deliberately give up is a
single headline "X strokes lost to putting" number for the split. That number
was never obtainable honestly without an external baseline, and the round-level
leak ranking still reports the fused version for continuity.

Bucket boundaries and the minimum sample per bucket before a rate is reported
are implementation decisions for the plan; the `lowConfidence` pattern in
`computeGapping` (fewer than 5 clean shots per club) is the precedent to follow.

**This creates a third data tier.** Rollups must not silently mix them:

| Tier | Corpus | Supports |
|---|---|---|
| Round-level | All 31 rounds | Differential trend, career baselines |
| Hole-level | Rounds with `holeDetail` | Blow-ups, compounding vs standalone, par-3 isolation |
| Distance-aware | Rounds with first-putt distance (forward only) | True putting-vs-chipping split |

Each tier reports its own sample size. The distance-aware tier starts empty and
will be the smallest for some time, so its conclusions carry the weakest
confidence and should be labeled accordingly rather than presented alongside
31-round trends as equals.

Penalty capture remains deferred pending clarification — see open questions.

**Rollups unlocked:** putts after a green hit vs putts after a miss (the
compounding-vs-standalone split that separates putting from chipping);
double-bogey-or-worse count; par-3 approach performance isolated from
FIR-driven approach performance.

**Blow-up holes need a self-relative baseline.** "Four holes accounted for 45%
of strokes over par" is close to arithmetic for any high-handicap round — the
distribution is skewed by construction. Define the metric concretely
(double-bogey-or-worse count) and trend it against the user's own history, not
an absolute standard.

**Consistency risk — reframed by the workflow change.** The original risk was
an in-app flow being annoying enough to skip. That flow no longer exists; the
live risk now is that hole-level capture only happens when the user thinks to
send screenshots inside a Claude session, which skews toward rounds worth
talking about — the same memorable-rounds bias, different cause. Nothing in the
implementation fixes this; it is a standing limitation of the distance-aware and
hole-level tiers, which is exactly why they report their own sample size rather
than borrowing the round-level tier's.

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
- An in-app hole-detail import UI (paste-and-confirm). Superseded 2026-09-11 —
  Claude writes `data/hole-detail/*.json` directly during a session and commits.
- Penalty capture — Grint's PENALTIES row semantics are still unresolved (open
  question 3). Driving-miss severity is no longer deferred; see Phase 3.
- Any expected-putts-by-distance curve, imported or self-calibrated. The
  imported kind is not available bogey-calibrated; the self-calibrated kind is
  circular and measures nothing. Replaced by 3-putt rate by distance bucket and
  post-miss first-putt distance — see Phase 3.
- A single "X strokes lost to putting" figure for the putting/chipping split.
  Not obtainable honestly without an external baseline; the round-level leak
  ranking still reports the fused version.
- Backfilling hole detail for the existing 31 rounds.
- Writing data from the phone; it remains read-only.

## Open questions

1. ~~Does the Grint scorecard show putts per hole?~~ **Resolved 2026-09-11** —
   yes, and considerably more: par, score, putts, GIR with miss type, driving
   accuracy with miss direction and severity, and tee club, all per hole.
   Phase 3 is well-supported. A sample extraction is checked in at
   `data/hole-detail/2026-09-05-pinehurst-10.json`.
2. ~~What populates Grint's DISTANCE (ft) row, and what baseline should it be
   judged against?~~ **Resolved 2026-09-11** — it is first-putt distance,
   recorded going forward. No baseline curve is used at all: the split is
   measured as 3-putt rate by distance bucket (anchored to two-putt regulation)
   plus post-miss first-putt distance. A self-calibrated curve was approved
   first and then rejected as circular — see the Phase 3 section above.
3. Grint's **PENALTIES** row is mixed-use — it carries lie codes (`S` =
   greenside bunker) alongside penalty counts, and the sample round totals
   `0.5` rather than a whole number. Still open; penalty capture stays
   deferred until resolved (see Out of scope).
4. ~~Does `course.html` need findings and the current priority on the phone?~~
   **Resolved by the Phase 2b build** — no. Findings were deliberately kept
   off that page: it is an on-course yardage reference, and swing-mechanics
   findings do not belong in that moment. `course.html` shows no
   recommendations either.
5. ~~Should `index.html` and `range.html` share one recommendations view?~~
   **Resolved by the Phase 2b build** — no. Each shows only its own
   source-scoped history (`round` on the rounds page; `range`/`video` on the
   range page), reading the same committed `data/recommendations.json` but
   staged under separate localStorage keys so the two pages' unsaved edits
   cannot collide.

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
