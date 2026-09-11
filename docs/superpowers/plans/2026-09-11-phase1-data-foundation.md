# Phase 1: Data Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the stored numbers correct (units, dates, mishit detection), tag every club-session with the launch monitor that produced it, and move canonical storage into committed JSON files served by GitHub Pages so the phone reads current data with no import step.

**Architecture:** Units are declared per source and normalized to the engine's canonical metric at parse time. `source` becomes part of a club-session's identity (`date + club + source`). A baseline dataset is fetched once at startup from `data/range.json` and cached; `load()` stays synchronous and returns that baseline merged with localStorage staging, minus tombstoned deletions.

**Tech Stack:** Vanilla JS/CSS, no dependencies, no build step. Node.js for the test harnesses.

**Spec:** `docs/superpowers/specs/2026-09-11-analysis-platform-design.md`

---

## Why this plan changed

The original plan started at source tagging. Investigating the real stored data on
2026-09-11 surfaced three defects that have to be fixed first, because every
number downstream inherits them.

**1. Units are wrong.** The engine treats `carry` and `side` as **metres** and
speeds as **m/s** — correct for a native Trackman table paste, whose header
literally declares `m/s Deg m/s Rpm m m`. But the user's data was exported from
Trackman as **CSV** and pasted through the "Other launch monitor" option, which
calls no unit conversion at all. That CSV is in yards, feet, and mph.

Evidence, from comparing the two real datasets — carry ÷ ball speed per club:

| | Driver | 4H | 6H | 7i | 8i | PW |
|---|---|---|---|---|---|---|
| Trackman (stored) | 1.53 | 1.43 | 1.30 | 1.26 | 1.25 | 1.07 |
| Toptracer (raw CSV) | 1.44 | 1.41 | 1.32 | 1.30 | 1.25 | 1.10 |

The ratios align, which can only happen if both hold the same unit. Were the
stored Trackman values metres, its ratios would each be 9% higher and would not
match. **Every carry the tool has displayed is ~9% too long; every side bias
~3.3× too large.**

**2. No dates.** All nine stored club-sessions carry `date: '0000-00-00'`,
`dateAssumed: true`. Neither CSV export has a date column, so nothing supplies
one. `computeTrend` needs 3+ sessions of a club; with every session collapsed
onto one pseudo-date, **no trend can ever be computed**. Nothing was lost so far
— both Trackman uploads were genuinely the same day (8/22), so merging them was
correct — but every future session would pile onto the same bucket.

**3. Mishit quarantine cannot run on Toptracer.** `quarantineClub` gates on
smash factor (ball speed ÷ club speed). The Toptracer CSV has neither club speed
nor spin. Its session contains obvious duffs — a 19-yard 7-iron, a 45-yard drive
at 1° launch and 1 ft of height — that the current logic physically cannot
detect, so they would be averaged in as clean shots.

A fourth finding shapes the ordering but needs no code: Toptracer reads
**12–20% hotter on ball speed** than Trackman across every club. Ball speed is a
measured quantity and cannot move that much in three weeks, so this is the
instrument. It is exactly why Tasks 5 and 7 exist — merged, these two sessions
would have reported a ~20-yard bag-wide "improvement" that never happened.

---

## Critical conventions (read before implementing any task)

1. **`var`, not `const`, for engine-block bindings referenced by bare name in tests.** The harness extracts `/*ENGINE-START*/…/*ENGINE-END*/` and runs it through a dynamic-evaluation step that only leaks `var`/`function` declarations into the caller's scope. `M_TO_YD`, `median`, `SOURCES` are already `var` for this reason. Function declarations are unaffected.
2. **Never interpolate user-controlled text into an `onclick="..."` attribute**, even escaped. HTML-entity decoding precedes JS parsing, so an escaped quote still closes a nested JS string. Club names can be arbitrary raw pasted text. `doDeleteSession(i)` takes an integer index for exactly this reason — follow that pattern for any new row control.
3. **Escape every dynamic string reaching the DOM via a markup string** with `esc()`. Verdict `.text` is the one deliberate exception: engine-generated, already internally escaped, contains intentional `<b>` tags.
4. **Two known false-positive security hooks** may block a write once per (file, rule) per session — one on the harness's dynamic-evaluation call, one on markup-to-`innerHTML` assignment. Retry the identical write once and it succeeds.
5. **`range.html` and `course.html` share a byte-identical engine block.** Any engine change must be applied to both. `course.html` carries extra functions after the shared portion — everything before `// ── Course-view helpers` must match `range.html` exactly.
6. **`fetch()` fails on `file://` URLs.** Every fetch path must degrade to an empty baseline rather than throwing.
7. **The engine's canonical units are metres and m/s.** Never change that. Convert at the parser boundary instead — `normalizeShotUnits` already exists for this and the Trackman table parser already uses it.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `range.html` | Modify | Units, date, source, quarantine, storage, filter UI |
| `course.html` | Modify | Same engine changes; baseline fetch; single-source ladder |
| `index.html` | Modify | Baseline fetch for rounds (storage only) |
| `test-range-engine.js` | Modify | T36+ |
| `test-course-engine.js` | Modify | C5+ |
| `data/range.json` | **Create** | Canonical club-sessions |
| `data/rounds.json` | **Create** | Canonical rounds |
| `README.md` | Modify | Document the sync flow |

---

## Task 1: Per-source unit normalization

**Files:**
- Modify: `range.html` (`normalizeShotUnits`, `SOURCES`, `parseGenericLM`, the source select)
- Modify: `test-range-engine.js`

- [ ] **Step 1: Write the failing tests**

Append to `test-range-engine.js`, before the final `console.log`:

```js
// T36. Units are declared per source and normalized to metres/m-per-s at parse.
chk('T36 normalizeShotUnits converts yards to metres', (() => {
  const s = normalizeShotUnits({ carry: 109.361 }, { distance: 'yd', speed: 'mph' });
  return Math.abs(s.carry - 100) < 0.01;
})());
chk('T36 normalizeShotUnits converts mph to m/s', (() => {
  const s = normalizeShotUnits({ ballSpeed: 22.3694 }, { distance: 'm', speed: 'mph' });
  return Math.abs(s.ballSpeed - 10) < 0.01;
})());
chk('T36 side can use feet independently of the distance unit', (() => {
  const s = normalizeShotUnits({ carry: 109.361, side: 32.8084 }, { distance: 'yd', side: 'ft', speed: 'mph' });
  return Math.abs(s.carry - 100) < 0.01 && Math.abs(s.side - 10) < 0.01;
})());
chk('T36 side defaults to the distance unit when unspecified (back-compat)', (() => {
  const s = normalizeShotUnits({ side: 109.361 }, { distance: 'yd', speed: 'mph' });
  return Math.abs(s.side - 100) < 0.01;
})());
chk('T36 metric input passes through untouched', (() => {
  const s = normalizeShotUnits({ carry: 100, side: 10, ballSpeed: 40 }, { distance: 'm', side: 'm', speed: 'ms' });
  return s.carry === 100 && s.side === 10 && s.ballSpeed === 40;
})());
chk('T36 every SOURCES entry declares units and a source tag', (() => {
  return Object.keys(SOURCES).every(k => {
    const e = SOURCES[k];
    return e.source && e.units && e.units.distance && e.units.speed && typeof e.parse === 'function';
  });
})());
chk('T36 toptracer CSV carry lands in metres', (() => {
  const csv = 'Club,Shot,Flat Carry (yd),Offline (ft) [+R/-L],Ball Speed (mph)\n7 Iron,1,139,-9,105';
  const r = SOURCES.toptracer.parse(csv, SOURCES.toptracer.units);
  const sh = r.sessions[0].shots[0];
  return Math.abs(sh.carry - 127.1) < 0.5 && Math.abs(sh.side - (-2.74)) < 0.05;
})());
chk('T36 a 139-yard Toptracer 7-iron displays as 139 yards, not 152', (() => {
  const csv = 'Club,Shot,Flat Carry (yd),Ball Speed (mph)\n7 Iron,1,139,105';
  const r = SOURCES.toptracer.parse(csv, SOURCES.toptracer.units);
  return Math.abs(r.sessions[0].shots[0].carry * M_TO_YD - 139) < 0.5;
})());
```

- [ ] **Step 2: Run to confirm failure**

Run: `node test-range-engine.js`
Expected: the `T36` checks fail — `SOURCES.toptracer` does not exist and `parseGenericLM` ignores units.

- [ ] **Step 3: Give `side` its own unit**

In `range.html`, replace `normalizeShotUnits`:

```js
// Canonical engine units are metres and m/s. Every parser converts here.
// `side` gets its own unit because launch monitors disagree: Trackman's table
// reports it in the same unit as carry, but Toptracer's CSV reports carry in
// yards and offline in FEET. Defaults to units.distance when unset so the
// existing Trackman table path is unaffected.
function normalizeShotUnits(shot, units) {
  const s = { ...shot };
  const perUnit = { m: 1, yd: 1 / M_TO_YD, ft: 1 / 3.28084 };
  const dFactor = perUnit[units.distance] != null ? perUnit[units.distance] : 1;
  const sUnit = units.side || units.distance;
  const sFactor = perUnit[sUnit] != null ? perUnit[sUnit] : 1;
  const vFactor = units.speed === 'mph' ? (1 / MS_TO_MPH) : 1;
  ['carry', 'total', 'height'].forEach(k => { if (s[k] != null) s[k] = s[k] * dFactor; });
  if (s.side != null) s.side = s.side * sFactor;
  ['clubSpeed', 'ballSpeed'].forEach(k => { if (s[k] != null) s[k] = s[k] * vFactor; });
  return s;
}
```

- [ ] **Step 4: Declare units on every source**

Replace the `SOURCES` block:

```js
// Each entry binds three independent things: which parser reads the text, which
// launch monitor the data came from, and what units that export uses. They are
// genuinely independent — the user's Trackman data arrives as an imperial CSV,
// which is the same parser as Toptracer but a different instrument, and a
// different unit set from Trackman's own metric table paste.
var SOURCES = {
  trackman:     { label: 'Trackman — table paste',   parse: parseTrackman,  source: 'trackman',
                  units: { distance: 'm',  side: 'm',  speed: 'ms'  } },
  trackman_csv: { label: 'Trackman — CSV export',    parse: parseGenericLM, source: 'trackman',
                  units: { distance: 'yd', side: 'ft', speed: 'mph' } },
  toptracer:    { label: 'Toptracer — CSV',          parse: parseGenericLM, source: 'toptracer',
                  units: { distance: 'yd', side: 'ft', speed: 'mph' } },
  generic:      { label: 'Other launch monitor — CSV', parse: parseGenericLM, source: 'other',
                  units: { distance: 'yd', side: 'ft', speed: 'mph' } },
};
var VALID_SOURCES = ['trackman', 'toptracer', 'other', 'unknown'];
```

`parseTrackman` reads its units from the pasted table's own unit line and ignores
the passed argument — the declared metric units above document that path rather
than driving it.

- [ ] **Step 5: Make the CSV parser normalize**

In `parseGenericLM`, change the signature and the shot construction. Replace:

```js
function parseGenericLM(text) {
```

with:

```js
function parseGenericLM(text, units) {
  const u = units || { distance: 'yd', side: 'ft', speed: 'mph' };
```

and replace the `const shot = {...}` assignment plus the line that follows it:

```js
    const shot = normalizeShotUnits({
      clubSpeed: num(c, col.clubSpeed), attackAngle: num(c, col.attackAngle),
      ballSpeed: num(c, col.ballSpeed), spin: num(c, col.spin), launch: num(c, col.launch),
      carry: num(c, col.carry), total: num(c, col.total), side: side(c, col.side),
      height: num(c, col.height), smash: num(c, col.smash),
    }, u);
```

`attackAngle`, `launch`, `spin`, and `smash` are angles, rpm, and a ratio — unit-free, so `normalizeShotUnits` correctly leaves them alone.

- [ ] **Step 6: Pass units at the call site and widen the selector**

Replace the `#source` select's options:

```html
    <select id="source" style="width:100%;margin-bottom:8px">
      <option value="trackman_csv">Trackman — CSV export (yards)</option>
      <option value="trackman">Trackman — table paste (metric)</option>
      <option value="toptracer">Toptracer — CSV (yards)</option>
      <option value="generic">Other launch monitor — CSV (yards)</option>
    </select>
```

`trackman_csv` is listed first because it is the path actually in use.

In `doParse`, pass the units through:

```js
  const result = SOURCES[src].parse(pasteText, SOURCES[src].units);
```

