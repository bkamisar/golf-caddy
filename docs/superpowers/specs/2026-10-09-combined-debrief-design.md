# Combined coach debrief — design

**Date:** 2026-10-09, revised the same day after an independent review
**Status:** approved; implemented per `docs/superpowers/plans/2026-10-09-combined-debrief.md`

## Problem

**1. Each debrief sees half the evidence.** `range.html` builds its prompt from
launch-monitor data and swing findings only; `index.html` from rounds and
hole-level data only. Verified: neither prompt contains the other's data.

The range debrief therefore made driver side-to-side spread the one priority. The
full evidence says that was the wrong call, but for a different reason than first
assumed:

| Source | What it shows | Sample |
|---|---|---|
| Toptracer, 2026-09-11 | spread about 64 yd, split into a left group and a right group, median 12 yd left | 14 shots |
| Trackman, 2026-08-22 | tight (about 17 yd) but 7 of 8 right, median about 28 yd right | 8 shots |
| Course | 68% fairways; driver misses with a side recorded: 4 of 4 right (5 of 6 across all tee clubs) | 71 driver tee shots, 9 rounds |

Trackman and the course agree on a steady miss right; the Toptracer session is the
odd one out. Toptracer measures side from the bay's centre line, so changing
targets alone could produce its split. The driver was the wrong priority mainly
because **it is the smaller lever**: a missed driver fairway costs about 0.65
strokes against a hit (2.04 vs 1.40 over par), roughly 1.9 strokes per 18, while
putting runs about 8.5 putts per round above expectation. A debrief that saw both
domains would have seen that.

**2. The debrief cannot save its own result.** It runs in a separate Claude
conversation with no access to the repo. Logging on the page writes to browser
storage, then needs a download, a file replacement, a commit and a push. That chain
is why `data/recommendations.json` is still empty.

**Goal:** one debrief that ranks problems by what they cost on the course, says
honestly where the evidence agrees and disagrees, and saves and later checks its
own priority with no manual steps.

## Constraints

- **No shot-level course data.** Grint has no practical export. The design works
  from scorecards; anything richer is a bonus, never a dependency.
- **Putts are counted on the green only** (confirmed by the user), so putting
  figures are genuine putting, not putts from the fringe.
- **Course data coverage** (139 captured holes):
  - Left or right actually recorded on 6 of 35 fairway misses and 1 of 120 green
    misses. Any label at all (including short, long, severe) on 23 of 35 and
    26 of 120.
  - First-putt distance on 27 of 139 holes (19%), possibly logged selectively.
  - Tee club on 111 of 139.
  - No approach club, approach distance, or hole yardage field.
- **Existing project rules stay:** no API calls or keys from the app; no
  population baselines, except the bogey-golfer putting expectation (2.15 putts on
  a green hit, 1.95 after a miss) the round analyzer already uses; instruments
  never pooled; outcomes never silently inferred.

## Evidence rules

| Tier | Source | Notes |
|---|---|---|
| A | `rounds.json`: 33 eighteen-hole rounds | Not self-selected. Preferred for anything it can answer |
| A | `hole-detail.json`: 9 rounds | Self-selected (the user chose which rounds to capture, including some deliberately bad ones) |
| B | Range sessions, one instrument at a time | Mat, known yardage, no hazards, flat lie; instrument-specific |
| C | Video findings | Usually a single swing; context, never a cause |

1. **Rank problems by course cost wherever the course can measure them.**
2. **A range-originated priority is allowed only where the course data
   structurally cannot see the problem**, such as wedge distance gaps (there is no
   approach data). It must be labelled range-originated and name a course outcome
   to watch.
3. **Report disagreement; don't settle it by fiat.** Neither source is presumed
   correct. Course data is self-recorded and coarse; range data is mat-based and
   instrument-specific. The debrief states which evidence agrees with which.
4. **Every figure carries its sample size and coverage.** Unrecorded is unknown,
   never counted as a miss.
5. **Instruments are never pooled.**
6. **"Not enough data" is a valid answer for any section.**

## Where strokes go

An earlier draft opened with an exact ledger splitting strokes over par into
"getting to the green" and "putting." It is arithmetically correct but
uninformative: it is anchored to regulation, so a high handicapper lands at about
80% "before the green" almost by construction, and stating putting as a 20% share
hid how large it is per round. It is replaced by comparisons within the golfer's
own data, reported per 18 holes. Categories overlap and are **never summed**.

