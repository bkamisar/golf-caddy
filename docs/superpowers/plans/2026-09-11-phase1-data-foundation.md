# Phase 1: Data Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag every club-session with the launch monitor that produced it, make identity and trends source-aware, and move canonical storage into committed JSON files served by GitHub Pages so the phone reads current data with no import step.

**Architecture:** `source` becomes part of a club-session's identity (`date + club + source`). A baseline dataset is fetched once at startup from `data/range.json` and cached; `load()` stays synchronous and returns that baseline merged with localStorage staging, minus tombstoned deletions. Saving writes the merged set back to the repo file, which the user commits and pushes.

**Tech Stack:** Vanilla JS/CSS, no dependencies, no build step. Node.js for the test harnesses.

**Spec:** `docs/superpowers/specs/2026-09-11-analysis-platform-design.md`

---

## Critical conventions (read before implementing any task)

1. **`var`, not `const`, for engine-block bindings referenced by bare name in tests.** The harness extracts `/*ENGINE-START*/…/*ENGINE-END*/` and runs it through a dynamic-evaluation step that only leaks `var`/`function` declarations into the caller's scope. `M_TO_YD`, `median`, `SOURCES` are already `var` for this reason. Function declarations are unaffected.
2. **Never interpolate user-controlled text into an `onclick="..."` attribute**, even escaped. HTML-entity decoding precedes JS parsing, so an escaped quote still closes a nested JS string. Club names can be arbitrary raw pasted text. `doDeleteSession(i)` takes an integer index for exactly this reason — follow that pattern for any new row control.
3. **Escape every dynamic string reaching the DOM via a markup string** with `esc()`. Verdict `.text` is the one deliberate exception: engine-generated, already internally escaped, contains intentional `<b>` tags.
4. **Two known false-positive security hooks** may block a write once per (file, rule) per session — one on the harness's dynamic-evaluation call, one on markup-to-`innerHTML` assignment. Retry the identical write once and it succeeds.
5. **`range.html` and `course.html` share a byte-identical engine block.** Any engine change must be applied to both. `course.html` carries two extra functions (`pickReminders`, `ladderRows`) after the shared portion — everything before `// ── Course-view helpers` must match `range.html` exactly.
6. **`fetch()` fails on `file://` URLs.** Every fetch path must degrade to an empty baseline rather than throwing, so opening the file directly still works off localStorage alone.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `range.html` | Modify | Source selection, source-aware engine, filter UI, baseline fetch, save-to-file |
| `course.html` | Modify | Same engine changes; baseline fetch; source filter |
| `index.html` | Modify | Baseline fetch for rounds (storage only — no source concept) |
| `test-range-engine.js` | Modify | T36+ source identity, tombstones, mixed-source caveat |
| `test-course-engine.js` | Modify | C5+ engine parity for the same |
| `data/range.json` | **Create** | Canonical club-sessions |
| `data/rounds.json` | **Create** | Canonical rounds |
| `README.md` | Modify | Document the commit-and-push sync flow |

---

## Task 1: Add `source` to the club-session model

**Files:**
- Modify: `range.html` (`SOURCES`, `healSession`, the `#source` select, `doParse`)
- Modify: `test-range-engine.js`

The `#source` select currently picks a *parser* and its value is discarded. It must pick a parser **and** record which launch monitor produced the data.

- [ ] **Step 1: Write the failing tests**

Append to `test-range-engine.js`, before the final `console.log`:

```js
// T36. source is part of the stored model, normalized on read.
chk('T36 SOURCES entries each declare a parser and a source tag', (() => {
  return SOURCES.trackman.source === 'trackman'
      && SOURCES.toptracer.source === 'toptracer'
      && SOURCES.generic.source === 'other'
      && typeof SOURCES.toptracer.parse === 'function';
})());
chk('T36 toptracer and generic share the generic parser', SOURCES.toptracer.parse === SOURCES.generic.parse);
chk('T36 healSession normalizes a missing source to "unknown"', (() => {
  const h = healSession({ date: '2026-08-01', clubCode: '7i', club: canonicalClub('7i'), tags: {}, shots: [] });
  return h.source === 'unknown';
})());
chk('T36 healSession preserves an explicit source', (() => {
  const h = healSession({ date: '2026-08-01', clubCode: '7i', club: canonicalClub('7i'), source: 'toptracer', tags: {}, shots: [] });
  return h.source === 'toptracer';
})());
chk('T36 healSession rejects an unrecognized source as "unknown"', (() => {
  const h = healSession({ date: '2026-08-01', clubCode: '7i', club: canonicalClub('7i'), source: 'nonsense', tags: {}, shots: [] });
  return h.source === 'unknown';
})());
```

- [ ] **Step 2: Run to confirm failure**

Run: `node test-range-engine.js`
Expected: the `T36` checks fail. `SOURCES.toptracer` is undefined, so the first check throws inside its IIFE and the run aborts with a TypeError — that counts as failure for this step.

- [ ] **Step 3: Add the source registry and normalization**

In `range.html`, replace the `SOURCES` block (currently near line 518):

