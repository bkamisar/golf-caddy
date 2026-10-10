# Combined coach debrief — design

**Date:** 2026-10-09
**Status:** direction approved by the user; awaiting spec review before a plan is written

## Problem

Two things are wrong with how debriefs work today.

**1. Each debrief sees half the evidence.** `range.html` builds a prompt from
launch-monitor data and swing findings only. `index.html` builds one from rounds
and hole-level data only. Verified: neither prompt contains the other's data. That
produced a confident wrong answer. The range debrief made driver side-to-side
spread the one priority and called it real. The other evidence disagrees:

| Source | Driver side-to-side spread | Sample |
|---|---|---|
| Toptracer, 2026-09-11 | about 64 yd | 14 shots |
| Trackman, 2026-08-22 | about 17 yd | 8 shots |
| On the course | fairway hit 68% | 71 tee shots, 9 rounds |

A 64-yard spread is incompatible with a normal fairway rate. The priority was most
likely an artifact of one instrument or one session.

**2. The debrief cannot save its own result.** It happens in a separate Claude
conversation with no access to the repo. The priority only reaches the website if
the user remembers to log it by hand, and they forget.

**Goal:** one debrief, anchored in the evidence that best reflects scoring, that
saves its own priority and checks the previous one.

## Constraints

- **No shot-level course data.** Grint offers no practical export, so the design
  must work from scorecards alone. Anything richer is a bonus, never a dependency.
- Course data coverage today (139 captured holes): direction recorded on 22% of
  green misses (26/120) and 66% of fairway misses (23/35); first-putt distance on
  19% of holes (27/139); tee club on 80% (111/139). There is no approach club,
  approach distance, or hole yardage field.
- Existing project rules stay: no API calls or keys from the app, no population
  baselines, instruments never pooled, outcomes never silently inferred.

## Evidence rules

The course decides *what* the problem is. The range and video can only help
explain *why*.

| Tier | Source | Role |
|---|---|---|
| A | Course outcomes: `rounds.json` (33 eighteen-hole rounds), `hole-detail.json` (9 rounds) | Defines the problem and the priority |
| B | Range sessions, one instrument at a time | Diagnostic. Describes what the golfer can do on a mat with known yardages, no hazards, a flat lie |
| C | Video findings | Mechanism. Usually a single swing, so context only |

1. **A priority must point to a cost on the course.** Range or video evidence can
   support or contradict one. It can never originate one.
2. **The course wins a disagreement.** The conflicting range figure is flagged for
   recalibration, never averaged in.
3. **Every figure carries its sample size and how much was actually recorded.**
   Unrecorded is unknown, never counted as a miss.
4. **Instruments are never pooled.** Range numbers compare within one instrument.
5. **Sampling bias is disclosed.** The user chooses which rounds get hole-level
   capture, including some deliberately bad ones, so hole-level rates are weaker
   evidence about a typical round than their precision suggests.
6. **"Not enough data" is a valid answer for any section.**

## The stroke ledger

Every hole decomposes exactly, anchored only to the two-putt rule:

```
strokes over par = (score - putts - (par - 2)) + (putts - 2)
                   \_______ getting to the green _______/   \_ putting _/
```

Current result over 139 holes: **227 strokes over par = 182 getting to the green
(80%) + 45 putting (20%).** The split is consistent per round (before-the-green
ranges 67% to 93%). It needs no comparison to other golfers.

**Limit, to be stated in every debrief:** "getting to the green" mixes tee shots,
approaches, recoveries, chips and penalties, and the current data cannot split it
further. The debrief must say so rather than imply a finer attribution.

## Cross-links that today's data supports

Links are allowed only where both data sets measure the same thing.

1. **Driver:** range side-to-side spread against on-course driver fairway rate
   (n = 71 tee shots).
2. **Par-3 tee shots:** the club used (44 holes: 7i x10, 4H x9, PW x7, 8i x4,
   9i x3, 5H x3, 8 unrecorded) against green hit/miss, against that club's range
   consistency. Per-club samples are small and must be flagged as such. This is the
   closest available substitute for approach data, since a par-3 tee shot is an
   approach shot with a known club.
3. **Putting:** the existing 3-putt-by-first-putt-distance tier, with its
   10-hole-per-bucket minimum.

**Not allowed:** treating a range carry as an on-course yardage; blaming a course
miss on a single-swing video finding; any average across instruments.

## Priority design

- **One open priority overall**, stored with a new source value `overall`.
  Existing fields are unchanged:
  `{date, source: 'overall', priority, criterion, outcome, outcomeNote, outcomeDate}`.