| Comparison | Source | Current value |
|---|---|---|
| Putts above expectation, given greens hit | `rounds.json`, 28 rounds with putts and GIR | about 8.5 per round; above expectation in 28 of 28 rounds |
| Putts per round | `rounds.json`, 33 rounds | 44.3 (43.8 since 2025) |
| 3-putt holes | `hole-detail.json` | 53 of 139 holes, about 6.9 per 18 |
| Missed driver fairway, extra cost | `hole-detail.json`, 71 drives | about 0.65 strokes per miss, about 1.9 per 18 |
| Double bogey or worse | `hole-detail.json` | 71 of 139 holes; 103 of 227 over-par strokes are beyond bogey on those holes |
| Par-3 greens hit | `hole-detail.json` | 6 of 44 |

**Distance versus stroke, within putting.** Of 27 recorded first putts, only 2 were
inside 25 ft. After a missed green the median first putt is 40 ft (21 holes), and
from beyond 25 ft the 3-putt rate is 28% (25 holes). That suggests a large part of
the putting excess is long first putts: chips and approaches leaving 40-footers,
then lag putting. With distance on only 19% of holes, possibly logged selectively,
the debrief must call this suggestive. The most useful data request, and one
fully within the user's control, is **entering first-putt distance on every hole**.

## Cross-links today's data supports

Links are allowed only where both data sets measure the same thing.

1. **Driver.** Each instrument's side median and spread, reported separately,
   against course fairway rate and recorded miss sides.
2. **Par-3 tee shots.** The club used (44 holes: 7i x10, 4H x9, PW x7, 8i x4,
   9i x3, 5H x3, 8 unrecorded) against green hit or miss, against that club's range
   consistency. Per-club samples are small and flagged.
3. **Putting.** The existing 3-putt-by-first-putt-distance tier, with its
   10-hole-per-bucket minimum.

**Not allowed:** treating a range carry as an on-course yardage; blaming a course
outcome on a single-swing video finding; any average across instruments.

## Priority design

- **Stored with the existing source `'round'`.** The code already notes that
  putting drills "are assessed by round data," and a course-tested priority is
  exactly that. No new source value.
- **Criteria use measures with many chances every round:**
  - putts per round (in every Grint summary, so it needs no hole detail);
  - putts above expectation given greens hit;
  - 3-putt holes per 18 (hole detail);
  - double-bogey-or-worse holes per 18 (hole detail).

  These are computed per hole, so 9- and 13-hole rounds count, and the window is
  measured in holes (for example, the next 54).
- **The pass threshold comes from the golfer's own recent spread,** chosen so the
  chance of passing with no real change is about 10% or less. The facts script
  computes the threshold and reports both the no-change pass rate and the pass
  rate for a stated improvement, in plain words. With current data (last 10 rounds:
  mean 42.6 putts, SD 4.0), "average 39 putts or fewer over the next 3 rounds"
  passes 5% of the time with no change and 61% with a real 4-putt improvement.

  Rejected, because they are close to coin flips:

  | Test | Passes with no change |
  |---|---|
  | ≥3 par-3 greens in the next 15 | 34% |
  | Beat recent median in 2 of the next 3 rounds | 50% |
- **Running tally.** After every logged round, the scorecard skill prints the open
  priority's progress, so feedback arrives before the window closes.
- **Closing.** When the window completes, the debrief proposes met, not-met or
  insufficient-data with the evidence, and **the user confirms**. Outcomes are
  never silently inferred.
- **One open priority at a time.** Writing a new priority closes any open one.
  (There are none today.)
- **Same-day collision.** `recKey` is `date|source`. If an open `'round'` record is
  dated today, update it in place rather than writing a colliding second record.

### Page changes

Only `range.html` changes, and all of these lines sit outside its engine block
(lines 170 to 1276), so `course.html` needs no re-mirror. `index.html` already
handles `'round'`. `REC_SOURCES` stays untouched: it is declared in all three files
and never read.

| `range.html` line | Role | Change |
|---|---|---|
| 1361 | logging guard: is a priority open? | add `'round'` |
| 1377 | close the open priority when logging a new one | add `'round'` |
| 1503 | the form shows the open priority | add `'round'` |
| 1517 | priority-history table filters out `'round'` | remove that filter |
| 1495 | range Copy-prompt continuity check | **leave unchanged**: the fallback range prompt has no round data to judge a round criterion |

Effect: the open priority shows on both dashboards, including at the range where it
gets practised, and both pages' close-before-logging guards enforce one open
priority.

## Delivery

**Skill:** `.claude/skills/coach-debrief/SKILL.md`.