```js
var SOURCES = {
  trackman: { label: 'Trackman (range table)', parse: parseTrackman, source: 'trackman' },
  toptracer:{ label: 'Toptracer (CSV/table)',  parse: parseGenericLM, source: 'toptracer' },
  generic:  { label: 'Other launch monitor (CSV/table)', parse: parseGenericLM, source: 'other' },
};
// Every source a session may legitimately carry. 'unknown' exists for sessions
// saved before source tagging shipped; they are retagged by hand from the saved
// sessions table rather than guessed at, because the systems differ
// systematically and a wrong guess silently corrupts a trend.
var VALID_SOURCES = ['trackman', 'toptracer', 'other', 'unknown'];
```

Then replace `healSession` (immediately after `clubByName`):

```js
function healSession(cs) {
  return {
    ...cs,
    club: canonicalClub(normalizeClubCode(cs.clubCode)),
    source: VALID_SOURCES.indexOf(cs.source) >= 0 ? cs.source : 'unknown',
  };
}
```

- [ ] **Step 4: Widen the selector and record the choice**

In `range.html`, replace the `#source` select's options:

```html
    <select id="source" style="width:100%;margin-bottom:8px">
      <option value="trackman">Trackman — paste one club's session table</option>
      <option value="toptracer">Toptracer — CSV / table</option>
      <option value="generic">Other launch monitor — CSV / table</option>
    </select>
```

In `doParse()`, add the source tag to the per-session decoration loop:

```js
  result.sessions.forEach(s => {
    s.tags = tags;
    s.source = SOURCES[src].source;
    if (overrideName) { const c = clubByName(overrideName); if (c) { s.club = c; s.clubCode = overrideName; } }
  });
```

The existing no-rows error message branches on `src === 'trackman'`, which remains correct for the new three-option list (both non-Trackman options use the generic parser). Read it, confirm, and leave it unchanged.