- **The criterion is a course test with an explicit window**, not a range number.
  Example: "at least 3 of the next 15 par-3 holes with hole detail are greens hit."
  The drill is the means. The course result is the test. Only rounds dated after the
  priority count.
- **Checkable by name.** The facts script exposes a small set of named course
  metrics over a date window: par-3 green rate, driver fairway rate, 3-putt rate,
  blow-up rate (double bogey or worse), and before-the-green strokes per hole.
  Criteria should be written in those terms. A criterion outside the set is
  allowed but is judged by the user.
- **Closing.** The debrief computes the metric, proposes met / not-met /
  insufficient-data with the evidence, and the **user confirms**. It is
  `insufficient-data` until the window has enough exposure. Outcomes are never
  silently inferred.
- **One open at a time.** Writing the new priority closes any other open priority
  (none exist today: `recommendations.json` is empty).
- **Same-day collision.** `recKey` is `date|source`, so a close and a new write for
  the same source on the same day would overwrite. If an open `overall` record is
  dated today, update it in place.

### Page changes this requires

The pages filter priorities by hardcoded source lists, so an `overall` priority is
invisible to them until each is updated (verified: `lastRecommendation` with
`['range','video']` does not return an `overall` record).

| File | Lines (as of this spec) | Change |
|---|---|---|
| `range.html` | 1361, 1377, 1495, 1503 | add `'overall'` to `['range','video']` |
| `index.html` | 881, 923, 973, 989 | add `'overall'` to `['round']` |
| both engine blocks | `REC_SOURCES` (1093, 655) | add `'overall'` |
| `course.html` | engine block | re-mirror from `range.html` using the helpers-marker splice documented in `2026-09-14-plain-language-findings.md` Task 3, never a wholesale replace |

Effect: the open priority shows on both dashboards, and each page's existing
close-before-logging guard enforces one open priority.

## Delivery

**Skill:** `.claude/skills/coach-debrief/SKILL.md`.

**Facts script:** `tools/debrief-facts.js`. It loads each page's engine block into
its **own `vm` context**, reads the committed JSON, and prints a facts report: the
ledger, coverage rates, per-instrument range digests, par-3 outcomes by club, the
driver cross-check, a findings digest, the open priority, and its criterion
evaluated. Feasibility is verified: both engines run on the real data in a single
process with no collisions, which a plain concatenation cannot do (it is a
`SyntaxError`, because the pages declare some of the same names, notably
`SOURCES` and `coachPrompt`, differently).

**Numbers come from tested code, never from the model's mental arithmetic.** The
model's job is judgment and wording.

**Procedure:** run the facts script, write the debrief, propose one priority, get
confirmation, edit `data/recommendations.json` surgically (no reserialising),
commit locally, and remind the user to push.

**Trigger:** offered at the end of logging a round, when the data is fresh, and
available on request. The offer is real work, not an assumption: the
`grint-scorecard-capture` skill's "After writing the entry" section gains one step
telling the session to offer the debrief once the round is committed. The existing
"Copy prompt" buttons stay unchanged as a fallback for when no session is
available.

## Debrief structure

1. **Continuity.** The last priority, evaluated against course data.
2. **What the course says.** The ledger, blow-ups, par-type, putting tiers, each
   with n and coverage.
3. **What range and video add, and where they disagree with the course.** A
   required section, even if the answer is "they agree."
4. **The biggest lever.** Course-anchored.
5. **One priority.** The drill, the course test, and the window.
6. **What this can't tell you.** The data gaps that limit the answer.

## Testing

New `test-debrief-facts.js`, covering:

- The ledger identity: the two parts sum to strokes over par on every hole and in
  total.
- Coverage counts and par-3-by-club tables match a hand-built fixture.
- Both engines load in one process and neither's functions interfere with the
  other's.
- Named course metrics over a date window, including the empty-window case.
- Criterion evaluation returns `insufficient-data` below the exposure threshold.
- Priority record shape, the same-day update-in-place rule, and that
  `lastRecommendation` on both pages' source lists returns an `overall` record.
- The existing `test-course-engine.js` parity tests still pass after the re-mirror.

## Out of scope

- Shot-level or approach data from the course (no export exists).
- A new page, or any model call from the app.
- Cross-domain digests inside the existing app prompts, and retiring them.
  Both are later decisions.
- The schematic diagram, and any change to how swings are measured.

## Open questions

- Whether Grint's **Shots** view records per-shot club and distance is unknown. If
  it ever yields reliable data, the ledger could be split further. This design does
  not depend on it.
- Criterion windows depend on exposure (roughly five par 3s per 18 holes), so they
  are set per priority in the debrief rather than by a fixed rule.