**Facts script:** `tools/debrief-facts.js`.
- Loads each page's engine block into its **own `vm` context**. Concatenating
  them is a `SyntaxError`, because the pages redeclare names such as `p2` and
  `median` differently, and they define `SOURCES` and `coachPrompt` with different
  meanings. Top-level `const`/`let` are not properties of the context object, so
  they are read with `vm.runInContext('NAME', ctx)`.
- **Reuses existing engine functions** wherever they exist (`threePuttRates`,
  `chipProximity`, `blowUpHoles`, `puttsByGreenResult`, `overParByParType`,
  `computeMetrics`, `computeGapping`, and others).
- **Adds only what is new:** driver hit-versus-miss cost, the putts-above-expectation
  series, per-instrument driver side statistics, criterion thresholds with their
  pass probabilities, and criterion evaluation.

**Numbers come from tested code, never from the model's mental arithmetic.** The
model's job is judgment and wording.

**Cadence.**
- **Every logged round:** the scorecard skill prints a progress line for the open
  priority.
- **Full debrief:** only when the priority's window completes, no priority is open,
  or the user asks.

The `grint-scorecard-capture` skill's "After writing the entry" section gains that
step.

**Procedure for a full debrief:**
1. Run the facts script.
2. Write the debrief.
3. Propose one priority, with its test, window, and pass odds.
4. Get the user's confirmation.
5. Write `data/recommendations.json` with `tools/write-priority.js`, in the
   pages' own save format (`JSON.stringify(recs, null, 1)`), so unchanged
   records keep identical bytes.
6. Commit locally and remind the user to push.

The existing Copy-prompt buttons stay unchanged as a fallback when no session is
available.

## Debrief structure

1. **Continuity.** The open priority, evaluated against course data.
2. **Where strokes go.** The within-player comparisons, each with sample size and
   coverage.
3. **What range and video add, and where the evidence agrees or disagrees.**
   Required, even if the answer is "they agree."
4. **The biggest lever.**
5. **One priority.** The drill, the course test, the window, and in plain words how
   likely it is to pass by luck versus with real improvement.
6. **What this can't tell you.** The data gaps, including which recording habit
   would close each one.

## Testing

New `test-debrief-facts.js`, covering:

- Both engines load in one process with no interference, including reading a
  top-level `const`.
- Each comparison in "Where strokes go" against a hand-built fixture.
- Putts above expectation per round.
- Criterion thresholds and pass probabilities. A seeded random generator keeps
  these deterministic.
- 9-hole rounds are normalised per hole.
- Short or empty windows return insufficient-data.
- Priority record shape and the same-day update-in-place rule.

The `range.html` page edits are UI code outside the engine block. Verify them in a
browser: a `'round'` priority shows in the form and the history table, and blocks
logging a second one.

The three existing engine suites must still pass.

## Out of scope

- Shot-level or approach data from the course.
- A new page, or any model call from the app.
- Cross-domain data inside the existing Copy-prompt buttons, and retiring them.
  Both are later decisions.
- The schematic diagram, and any change to how swings are measured.

## Open questions

- Whether Grint's **Shots** view records per-shot club and distance is unknown.
  This design does not depend on it.
- Whether the debrief text itself should be kept anywhere, or only the priority.
  First version: only the priority.

## Review record

An independent review (Opus, fresh context, no access to the design conversation)
returned **"right approach, change X."** Every load-bearing number it cited was
re-verified against the data before being accepted.

**Accepted:**
- Replace the ledger with within-player comparisons.
- Correct the driver account: mixed evidence, not refuted, and a smaller lever.
- Correct the coverage figures, which had counted short, long and severe as
  "direction."
- Reject the par-3 count test.
- Allow labelled range-originated priorities where the course can't see the
  problem.
- Lighter cadence.
- Reuse the `'round'` source instead of adding `overall`.
- Drop the `course.html` re-mirror (`REC_SOURCES` is never read).
- Read top-level `const` with `runInContext`.

**Changed from the review:** its proposed test, "beat your recent median in 2 of
the next 3 rounds," passes 50% of the time with no change. It was replaced by a
window average against a threshold derived from the recent spread.

**Added after the review:**
- The putting finding was re-checked against greens hit (still about 8.5 per
  round, above expectation in 28 of 28 rounds).
- The user confirmed putts are counted on the green only.
- Long first putts suggest a proximity component within putting.
- `range.html` line 1517 also filters out round priorities.
- The range prompt's continuity line (1495) is deliberately left alone.
