# Phase 2b — Conclusion Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app a memory of its own conclusions — a dated log of practice priorities with measurable criteria and recorded outcomes, and a standing list of swing findings — so each coach debrief checks the previous one instead of starting cold.

**Architecture:** Two new committed JSON files following Phase 1's exact storage pattern (baseline fetch + localStorage staging + tombstones). Engine functions duplicated between `index.html` and `range.html` per this suite's established no-bundler convention, with `range.html`'s copy mirrored verbatim into `course.html`.

**Tech Stack:** Vanilla JS, no dependencies. Node for the three test harnesses.

**Spec:** `docs/superpowers/specs/2026-09-11-analysis-platform-design.md` (Phase 2)

---

## Why this exists

Phase 2a rewrote both prompts to open with a continuity check. It currently always renders `none on record`, because nothing stores what was recommended. This phase fills that gap and closes the loop:

> debrief → log the priority → practice → next debrief evaluates it → record the outcome → log the next priority

Findings are the second half: video analysis produces observations about swing mechanics that are *conditions*, not events. They persist until resolved, which is why they are a standing list with a status rather than a dated log — and it is why a video session's date never needs to line up with a range session's.

---

## Design decisions settled before writing

These were open questions; the answers are load-bearing and should not be re-litigated mid-implementation.

**1. Outcomes are recorded by hand, not inferred.** Criteria are free text ("8 of 10 within 5 yards of median"). No parser can evaluate arbitrary natural-language criteria against shot data, and one that half-worked would silently mark things met that weren't. The app never guesses an outcome.

**2. The outcome is captured when the next priority is logged.** One form does both, because that is the moment the information exists: you have just read a debrief that told you whether you met the last criterion and gave you a new one. A separate "go back and close out an old recommendation" flow would be a second thing to remember, and would not get done.

**3. At most one pending recommendation per source.** The form refuses to add a new priority for a source while that source still has a pending one, until an outcome is supplied. Without this invariant the continuity check has to guess which of several open priorities it is asking about.

**4. Recommendations are keyed by `date + source`.** `range.html` and `index.html` each produce debriefs about different things and may both write on the same day. They do not collide.

**5. Continuity is source-scoped, and video priorities belong to the range.** `index.html` reads `round`; `range.html` reads `range` and `video`. A putting drill cannot be assessed from launch-monitor data, and a swing-mechanics priority derived from video is exactly what range data *does* assess.

**6. Findings do not appear on `course.html`.** That page is an on-course yardage reference. Feeding swing-mechanics thoughts to someone standing over a ball is actively counterproductive, and the spec already gives that page its "today's reminders" from verdicts. Deliberately omitted, not overlooked.

---

## Critical conventions

1. **`var`, not `const`, for engine bindings referenced by bare name in tests.** The harness extracts the `/*ENGINE-START*/`–`/*ENGINE-END*/` block and evals it; only `var`/`function` declarations leak to the caller's scope.
2. **`course.html`'s shared engine block must stay byte-identical to `range.html`'s.** Task 7 mirrors it with a splice script — never hand-merge.
3. **Never interpolate user-controlled text into an `onclick="..."` attribute**, even escaped. HTML-entity decoding happens before JS parsing, so an escaped quote still closes a nested JS string. Recommendation text and finding notes are free-form user input. Use integer-index lookups into a module-scoped array, exactly as `doDeleteSession(i)` already does.
4. **Escape every dynamic string reaching innerHTML via `esc()`.** Verdict `.text` remains the one deliberate exception.
5. **Two known false-positive security hooks** may block a write once per (file, rule) per session. Retry the identical write once.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `data/recommendations.json` | **Create** | Committed recommendation log (seeded `[]`) |
| `data/findings.json` | **Create** | Committed findings list (seeded `[]`) |
| `range.html` | Modify | Rec + findings engine, storage, UI, prompt wiring |
| `index.html` | Modify | Rec engine, storage, UI, prompt wiring (no findings) |
| `course.html` | Modify | Mirror the shared engine block only |
| `test-range-engine.js` | Modify | Rec + findings assertions |
| `test-engine.js` | Modify | Rec assertions |
| `test-course-engine.js` | Modify | Parity assertions |

---

## Task 1: Recommendations engine — `range.html`

**Files:**
- Modify: `range.html` (new engine functions, above `coachPrompt`)
- Test: `test-range-engine.js`

- [ ] **Step 1: Write the failing tests**

Append to `test-range-engine.js` before the final `console.log`:

```js
// T46. Recommendations store. The continuity check needs exactly one open
// question per source — "did you do the thing you said you'd do?" — so the
// engine enforces at most one pending recommendation per source and scopes
// lookups by source (a putting drill cannot be judged from launch data).
const mkRec = (date, source, priority, outcome) => ({
  date, source, priority, criterion: '8 of 10 inside 6 yards',
  outcome: outcome || 'pending', outcomeNote: null, outcomeDate: null,
});

chk('T46 recKey is date plus source', recKey(mkRec('2026-09-01', 'range', 'A')) === '2026-09-01|range');
chk('T46 same day, different sources do not collide', (() => {
  const merged = mergeRecommendations([], [mkRec('2026-09-01','range','A'), mkRec('2026-09-01','round','B')]);
  return merged.length === 2;
})());
chk('T46 same day and source is one record, incoming wins', (() => {
  const merged = mergeRecommendations([mkRec('2026-09-01','range','old')], [mkRec('2026-09-01','range','new')]);
  return merged.length === 1 && merged[0].priority === 'new';
})());
chk('T46 merge is idempotent', (() => {
  const once = mergeRecommendations([], [mkRec('2026-09-01','range','A')]);
  return mergeRecommendations(once, [mkRec('2026-09-01','range','A')]).length === 1;
})());
chk('T46 results are sorted oldest to newest', (() => {
  const m = mergeRecommendations([], [mkRec('2026-09-08','range','B'), mkRec('2026-09-01','range','A')]);
  return m[0].date === '2026-09-01' && m[1].date === '2026-09-08';
})());

chk('T46 lastRecommendation returns the pending one for the given sources', (() => {
  const recs = [mkRec('2026-08-01','range','old','met'), mkRec('2026-09-01','range','current')];
  return lastRecommendation(recs, ['range','video']).priority === 'current';
})());
chk('T46 lastRecommendation ignores other sources', (() => {
  const recs = [mkRec('2026-09-01','round','putting drill')];
  return lastRecommendation(recs, ['range','video']) === null;
})());
chk('T46 a video-sourced priority is assessed by the range', (() => {
  const recs = [mkRec('2026-09-01','video','stop early extension')];
  return lastRecommendation(recs, ['range','video']).priority === 'stop early extension';
})());
chk('T46 an already-answered recommendation is closed, not re-asked', (() => {
  return lastRecommendation([mkRec('2026-09-01','range','done','met')], ['range']) === null;
})());
chk('T46 the newest pending wins when several exist', (() => {
  const recs = [mkRec('2026-08-01','range','older'), mkRec('2026-09-01','range','newer')];
  return lastRecommendation(recs, ['range']).priority === 'newer';
})());
chk('T46 empty and undefined input return null without throwing',
  lastRecommendation([], ['range']) === null && lastRecommendation(undefined, ['range']) === null);

chk('T46 closePending stamps the outcome on the open record only', (() => {
  const recs = [mkRec('2026-08-01','range','a','met'), mkRec('2026-09-01','range','b')];
  const out = closePending(recs, ['range'], 'not-met', 'only got 5 of 10', '2026-09-10');
  const closed = out.find(r => r.priority === 'b');
  return closed.outcome === 'not-met' && closed.outcomeNote === 'only got 5 of 10'
    && closed.outcomeDate === '2026-09-10' && out.find(r => r.priority === 'a').outcome === 'met';
})());
chk('T46 closePending does not mutate its input', (() => {
  const recs = [mkRec('2026-09-01','range','b')];
  closePending(recs, ['range'], 'met', null, '2026-09-10');
  return recs[0].outcome === 'pending';
})());
chk('T46 closePending with nothing pending is a no-op', (() => {
  const recs = [mkRec('2026-09-01','range','a','met')];
  return closePending(recs, ['range'], 'met', null, '2026-09-10').length === 1;
})());
chk('T46 VALID_OUTCOMES covers the four states', ['pending','met','not-met','insufficient-data']
  .every(o => VALID_OUTCOMES.indexOf(o) >= 0));
```

- [ ] **Step 2: Run to confirm failure**

Run: `node test-range-engine.js`
Expected: fails — `recKey is not defined`.

- [ ] **Step 3: Implement the engine functions**

In `range.html`, insert immediately **above** `function rangeConfounds(`:

```js
// ── Recommendations ──────────────────────────────────────────────────────────
// A dated log of practice priorities, each with a criterion specific enough to
// be checked later. Outcomes are never inferred: a criterion is free text
// ("8 of 10 inside 6 yards"), and a parser that half-understood one would
// quietly mark things met that were not. The user records the outcome, and the
// natural moment to ask is when they log the NEXT priority — they have just
// read a debrief that told them both answers.
var VALID_OUTCOMES = ['pending', 'met', 'not-met', 'insufficient-data'];
var REC_SOURCES = ['range', 'round', 'video'];

// Keyed by date+source so the range and round debriefs can each write a
// priority on the same day without overwriting each other.
function recKey(rec) {
  return `${rec.date}|${rec.source}`;
}

function mergeRecommendations(baseline, incoming) {
  const map = {};
  (baseline || []).forEach(r => { map[recKey(r)] = { ...r }; });
  (incoming || []).forEach(r => { map[recKey(r)] = { ...r }; });
  return Object.values(map).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : (a.source < b.source ? -1 : 1));
}

// The one open question for these sources, or null. Sources are passed in
// rather than hardcoded because a video-derived swing priority is assessed by
// range data, while a putting drill is assessed by round data — the pages ask
// for different slices. Only 'pending' records are returned: once an outcome
// is recorded the loop on that recommendation is closed, and asking about it
// again in the next debrief would be noise.
function lastRecommendation(recs, sources) {
  const want = sources || [];
  const open = (recs || [])
    .filter(r => r && r.outcome === 'pending' && want.indexOf(r.source) >= 0)
    .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return open.length ? open[open.length - 1] : null;
}

// Stamps an outcome onto the open recommendation for these sources. Returns a
// new array; never mutates, because the caller still holds the pre-change list
// for its own undo/compare paths.
function closePending(recs, sources, outcome, note, when) {
  const target = lastRecommendation(recs, sources);
  if (!target) return (recs || []).map(r => ({ ...r }));
  const key = recKey(target);
  return (recs || []).map(r => recKey(r) === key
    ? { ...r, outcome, outcomeNote: note || null, outcomeDate: when || null }
    : { ...r });
}
```

- [ ] **Step 4: Run the tests**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Add the recommendations engine: one open priority per source"
```

---

## Task 2: Recommendations storage and prompt wiring — `range.html`

**Files:**
- Create: `data/recommendations.json`
- Modify: `range.html` (storage layer, bootstrap, `render()`)

- [ ] **Step 1: Seed the committed file**

Create `data/recommendations.json` containing exactly:

```json
[]
```

- [ ] **Step 2: Add the storage layer**

In `range.html`, immediately after the existing `const load = () => composeDataset(...)` / `const save = cs => saveStaging(cs);` pair, insert:

```js
// Recommendations follow the same baseline+staging shape as sessions: the
// committed file is the durable copy, localStorage holds only what has not
// been saved and pushed yet.
const LS_REC = 'golfcaddy_recs';
const REC_URL = 'data/recommendations.json';
let recBaseline = [];
const loadRecStaging = () => { try { return JSON.parse(localStorage.getItem(LS_REC)) || []; } catch (e) { return []; } };
const saveRecStaging = rs => localStorage.setItem(LS_REC, JSON.stringify(rs));
const loadRecs = () => mergeRecommendations(recBaseline, loadRecStaging());
```

- [ ] **Step 3: Fetch the second baseline in `bootstrap()`**

In `bootstrap()`, find the existing chain step:

```js
    .then(d => { baseline = Array.isArray(d) ? d : []; })
    .catch(() => { baseline = []; })