- [ ] **Step 7: Run the tests**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 8: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Normalize launch monitor units per source instead of assuming metric"
```

---

## Task 2: Repair the existing stored data

**Files:**
- Create: `tools/repair-units.js`

Nine stored club-sessions hold yards, feet, and mph in fields the engine reads as
metres and m/s. The original Trackman CSV is gone, so the stored JSON must be
repaired in place rather than re-parsed.

- [ ] **Step 1: Write the repair script**

Create `tools/repair-units.js`:

```js
// One-time repair for data captured before per-source units existed (Task 1).
// Those sessions came from a Trackman CSV export in yards/feet/mph but were
// stored raw, and the engine reads carry/side as metres and speeds as m/s.
//
// Also stamps the known date and source: both uploads were Trackman on
// 2026-08-22, confirmed by the user. Re-running is NOT safe — it would convert
// twice — so it refuses unless every session still looks unconverted.
const fs = require('fs');
const M_TO_YD = 1.09361, FT_PER_M = 3.28084, MS_TO_MPH = 2.23694;

const inPath = process.argv[2], outPath = process.argv[3];
if (!inPath || !outPath) { console.error('usage: node tools/repair-units.js <in.json> <out.json>'); process.exit(1); }

const data = JSON.parse(fs.readFileSync(inPath, 'utf8'));

// Guard against a double conversion, which would silently shrink every number
// by another 9% with no error. Keyed on the two stamps this script itself
// applies — a real date and a source on every session — rather than on value
// magnitudes. A magnitude heuristic looked tempting (m/s speeds are ~40, mph
// ~90) but breaks on fast clubs: a 151 mph Toptracer drive is 67 m/s, which
// would read as "still imperial" and invite a second pass.
const repaired = data.length > 0
  && data.every(s => s.source) && data.every(s => s.date !== '0000-00-00');
if (repaired) {
  console.error('Refusing: every session already has a date and source. This file looks repaired.');
  console.error('Converting twice would shrink every distance by a further 9%.');
  process.exit(1);
}

let shots = 0;
const out = data.map(s => ({
  ...s,
  date: s.date === '0000-00-00' ? '2026-08-22' : s.date,
  dateAssumed: s.date === '0000-00-00' ? false : s.dateAssumed,
  source: s.source || 'trackman',
  shots: s.shots.map(x => {
    shots++;
    const y = { ...x };
    ['carry', 'total', 'height'].forEach(k => { if (y[k] != null) y[k] = y[k] / M_TO_YD; });
    if (y.side != null) y.side = y.side / FT_PER_M;
    ['clubSpeed', 'ballSpeed'].forEach(k => { if (y[k] != null) y[k] = y[k] / MS_TO_MPH; });
    return y;
  }),
}));

fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`Repaired ${out.length} club-sessions, ${shots} shots -> ${outPath}`);
out.forEach(s => {
  const c = s.shots.map(x => x.carry).filter(v => v != null).sort((a, b) => a - b);
  const m = c.length ? c[Math.floor(c.length / 2)] : null;
  console.log('  ' + (s.club.name + '        ').slice(0, 10) + (m != null ? Math.round(m * M_TO_YD) + ' yd' : '-'));
});
```

- [ ] **Step 2: Run it against the backup**

```bash
node tools/repair-units.js "C:/Users/bkami/Downloads/golf-range.json" data/range.json
```

Expected output — these are the carries confirmed during investigation:

```
Driver     188 yd
4-Hybrid   151 yd
6-Hybrid   132 yd
7-Iron     118 yd
8-Iron     106 yd
9-Iron     108 yd
PW          76 yd
SW          26 yd
LW          32 yd
```

If any number differs by more than 1 yard, stop — the conversion is wrong and
must not be committed.

- [ ] **Step 3: Confirm the guard works**

```bash
node tools/repair-units.js data/range.json /tmp/double.json
```

Expected: refuses with the "already look like m/s" message and exit code 1.

- [ ] **Step 4: Commit**

```bash
git add tools/repair-units.js data/range.json
git commit -m "Repair pre-units data: convert yd/ft/mph to metric, stamp 8/22 Trackman"
```

---

## Task 3: Session date field

**Files:**
- Modify: `range.html`
- Modify: `test-range-engine.js`

No CSV export carries a date, so the form must supply one or every session lands
on `0000-00-00` and merges into a single undated pile.

- [ ] **Step 1: Write the failing tests**

```js
// T37. A manual date fills in only where the parser found none.
chk('T37 applySessionDate stamps sessions whose date was assumed', (() => {
  const out = applySessionDate([{ date: '0000-00-00', dateAssumed: true, shots: [] }], '2026-09-11');
  return out[0].date === '2026-09-11' && out[0].dateAssumed === false;
})());
chk('T37 applySessionDate leaves a parsed date alone', (() => {
  const out = applySessionDate([{ date: '2026-08-22', dateAssumed: false, shots: [] }], '2026-09-11');
  return out[0].date === '2026-08-22';
})());
chk('T37 applySessionDate is a no-op when no date is given', (() => {
  const out = applySessionDate([{ date: '0000-00-00', dateAssumed: true, shots: [] }], '');
  return out[0].date === '0000-00-00';
})());
chk('T37 applySessionDate rejects a malformed date', (() => {
  const out = applySessionDate([{ date: '0000-00-00', dateAssumed: true, shots: [] }], 'not-a-date');
  return out[0].date === '0000-00-00';
})());
```

- [ ] **Step 2: Run to confirm failure**

Run: `node test-range-engine.js`
Expected: `applySessionDate is not defined`.

- [ ] **Step 3: Add the function to the engine block**

Immediately before `/*ENGINE-END*/`:

```js
// Neither Trackman's nor Toptracer's CSV export has a date column, so the form
// supplies one. Applied only where the parser genuinely found no date
// (dateAssumed), so a CSV that does carry per-row dates keeps them.
function applySessionDate(sessions, dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return sessions;
  return sessions.map(s => s.dateAssumed ? { ...s, date: dateStr, dateAssumed: false } : s);
}
```

- [ ] **Step 4: Add the input and wire it up**

In the "Add a session" section, directly after the `#source` select:

```html
    <label class="sub" style="text-transform:none;letter-spacing:0;display:block;margin-bottom:8px">
      Session date
      <input type="date" id="sessionDate" style="margin-left:6px">
    </label>
```

In `doParse`, after the parse result is obtained and before the tag loop:

```js
  result.sessions = applySessionDate(result.sessions, document.getElementById('sessionDate').value);
```

