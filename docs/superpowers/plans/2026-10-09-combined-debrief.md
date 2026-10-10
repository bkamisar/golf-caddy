# Combined Coach Debrief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One coach debrief that ranks problems by what they cost on the course, says where course, range and video evidence agree or disagree, and saves and later checks its own priority without manual file steps.

**Architecture:** Node scripts under `tools/` load each page's `/*ENGINE-START*/…/*ENGINE-END*/` block into its own `vm` context and reuse the page's own analysis functions. Small new modules add only what doesn't exist yet: course facts, a per-instrument range digest, bootstrap-calibrated course tests, a progress line and a priority writer. A new `coach-debrief` skill runs the scripts, writes the debrief, and saves the confirmed priority to `data/recommendations.json`. `range.html` gets four one-line page-code edits so a course-tested (`'round'`) priority shows and blocks double-logging there too.

**Tech Stack:** Node built-ins only (`fs`, `path`, `vm`, `os`). Plain HTML/JS pages. Tests use the repo's existing `chk(name, cond)` harness style.

**Spec:** `docs/superpowers/specs/2026-10-09-combined-debrief-design.md`

## Status at hand-off

Tasks 1–6 were written and run against the real data while this plan was being drafted; Tasks 7–8 followed in the same session (user chose to finish on Opus). All are committed. **None has been independently reviewed yet.** The code for Tasks 1–6 lives in the files named under each task and is not repeated here. Task 9 (the first real debrief) is next.

## Global Constraints