```

and insert immediately after it, before the final `.then(...)` that calls `render()`:

```js
    .then(() => fetch(REC_URL, { cache: 'no-store' }))
    .then(r => r.ok ? r.json() : [])
    .then(d => { recBaseline = Array.isArray(d) ? d : []; })
    .catch(() => { recBaseline = []; })
```

- [ ] **Step 4: Pass the open recommendation into the prompt**

In `render()`, find:

```js
  const prompt = coachPrompt(gaps, verdicts, groups, chosen);
```

and replace with:

```js
  const openRec = lastRecommendation(loadRecs(), ['range', 'video']);
  const prompt = coachPrompt(gaps, verdicts, groups, chosen, openRec);
```

`coachPrompt`'s fifth parameter already exists and already renders `none on record` when null — Phase 2a built it that way specifically so this wiring would be a one-line change.

- [ ] **Step 5: Verify nothing broke**

Run: `node test-range-engine.js`
Expected: `ALL PASS` (this step changes UI wiring, not engine logic).

- [ ] **Step 6: Commit**

```bash
git add range.html data/recommendations.json
git commit -m "Load recommendations from a committed baseline and feed the range prompt"
```

---

## Task 3: Recommendation UI — `range.html`

**Files:**
- Modify: `range.html` (static markup, `render()`, new handlers)

- [ ] **Step 1: Add the form markup**

In `range.html`, immediately before `<div id="dash"></div>`, insert:

```html
  <div class="sec">
    <h2>Log a practice priority</h2>
    <div id="closeOut"></div>
    <input type="text" id="recPriority" placeholder="Priority (e.g. ten 7-irons at 80% tempo)" style="width:100%;margin-bottom:6px">
    <input type="text" id="recCriterion" placeholder="Success criterion (e.g. 8 of 10 inside a 6-yard window)" style="width:100%;margin-bottom:6px">
    <select id="recSource">
      <option value="range">From range data</option>
      <option value="video">From video analysis</option>
    </select>
    <button onclick="doAddRec()">Log priority</button>
    <button class="ghost" onclick="doSaveRecsToFile()">Save priorities to data file</button>
    <div id="recMsg" style="color:var(--gold);font-size:12.5px;min-height:17px;margin-top:8px"></div>
  </div>
```

- [ ] **Step 2: Render the close-out control and history**

In `render()`, immediately before the `dash.innerHTML = \`` assignment, insert:

```js
  // If a priority is still open, the only way to log a new one is to say how
  // the open one went — that is the invariant that keeps the continuity check
  // answerable, and asking here is free because the user has just read the
  // debrief that tells them.
  const recs = loadRecs();
  const pending = lastRecommendation(recs, ['range', 'video']);
  document.getElementById('closeOut').innerHTML = pending
    ? `<div class="note warn"><span class="dot"></span><span class="txt">
         <b>Open priority from ${esc(pending.date)}:</b> ${esc(pending.priority)}
         <br>Criterion: ${esc(pending.criterion)}
         <br>How did it go?
         <select id="recOutcome">
           <option value="met">Met it</option>
           <option value="not-met">Did not meet it</option>
           <option value="insufficient-data">Not enough data to tell</option>
         </select>
       </span></div>`
    : '';

  recRows = recs.filter(r => r.source !== 'round').slice().reverse();
  const recHistHtml = recRows.map((r, i) => `<tr>
    <td>${esc(r.date)}</td>
    <td>${esc(r.source)}</td>
    <td>${esc(r.priority)}</td>
    <td>${esc(r.criterion)}</td>
    <td>${esc(r.outcome)}${r.outcomeNote ? ' — ' + esc(r.outcomeNote) : ''}</td>
    <td><button class="ghost danger small" onclick="doDeleteRec(${i})">Delete</button></td>
  </tr>`).join('');
```

Then add this section to the `dash.innerHTML` template, immediately before the closing `` <div class="sec"><h2>Per-club detail</h2>${detailCards}</div>` ``:

```js
  <div class="sec"><h2>Priority history</h2>
    ${recRows.length
      ? `<table><tr><th>Date</th><th>From</th><th>Priority</th><th>Criterion</th><th>Outcome</th><th></th></tr>${recHistHtml}</table>`
      : '<div class="note"><span class="dot"></span><span class="txt">Nothing logged yet. After your next debrief, record the one priority it gives you.</span></div>'}
  </div>
```

- [ ] **Step 3: Add the handlers**

Immediately after the existing `let savedSessionRows = [];` declaration, insert:

```js
// Same integer-index pattern as doDeleteSession: priority text is free-form
// user input, and esc() does not make a string safe inside an onclick
// attribute, because HTML-entity decoding runs before the JS is parsed.
let recRows = [];
function doDeleteRec(i) {
  const r = recRows[i];
  if (!r) return;
  if (!confirm(`Delete the priority logged ${r.date}?`)) return;
  saveRecStaging(loadRecs().filter(x => recKey(x) !== recKey(r)));
  render();
}

function doAddRec() {
  const priority = document.getElementById('recPriority').value.trim();
  const criterion = document.getElementById('recCriterion').value.trim();
  const source = document.getElementById('recSource').value;
  const rm = t => { document.getElementById('recMsg').textContent = t; };
  if (!priority || !criterion) { rm('Both a priority and a success criterion are required.'); return; }

  let recs = loadRecs();
  const pending = lastRecommendation(recs, ['range', 'video']);
  if (pending) {
    const sel = document.getElementById('recOutcome');
    if (!sel) { rm('Could not read the outcome of the open priority.'); return; }
    recs = closePending(recs, ['range', 'video'], sel.value, null, new Date().toISOString().slice(0, 10));
  }
  const today = new Date().toISOString().slice(0, 10);
  recs = mergeRecommendations(recs, [{
    date: today, source, priority, criterion,
    outcome: 'pending', outcomeNote: null, outcomeDate: null,
  }]);
  saveRecStaging(recs);
  document.getElementById('recPriority').value = '';
  document.getElementById('recCriterion').value = '';
  rm('Logged. Save to data file and push to keep it.');
  render();
}