Default it to today on load — add to `bootstrap()` (Task 8) or immediately before the existing `populateClubOverride()` call:

```js
document.getElementById('sessionDate').value = new Date().toISOString().slice(0, 10);
```

- [ ] **Step 5: Warn when a session would still be undated**

In `doParse`, immediately after the `applySessionDate` line:

```js
  if (result.sessions.some(s => s.date === '0000-00-00')) {
    msg('Pick a session date first — without one this paste merges into every other undated session and no trend can ever be computed.');
    return;
  }
```

- [ ] **Step 6: Run the tests**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 7: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Require a session date, since no CSV export supplies one"
```

---

## Task 4: Record the source on each club-session

**Files:**
- Modify: `range.html` (`healSession`, `doParse`)
- Modify: `test-range-engine.js`

- [ ] **Step 1: Write the failing tests**

```js
// T38. source is part of the stored model, normalized on read.
chk('T38 healSession normalizes a missing source to "unknown"',
  healSession({ date: '2026-08-01', clubCode: '7i', club: canonicalClub('7i'), tags: {}, shots: [] }).source === 'unknown');
chk('T38 healSession preserves an explicit source',
  healSession({ date: '2026-08-01', clubCode: '7i', club: canonicalClub('7i'), source: 'toptracer', tags: {}, shots: [] }).source === 'toptracer');
chk('T38 healSession rejects an unrecognized source as "unknown"',
  healSession({ date: '2026-08-01', clubCode: '7i', club: canonicalClub('7i'), source: 'nonsense', tags: {}, shots: [] }).source === 'unknown');
```

- [ ] **Step 2: Run to confirm failure**

Run: `node test-range-engine.js`
Expected: three `FAIL T38` lines.

- [ ] **Step 3: Normalize source in `healSession`**

```js
function healSession(cs) {
  return {
    ...cs,
    club: canonicalClub(normalizeClubCode(cs.clubCode)),
    source: VALID_SOURCES.indexOf(cs.source) >= 0 ? cs.source : 'unknown',
  };
}
```

- [ ] **Step 4: Tag at parse time**

In `doParse`'s per-session loop:

```js
  result.sessions.forEach(s => {
    s.tags = tags;
    s.source = SOURCES[src].source;
    if (overrideName) { const c = clubByName(overrideName); if (c) { s.club = c; s.clubCode = overrideName; } }
  });
```

- [ ] **Step 5: Run the tests**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 6: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Record which launch monitor produced each club-session"
```

---

## Task 5: Make identity source-aware

**Files:**
- Modify: `range.html` (`mergeClubSessions`, `computeSavedSessionRows`, `doDeleteSession`)
- Modify: `test-range-engine.js`

Toptracer reads 12–20% hotter than Trackman on ball speed. Merging them would
average two instruments into one number.

- [ ] **Step 1: Write the failing tests**

```js
// T39. Identity is date + club + source.
const srcShots = n => Array.from({ length: n }, () => ({ clubSpeed: 30, attackAngle: 0, ballSpeed: 40, spin: 6000, carry: 110, side: -3 }));
const tmSess = { date: '2026-08-01', dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'), source: 'trackman', tags: {}, shots: srcShots(6) };
const ttSess = { date: '2026-08-01', dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'), source: 'toptracer', tags: {}, shots: srcShots(6) };

chk('T39 same club+date from two sources stays two club-sessions', mergeClubSessions([tmSess], [ttSess]).all.length === 2);
chk('T39 same club+date+source still merges into one', mergeClubSessions([tmSess], [{ ...tmSess }]).all.length === 1);
chk('T39 merging identical input twice is idempotent', (() => {
  const once = mergeClubSessions([], [tmSess, ttSess]).all;
  const twice = mergeClubSessions(once, [tmSess, ttSess]);
  return twice.all.length === 2 && twice.addedShots === 0;
})());
chk('T39 an untagged legacy session does not collide with a tagged one', (() => {
  const legacy = { date: '2026-08-01', dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'), tags: {}, shots: srcShots(6) };
  return mergeClubSessions([legacy], [tmSess]).all.length === 2;
})());
chk('T39 saved-session rows expose the source', (() => {
  const rows = computeSavedSessionRows(groupByClub([tmSess, ttSess]));
  return rows.length === 2 && rows.some(r => r.source === 'trackman') && rows.some(r => r.source === 'toptracer');
})());
```

- [ ] **Step 2: Run to confirm failure**

Run: `node test-range-engine.js`
Expected: the first, fourth, and fifth `T39` checks fail.

- [ ] **Step 3: Key the merge on source**

Replace the `key` line inside `mergeClubSessions`:

```js
  // Identity is date + club + source. Toptracer reads 12-20% hotter on ball
  // speed than Trackman (measured across the user's own two sessions), so
  // merging a Trackman and a Toptracer session of the same club on the same day
  // would average two different instruments into one number. healSession
  // normalizes a missing source to 'unknown' so legacy untagged sessions get
  // their own bucket rather than silently absorbing newly-tagged data.
  const key = cs => `${cs.date}|${canonicalClub(normalizeClubCode(cs.clubCode)).name}|${healSession(cs).source}`;
```

- [ ] **Step 4: Expose source in the sessions table**

`groupByClub` pushes whole session objects, healed on the way in, so each session
already retains `source`. Read it and confirm before assuming.

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
  rows.sort((a, b) => a.date < b.date ? 1 : (a.date > b.date ? -1 : 0));
  return rows;
}
```

- [ ] **Step 5: Make delete source-aware**

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

`tombstone`, `loadStaging`, and `saveStaging` arrive in Task 8. Delete will throw
in the browser until then; the engine tests gate this step.

- [ ] **Step 6: Run the tests**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 7: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Make club-session identity source-aware so instruments never average together"
```

---

## Task 6: Source-aware mishit quarantine

**Files:**
- Modify: `range.html` (`quarantineClub`)
- Modify: `test-range-engine.js`

`quarantineClub` gates on smash factor, which needs club speed. Toptracer
supplies none, so every duff currently counts as a clean shot. This adds a
fallback that runs only when smash factor is unavailable.

Read `quarantineClub` in full before editing — it has been tuned against real
sample data (the `iron:1.15` floor is calibrated, not textbook) and the existing
path must not change behaviour for shots that do have club speed.

- [ ] **Step 1: Write the failing tests**