- [ ] **Step 5: Run the tests**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 6: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Record which launch monitor produced each club-session"
```

---

## Task 2: Make identity source-aware

**Files:**
- Modify: `range.html` (`mergeClubSessions`, `doDeleteSession`, `computeSavedSessionRows`)
- Modify: `test-range-engine.js`

Two systems measure the same club differently. A Trackman 7-iron session and a Toptracer 7-iron session on the same day must stay two rows, never average into one.

- [ ] **Step 1: Write the failing tests**

Append to `test-range-engine.js`:

```js
// T37. Identity is date + club + source.
const srcShots = n => Array.from({ length: n }, () => ({ clubSpeed: 30, attackAngle: 0, ballSpeed: 40, spin: 6000, carry: 110, side: -3 }));
const tmSess = { date: '2026-08-01', dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'), source: 'trackman', tags: {}, shots: srcShots(6) };
const ttSess = { date: '2026-08-01', dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'), source: 'toptracer', tags: {}, shots: srcShots(6) };

chk('T37 same club+date from two sources stays two club-sessions', mergeClubSessions([tmSess], [ttSess]).all.length === 2);
chk('T37 same club+date+source still merges into one', mergeClubSessions([tmSess], [{ ...tmSess }]).all.length === 1);
chk('T37 merging identical input twice is idempotent', (() => {
  const once = mergeClubSessions([], [tmSess, ttSess]).all;
  const twice = mergeClubSessions(once, [tmSess, ttSess]);
  return twice.all.length === 2 && twice.addedShots === 0;
})());
chk('T37 an untagged legacy session does not collide with a tagged one', (() => {
  const legacy = { date: '2026-08-01', dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'), tags: {}, shots: srcShots(6) };
  return mergeClubSessions([legacy], [tmSess]).all.length === 2;
})());
chk('T37 saved-session rows expose the source', (() => {
  const rows = computeSavedSessionRows(groupByClub([tmSess, ttSess]));
  return rows.length === 2 && rows.some(r => r.source === 'trackman') && rows.some(r => r.source === 'toptracer');
})());
```

- [ ] **Step 2: Run to confirm failure**

Run: `node test-range-engine.js`
Expected: `FAIL T37 same club+date from two sources stays two club-sessions`, `FAIL T37 an untagged legacy session does not collide with a tagged one`, and `FAIL T37 saved-session rows expose the source`.

- [ ] **Step 3: Key the merge on source**

In `range.html`, replace the `key` line inside `mergeClubSessions`:

```js
  // Identity is date + club + source. Two launch monitors measure the same
  // swing differently (Toptracer is camera-based and estimates spin on many
  // installs; Trackman is radar), so merging a Trackman and a Toptracer
  // session of the same club on the same day would average two different
  // instruments into one number. healSession normalizes a missing source to
  // 'unknown', so legacy untagged sessions get their own bucket rather than
  // silently absorbing newly-tagged data.
  const key = cs => `${cs.date}|${canonicalClub(normalizeClubCode(cs.clubCode)).name}|${healSession(cs).source}`;
```

- [ ] **Step 4: Carry source into the sessions table**

`groupByClub` pushes whole session objects into its per-club buckets, and those objects are healed on the way in, so each session already retains its `source`. Read `groupByClub` and confirm it pushes `cs` rather than a projection — if it does, no change is needed there.

Replace `computeSavedSessionRows`:

```js
function computeSavedSessionRows(groups) {
  const rows = [];
  groups.forEach(g => {
    g.sessions.forEach(sess => {
      const total = sess.shots.length;
      const clean = sess.shots.filter(s => !s.quarantined).length;
      rows.push({
        date: sess.date, clubName: g.name, source: sess.source || 'unknown', clean, total,
        mishitRate: total ? Math.round((1 - clean / total) * 100) : null,
      });
    });
  });
  rows.sort((a, b) => a.date < b.date ? 1 : (a.date > b.date ? -1 : 0)); // most recent first
  return rows;
}
```

- [ ] **Step 5: Make delete source-aware**

In `range.html`, replace the body of `doDeleteSession`:

```js
function doDeleteSession(i) {
  const row = savedSessionRows[i];
  if (!row) return;
  if (!confirm(`Delete ${row.clubName} (${row.source}) on ${row.date}? This removes ${row.total} shot(s).`)) return;
  tombstone(row.date, row.clubName, row.source);
  saveStaging(loadStaging().filter(cs => {
    const h = healSession(cs);
    return !(cs.date === row.date && h.club.name === row.clubName && h.source === row.source);
  }));
  msg(`Deleted ${row.clubName} (${row.date}).`);
  render();
}
```

`tombstone`, `loadStaging`, and `saveStaging` arrive in Task 4. Between this task and that one, delete will throw in the browser — the engine tests are what gate this step, and Task 4 closes the gap.

- [ ] **Step 6: Run the tests**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 7: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Make club-session identity source-aware so instruments never average together"
```

---

## Task 3: Caveat trends that span mixed sources

**Files:**
- Modify: `range.html` (`computeTrend`, `computeVerdicts`)
- Modify: `test-range-engine.js`

A trend window containing both Trackman and Toptracer sessions measures the instrument, not the swing. `computeTrend` already carries a `caveat` flag for ball/weather confounds — this adds a parallel, separately-reported flag rather than overloading it, because the two confounds have different remedies.

- [ ] **Step 1: Write the failing tests**

Append to `test-range-engine.js`:

```js
// T38. Mixed-source trend windows are flagged.
const mkSess = (date, source, carry) => ({
  date, dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'), source,
  tags: { ball: 'range', venue: 'indoor', tempF: 70 },
  shots: Array.from({ length: 8 }, () => ({ clubSpeed: 30, attackAngle: 0, ballSpeed: 40, spin: 6000, carry, side: -3 })),
});
const singleSourceTrend = computeTrend([
  mkSess('2026-08-01', 'trackman', 108), mkSess('2026-08-02', 'trackman', 109),
  mkSess('2026-08-03', 'trackman', 110), mkSess('2026-08-04', 'trackman', 111),
  mkSess('2026-08-05', 'trackman', 112),
]);
const mixedSourceTrend = computeTrend([
  mkSess('2026-08-01', 'trackman', 108), mkSess('2026-08-02', 'trackman', 109),
  mkSess('2026-08-03', 'trackman', 110), mkSess('2026-08-04', 'toptracer', 111),
  mkSess('2026-08-05', 'toptracer', 112),
]);
chk('T38 single-source window is not source-caveated', singleSourceTrend.enough && singleSourceTrend.sourceCaveat === false);
chk('T38 mixed-source window is source-caveated', mixedSourceTrend.enough && mixedSourceTrend.sourceCaveat === true);
chk('T38 sourceCaveat is independent of the conditions caveat', singleSourceTrend.caveat === false && singleSourceTrend.sourceCaveat === false);
chk('T38 mixed-source window names the sources involved', (() => {
  const s = mixedSourceTrend.sources;
  return Array.isArray(s) && s.length === 2 && s.indexOf('trackman') >= 0 && s.indexOf('toptracer') >= 0;
})());
chk('T38 a carry verdict from a mixed window carries the instrument warning', (() => {
  const groups = groupByClub([
    mkSess('2026-08-01', 'trackman', 100), mkSess('2026-08-02', 'trackman', 100),
    mkSess('2026-08-03', 'trackman', 100), mkSess('2026-08-04', 'toptracer', 120),
    mkSess('2026-08-05', 'toptracer', 120),
  ]);
  const v = computeVerdicts(groups, computeGapping(groups), []);
  return v.some(x => /different launch monitors/i.test(x.text));
})());
```

- [ ] **Step 2: Run to confirm failure**

Run: `node test-range-engine.js`
Expected: all five `T38` checks fail — `sourceCaveat` and `sources` are undefined.

- [ ] **Step 3: Compute the flag in `computeTrend`**

In `range.html`, immediately after the existing `const caveat = !sameConditions;` line, insert:

```js
  // Instrument confound, tracked separately from the ball/weather caveat above
  // because it has a different remedy: conditions can be tagged retroactively,
  // but a Trackman number and a Toptracer number are not comparable at all and
  // the only fix is to compare within one source.
  const sources = [...new Set([...recent, ...baseline].map(s => s.source || 'unknown'))].sort();
  const sourceCaveat = sources.length > 1;
```

Then extend the returned object's first line:

```js
    enough: true, caveat, sourceCaveat, sources,
```

- [ ] **Step 4: Surface it in `computeVerdicts`**

In `range.html`, inside `computeVerdicts`'s `groups.forEach`, immediately after `anyEnoughData = true;`, insert:

```js
    if (t.sourceCaveat) {
      v.push({ tone: 'warn',
        text: `<b>${esc(g.name)} spans different launch monitors:</b> this window mixes ${esc(t.sources.join(' and '))}, which measure differently — treat any change below as the instrument, not your swing.` });
    }
```

- [ ] **Step 5: Run the tests**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 6: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Flag trend windows that mix launch monitors as instrument confounds"
```

---

## Task 4: Baseline fetch, localStorage staging, and deletion tombstones

**Files:**
- Modify: `range.html` (storage layer)
- Modify: `test-range-engine.js`

The subtlest task in this plan. `load()` must stay synchronous — it is called from many places — so the baseline is fetched once at startup and cached, and `load()` composes cached baseline + local staging − tombstones.

**Tombstone rule:** tombstones filter the **fetched baseline only**, never local staging. Local data is always authoritative, so re-pasting a previously deleted session makes it reappear correctly instead of being silently swallowed by a stale tombstone.

- [ ] **Step 1: Write the failing tests**

Append to `test-range-engine.js`:

```js
// T39. Baseline + staging composition and tombstones.
const tsA = { date: '2026-08-01', dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'), source: 'trackman', tags: {}, shots: srcShots(6) };
const tsB = { date: '2026-08-02', dateAssumed: false, clubCode: 'dr', club: canonicalClub('dr'), source: 'trackman', tags: {}, shots: srcShots(6) };

chk('T39 tombstoneKey is date|club|source', tombstoneKey('2026-08-01', '7-Iron', 'trackman') === '2026-08-01|7-Iron|trackman');
chk('T39 composeDataset with no staging returns the baseline', composeDataset([tsA, tsB], [], []).length === 2);
chk('T39 composeDataset merges staging into the baseline', (() => {
  const stagedNew = { ...tsA, date: '2026-08-03' };
  return composeDataset([tsA], [stagedNew], []).length === 2;
})());
chk('T39 a tombstone removes a baseline record', (() => {
  const out = composeDataset([tsA, tsB], [], [tombstoneKey('2026-08-01', '7-Iron', 'trackman')]);
  return out.length === 1 && out[0].date === '2026-08-02';
})());
chk('T39 a tombstone does NOT suppress a re-pasted local session', (() => {
  const out = composeDataset([tsA], [tsA], [tombstoneKey('2026-08-01', '7-Iron', 'trackman')]);
  return out.length === 1 && out[0].date === '2026-08-01';
})());
chk('T39 a tombstone for a different source leaves the record alone', (() => {
  const out = composeDataset([tsA], [], [tombstoneKey('2026-08-01', '7-Iron', 'toptracer')]);
  return out.length === 1;
})());
chk('T39 composeDataset is idempotent when run on its own output', (() => {
  const once = composeDataset([tsA, tsB], [], []);
  return composeDataset(once, [], []).length === once.length;
})());
chk('T39 composeDataset heals stale club identity from the baseline', (() => {
  const stale = { date: '2026-08-01', dateAssumed: false, clubCode: '6h',
    club: { code: '6h', name: '6h', order: 999, klass: 'unknown' }, source: 'trackman', tags: {}, shots: srcShots(6) };
  return composeDataset([stale], [], [])[0].club.name === '6-Hybrid';
})());
chk('T39 composeDataset tolerates a null/absent baseline', composeDataset(null, [tsA], []).length === 1);
```

- [ ] **Step 2: Run to confirm failure**

Run: `node test-range-engine.js`
Expected: the `T39` checks fail — `tombstoneKey` and `composeDataset` are not defined, so the first one throws and the run aborts.

- [ ] **Step 3: Add the pure composition functions to the engine block**

In `range.html`, immediately before `/*ENGINE-END*/`, insert:

```js
// ── Dataset composition ───────────────────────────────────────────────────────
// Canonical data lives in a committed JSON file; unpushed local edits live in
// localStorage. The rendered dataset is baseline + staging − tombstones.
//
// Tombstones filter the BASELINE ONLY, never staging. A deleted session still
// exists in the committed file until the next save-and-push, so without this
// the next page load resurrects it. But if the same session is later re-pasted,
// it lands in staging and must reappear — so staging always wins. Filtering
// both would let a stale tombstone permanently swallow real new data.
function tombstoneKey(date, clubName, source) {
  return `${date}|${clubName}|${source}`;
}
function sessionTombstoneKey(cs) {
  const h = healSession(cs);
  return tombstoneKey(cs.date, h.club.name, h.source);
}
function composeDataset(baseline, staging, tombstones) {
  const dead = new Set(tombstones || []);
  const live = (baseline || []).filter(cs => !dead.has(sessionTombstoneKey(cs)));
  return mergeClubSessions(live, staging || []).all;
}
```

- [ ] **Step 4: Rewire the storage layer**

In `range.html`, replace the UI storage block (the `const LS = …` / `load` / `save` lines):

```js
// ── Storage ──────────────────────────────────────────────────────────────────
// Canonical data is data/range.json in the repo, served by GitHub Pages.
// localStorage holds only what hasn't been committed yet, plus tombstones for
// records deleted locally that still exist in the committed file.
const LS = 'golfcaddy_range';              // staging (unpushed local edits)
const LS_DEAD = 'golfcaddy_range_deleted'; // tombstones
const DATA_URL = 'data/range.json';

let baseline = [];   // populated by bootstrap(); [] until then

const loadStaging = () => { try { return JSON.parse(localStorage.getItem(LS)) || []; } catch (e) { return []; } };
const saveStaging = cs => localStorage.setItem(LS, JSON.stringify(cs));
const loadTombstones = () => { try { return JSON.parse(localStorage.getItem(LS_DEAD)) || []; } catch (e) { return []; } };
function tombstone(date, clubName, source) {
  const k = tombstoneKey(date, clubName, source);
  const all = loadTombstones();
  if (all.indexOf(k) < 0) { all.push(k); localStorage.setItem(LS_DEAD, JSON.stringify(all)); }
}

const load = () => composeDataset(baseline, loadStaging(), loadTombstones());
// Anything newly entered goes to staging; the baseline only changes on save+push.
const save = cs => saveStaging(cs);
```

`save(all)` in `doParse` now writes the whole composed set into staging. That is intentional and harmless: staging is merged against the baseline on every load and `mergeClubSessions` is idempotent, so re-staging records that already exist in the baseline produces no duplicates. It also means a user who never pushes still holds a complete local dataset.

- [ ] **Step 5: Bootstrap the baseline before first render**

In `range.html`, replace the two trailing lines (`populateClubOverride();` and `render();`) at the very end of the script:

```js
// Fetch the committed baseline once, then render. fetch() throws on file://
// URLs, and the file legitimately may not exist yet, so both degrade to an
// empty baseline and the page runs off localStorage alone.
function bootstrap() {
  return fetch(DATA_URL, { cache: 'no-store' })
    .then(r => r.ok ? r.json() : [])
    .then(d => { baseline = Array.isArray(d) ? d : []; })
    .catch(() => { baseline = []; })
    .then(() => {
      populateClubOverride();
      render();
    });
}
bootstrap();
```

- [ ] **Step 6: Replace `doClear` so it clears staging and tombstones together**

```js
function doClear() {
  if (!confirm('Delete all locally stored range sessions? Data already committed to data/range.json is not affected until you save and push.')) return;
  localStorage.removeItem(LS);
  localStorage.removeItem(LS_DEAD);
  render();
}
```

- [ ] **Step 7: Run the tests**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 8: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Compose the dataset from a committed baseline plus local staging and tombstones"
```

---

## Task 5: Save-to-file and the source filter UI

**Files:**
- Modify: `range.html` (export button, filter control, `render()`)

- [ ] **Step 1: Replace `doExport` with a repo-file save**

In `range.html`, replace `doExport`:

```js
// Writes the full composed dataset back to data/range.json. On Chrome/Edge the
// File System Access API writes the repo file in place; elsewhere it falls back
// to a download the user saves over that path manually. Either way the user
// then commits and pushes — that is what makes the phone see it.
function doSaveToFile() {
  const json = JSON.stringify(load(), null, 1);
  if (window.showSaveFilePicker) {
    window.showSaveFilePicker({
      suggestedName: 'range.json',
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    }).then(handle => handle.createWritable())
      .then(w => w.write(json).then(() => w.close()))
      .then(() => msg('Saved. Commit and push in GitHub Desktop to update your phone.'))
      .catch(e => { if (e && e.name !== 'AbortError') msg('Save failed — use the download fallback.'); });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = 'range.json'; a.click();
  msg('Downloaded. Save it over data/range.json, then commit and push.');
}
```

Then replace the export button at `range.html:134`:

```html
    <button class="ghost" onclick="doSaveToFile()">Save to data file</button>
```

`doExport` is replaced wholesale, so no `doExport` reference should survive. Confirm:

```bash
grep -n "doExport" range.html
```

Expected: no output.

- [ ] **Step 2: Add the source filter control**

In `range.html`, immediately before `<div id="dash"></div>`, insert:

```html
  <div class="sec" id="filterbar" style="padding-bottom:0;border-bottom:0">
    <label class="sub" style="text-transform:none;letter-spacing:0">Launch monitor:
      <select id="sourceFilter" onchange="render()" style="margin-left:6px"></select>
    </label>
  </div>
```

- [ ] **Step 3: Populate and apply the filter in `render()`**

In `range.html`, at the top of `render()`, replace `const clubSessions = load();` with:

```js
  const allSessions = load();
  const present = [...new Set(allSessions.map(cs => cs.source || 'unknown'))].sort();
  const sel = document.getElementById('sourceFilter');
  const want = sel.value || 'all';
  sel.innerHTML = '<option value="all">All sources</option>' +
    present.map(s => `<option value="${esc(s)}"${s === want ? ' selected' : ''}>${esc(s)}</option>`).join('');
  if (want !== 'all' && present.indexOf(want) < 0) sel.value = 'all';
  const clubSessions = sel.value === 'all' ? allSessions
    : allSessions.filter(cs => (cs.source || 'unknown') === sel.value);
```

`sel.value` is read before the options are rebuilt so the selection survives a re-render; the guard resets it to `all` if the previously-selected source no longer has data.

- [ ] **Step 4: Show source in the saved-sessions table**

In `render()`, replace the saved-sessions row template:

```js
  const savedRowsHtml = savedSessionRows.map((row, i) => `<tr>
    <td>${esc(row.clubName)}</td>
    <td>${esc(row.date)}</td>
    <td>${esc(row.source)}</td>
    <td class="num">${row.clean}/${row.total}</td>
    <td class="num">${row.mishitRate != null ? row.mishitRate + '%' : '–'}</td>
    <td><button class="ghost danger small" onclick="doDeleteSession(${i})">Delete</button></td>
  </tr>`).join('');
```

and its header row inside the dashboard template:

```html
    <table><tr><th>Club</th><th>Date</th><th>Source</th><th>Clean/Total</th><th>Mishit</th><th></th></tr>
```

- [ ] **Step 5: Verify**

Run: `node test-range-engine.js`
Expected: `ALL PASS` (engine untouched by this task).

- [ ] **Step 6: Commit**

```bash
git add range.html
git commit -m "Add save-to-data-file and a launch monitor filter to range.html"
```

---

## Task 6: Retagging control for legacy sessions

**Files:**
- Modify: `range.html`

Three days of existing data carry no source. They are retagged by hand — never guessed at, because a wrong tag silently corrupts a trend.

- [ ] **Step 1: Add a retag handler**

In `range.html`, immediately after `doDeleteSession`, insert:

```js
// Retag takes an integer index into savedSessionRows for the same reason delete
// does: club names come from raw pasted text and must never reach an onclick
// attribute, escaped or otherwise.
function doRetagSession(i, newSource) {
  const row = savedSessionRows[i];
  if (!row || VALID_SOURCES.indexOf(newSource) < 0) return;
  const updated = load().map(cs => {
    const h = healSession(cs);
    return (cs.date === row.date && h.club.name === row.clubName && h.source === row.source)
      ? { ...cs, source: newSource } : cs;
  });
  saveStaging(updated);
  msg(`Retagged ${row.clubName} (${row.date}) as ${newSource}.`);
  render();
}
```

- [ ] **Step 2: Render it as a dropdown per row**

In `render()`, replace the source cell in `savedRowsHtml`:

```js
    <td><select class="small" onchange="doRetagSession(${i}, this.value)">${
      VALID_SOURCES.map(s => `<option value="${esc(s)}"${s === row.source ? ' selected' : ''}>${esc(s)}</option>`).join('')
    }</select></td>
```

- [ ] **Step 3: Verify in the browser**

Serve the directory (`python -m http.server 8940`) and open `http://127.0.0.1:8940/range.html`. With at least one stored session, change its source dropdown.
Expected: the message line confirms the retag, the row re-renders with the new value, and the filter dropdown gains the new source as an option.

- [ ] **Step 4: Commit**

```bash
git add range.html
git commit -m "Allow retagging a stored session's launch monitor from the sessions table"
```

---

## Task 7: Propagate the engine changes to `course.html`

**Files:**
- Modify: `course.html`
- Modify: `test-course-engine.js`

- [ ] **Step 1: Re-copy the shared engine block**

Copy everything in `range.html` between `/*ENGINE-START*/` and `/*ENGINE-END*/`, and use it to replace everything in `course.html` between `/*ENGINE-START*/` and the line `// ── Course-view helpers ───────────────────────────────────────────────────────`, leaving `pickReminders`, `ladderRows`, and `/*ENGINE-END*/` intact.

Verify parity:

```bash
node -e "const fs=require('fs'),n=s=>s.replace(/\r\n/g,'\n');const r=n(fs.readFileSync('range.html','utf8')).split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0];const c=n(fs.readFileSync('course.html','utf8')).split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0];const i=c.indexOf('// ── Course-view helpers');console.log('identical:', r.trim()===c.slice(0,i).trim());"
```

Expected: `identical: true`.

- [ ] **Step 2: Rewire `course.html`'s storage layer**

Replace `course.html`'s `const LS = …` / `load` / `save` block:

```js
// ── Storage ──────────────────────────────────────────────────────────────────
// Read-only on this page: it composes the committed baseline with whatever
// staging exists on this device, but only ever writes staging via doImport.
const LS = 'golfcaddy_range';
const LS_DEAD = 'golfcaddy_range_deleted';
const DATA_URL = 'data/range.json';

let baseline = [];

const loadStaging = () => { try { return JSON.parse(localStorage.getItem(LS)) || []; } catch (e) { return []; } };
const saveStaging = cs => localStorage.setItem(LS, JSON.stringify(cs));
const loadTombstones = () => { try { return JSON.parse(localStorage.getItem(LS_DEAD)) || []; } catch (e) { return []; } };
const load = () => composeDataset(baseline, loadStaging(), loadTombstones());
const save = cs => saveStaging(cs);
```

- [ ] **Step 3: Bootstrap before first render**

Replace the trailing `render();` call in `course.html`:

```js
fetch(DATA_URL, { cache: 'no-store' })
  .then(r => r.ok ? r.json() : [])
  .then(d => { baseline = Array.isArray(d) ? d : []; })
  .catch(() => { baseline = []; })
  .then(render);
```

- [ ] **Step 4: Pick a single source for the ladder**

`course.html` must never mix instruments. On `range.html` an "All sources" view
is a reasonable analysis option; on the course it is actively harmful, because a
ladder blending Trackman and Toptracer carries for the same club gives a yardage
that matches neither and you club off it for real.

So this page always renders exactly one source, defaulting to whichever has the
most recent data, with a selector appearing only when there is a genuine choice.

Add to `course.html`'s engine block, immediately before `/*ENGINE-END*/`:

```js
// Which single source this page should show: the one with the most recent
// session. Never a blend — see course.html's render() for why.
function preferredSource(clubSessions) {
  let best = null, bestDate = '';
  (clubSessions || []).forEach(cs => {
    const s = healSession(cs);
    if (cs.date > bestDate) { bestDate = cs.date; best = s.source; }
  });
  return best;
}
```

In `course.html`'s `render()`, replace `const clubSessions = load();` with:

```js
  const allSessions = load();
  const present = [...new Set(allSessions.map(cs => healSession(cs).source))].sort();
  const sel = document.getElementById('sourcePick');
  const chosen = (sel && sel.value && present.indexOf(sel.value) >= 0)
    ? sel.value : preferredSource(allSessions);
  if (sel) {
    sel.parentElement.style.display = present.length > 1 ? '' : 'none';
    sel.innerHTML = present.map(s => `<option value="${esc(s)}"${s === chosen ? ' selected' : ''}>${esc(s)}</option>`).join('');
  }
  const clubSessions = allSessions.filter(cs => healSession(cs).source === chosen);
```

And add the selector to `course.html`'s markup, immediately before `<div id="view"></div>`:

```html
  <div class="sub" style="text-transform:none;letter-spacing:0;margin-bottom:12px;display:none">
    Numbers from <select id="sourcePick" onchange="render()" style="margin-left:4px"></select>
  </div>
```

- [ ] **Step 5: Add parity tests**

Append to `test-course-engine.js`, before the final `console.log`:

```js
// C5. Phase 1 engine parity.
const c5shots = () => Array.from({ length: 6 }, () => ({ clubSpeed: 30, ballSpeed: 40, spin: 6000, carry: 110, side: -3 }));
chk('C5 SOURCES carries source tags', SOURCES.trackman.source === 'trackman' && SOURCES.toptracer.source === 'toptracer');
chk('C5 healSession normalizes source', healSession({ date: '2026-08-01', clubCode: '7i', tags: {}, shots: [] }).source === 'unknown');
chk('C5 identity is source-aware', (() => {
  const mk = source => ({ date: '2026-08-01', dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'), source, tags: {}, shots: c5shots() });
  return mergeClubSessions([mk('trackman')], [mk('toptracer')]).all.length === 2;
})());
chk('C5 tombstones filter the baseline only', (() => {
  const s = { date: '2026-08-01', dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'), source: 'trackman', tags: {}, shots: c5shots() };
  const k = tombstoneKey('2026-08-01', '7-Iron', 'trackman');
  return composeDataset([s], [], [k]).length === 0 && composeDataset([s], [s], [k]).length === 1;
})());

// C6. preferredSource — the on-course ladder shows one instrument, never a blend.
const mkC6 = (date, source) => ({ date, dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'), source, tags: {}, shots: c5shots() });
chk('C6 picks the source with the most recent session', preferredSource([mkC6('2026-08-01', 'trackman'), mkC6('2026-08-09', 'toptracer')]) === 'toptracer');
chk('C6 is order-independent', preferredSource([mkC6('2026-08-09', 'toptracer'), mkC6('2026-08-01', 'trackman')]) === 'toptracer');
chk('C6 returns null on empty input', preferredSource([]) === null && preferredSource(undefined) === null);
chk('C6 heals an untagged session to unknown rather than returning undefined', preferredSource([{ date: '2026-08-01', clubCode: '7i', tags: {}, shots: [] }]) === 'unknown');
```

- [ ] **Step 6: Run both suites**

Run: `node test-range-engine.js && node test-course-engine.js`
Expected: `ALL PASS` from both.

Then re-verify engine parity, since Step 4 added `preferredSource` to
`course.html` only — it must sit **after** the shared block's end. Re-run the
parity command from Step 1; if it now reports `false`, move `preferredSource`
down so it lives alongside `pickReminders`/`ladderRows` in the course-helpers
section rather than inside the shared portion.

- [ ] **Step 7: Commit**

```bash
git add course.html test-course-engine.js
git commit -m "Propagate source-aware identity to course.html and pin the ladder to one instrument"
```

---

## Task 8: Rounds baseline in `index.html`

**Files:**
- Modify: `index.html`

Rounds have no source concept — this is storage only.

- [ ] **Step 1: Rewire storage**

`index.html` already has `mergeRounds(existing, incoming)` at line 270, keyed on
`date|score|course`. **It returns `{ all, added }`, not a bare array** — `load()`
must take `.all` or every caller receives an object where it expects a list.

Replace `index.html`'s `const LS = 'golfcaddy_rounds';` line and the two
`load`/`save` lines directly beneath it (currently lines 459–461):

```js
const LS = 'golfcaddy_rounds';
const DATA_URL = 'data/rounds.json';

let baseline = [];   // populated by the bootstrap at the end of this script

const loadStaging = () => { try { return JSON.parse(localStorage.getItem(LS)) || []; } catch (e) { return []; } };
const saveStaging = rs => localStorage.setItem(LS, JSON.stringify(rs));
// .all — mergeRounds returns {all, added}, and every caller of load() wants the array.
const load = () => mergeRounds(baseline, loadStaging()).all;
const save = rs => saveStaging(rs);
```

- [ ] **Step 2: Bootstrap and add save-to-file**

Replace `index.html`'s trailing `render();` call:

```js
function doSaveToFile() {
  const json = JSON.stringify(load(), null, 1);
  if (window.showSaveFilePicker) {
    window.showSaveFilePicker({
      suggestedName: 'rounds.json',
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    }).then(handle => handle.createWritable())
      .then(w => w.write(json).then(() => w.close()))
      .then(() => msg('Saved. Commit and push in GitHub Desktop.'))
      .catch(e => { if (e && e.name !== 'AbortError') msg('Save failed — use the download fallback.'); });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = 'rounds.json'; a.click();
  msg('Downloaded. Save it over data/rounds.json, then commit and push.');
}

fetch(DATA_URL, { cache: 'no-store' })
  .then(r => r.ok ? r.json() : [])
  .then(d => { baseline = Array.isArray(d) ? d : []; })
  .catch(() => { baseline = []; })
  .then(render);
```

Then replace the export button at `index.html:127`:

```html
    <button class="ghost" onclick="doSaveToFile()">Save to data file</button>
```

and delete the now-unreferenced `doExport` function at `index.html:531`.

- [ ] **Step 3: Verify**

Run: `node test-engine.js`
Expected: `ALL PASS`.

Then confirm the old function is gone:

```bash
grep -n "doExport" index.html
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Load rounds from a committed baseline and add save-to-data-file"
```

---

## Task 9: Seed data files, verify live, document

**Files:**
- Create: `data/range.json`, `data/rounds.json`
- Modify: `README.md`

- [ ] **Step 1: Seed empty data files**

```bash
mkdir -p data
echo "[]" > data/range.json
echo "[]" > data/rounds.json
git add data/range.json data/rounds.json
git commit -m "Seed empty canonical data files"
```

- [ ] **Step 2: Audit the origin split before migrating**

localStorage is per-origin. Data entered via `file:///` and via `http://127.0.0.1:<port>` sit in separate silos, and both have been used here. In each origin previously used, run in the DevTools console:

```js
JSON.parse(localStorage.getItem('golfcaddy_range') || '[]').length + ' range sessions, ' +
JSON.parse(localStorage.getItem('golfcaddy_rounds') || '[]').length + ' rounds'
```

Report the counts per origin. Any origin holding data must have it exported before that data is stranded.

- [ ] **Step 3: Tag the existing sessions**

Three days of data predate source tagging and currently read `unknown`. Ask the
user which launch monitor produced each date — do not infer it. Then set each
one with the per-row dropdown from Task 6.

Confirm none are left untagged:

```js
JSON.parse(localStorage.getItem('golfcaddy_range') || '[]')
  .filter(cs => !cs.source || cs.source === 'unknown')
  .map(cs => cs.date + ' ' + (cs.club && cs.club.name))
```

Expected: an empty array. A session left as `unknown` is excluded from
same-source trend comparisons with tagged data, so this is not cosmetic.

- [ ] **Step 4: Verify the full loop locally**

Serve (`python -m http.server 8940`) and open `http://127.0.0.1:8940/range.html`.

1. Paste a Trackman sample. Confirm it renders and the saved-sessions table shows source `trackman`.
2. Click **Save to data file**, write `data/range.json`.
3. Hard-reload. Confirm the data still renders (now from the baseline).
4. Run `localStorage.clear()` in the console and reload. Confirm the data **still renders** — this proves it is coming from the committed file, not localStorage.
5. Delete a session. Reload. Confirm it stays deleted (tombstone held).
6. Re-paste that same session. Confirm it reappears (staging beats tombstone).
7. Open `course.html`; confirm the same data appears with no import.

- [ ] **Step 5: Verify the `file://` fallback**

Open `range.html` directly by double-clicking it. `fetch` fails on the `file://` origin.
Expected: the page loads without a console error cascade and renders from localStorage alone (likely empty). It must not show a blank or broken page.

- [ ] **Step 6: Enable GitHub Pages**

This is a user action, not an agent action. The user enables Pages on the repo (Settings → Pages → deploy from `master`, root). Report the resulting URL, then verify `course.html` loads on a phone and shows the committed data with no import step.

- [ ] **Step 7: Document the sync flow**

Append to `README.md`:

```markdown

## Where the data lives

Canonical data is committed JSON in this repo: `data/range.json` and
`data/rounds.json`. The pages fetch those files as a baseline and merge in
anything you've entered locally but not yet committed.

The loop: paste on your computer → **Save to data file** → commit and push in
GitHub Desktop → your phone sees it.

Pushing is the *sync* step, not the save step. If you forget to push, nothing is
lost — your computer still has everything in browser storage. Only the phone
view goes stale.

Deleting a session locally writes a tombstone, so it stays deleted after a
reload even though it's still in the committed file until your next save and
push. Re-pasting the same session brings it back — local edits always win.

Opening the pages by double-clicking the HTML file (a `file://` URL) still
works, but browsers block `fetch` there, so you'll only see browser-storage
data. Serve the folder over HTTP, or use the Pages URL, to see committed data.
```

- [ ] **Step 8: Commit**

```bash
git add README.md
git commit -m "Document the commit-and-push data sync flow"
```

---

## Final check

- [ ] `node test-engine.js && node test-range-engine.js && node test-course-engine.js` — all three print `ALL PASS`.
- [ ] Engine blocks in `range.html` and `course.html` are identical up to the course-helpers marker (parity command from Task 7 Step 1).
- [ ] `grep -n "doExport" range.html index.html` returns nothing — both replaced by `doSaveToFile`.
- [ ] A Trackman and a Toptracer session for the same club on the same date render as two separate rows.
- [ ] A trend window spanning two sources produces the instrument-confound verdict.
- [ ] `localStorage.clear()` followed by a reload still shows committed data.
- [ ] All three pages load on the Pages URL and cross-links work in every direction.
- [ ] `git log --oneline -12` shows one descriptive commit per task.