function doSaveRecsToFile() {
  const json = JSON.stringify(loadRecs(), null, 1);
  if (window.showSaveFilePicker) {
    window.showSaveFilePicker({
      suggestedName: 'recommendations.json',
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    }).then(handle => handle.createWritable())
      .then(w => w.write(json).then(() => w.close()))
      .then(() => msg('Saved. Commit and push in GitHub Desktop.'))
      .catch(e => { if (e && e.name !== 'AbortError') msg('Save failed — use the download fallback.'); });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = 'recommendations.json'; a.click();
  msg('Downloaded. Save it over data/recommendations.json, then commit and push.');
}
```

- [ ] **Step 4: Verify**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add range.html
git commit -m "Add the priority log UI to the range analyzer"
```

---

## Task 4: Recommendations in `index.html`

`index.html` carries its own engine copy. The functions are identical; the source scope is `['round']`.

**Files:**
- Modify: `index.html`
- Test: `test-engine.js`

- [ ] **Step 1: Write the failing tests**

Append to `test-engine.js` before the final `console.log`:

```js
// A12. Recommendations in the rounds analyzer. Same engine as range.html's
// copy (this suite duplicates coverage deliberately — the two files each carry
// their own engine and can drift), scoped to the 'round' source.
const mkRecR = (date, source, priority, outcome) => ({
  date, source, priority, criterion: '7 of 10 inside 3 feet',
  outcome: outcome || 'pending', outcomeNote: null, outcomeDate: null,
});

chk('A12 recKey is date plus source', recKey(mkRecR('2026-09-01','round','A')) === '2026-09-01|round');
chk('A12 merge dedupes on date+source', mergeRecommendations([mkRecR('2026-09-01','round','old')], [mkRecR('2026-09-01','round','new')]).length === 1);
chk('A12 lastRecommendation is scoped to round', (() => {
  const recs = [mkRecR('2026-09-01','range','range drill'), mkRecR('2026-09-02','round','putting drill')];
  return lastRecommendation(recs, ['round']).priority === 'putting drill';
})());
chk('A12 a closed recommendation is not re-asked', lastRecommendation([mkRecR('2026-09-01','round','x','met')], ['round']) === null);
chk('A12 closePending stamps only the open record', (() => {
  const out = closePending([mkRecR('2026-09-01','round','x')], ['round'], 'met', 'done', '2026-09-10');
  return out[0].outcome === 'met' && out[0].outcomeDate === '2026-09-10';
})());
chk('A12 the rounds prompt renders a logged priority', (() => {
  const rounds = [
    mkR('2026-07-05','A',123,111,47,17,77), mkR('2026-07-08','A',123,102,38,12,62),
    mkR('2026-07-10','A',123,104,46,17,54), mkR('2026-07-19','B',123,98,38,11,46),
    mkR('2026-09-05','C',129,99,44,17,62),
  ];
  const m = computeMetrics(rounds);
  const p = coachPrompt(m, lastRecommendation([mkRecR('2026-09-06','round','Lag putting from 30 feet')], ['round']));
  return p.includes('Lag putting from 30 feet') && !p.includes('none on record');
})());
```

- [ ] **Step 2: Run to confirm failure**

Run: `node test-engine.js`
Expected: fails — `recKey is not defined`.

- [ ] **Step 3: Copy the engine functions**

Copy the entire `// ── Recommendations ───` block written in Task 1 Step 3 — `VALID_OUTCOMES`, `REC_SOURCES`, `recKey`, `mergeRecommendations`, `lastRecommendation`, `closePending`, and all their comments — verbatim from `range.html` into `index.html`, inserted immediately above `function roundConfounds(`. It is intentionally identical; this suite duplicates the engine the same way it already duplicates `median`, `esc`, and `r1`.

- [ ] **Step 4: Add the storage layer**

The committed baseline file `data/recommendations.json` is **shared** between both pages; only the staging key differs. Both merge the same baseline and write their own slice, which is why `recKey` includes the source.

In `index.html`, immediately after the existing `const load = ...` / `const save = ...` pair, insert:

```js
// Shares data/recommendations.json with range.html, but stages under its own
// localStorage key. Both pages are served from the same origin and therefore
// share one localStorage — reusing range.html's key would make each page's
// unsaved edits silently overwrite the other's.
const LS_REC = 'golfcaddy_recs_rounds';
const REC_URL = 'data/recommendations.json';
let recBaseline = [];
const loadRecStaging = () => { try { return JSON.parse(localStorage.getItem(LS_REC)) || []; } catch (e) { return []; } };
const saveRecStaging = rs => localStorage.setItem(LS_REC, JSON.stringify(rs));
const loadRecs = () => mergeRecommendations(recBaseline, loadRecStaging());
```

- [ ] **Step 5: Fetch the baseline in the bootstrap**

In `index.html`'s bootstrap chain, find:

```js
  .then(d => { baseline = Array.isArray(d) ? d : []; })
  .catch(() => { baseline = []; })
```

and insert immediately after it, before the final `.then(...)` that calls `render()`:

```js
  .then(() => fetch(REC_URL, { cache: 'no-store' }))
  .then(r => r.ok ? r.json() : [])
  .then(d => { recBaseline = Array.isArray(d) ? d : []; })
  .catch(() => { recBaseline = []; })
```

- [ ] **Step 6: Add the form markup**

In `index.html`, immediately before `<div id="dash"></div>`, insert:

```html
  <div class="sec">
    <h2>Log a practice priority</h2>
    <div id="closeOut"></div>
    <input type="text" id="recPriority" placeholder="Priority (e.g. lag putting from 30 feet)" style="width:100%;margin-bottom:6px">
    <input type="text" id="recCriterion" placeholder="Success criterion (e.g. 7 of 10 inside 3 feet)" style="width:100%;margin-bottom:6px">
    <button onclick="doAddRec()">Log priority</button>
    <button class="ghost" onclick="doSaveRecsToFile()">Save priorities to data file</button>
    <div id="recMsg" style="color:var(--gold);font-size:12.5px;min-height:17px;margin-top:8px"></div>
  </div>
```

There is no source selector here — a priority logged from the rounds analyzer is always `source: 'round'`.

- [ ] **Step 7: Render the close-out control and history**

In `index.html`'s `render()`, immediately before the `dash.innerHTML = \`` assignment, insert:

```js
  const recs = loadRecs();
  const pending = lastRecommendation(recs, ['round']);
  document.getElementById('closeOut').innerHTML = pending
    ? `<div class="note warn"><span class="dot"></span><span class="txt">
         <b>Open priority from ${esc(pending.date)}:</b> ${esc(pending.priority)}
         <br>Criterion: ${esc(pending.criterion)}
         <br>How did it go?
         <select id="recOutcome">
           <option value="met">Met it</option>
           <option value="not-met">Did not meet it</option>
           <option value="insufficient-data">Not enough data to tell</option>
         </select>
       </span></div>`
    : '';

  recRows = recs.filter(r => r.source === 'round').slice().reverse();
  const recHistHtml = recRows.map((r, i) => `<tr>
    <td>${esc(r.date)}</td>
    <td>${esc(r.priority)}</td>
    <td>${esc(r.criterion)}</td>
    <td>${esc(r.outcome)}${r.outcomeNote ? ' — ' + esc(r.outcomeNote) : ''}</td>
    <td><button class="ghost danger small" onclick="doDeleteRec(${i})">Delete</button></td>
  </tr>`).join('');
```

Then add this section to `index.html`'s `dash.innerHTML` template, immediately before the final `All rounds` details section:

```js
  <div class="sec"><h2>Priority history</h2>
    ${recRows.length
      ? `<table><tr><th>Date</th><th>Priority</th><th>Criterion</th><th>Outcome</th><th></th></tr>${recHistHtml}</table>`
      : '<div class="note"><span class="dot"></span><span class="txt">Nothing logged yet. After your next debrief, record the one priority it gives you.</span></div>'}
  </div>
```

- [ ] **Step 8: Add the handlers**

In `index.html`, immediately before `function doParse()`, insert:

```js
// Integer-index lookup rather than embedding priority text into an onclick
// attribute: priorities are free-form user input, and esc() does not make a
// string safe there — HTML-entity decoding runs before the JS is parsed, so an
// escaped quote still closes the nested string.
let recRows = [];
function doDeleteRec(i) {
  const r = recRows[i];
  if (!r) return;
  if (!confirm(`Delete the priority logged ${r.date}?`)) return;
  saveRecStaging(loadRecs().filter(x => recKey(x) !== recKey(r)));
  render();
}

function doAddRec() {
  const priority = document.getElementById('recPriority').value.trim();
  const criterion = document.getElementById('recCriterion').value.trim();
  const rm = t => { document.getElementById('recMsg').textContent = t; };
  if (!priority || !criterion) { rm('Both a priority and a success criterion are required.'); return; }

  let recs = loadRecs();
  const pending = lastRecommendation(recs, ['round']);
  if (pending) {
    const sel = document.getElementById('recOutcome');
    if (!sel) { rm('Could not read the outcome of the open priority.'); return; }
    recs = closePending(recs, ['round'], sel.value, null, new Date().toISOString().slice(0, 10));
  }
  const today = new Date().toISOString().slice(0, 10);
  recs = mergeRecommendations(recs, [{
    date: today, source: 'round', priority, criterion,
    outcome: 'pending', outcomeNote: null, outcomeDate: null,
  }]);
  saveRecStaging(recs);
  document.getElementById('recPriority').value = '';
  document.getElementById('recCriterion').value = '';
  rm('Logged. Save to data file and push to keep it.');
  render();
}

function doSaveRecsToFile() {
  const json = JSON.stringify(loadRecs(), null, 1);
  if (window.showSaveFilePicker) {
    window.showSaveFilePicker({
      suggestedName: 'recommendations.json',
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    }).then(handle => handle.createWritable())
      .then(w => w.write(json).then(() => w.close()))
      .then(() => msg('Saved. Commit and push in GitHub Desktop.'))
      .catch(e => { if (e && e.name !== 'AbortError') msg('Save failed — use the download fallback.'); });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = 'recommendations.json'; a.click();
  msg('Downloaded. Save it over data/recommendations.json, then commit and push.');
}
```

- [ ] **Step 9: Wire the prompt**

In `index.html`'s `render()`, find the `coachPrompt(m)` call inside the `dash.innerHTML` template and change it to:

```js
coachPrompt(m, lastRecommendation(recs, ['round']))
```

`recs` is already in scope from Step 7.

**Important — saving both files:** `index.html` now has two save buttons writing two different files (`rounds.json` and `recommendations.json`). Saving rounds does not save priorities. The README task documents this.

- [ ] **Step 10: Run the tests**

Run: `node test-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 11: Commit**

```bash
git add index.html test-engine.js
git commit -m "Add recommendations to the rounds analyzer"
```

---

## Task 5: Findings engine — taxonomy and camera-angle gating

**Files:**
- Modify: `range.html` (new engine functions, above the recommendations block)
- Test: `test-range-engine.js`

- [ ] **Step 1: Write the failing tests**

Append to `test-range-engine.js` before the final `console.log`:

```js
// T47. Findings are standing conditions, not dated events — which is why a
// video session's date never has to line up with a range session's. The angle
// gate encodes the lesson from the retracted driver claim: a front-on clip
// cannot support a swing-plane assessment, so a finding recorded from one is
// downgraded rather than trusted.
const mkF = (over) => Object.assign({
  id: 'f1', finding: 'early-extension', clubs: ['7-Iron'], assessment: 'fault',
  confidence: 'measured', measurement: 'cap-top +4px address to impact',
  cameraAngle: 'down-the-line', firstNoted: '2026-09-11', lastConfirmed: '2026-09-11',
  status: 'open', note: '',
}, over || {});

chk('T47 the taxonomy is a fixed list, not free text', (() => {
  return isKnownFinding('early-extension') && !isKnownFinding('feels-a-bit-off');
})());
chk('T47 every taxonomy entry declares a label and angle rule', (() => {
  return Object.keys(FINDING_TAXONOMY).every(k => {
    const t = FINDING_TAXONOMY[k];
    return typeof t.label === 'string' && (t.angles === null || Array.isArray(t.angles));
  });
})());
chk('T47 swing plane requires a down-the-line view', angleSupports('swing-plane', 'down-the-line') === true
  && angleSupports('swing-plane', 'front-on') === false);
chk('T47 weight transfer requires a front-on view', angleSupports('weight-transfer-quality', 'front-on') === true
  && angleSupports('weight-transfer-quality', 'down-the-line') === false);
chk('T47 an unrestricted finding accepts any angle', angleSupports('finish-balance', 'front-on') === true
  && angleSupports('finish-balance', 'down-the-line') === true);
chk('T47 an unknown angle never supports anything', angleSupports('swing-plane', null) === false);

chk('T47 a finding from an unsupported angle is downgraded to speculative', (() => {
  const f = gradeFinding(mkF({ finding: 'swing-plane', cameraAngle: 'front-on', confidence: 'measured' }));
  return f.confidence === 'speculative' && /angle/i.test(f.confidenceNote);
})());
chk('T47 a finding from a supported angle keeps its stated confidence', (() => {
  const f = gradeFinding(mkF({ finding: 'swing-plane', cameraAngle: 'down-the-line', confidence: 'measured' }));
  return f.confidence === 'measured' && f.confidenceNote === null;
})());
chk('T47 gradeFinding does not mutate its input', (() => {
  const src = mkF({ finding: 'swing-plane', cameraAngle: 'front-on', confidence: 'measured' });
  gradeFinding(src);
  return src.confidence === 'measured';
})());

chk('T47 merge keys on id and the newer lastConfirmed wins', (() => {
  const a = mkF({ id: 'x', lastConfirmed: '2026-09-01', note: 'older' });
  const b = mkF({ id: 'x', lastConfirmed: '2026-09-11', note: 'newer' });
  const m = mergeFindings([a], [b]);
  return m.length === 1 && m[0].note === 'newer';
})());
chk('T47 an older incoming record does not clobber a newer one', (() => {
  const a = mkF({ id: 'x', lastConfirmed: '2026-09-11', note: 'newer' });
  const b = mkF({ id: 'x', lastConfirmed: '2026-09-01', note: 'older' });
  return mergeFindings([a], [b])[0].note === 'newer';
})());
chk('T47 openFindings excludes resolved ones', (() => {
  const list = [mkF({ id: 'a' }), mkF({ id: 'b', status: 'resolved' })];
  return openFindings(list).length === 1 && openFindings(list)[0].id === 'a';
})());
chk('T47 openFindings keeps improving ones, which are not finished', (() => {
  return openFindings([mkF({ id: 'a', status: 'improving' })]).length === 1;
})());
chk('T47 findingsForPrompt renders one plain line per open finding', (() => {
  const lines = findingsForPrompt([mkF({ clubs: ['7-Iron','PW'] })]);
  return lines.length === 1 && /early extension/i.test(lines[0]) && /7-Iron/.test(lines[0])
    && !/[<>]/.test(lines[0]);
})());
chk('T47 findingsForPrompt states confidence and flags a downgrade', (() => {
  const f = gradeFinding(mkF({ finding: 'swing-plane', cameraAngle: 'front-on', confidence: 'measured' }));
  return /speculative/i.test(findingsForPrompt([f])[0]);
})());
chk('T47 findingsForPrompt on empty input returns an empty array', findingsForPrompt([]).length === 0);
```

- [ ] **Step 2: Run to confirm failure**

Run: `node test-range-engine.js`
Expected: fails — `isKnownFinding is not defined`.

- [ ] **Step 3: Implement the findings engine**

In `range.html`, insert immediately **above** the `// ── Recommendations ───` block added in Task 1:

```js
// ── Swing findings ───────────────────────────────────────────────────────────
// Findings are conditions that persist until resolved, not events on a date.
// That is why they are a standing list with a status rather than a log, and it
// is what lets a video session's date sit anywhere relative to a range
// session's without the two needing to align.
//
// The taxonomy is a fixed list because a finding is only trendable if it is
// spelled the same way every time; "early extension" and "standing up through
// impact" as free text would never group. `angles` names the camera views that
// can actually support the observation, or null where either works. These come
// from a real session where a swing-plane claim was made from a front-on clip
// and had to be retracted — the view simply cannot show it.
var FINDING_TAXONOMY = {
  'early-extension':             { label: 'early extension',                 angles: ['down-the-line'] },
  'swing-plane':                 { label: 'swing plane',                     angles: ['down-the-line'] },
  'low-point-control':           { label: 'low point control',               angles: ['front-on'] },
  'weight-transfer-quality':     { label: 'weight transfer quality',         angles: ['front-on'] },
  'static-lower-body-transition':{ label: 'static lower body at transition', angles: ['front-on'] },
  'backswing-width-turn':        { label: 'backswing width and turn',        angles: null },
  'finish-balance':              { label: 'finish balance',                  angles: null },
  'grip-setup':                  { label: 'grip and setup',                  angles: null },
  'tempo-sequencing':            { label: 'tempo and sequencing',            angles: null },
};
var VALID_ANGLES = ['down-the-line', 'front-on', 'other'];
var VALID_STATUS = ['open', 'improving', 'resolved'];

function isKnownFinding(key) {
  return Object.prototype.hasOwnProperty.call(FINDING_TAXONOMY, key);
}

// True only when this camera view can actually support this observation. A
// null angle list means any view works; an unknown or missing angle supports
// nothing, because "we do not know what the camera saw" is not evidence.
function angleSupports(findingKey, angle) {
  if (!isKnownFinding(findingKey)) return false;
  const t = FINDING_TAXONOMY[findingKey];
  if (t.angles === null) return VALID_ANGLES.indexOf(angle) >= 0;
  return t.angles.indexOf(angle) >= 0;
}

// Downgrades a finding whose camera angle cannot support it, rather than
// dropping it — the observation may still be worth recording, it just is not
// evidence at the confidence originally claimed.
function gradeFinding(f) {
  const out = { ...f, confidenceNote: null };
  if (!angleSupports(f.finding, f.cameraAngle) && f.confidence !== 'speculative') {
    out.confidence = 'speculative';
    out.confidenceNote = `downgraded: a ${f.cameraAngle || 'missing'} camera angle cannot support this observation`;
  }
  return out;
}

function mergeFindings(baseline, incoming) {
  const map = {};
  (baseline || []).forEach(f => { map[f.id] = { ...f }; });
  (incoming || []).forEach(f => {
    const prev = map[f.id];
    // Later confirmation wins, so re-importing an older export cannot roll a
    // finding back to a stale status.
    if (!prev || (f.lastConfirmed || '') >= (prev.lastConfirmed || '')) map[f.id] = { ...f };
  });
  return Object.values(map).sort((a, b) =>
    (a.firstNoted || '') < (b.firstNoted || '') ? -1 : 1);
}

function openFindings(findings) {
  return (findings || []).filter(f => f && f.status !== 'resolved');
}

// Plain-text lines for the coach prompt. Confidence is always stated, so the
// model can weigh a pixel-measured observation differently from an eyeballed
// one instead of treating every finding as equally established.
function findingsForPrompt(findings) {
  return openFindings(findings).map(f => {
    const t = FINDING_TAXONOMY[f.finding];
    const name = t ? t.label : f.finding;
    const clubs = (f.clubs || []).length ? ` on ${f.clubs.join(', ')}` : '';
    const since = f.firstNoted ? `, first noted ${f.firstNoted}` : '';
    const note = f.note ? ` — ${f.note}` : '';
    const meas = f.measurement ? ` [${f.measurement}]` : '';
    return `${name}${clubs} (${f.assessment}, ${f.confidence}, ${f.status}${since})${meas}${note}`;
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Add the findings engine with a fixed taxonomy and camera-angle gating"
```

---

## Task 6: Findings storage, prompt wiring, and display

**Files:**
- Create: `data/findings.json`
- Modify: `range.html`

- [ ] **Step 1: Seed the committed file**

Create `data/findings.json` containing exactly:

```json
[]
```

- [ ] **Step 2: Add the storage layer**

In `range.html`, immediately after the recommendations storage block from Task 2 Step 2, insert:

```js
const LS_FIND = 'golfcaddy_findings';
const FIND_URL = 'data/findings.json';
let findBaseline = [];
const loadFindStaging = () => { try { return JSON.parse(localStorage.getItem(LS_FIND)) || []; } catch (e) { return []; } };
const saveFindStaging = fs => localStorage.setItem(LS_FIND, JSON.stringify(fs));
// Graded on read so a downgrade from an unsupportable camera angle applies
// everywhere — prompt, display, export — rather than only where someone
// remembered to call gradeFinding.
const loadFindings = () => mergeFindings(findBaseline, loadFindStaging()).map(gradeFinding);
```

- [ ] **Step 3: Fetch the third baseline**

In `bootstrap()`, after the recommendations fetch added in Task 2 Step 3, insert:

```js
    .then(() => fetch(FIND_URL, { cache: 'no-store' }))
    .then(r => r.ok ? r.json() : [])
    .then(d => { findBaseline = Array.isArray(d) ? d : []; })
    .catch(() => { findBaseline = []; })
```

- [ ] **Step 4: Extend `coachPrompt` to carry findings**

Change `coachPrompt`'s signature in `range.html` from:

```js
function coachPrompt(gaps, verdicts, groups, sourceName, lastRec) {
```

to:

```js
function coachPrompt(gaps, verdicts, groups, sourceName, lastRec, findings) {
```

Then, immediately before the `return \`You are my golf performance analyst...\`` statement, add:

```js
  const findingLines = findingsForPrompt(findings || []);
```

And insert this block into the returned template, immediately after the `RECENT SIGNALS:` block and before `CONFOUNDS IN THIS SAMPLE:`:

```
OPEN SWING FINDINGS (from video analysis — positions and mechanism only; these never establish ball flight, which only the launch monitor measures):
${findingLines.length ? findingLines.map(l => '- ' + l).join('\n') : '- (none recorded)'}
```

- [ ] **Step 5: Wire it in `render()`**

Change the prompt call from Task 2 Step 4 to:

```js
  const openRec = lastRecommendation(loadRecs(), ['range', 'video']);
  const prompt = coachPrompt(gaps, verdicts, groups, chosen, openRec, loadFindings());
```

- [ ] **Step 6: Display open findings**

In `render()`, add this section to the `dash.innerHTML` template immediately before the `Priority history` section:

```js
  <div class="sec"><h2>Open swing findings</h2>
    ${(() => {
      const lines = findingsForPrompt(loadFindings());
      return lines.length
        ? lines.map(l => `<div class="note"><span class="dot"></span><span class="txt">${esc(l)}</span></div>`).join('')
        : '<div class="note"><span class="dot"></span><span class="txt">None recorded. Video findings are written here from a Claude Code session — see the README.</span></div>';
    })()}
  </div>
```

There is deliberately **no add/edit form** for findings. They are written by Claude directly into `data/findings.json` during a video-analysis session, which is the workflow the user chose: send screenshots or clips, the findings are written into the repo and committed. A hand-entry form would be a second, diverging path into the same file.

- [ ] **Step 7: Verify**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 8: Commit**

```bash
git add range.html data/findings.json
git commit -m "Wire swing findings into the range prompt and dashboard"
```

---

## Task 7: Mirror the shared engine into `course.html`

**Files:**
- Modify: `course.html`
- Test: `test-course-engine.js`

- [ ] **Step 1: Splice**

Run from the repo root:

```bash
node -e "
const fs=require('fs');
const rd=p=>fs.readFileSync(p,'utf8');
const range=rd('range.html'), course=rd('course.html');
const shared=range.split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0];
const head=course.slice(0, course.indexOf('/*ENGINE-START*/')+'/*ENGINE-START*/'.length);
const body=course.split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0];
const marker='// ── Course-view helpers';
const i=body.indexOf(marker);
if(i<0){console.error('ABORT: course-view helper marker not found');process.exit(1);}
const helpers=body.slice(i);
const tail=course.slice(course.indexOf('/*ENGINE-END*/'));
fs.writeFileSync('course.html', head+shared+helpers+tail);
console.log('spliced; helpers preserved:', helpers.length, 'chars');
"
```

Expected: `spliced; helpers preserved: <n> chars`, `<n>` positive. On `ABORT`, stop and report — the marker was renamed and guessing risks dropping `pickReminders`/`ladderRows`/`preferredSource`.

- [ ] **Step 2: Verify byte-parity**

```bash
node -e "
const fs=require('fs');const n=s=>s.replace(/\r\n/g,'\n');
const r=n(fs.readFileSync('range.html','utf8')).split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0];
const c=n(fs.readFileSync('course.html','utf8')).split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0];
const i=c.indexOf('// ── Course-view helpers');
console.log('shared prefix identical:', r.trim()===(i>=0?c.slice(0,i):c).trim());
"
```

Expected: `shared prefix identical: true`.

- [ ] **Step 3: Add parity assertions**

Append to `test-course-engine.js` before the final `console.log`:

```js
// C8. Phase 2b engine mirrored into course.html's own copy. The page does not
// use any of it — it shows no findings and logs no priorities — but the shared
// block stays identical so a future engine fix is one splice, not a merge.
chk('C8 recommendations engine present', typeof recKey === 'function'
  && typeof mergeRecommendations === 'function' && typeof lastRecommendation === 'function'
  && typeof closePending === 'function');
chk('C8 findings engine present', typeof isKnownFinding === 'function'
  && typeof angleSupports === 'function' && typeof gradeFinding === 'function'
  && typeof findingsForPrompt === 'function');
chk('C8 the taxonomy mirrored intact', isKnownFinding('early-extension')
  && !isKnownFinding('nonsense-key')
  && angleSupports('swing-plane', 'down-the-line') === true
  && angleSupports('swing-plane', 'front-on') === false);
chk('C8 lastRecommendation behaves identically here', (() => {
  const r = { date: '2026-09-01', source: 'range', priority: 'p', criterion: 'c', outcome: 'pending' };
  return lastRecommendation([r], ['range', 'video']).priority === 'p'
    && lastRecommendation([r], ['round']) === null;
})());
```

- [ ] **Step 4: Run all three suites**

```bash
node test-engine.js && node test-range-engine.js && node test-course-engine.js
```

Expected: three `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add course.html test-course-engine.js
git commit -m "Mirror the Phase 2b engine into course.html"
```

---

## Task 8: README and live verification

**Files:**
- Modify: `README.md`
- Modify: `range.html` / `index.html` only if the smoke test finds a defect

- [ ] **Step 1: Document the loop**

Append to `README.md`:

```markdown

## The practice loop

Each coach debrief opens with a continuity check, because the app remembers
what it told you last time.

1. Copy the debrief prompt into Claude and read what comes back.
2. It ends with one priority and a numeric success criterion. Log both under
   **Log a practice priority**.
3. Practice. Paste the new session.
4. The next debrief opens by asking whether you met that criterion. Record the
   answer when you log the next priority — one form does both.

A priority stays open until you close it, and only one can be open per source
at a time. That is deliberate: the continuity check has to be answerable, and
three simultaneous open priorities make it a guess.

### Swing findings

`data/findings.json` holds standing observations about your swing — early
extension, weight transfer, and so on — from video analysis. They persist until
resolved, so a video session never needs to line up with a range session.

These are written by Claude during a video-analysis session, not typed into the
app. Send the clips, and the findings are written into the repo and committed.
Each carries a confidence level, and a finding recorded from a camera angle
that cannot support it is automatically downgraded to speculative — a front-on
clip cannot establish swing plane, and the app will not pretend otherwise.

Video establishes positions and mechanism. Ball flight comes only from the
launch monitor. The prompt states this rule explicitly so the two are never
conflated.
```

- [ ] **Step 2: Serve and verify the range loop end to end**

Start the preview server, open `range.html`, and:
1. Confirm the coach prompt shows `CONTINUITY CHECK — My last priority was: none on record`.
2. Log a priority ("test priority" / "test criterion", source `range`).
3. Confirm it appears in **Priority history** with outcome `pending`, and that the prompt's continuity line now names it instead of `none on record`.
4. Confirm the **Log a practice priority** section now shows the open priority with an outcome selector.
5. Log a second priority, choosing an outcome for the first. Confirm the first's outcome updates in the history and the second becomes the open one.
6. Delete both test priorities.

- [ ] **Step 3: Verify the findings display and angle gate**

In the DevTools console on `range.html`:

```js
saveFindStaging([{
  id: 'test1', finding: 'swing-plane', clubs: ['Driver'], assessment: 'fault',
  confidence: 'measured', measurement: 'test', cameraAngle: 'front-on',
  firstNoted: '2026-09-11', lastConfirmed: '2026-09-11', status: 'open', note: 'angle gate test'
}]);
render();
```

Expected: **Open swing findings** shows the finding as `speculative`, not `measured`, because a front-on angle cannot support a swing-plane claim. Confirm the prompt's `OPEN SWING FINDINGS` block says the same. Then clear it:

```js
saveFindStaging([]); render();
```

- [ ] **Step 4: Verify the rounds loop**

Open `index.html`, log a priority, confirm it reaches that page's continuity line, and confirm it does **not** appear in `range.html`'s priority history (different source scope). Delete it.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "Document the practice loop and swing findings"
```

---

## Final check

- [ ] `node test-engine.js && node test-range-engine.js && node test-course-engine.js` — three `ALL PASS`.
- [ ] Shared engine parity command from Task 7 Step 2 prints `true`.
- [ ] `data/recommendations.json` and `data/findings.json` exist, are tracked by git, and contain `[]` (no test data committed).
- [ ] Both analyzers' continuity checks read from the store rather than always printing `none on record`.
- [ ] `git log --oneline -9` shows one descriptive commit per task.
- [ ] Remind the user to push, reporting the count from `git log origin/master..HEAD --oneline | wc -l` **re-read at that moment** rather than carried forward from earlier in the session.