```js
// T40. Fallback quarantine for sources with no club speed.
// Real values from the user's Toptracer session: a 19-yard 7-iron off a 2 ft
// peak, and a 45-yard drive launched at 1 degree with 1 ft of height.
const ttClub = carries => ({
  date: '2026-09-11', dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'), source: 'toptracer', tags: {},
  shots: carries.map(c => ({ clubSpeed: null, spin: null, ballSpeed: c.bs, carry: c.carry / M_TO_YD,
                             height: c.h / 3.28084, launch: c.launch, side: 0 })),
});
const ttQ = quarantineClub([ttClub([
  { carry: 139, bs: 105, h: 90, launch: 27 }, { carry: 149, bs: 114, h: 101, launch: 25 },
  { carry: 135, bs: 105, h: 73, launch: 22 }, { carry: 144, bs: 108, h: 65, launch: 20 },
  { carry: 135, bs: 108, h: 96, launch: 25 }, { carry: 19,  bs: 83,  h: 2,  launch: 7  },
  { carry: 111, bs: 98,  h: 31, launch: 17 }, { carry: 140, bs: 106, h: 86, launch: 25 },
])]);
const ttShots = ttQ[0].shots;
chk('T40 the 19-yard duff is quarantined despite no club speed', ttShots[5].quarantined === true);
chk('T40 good shots are not quarantined', [0,1,2,3,4,7].every(i => !ttShots[i].quarantined));
chk('T40 the fallback records why', typeof ttShots[5].quarantineReason === 'string' && ttShots[5].quarantineReason.length > 0);

// The smash-factor path must be untouched when club speed IS present.
const tmQ = quarantineClub([{
  date: '2026-08-22', dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'), source: 'trackman', tags: {},
  shots: Array.from({ length: 8 }, (_, i) => ({ clubSpeed: 32, ballSpeed: i === 3 ? 24 : 43, spin: 5400, carry: 110, side: 2, height: 20 })),
}]);
chk('T40 smash-factor quarantine still fires when club speed exists', tmQ[0].shots[3].quarantined === true);
chk('T40 smash-factor path leaves good shots clean', tmQ[0].shots.filter(s => s.quarantined).length === 1);
```

- [ ] **Step 2: Run to confirm failure**

Run: `node test-range-engine.js`
Expected: the first and third `T40` checks fail — the duff is not flagged.

- [ ] **Step 3: Add the fallback**

Inside `quarantineClub`, after the existing smash-factor pass and before the
function returns, add a second pass that only touches shots the first could not
judge:

```js
  // Fallback for sources with no club speed (Toptracer reports neither club
  // speed nor spin, so smash factor is uncomputable and every duff would count
  // as clean). Judged against the club's OWN session rather than absolute
  // thresholds, so no per-club calibration is needed and it works at any skill
  // level. Deliberately coarse: it catches tops and chunks, not marginal
  // thin strikes. A shot missing carry or height is left alone rather than
  // guessed at.
  sessions.forEach(sess => {
    const judgeable = sess.shots.filter(s => s.clubSpeed == null && s.carry != null);
    if (judgeable.length < 4) return;
    const medCarry = median(judgeable.map(s => s.carry));
    const heights = judgeable.map(s => s.height).filter(v => v != null);
    const medHeight = heights.length >= 4 ? median(heights) : null;
    sess.shots.forEach(s => {
      if (s.quarantined || s.clubSpeed != null || s.carry == null) return;
      const shortCarry = medCarry && s.carry < medCarry * 0.6;
      const lowFlight = medHeight != null && s.height != null && s.height < medHeight * 0.25;
      if (shortCarry || lowFlight) {
        s.quarantined = true;
        s.quarantineReason = lowFlight && shortCarry ? 'topped' : (lowFlight ? 'low flight' : 'well short');
      }
    });
  });
```

Confirm the reason strings render — `render()`'s per-club detail maps
`quarantineReason` to display text for `'bad_strike'` and `'thin_flier'`. Extend
that mapping so the new reasons show rather than falling through to a blank cell.