- Work on `master`. Commit locally after each task with a descriptive message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (or the current session's attribution line). **Never** run `git push`, `git fetch` or `git pull`: the user pushes via GitHub Desktop.
- No change inside any `/*ENGINE-START*/…/*ENGINE-END*/` block, and no change to `course.html`.
- Node built-ins only; no npm packages; no network calls; no API keys.
- `data/recommendations.json` is written only by `tools/write-priority.js`, in the pages' own save format (`JSON.stringify(recs, null, 1)` plus a trailing newline).
- Every number in a debrief comes from `tools/debrief-facts.js`, never from mental arithmetic.
- Instruments are never pooled. Unrecorded values are unknown, never counted as misses.
- Outcomes are never inferred: the user confirms met / not-met / insufficient-data.
- Never commit photos, video frames or any likeness of the user (public repo).
- The three existing suites (`test-engine.js`, `test-range-engine.js`, `test-course-engine.js`) and the new `test-debrief-facts.js` must all print `ALL PASS`.

## Review Focus

1. **A free-text priority logged on a page** (no `test` field) is open when a round is logged. Expected: the progress line says "judge it by hand", and nothing crashes. Pinned by F2.
2. **A round played on the same day as the debrief.** Expected: it counts in the baseline the debrief saw, not in the new test's window. Pinned by K5 (baseline) and K6 (window).
3. **The window overshoots** (54-hole window; 18+18+9+18 rounds). Expected: the crossing round counts whole, and later rounds are ignored. Pinned by K6.
4. **Too little history for a fair test** (fewer than 5 baseline rounds). Expected: an explicit "not enough rounds" message, never a made-up threshold. Pinned by K5, and by the writer's refusal in Task 6.
5. **Rows with putts or GIR missing, or the 11-putt nine quarantined by the engine.** Expected: skipped, not counted as zero. Pinned by C1 and K1.

---

### Task 1: Engine loader and test scaffold — DONE, needs review

**Files:**
- Create: `tools/debrief/load.js`
- Create: `test-debrief-facts.js` (section L)

**Interfaces (produced):**
- `engineBlock(file) -> string`: normalises CRLF and throws `Engine markers missing in <file>`.
- `loadEngine(file) -> (name: string) => any`: one fresh `vm` context per call.
- `loadEngines(root = ROOT) -> { range, round }`: two accessors, for `range.html` and `index.html`.
- `loadData(root = ROOT) -> { rounds, details, range, findings, recs }`: parsed `data/*.json`.
- `localToday(d = new Date()) -> 'YYYY-MM-DD'`: local calendar date, not UTC.
- `ROOT`: the repo root.

**Why an accessor and not the context:** top-level `const` (for example `EXP_PUTT_GIR`) is not a property of the context object; it can only be read by evaluating its name with `vm.runInContext`.

- [x] Tests L1–L3 written: both engines load side by side, a `const` and a `var` are readable, the `coachPrompt` functions stay distinct, missing markers throw, and `localToday` is local.
- [x] `node test-debrief-facts.js` reports L1–L3 PASS.

### Task 2: Course facts — DONE, needs review

**Files:** Create `tools/debrief/course.js`. Tests: section C.

**Interfaces:** each function takes plain data plus `E` (the round accessor).
- `allHoles(details)`
- `puttsSummary(rounds, E) -> { perRound18:{n,mean}, recent10:{n,values,mean,sd}, aboveExpectation:{n,meanPer18,roundsAbove} }`, using `enrich` from the engine.
- `threePutts(details) -> { holes, threePutts, per18 }`
- `driverCost(details) -> { drives, fairwayRate, overParHit, overParMiss, costPerMiss, missesPer18, costPer18, missLabels, driverSides:{left,right}, allClubSides:{left,right} }`
- `blowUps(rounds, details, E) -> { rounds, holes, blowUpHoles, per18, strokesBeyondBogey, totalOverPar }`, using `blowUpHoles` and `attachHoleDetail`.
- `par3(details) -> { holes, greens, byClub:{ [club]:{n,greens} } }`
- `coverage(details) -> { rounds, holes, fairwayMisses:{n,leftRight,anyLabel}, greenMisses:{…}, firstPuttDistance, teeClub }`
- `puttingDistance(rounds, details, E) -> { threePuttByDistance[], afterMissedGreen:{n,medianFt}, firstPutts:{n,under25} }`, using `threePuttRates` and `chipProximity`.
- `courseFacts(data, E)`: all of the above, keyed `putts`, `threePutts`, `driver`, `blowUps`, `par3`, `puttingDistance`, `coverage`.

**Real-data check (2026-10-09):** the output matches every figure in the spec's "Where strokes go" table: 53/139 three-putts (6.86 per 18); driver 0.65 per miss and 1.93 per 18; 71 blow-ups and 103 of 227 strokes beyond bogey; 6/44 par-3 greens; coverage 6/35, 23/35, 1/120, 26/120, 27 and 111. One difference: putts above expectation uses 36 rounds of all lengths, normalised per 18 (8.46), where the spec quotes 28. The per-hole basis is the spec's own rule.

- [x] Tests C1–C7 against a 6-hole hand-built fixture with hand-computed answers.
- [x] PASS.

### Task 3: Range digest — DONE, needs review

**Files:** Create `tools/debrief/range.js`.

**Interfaces:** `E` is the range accessor.
- `rangeDigest(range, E) -> [{ source, sessions, clubs:[{name,n,cleanCarryYd,carryIqrYd,sideBiasYd,sideIqrYd,mishitRate,sessionCount,lastSeen,lowConfidence}] }]`. One entry per instrument, from `groupByClub` and `computeGapping`.
- `driverSides(range, E) -> [{ date, source, n, medianYd, iqrYd, widthYd, right, left }]`. Clean shots only, grouped per instrument before the quarantine; side converted from metres with `M_TO_YD`.
- `findingsDigest(findings, E) -> string[]`, from `findingsForPrompt` after `gradeFinding`.

**Real-data check:** Trackman 2026-08-22 gives 8 clean shots, median 28.5 yd right, 7 right. Toptracer 2026-09-11 gives 13 clean shots, median 8 yd left, IQR 66. The spec quoted 14 shots and 12 left because it included one quarantined shot; the script's figure is the right one.

- [x] Covered by F4: the report builds, and there is one entry per source.

### Task 4: Course tests (criteria) — DONE, needs review

**Files:** Create `tools/debrief/criteria.js`. Tests: section K.

**Interfaces:**
- `METRICS`: the keys are `putts`, `putts-vs-expected`, `three-putts` and `blow-ups`. Each has a `label` and a `values(data, E)` function. All are lower-is-better.
- `roundValues(metric, data, E) -> [{date, holes, total}]`, sorted by date. Throws `Unknown metric`.
- `mulberry32(seed) -> () => [0,1)`
- `calibrate(values, since, windowHoles, improvementPer18, opts?)` returns one of:
  - `{insufficient:true, baselineRounds, needed}`
  - `{insufficient:false, baselineRounds, baselinePer18, threshold, windowHoles, since, improvementPer18, falsePass, passIfImproved}`

  How it works:
  - The baseline is the last 10 rounds dated on or before `since`. Fewer than 5 means insufficient.
  - It runs 20,000 seeded bootstrap trials, drawing whole rounds until the window's hole count is reached.
  - The threshold is the largest value on a 0.5 grid that passes by luck at most 10% of the time.
  - `passIfImproved` reads the same distribution at `threshold + improvementPer18`.
- `evaluate(test, values) -> { rounds, holes, windowHoles, per18, threshold, complete, proposed: 'met'|'not-met'|'insufficient-data' }`. Rounds after `since` fill the window, and the round that crosses it counts whole.

**Real-data check, for a 54-hole window:**

| Test | Threshold | Passes by luck | Passes with improvement |
|---|---|---|---|
| Putts | 39.5 per 18 | 9% | 73% with −4 |
| Putts vs expected | 5 | 9% | 69% with −4 |
| 3-putts | 4 | 5% | 36% with −2 |
| Blow-ups | 7.5 | 5% | 65% with −2 |

- [x] Tests K1–K6 cover per-hole normalisation, determinism, the 10% ceiling, the last-10 baseline, under 5 rounds, the same-day round, empty, partial and overshooting windows, and met vs not-met.
- [x] PASS.

### Task 5: Facts CLI — DONE, needs review

**Files:** Create `tools/debrief-facts.js`. Tests: section F.

**Interfaces:**
- `ALL_SOURCES = ['range','video','round']`
- `openPriority(data, E) -> null | { rec, evaluation | null }`: the newest pending record across all sources.
- `buildReport(data, E) -> { open, course, range:{bySource, driverSides}, findings }`
- `progressLine(data, E) -> string`. The five cases are: none open; open without a test; no rounds yet; in progress; complete (proposes MET or NOT MET and asks for the debrief).
- `proposeTest(data, E, metric, improvementPer18, windowHoles = 54, since = localToday())`
- `proposalSentence(p) -> string`
- `testSentence(test) -> string`

**CLI:**
- `node tools/debrief-facts.js` prints the report as JSON.
- `--progress` prints one line.
- `--propose <metric> <improvementPer18> [windowHoles]` prints a plain sentence, then a JSON line. An unknown metric prints usage and exits 1.

- [x] Tests F1–F5 PASS. Manual runs of all three modes behave as described.

### Task 6: Priority writer — DONE, needs review

**Files:** Create `tools/write-priority.js`. Tests: section W.

**Interfaces:**

`applyPriority(recs, {date, priority, criterion, test?, close?, closeNote?}, E) -> recs` is a pure function. It throws with a message meant for the user. In order:
- **Same-day revision.** If the open record is `'round'` and dated `date`, it is revised in place.
- **Open priority needs an outcome.** Otherwise, any open record requires `close`. The newest open record gets the confirmed outcome, and older open ones become `insufficient-data` with the note "superseded by the <date> priority".
- **Bad `close` values.** `close` with nothing open is an error, and so is a `close` value outside `met`, `not-met` and `insufficient-data`.
- **Collision.** An existing `<date>|round` record (already closed) is a collision error.
- **New record.** Appends `{date, source:'round', priority, criterion, outcome:'pending', outcomeNote:null, outcomeDate:null, test?}`, sorted with the engine's `mergeRecommendations`.
- **Output.** Plain objects, outside the vm's realm.

**CLI:**
- `--priority "<drill>"`
- `--metric <m> --improvement <n> [--window 54]`: computes the test itself and writes the criterion sentence.
- `--criterion "<text>"`: free text, for a range-originated priority judged by hand.
- `--close <outcome> [--close-note "..."]`
- `--date YYYY-MM-DD`
- `--dry-run`

Errors exit 1 with the message. Writes `JSON.stringify(recs, null, 1) + '\n'`.

- [x] Tests W1–W7 PASS. A `--dry-run` with `--metric putts --improvement 4` printed a valid record.

---

### Task 7: `range.html` shows and guards course-tested priorities — DONE

**Files:** Modify `range.html` page code only, outside the engine block (lines 170–1276):
- line 1361 in `doAddRec`
- line 1377 in `doAddRec`
- line 1503 in `render`
- line 1517 in `render`

Line 1495 (`const openRec = …` for the range Copy-prompt) is **left unchanged**: the fallback range prompt has no round data to judge a round test.

**Interfaces:** consumes the existing page functions `lastRecommendation`, `closePending` and `loadRecs`, and the localStorage key `golfcaddy_recs`. Produces no new names.

- [x] **Step 1: Confirm the line numbers.**

Run: `grep -n "\['range', 'video'\]\|r.source !== 'round'" range.html`

Expected: exactly lines 1361, 1377, 1495, 1503 and 1517. If they have moved, use the matches; the text is what matters.

- [x] **Step 2: Edit the two identical `pending` lines (1361 and 1503).** Use Edit with `replace_all: true`.

Old: `  const pending = lastRecommendation(recs, ['range', 'video']);`

New: `  const pending = lastRecommendation(recs, ['range', 'video', 'round']);`

- [x] **Step 3: Edit line 1377.**

Old: `    recs = closePending(recs, ['range', 'video'], sel.value, null, today);`

New: `    recs = closePending(recs, ['range', 'video', 'round'], sel.value, null, today);`

- [x] **Step 4: Edit line 1517.**

Old: `  recRows = recs.filter(r => r.source !== 'round').slice().reverse();`

New: `  recRows = recs.slice().reverse();`

`doDeleteRec(i)` looks rows up by index in `recRows` and deletes by `recKey`, so round rows in the table delete correctly.

- [x] **Step 5: Run all suites.**

Run: `node test-engine.js | tail -1 && node test-range-engine.js | tail -1 && node test-course-engine.js | tail -1 && node test-debrief-facts.js | tail -1`

Expected: four lines of `ALL PASS`. `test-course-engine.js` proves the engine block, which is mirrored into `course.html`, is untouched.

- [x] **Step 6: Verify in the browser.** Start the preview with `preview_start {name: "golf-caddy-http"}` and navigate to `http://localhost:8940/range.html`. Then run in the page:

```js
localStorage.setItem('golfcaddy_recs', JSON.stringify([{date:'2026-10-01',source:'round',priority:'TEST lag ladder',criterion:'TEST putts <= 39.5 per 18 over 54 holes',outcome:'pending',outcomeNote:null,outcomeDate:null}]));
location.reload();
```

Check with `get_page_text` or `read_page`:
- (a) The "Log a practice priority" box shows "Open priority from 2026-10-01: TEST lag ladder" with the outcome dropdown.
- (b) The priority history table has a row with source `round`.

Then:
- (c) Type a priority and criterion, pick an outcome and click **Log priority**. The `round` row closes with that outcome, and exactly one pending row remains, the new one.

Take a screenshot as proof.

- [x] **Step 7: Clean up.** Run `localStorage.removeItem('golfcaddy_recs'); location.reload();` and confirm the box shows no open priority. Stop the preview.

- [x] **Step 8: Commit.**

```bash
git add range.html
git commit -m "Show and guard course-tested priorities on the range page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Skills, README, and spec amendment — DONE

**Files:**
- Create: `.claude/skills/coach-debrief/SKILL.md`
- Modify: `.claude/skills/grint-scorecard-capture/SKILL.md` ("After writing the entry")
- Modify: `README.md` ("The practice loop")
- Modify: `docs/superpowers/specs/2026-10-09-combined-debrief-design.md` (Delivery, step 5)

**Interfaces:** consumes the commands from Tasks 5 and 6. There is no code.

- [x] **Step 1: Create `.claude/skills/coach-debrief/SKILL.md`** with exactly this content:

````markdown
---
name: coach-debrief
description: Use when the user asks for a coach debrief, asks what to practise next, or when a scorecard capture reports that the open practice priority's window is complete. Combines round, hole-level, launch-monitor and video evidence, ranks problems by course cost, and saves the confirmed priority to data/recommendations.json.
---

# Combined coach debrief

One debrief across every data source, run in a Claude Code session in this repo
so it can save its own priority. Design: `docs/superpowers/specs/2026-10-09-combined-debrief-design.md`.

## Rules

- **Every number comes from `node tools/debrief-facts.js`.** Never compute a
  figure in your head. If a figure you want isn't in the report, say so.
- **Rank problems by what they cost on the course** wherever course data can
  measure them. A range-originated priority is allowed only where course data
  structurally cannot see the problem (such as wedge distance gaps: there is no
  approach data). Label it range-originated and name a course outcome to watch.
- **Report disagreement; don't settle it.** Course data is self-recorded and
  coarse; range data is mat-based and instrument-specific. Say which evidence
  agrees with which.
- **Every figure carries its sample size and coverage.** Unrecorded is unknown,
  never a miss. Never average across instruments.
- **"Not enough data" is a valid answer** for any section.
- **Video findings are context, never a cause.** Usually one swing.
- **Write like a golf coach, not a statistician.** No p-values, no "bootstrap",
  no measurement plumbing. State confidence in plain words.
- **Never infer an outcome.** The user confirms met, not met, or not enough data.

## When to run a full debrief

Only when: the open priority's window is complete, no priority is open, or
the user asks. After an ordinary round, the scorecard skill's progress line is
enough.

## Procedure

1. Run `node tools/debrief-facts.js` and read the whole report.
   - `open` is the open priority and its evaluation (`evaluation` is null for a
     free-text priority logged on a page, which you judge by hand).
   - `course` is tier A evidence; `range.bySource` and `range.driverSides` are
     tier B, one instrument each; `findings` is tier C.
   - The script reads only committed files. If the user mentions a priority
     they logged on a page but never saved to the data file, it is not here:
     ask them for its text.
2. Write the debrief in this order:
   1. **Continuity.** The open priority, its test, and the evaluation. If the
      window is complete, propose the outcome the numbers support and ask the
      user to confirm it.
   2. **Where strokes go.** Putts above expectation, putts per round, 3-putt
      holes, missed-driver cost, blow-ups, par-3 greens — each per 18 with its
      sample. These overlap; never add them up.
   3. **What range and video add, and where the evidence agrees or
      disagrees.** Required, even if the answer is "they agree".
   4. **The biggest lever.**
   5. **One priority.** The drill, the course test, the window, and in plain
      words how likely it is to pass by luck versus with real improvement.
   6. **What this can't tell you.** The data gaps, and which recording habit
      would close each (for example: first-putt distance on every hole).
3. Pick the test with `node tools/debrief-facts.js --propose <metric> <improvementPer18> [windowHoles]`.
   Metrics: `putts`, `putts-vs-expected`, `three-putts`, `blow-ups`. Choose an
   improvement that is ambitious but realistic for the drill. Use the printed
   sentence for the luck-versus-improvement odds. If it reports not enough
   rounds, say so and use a free-text criterion instead.
4. Ask the user to confirm the priority and, if one is open, its outcome. Do
   not write anything until they have.
5. Save it:
   - Course-tested: `node tools/write-priority.js --priority "<drill>" --metric <metric> --improvement <n> [--window <holes>] [--close <met|not-met|insufficient-data> --close-note "<why>"]`
   - Range-originated: `node tools/write-priority.js --priority "<drill>" --criterion "<test, including the course outcome to watch>" [--close …]`
   Run it with `--dry-run` first if anything is unusual. Never edit
   `data/recommendations.json` by hand.
6. Run `node test-debrief-facts.js` and confirm `ALL PASS`, then commit
   `data/recommendations.json` with a message naming the priority, for example
   `Set practice priority: lag putting ladder (putts <= 39.5 per 18 over 54 holes)`.
   Local commit only; remind the user to push in GitHub Desktop.

The pages' Copy-prompt buttons still work as a fallback when no Claude Code
session is available.
````

- [x] **Step 2: Add the progress step to the scorecard skill.** In `.claude/skills/grint-scorecard-capture/SKILL.md`, replace the "After writing the entry" list with:

```markdown
1. Run `node test-engine.js` from the repo root and confirm `ALL PASS`.
2. Commit with a descriptive message naming the round (date + course), e.g.
   `Add hole-level detail for the 2026-09-12 Paint Branch round`. Local
   commit only — this repo's standing rule is no `git push`/`fetch`/`pull`
   from the CLI; the user pushes via GitHub Desktop.
3. Run `node tools/debrief-facts.js --progress` and show the user the line it
   prints. If it says the window is complete, or that no priority is open,
   offer a full debrief (the `coach-debrief` skill). Otherwise the line is the
   whole update — don't run a full debrief unasked.
```

- [x] **Step 3: Update the README practice loop.** Replace the "The practice loop" section body, up to but not including `### Swing findings`, with:

```markdown
Each coach debrief opens with a continuity check, because the app remembers
what it told you last time.

**Preferred: the combined debrief in Claude Code.** Ask for a coach debrief in
a Claude Code session in this repo. It reads rounds, hole detail, launch-monitor
sessions and swing findings together (`node tools/debrief-facts.js`), ranks
problems by what they cost on the course, and proposes one priority with a
course test — for example "putts at or below 39.5 per 18 over the next 54
holes" — and how likely that is to pass by luck versus with real improvement.
Once you confirm, it saves the priority to `data/recommendations.json` itself
and commits; you push. After each logged round the scorecard capture prints
how the test is going.

**Fallback: the Copy-prompt buttons.**

1. Copy the debrief prompt into Claude and read what comes back.
2. It ends with one priority and a numeric success criterion. Log both under
   **Log a practice priority**.
3. Practice. Paste the new session.
4. The next debrief opens by asking whether you met that criterion. Record the
   answer when you log the next priority — one form does both.

Only one priority should be open at a time. The combined debrief and the range
page enforce that across every source; the rounds page checks only round
priorities. That is deliberate: the continuity check has to be answerable, and
three simultaneous open priorities make it a guess.
```

- [x] **Step 4: Amend the spec.** In `docs/superpowers/specs/2026-10-09-combined-debrief-design.md`:
  - Replace the line `5. Edit \`data/recommendations.json\` surgically (never reserialise it).` with `5. Write \`data/recommendations.json\` with \`tools/write-priority.js\`, in the pages' own save format (\`JSON.stringify(recs, null, 1)\`), so unchanged records keep identical bytes.`
  - Change the `**Status:**` line to `**Status:** approved; implemented per docs/superpowers/plans/2026-10-09-combined-debrief.md`.

- [x] **Step 5: Check the skill commands work as written.**

Run: `node tools/debrief-facts.js --progress && node tools/debrief-facts.js --propose putts 4 && node tools/write-priority.js --priority "check" --metric putts --improvement 4 --dry-run`

Expected: the progress line, the proposal sentence plus a JSON line, and a dry-run record. `git status` shows `data/recommendations.json` unchanged.

- [x] **Step 6: Commit.**

```bash
git add .claude/skills/coach-debrief/SKILL.md .claude/skills/grint-scorecard-capture/SKILL.md README.md docs/superpowers/specs/2026-10-09-combined-debrief-design.md
git commit -m "Add the coach-debrief skill and a progress step after each logged round" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: First real debrief (with the user)

Not a code task. Run it once Tasks 7–8 are in, ideally on the strongest model, since this is judgment.

- [ ] Invoke the `coach-debrief` skill and follow it end to end.
- [ ] Get the user's confirmation, run `write-priority.js`, run the tests, commit, and remind them to push.
- [ ] After their next push, open `range.html` and `index.html` on the live site and check that the priority shows on both.