- [ ] **Step 4: Run the tests**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Quarantine mishits on sources that report no club speed"
```

---

## Task 7: Caveat trends that span mixed sources

**Files:**
- Modify: `range.html` (`computeTrend`, `computeVerdicts`)
- Modify: `test-range-engine.js`

- [ ] **Step 1: Write the failing tests**

```js
// T41. Mixed-source trend windows are flagged.
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
chk('T41 single-source window is not source-caveated', singleSourceTrend.enough && singleSourceTrend.sourceCaveat === false);
chk('T41 mixed-source window is source-caveated', mixedSourceTrend.enough && mixedSourceTrend.sourceCaveat === true);
chk('T41 sourceCaveat is independent of the conditions caveat', singleSourceTrend.caveat === false && singleSourceTrend.sourceCaveat === false);
chk('T41 mixed-source window names the sources involved', (() => {
  const s = mixedSourceTrend.sources;
  return Array.isArray(s) && s.length === 2 && s.indexOf('trackman') >= 0 && s.indexOf('toptracer') >= 0;
})());
chk('T41 a mixed window produces the instrument warning verdict', (() => {
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
Expected: all five `T41` checks fail.

- [ ] **Step 3: Compute the flag**

In `computeTrend`, immediately after `const caveat = !sameConditions;`:

```js
  // Instrument confound, tracked separately from the ball/weather caveat because
  // it has a different remedy: conditions can be tagged retroactively, but a
  // Trackman number and a Toptracer number are not comparable at all and the
  // only fix is to compare within one source.
  const sources = [...new Set([...recent, ...baseline].map(s => s.source || 'unknown'))].sort();
  const sourceCaveat = sources.length > 1;
```

Extend the returned object's first line:

```js
    enough: true, caveat, sourceCaveat, sources,
```

- [ ] **Step 4: Surface it**

In `computeVerdicts`'s `groups.forEach`, immediately after `anyEnoughData = true;`:

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

## Task 8: Baseline fetch, staging, and deletion tombstones

**Files:**
- Modify: `range.html` (storage layer)
- Modify: `test-range-engine.js`

The subtlest task here. `load()` must stay synchronous — many call sites — so the
baseline is fetched once at startup and cached.

**Tombstone rule:** tombstones filter the **fetched baseline only**, never local
staging. Local data is always authoritative, so re-pasting a previously deleted
session makes it reappear instead of being swallowed by a stale tombstone.

- [ ] **Step 1: Write the failing tests**

```js
// T42. Baseline + staging composition and tombstones.
const tsA = { date: '2026-08-01', dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'), source: 'trackman', tags: {}, shots: srcShots(6) };
const tsB = { date: '2026-08-02', dateAssumed: false, clubCode: 'dr', club: canonicalClub('dr'), source: 'trackman', tags: {}, shots: srcShots(6) };

chk('T42 tombstoneKey is date|club|source', tombstoneKey('2026-08-01', '7-Iron', 'trackman') === '2026-08-01|7-Iron|trackman');
chk('T42 composeDataset with no staging returns the baseline', composeDataset([tsA, tsB], [], []).length === 2);
chk('T42 composeDataset merges staging into the baseline',
  composeDataset([tsA], [{ ...tsA, date: '2026-08-03' }], []).length === 2);
chk('T42 a tombstone removes a baseline record', (() => {
  const out = composeDataset([tsA, tsB], [], [tombstoneKey('2026-08-01', '7-Iron', 'trackman')]);
  return out.length === 1 && out[0].date === '2026-08-02';
})());
chk('T42 a tombstone does NOT suppress a re-pasted local session', (() => {
  const out = composeDataset([tsA], [tsA], [tombstoneKey('2026-08-01', '7-Iron', 'trackman')]);
  return out.length === 1 && out[0].date === '2026-08-01';
})());
chk('T42 a tombstone for a different source leaves the record alone',
  composeDataset([tsA], [], [tombstoneKey('2026-08-01', '7-Iron', 'toptracer')]).length === 1);
chk('T42 composeDataset is idempotent on its own output', (() => {
  const once = composeDataset([tsA, tsB], [], []);
  return composeDataset(once, [], []).length === once.length;
})());
chk('T42 composeDataset heals stale club identity from the baseline', (() => {
  const stale = { date: '2026-08-01', dateAssumed: false, clubCode: '6h',
    club: { code: '6h', name: '6h', order: 999, klass: 'unknown' }, source: 'trackman', tags: {}, shots: srcShots(6) };
  return composeDataset([stale], [], [])[0].club.name === '6-Hybrid';
})());
chk('T42 composeDataset tolerates a null baseline', composeDataset(null, [tsA], []).length === 1);
```

- [ ] **Step 2: Run to confirm failure**

Run: `node test-range-engine.js`
Expected: `tombstoneKey is not defined`.

- [ ] **Step 3: Add the composition functions**

Immediately before `/*ENGINE-END*/`:

```js
// ── Dataset composition ───────────────────────────────────────────────────────
// Canonical data lives in a committed JSON file; unpushed local edits live in
// localStorage. The rendered dataset is baseline + staging − tombstones.
//
// Tombstones filter the BASELINE ONLY, never staging. A deleted session still
// exists in the committed file until the next save-and-push, so without this the
// next page load resurrects it. But if the same session is later re-pasted, it
// lands in staging and must reappear — so staging always wins. Filtering both
// would let a stale tombstone permanently swallow real new data.
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

- [ ] **Step 4: Rewire storage**

Replace the `const LS = …` / `load` / `save` lines:

```js
// ── Storage ──────────────────────────────────────────────────────────────────
// Canonical data is data/range.json in the repo, served by GitHub Pages.
// localStorage holds only what hasn't been committed yet, plus tombstones for
// records deleted locally that still exist in the committed file.
const LS = 'golfcaddy_range';              // staging (unpushed local edits)
const LS_DEAD = 'golfcaddy_range_deleted'; // tombstones
const DATA_URL = 'data/range.json';

let baseline = [];

const loadStaging = () => { try { return JSON.parse(localStorage.getItem(LS)) || []; } catch (e) { return []; } };
const saveStaging = cs => localStorage.setItem(LS, JSON.stringify(cs));
const loadTombstones = () => { try { return JSON.parse(localStorage.getItem(LS_DEAD)) || []; } catch (e) { return []; } };
function tombstone(date, clubName, source) {
  const k = tombstoneKey(date, clubName, source);
  const all = loadTombstones();
  if (all.indexOf(k) < 0) { all.push(k); localStorage.setItem(LS_DEAD, JSON.stringify(all)); }
}

const load = () => composeDataset(baseline, loadStaging(), loadTombstones());
const save = cs => saveStaging(cs);
```

`save(all)` in `doParse` writes the whole composed set into staging. That is
intentional and harmless — staging merges against the baseline on every load and
`mergeClubSessions` is idempotent, so re-staging existing records creates no
duplicates, and a user who never pushes still holds a complete local dataset.

- [ ] **Step 5: Bootstrap before first render**

Replace the trailing `populateClubOverride(); render();` lines:

```js
// Fetch the committed baseline once, then render. fetch() throws on file:// URLs
// and the file may legitimately not exist yet, so both degrade to an empty
// baseline and the page runs off localStorage alone.
function bootstrap() {
  return fetch(DATA_URL, { cache: 'no-store' })
    .then(r => r.ok ? r.json() : [])
    .then(d => { baseline = Array.isArray(d) ? d : []; })
    .catch(() => { baseline = []; })
    .then(() => {
      document.getElementById('sessionDate').value = new Date().toISOString().slice(0, 10);
      populateClubOverride();
      render();
    });
}
bootstrap();
```

- [ ] **Step 6: Replace `doClear`**

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

## Task 9: Save-to-file and the source filter

**Files:**
- Modify: `range.html`

- [ ] **Step 1: Replace `doExport`**

```js
// Writes the full composed dataset back to data/range.json. On Chrome/Edge the
// File System Access API writes the repo file in place; elsewhere it falls back
// to a download the user saves over that path. Either way the user then commits
// and pushes — that is what makes the phone see it.
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

Replace the export button at `range.html:134`:

```html
    <button class="ghost" onclick="doSaveToFile()">Save to data file</button>
```

Confirm nothing still references the old name:

```bash
grep -n "doExport" range.html
```

Expected: no output.

- [ ] **Step 2: Add the filter control**

Immediately before `<div id="dash"></div>`:

```html
  <div class="sec" id="filterbar" style="padding-bottom:0;border-bottom:0">
    <label class="sub" style="text-transform:none;letter-spacing:0">Launch monitor:
      <select id="sourceFilter" onchange="render()" style="margin-left:6px"></select>
    </label>
  </div>
```

- [ ] **Step 3: Apply it in `render()`**

Replace `const clubSessions = load();`:

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

`sel.value` is read before the options are rebuilt so the selection survives a
re-render; the guard resets to `all` when the selected source no longer has data.

- [ ] **Step 4: Show source in the sessions table**

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

and its header:

```html
    <table><tr><th>Club</th><th>Date</th><th>Source</th><th>Clean/Total</th><th>Mishit</th><th></th></tr>
```

- [ ] **Step 5: Verify**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 6: Commit**

```bash
git add range.html
git commit -m "Add save-to-data-file and a launch monitor filter to range.html"
```

---

## Task 10: Retagging control

**Files:**
- Modify: `range.html`

- [ ] **Step 1: Add the handler**

Immediately after `doDeleteSession`:

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

- [ ] **Step 2: Render it as a dropdown**

Replace the source cell in `savedRowsHtml`:

```js
    <td><select class="small" onchange="doRetagSession(${i}, this.value)">${
      VALID_SOURCES.map(s => `<option value="${esc(s)}"${s === row.source ? ' selected' : ''}>${esc(s)}</option>`).join('')
    }</select></td>
```

- [ ] **Step 3: Verify in the browser**

Serve (`python -m http.server 8940`), open `http://127.0.0.1:8940/range.html`, and change a row's source.
Expected: the message line confirms it, the row re-renders, and the filter dropdown gains the new source.

- [ ] **Step 4: Commit**

```bash
git add range.html
git commit -m "Allow retagging a stored session's launch monitor from the sessions table"
```

---

## Task 11: Propagate to `course.html`

**Files:**
- Modify: `course.html`
- Modify: `test-course-engine.js`

- [ ] **Step 1: Re-copy the shared engine block**

Copy everything in `range.html` between `/*ENGINE-START*/` and `/*ENGINE-END*/`, and replace everything in `course.html` between `/*ENGINE-START*/` and `// ── Course-view helpers`, leaving `pickReminders`, `ladderRows`, and `/*ENGINE-END*/` intact.

```bash
node -e "const fs=require('fs'),n=s=>s.replace(/\r\n/g,'\n');const r=n(fs.readFileSync('range.html','utf8')).split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0];const c=n(fs.readFileSync('course.html','utf8')).split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0];const i=c.indexOf('// ── Course-view helpers');console.log('identical:', r.trim()===c.slice(0,i).trim());"
```

Expected: `identical: true`.

- [ ] **Step 2: Rewire storage**

```js
// ── Storage ──────────────────────────────────────────────────────────────────
// Read-only here: composes the committed baseline with any staging on this
// device, and only ever writes staging via doImport.
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

- [ ] **Step 3: Bootstrap**

Replace the trailing `render();`:

```js
fetch(DATA_URL, { cache: 'no-store' })
  .then(r => r.ok ? r.json() : [])
  .then(d => { baseline = Array.isArray(d) ? d : []; })
  .catch(() => { baseline = []; })
  .then(render);
```

- [ ] **Step 4: Pin the ladder to one source**

`course.html` must never blend instruments. On `range.html` an "All sources" view
is a reasonable analysis option; on the course it is actively harmful — a ladder
blending Trackman and Toptracer carries, which differ by 12–20%, produces a
yardage matching neither, and you club off it for real.

Add to the **course-helpers section** (after the shared block, alongside
`pickReminders`) so engine parity is preserved:

```js
// Which single source to show: the one with the most recent session. Never a
// blend — the two instruments differ by 12-20% on the same swing.
function preferredSource(clubSessions) {
  let best = null, bestDate = '';
  (clubSessions || []).forEach(cs => {
    const s = healSession(cs);
    if (cs.date > bestDate) { bestDate = cs.date; best = s.source; }
  });
  return best;
}
```

In `render()`, replace `const clubSessions = load();`:

```js
  const allSessions = load();
  const present = [...new Set(allSessions.map(cs => healSession(cs).source))].sort();
  const sel = document.getElementById('sourcePick');
  const chosen = (sel && sel.value && present.indexOf(sel.value) >= 0) ? sel.value : preferredSource(allSessions);
  if (sel) {
    sel.parentElement.style.display = present.length > 1 ? '' : 'none';
    sel.innerHTML = present.map(s => `<option value="${esc(s)}"${s === chosen ? ' selected' : ''}>${esc(s)}</option>`).join('');
  }
  const clubSessions = allSessions.filter(cs => healSession(cs).source === chosen);
```

And immediately before `<div id="view"></div>`:

```html
  <div class="sub" style="text-transform:none;letter-spacing:0;margin-bottom:12px;display:none">
    Numbers from <select id="sourcePick" onchange="render()" style="margin-left:4px"></select>
  </div>
```

- [ ] **Step 5: Add parity tests**

```js
// C5. Phase 1 engine parity.
const c5shots = () => Array.from({ length: 6 }, () => ({ clubSpeed: 30, ballSpeed: 40, spin: 6000, carry: 110, side: -3 }));
chk('C5 SOURCES declares units and source tags', Object.keys(SOURCES).every(k => SOURCES[k].source && SOURCES[k].units));
chk('C5 normalizeShotUnits handles feet for side', (() => {
  const s = normalizeShotUnits({ side: 32.8084 }, { distance: 'yd', side: 'ft', speed: 'mph' });
  return Math.abs(s.side - 10) < 0.01;
})());
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

// C6. preferredSource
const mkC6 = (date, source) => ({ date, dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'), source, tags: {}, shots: c5shots() });
chk('C6 picks the source with the most recent session', preferredSource([mkC6('2026-08-01', 'trackman'), mkC6('2026-09-11', 'toptracer')]) === 'toptracer');
chk('C6 is order-independent', preferredSource([mkC6('2026-09-11', 'toptracer'), mkC6('2026-08-01', 'trackman')]) === 'toptracer');
chk('C6 returns null on empty input', preferredSource([]) === null && preferredSource(undefined) === null);
chk('C6 heals an untagged session to unknown', preferredSource([{ date: '2026-08-01', clubCode: '7i', tags: {}, shots: [] }]) === 'unknown');
```

- [ ] **Step 6: Run both suites and re-verify parity**

Run: `node test-range-engine.js && node test-course-engine.js`
Expected: `ALL PASS` from both, and the Step 1 parity command still reports `identical: true`.

- [ ] **Step 7: Commit**

```bash
git add course.html test-course-engine.js
git commit -m "Propagate source-aware engine to course.html and pin the ladder to one instrument"
```

---

## Task 12: Rounds baseline in `index.html`

**Files:**
- Modify: `index.html`

Rounds have no source concept — storage only.

- [ ] **Step 1: Rewire storage**

`index.html` has `mergeRounds(existing, incoming)` at line 270, keyed on
`date|score|course`. **It returns `{ all, added }`, not a bare array** — `load()`
must take `.all` or every caller receives an object where it expects a list.

Replace lines 459–461:

```js
const LS = 'golfcaddy_rounds';
const DATA_URL = 'data/rounds.json';

let baseline = [];

const loadStaging = () => { try { return JSON.parse(localStorage.getItem(LS)) || []; } catch (e) { return []; } };
const saveStaging = rs => localStorage.setItem(LS, JSON.stringify(rs));
// .all — mergeRounds returns {all, added}, and every caller of load() wants the array.
const load = () => mergeRounds(baseline, loadStaging()).all;
const save = rs => saveStaging(rs);
```

- [ ] **Step 2: Bootstrap and save-to-file**

Replace the trailing `render();`:

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

Replace the export button at `index.html:127`:

```html
    <button class="ghost" onclick="doSaveToFile()">Save to data file</button>
```

and delete the now-unreferenced `doExport` at `index.html:531`.

- [ ] **Step 3: Verify**

Run: `node test-engine.js`
Expected: `ALL PASS`.

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

## Task 13: Seed, import the Toptracer session, verify, document

**Files:**
- Create: `data/rounds.json`
- Modify: `README.md`

`data/range.json` already exists from Task 2.

- [ ] **Step 1: Seed the rounds file**

```bash
echo "[]" > data/rounds.json
git add data/rounds.json
git commit -m "Seed empty canonical rounds file"
```

- [ ] **Step 2: Import the Toptracer session**

Serve (`python -m http.server 8940`), open `http://127.0.0.1:8940/range.html`.

1. Source: **Toptracer — CSV**. Session date: **2026-09-11**.
2. Paste `C:/Users/bkami/Downloads/toptracer_range_session.csv` in full.
3. Confirm the parse message reports 65 shots.

Expected ladder carries for the Toptracer source — these were computed from the
raw CSV during investigation, so any disagreement means the unit conversion is
wrong:

| Club | Carry |
|---|---|
| Driver | 204 |
| 4-Hybrid | 175 |
| 6-Hybrid | 158 |
| 7-Iron | 137 |
| 8-Iron | 128 |
| 9-Iron | 105 |
| PW | 81 |
| GW | 71 |

Also confirm the quarantine caught the obvious duffs: the 19-yard 7-iron and the
45-yard drive should both be flagged, and the 7-iron's clean count should be 7 of
8 rather than 8 of 8.

- [ ] **Step 3: Verify source separation**

With both sessions loaded, confirm:
- The sessions table shows Trackman rows dated 2026-08-22 and Toptracer rows dated 2026-09-11.
- Switching the filter to `trackman` shows Driver 188; switching to `toptracer` shows Driver 204.
- With "All sources" selected, no club silently averages the two — each source keeps its own row.

- [ ] **Step 4: Save and verify the full loop**

1. Click **Save to data file**, write `data/range.json`.
2. Hard-reload. Data still renders, now from the baseline.
3. `localStorage.clear()` in the console, reload. Data **still renders** — proof it comes from the committed file.
4. Delete a session, reload. It stays deleted (tombstone held).
5. Re-paste that session. It reappears (staging beats tombstone).
6. Open `course.html`. Same data, no import, ladder pinned to Toptracer (most recent).

- [ ] **Step 5: Verify the `file://` fallback**

Open `range.html` by double-clicking it. `fetch` fails on that origin.
Expected: renders from localStorage alone without a console error cascade — not a blank or broken page.

- [ ] **Step 6: Enable GitHub Pages**

A user action, not an agent action. The user enables Pages (Settings → Pages → deploy from `master`, root). Report the URL, then verify `course.html` on a phone shows committed data with no import.

- [ ] **Step 7: Document**

Append to `README.md`:

```markdown

## Where the data lives

Canonical data is committed JSON in this repo: `data/range.json` and
`data/rounds.json`. The pages fetch those as a baseline and merge in anything
entered locally but not yet committed.

The loop: paste on your computer → **Save to data file** → commit and push in
GitHub Desktop → your phone sees it.

Pushing is the *sync* step, not the save step. Forget to push and nothing is
lost — your computer still has everything in browser storage. Only the phone
view goes stale.

## Units and sources

Every launch monitor export declares its own units, normalized on import to the
engine's internal metric. Trackman's table paste is metric; its CSV export and
Toptracer's CSV are both yards, with offline in feet. Picking the wrong source
in the dropdown will silently scale every distance, so pick the one that matches
what you pasted.

The two instruments do not agree — measured across one session each, Toptracer
reads 12–20% hotter on ball speed than Trackman, and correspondingly longer on
carry. The tool therefore keeps them as separate sessions and refuses to trend
across them; a window spanning both gets flagged as measuring the instrument
rather than your swing.

Every session needs a date. No CSV export supplies one, so the form has a date
field and will refuse a paste without it — undated sessions all collapse into a
single bucket and make trends impossible.

## Opening the files directly

Double-clicking the HTML (a `file://` URL) still works, but browsers block
`fetch` there, so you'll only see browser-storage data. Serve the folder over
HTTP, or use the Pages URL, to see committed data.
```

- [ ] **Step 8: Commit**

```bash
git add README.md
git commit -m "Document the sync flow, per-source units, and the date requirement"
```

---

## Final check

- [ ] `node test-engine.js && node test-range-engine.js && node test-course-engine.js` — all three print `ALL PASS`.
- [ ] Engine blocks in `range.html` and `course.html` are identical up to the course-helpers marker.
- [ ] `grep -n "doExport" range.html index.html` returns nothing.
- [ ] Driver reads 188 under the `trackman` filter and 204 under `toptracer` — never a blend.
- [ ] A trend window spanning both sources produces the instrument-confound verdict.
- [ ] Pasting without a session date is refused with an explanatory message.
- [ ] The 19-yard 7-iron and 45-yard drive in the Toptracer session are quarantined.
- [ ] `localStorage.clear()` followed by a reload still shows committed data.
- [ ] All three pages load on the Pages URL and cross-links work in every direction.
- [ ] `git log --oneline -16` shows one descriptive commit per task.
