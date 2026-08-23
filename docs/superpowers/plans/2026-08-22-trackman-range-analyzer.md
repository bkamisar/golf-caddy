# Trackman Range Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `range.html`, a second self-contained tool in the Golf Caddy suite that parses Trackman range-session pastes (shot-level launch monitor data) into club gapping, dispersion, strike-quality, and session-over-session trend verdicts, with a coach debrief prompt matching the existing Grint tool.

**Architecture:** One new static HTML file following every convention in `index.html`: pure DOM-free engine functions between `/*ENGINE-START*/`/`/*ENGINE-END*/` markers, a `SOURCES` registry (named `trackman` adapter + keyword-mapped `generic` fallback), own `localStorage` key, node-testable via a growing `test-range-engine.js` harness mirroring `test-engine.js` (same extraction technique already committed and reviewed in that file: read the HTML, slice out the engine block, run it in-process).

**Tech Stack:** Vanilla JS, no build step, no dependencies. Node.js only for running the test harness.

**Spec:** `docs/superpowers/specs/2026-08-22-trackman-range-analyzer-design.md`

---

## Design decisions locked during this plan (read before implementing)

These resolve ambiguity the spec left at the "how" level; later tasks assume them:

1. **Storage shape is flat, not nested.** The spec's data model nests `clubs` under `sessions`. Implementation stores a flat array of **club-sessions** — `{date, club, tags, shots}`, one per (date, club) pair — because a Trackman paste is always one club on one date, and this matches `index.html`'s flat `rounds` array exactly. Multiple club-sessions sharing a date is how a single range visit (several pastes) is represented; nothing reads "all clubs hit on 2026-08-22" as a group, so the nesting the spec sketched isn't load-bearing.
2. **Trackman's `Average`/`Consistency` footer is used only as a same-turn parse self-check.** It is never stored long-term (merging two pastes of the same club-session makes any single footer stale). `doParse()` shows a warning immediately if the computed mean disagrees with the footer; nothing about later rendering depends on it.
3. **Quarantine and trend both operate on `club-session groups`** — all stored sessions for one club, sorted by date — computed fresh on every render (same philosophy as `index.html`'s `enrich()`/`computeMetrics()` recomputing everything from raw rounds each time, never caching derived state).
4. **Column alignment differs per adapter.** Trackman's paste has a header row with a leading garbage cell that data rows don't have, so position-based column mapping is unsafe. The `trackman` adapter matches columns by keyword **in left-to-right order of appearance**, then zips that ordered key list against each data row's non-empty tokens by position-in-row (not raw index). The `generic` adapter is a well-formed table, so it uses raw column-index mapping like `index.html`'s `parseGeneric` does.
5. **`var`, not `const`, for any top-level engine binding a test references by bare name.** Discovered during Task 1: the test harness's `eval(...)` call only leaks `var`/`function` declarations into the calling scope (per JS spec) — `const`/`let` stay trapped inside the eval's own lexical environment, even though the eval call is direct. `index.html`'s `test-engine.js` never hit this because it only ever calls `function`-declared helpers, never a `const`-declared value directly. In this plan, every engine-block value tested by bare name (`M_TO_YD`, `MS_TO_MPH`, `median`, `mean`, `r1`, `SOURCES`) is written as `var`, not `const`. Function declarations (`function foo() {}`) are unaffected and need no special handling — only non-function `const`/arrow-function bindings referenced directly (not through a wrapping function call) need this. If a later task adds a new top-level `const` that a test then references by bare name, apply the same fix.

---

## Task 1: Scaffold `range.html` + numeric helpers + club table

**Files:**
- Create: `range.html`
- Create: `test-range-engine.js`

- [ ] **Step 1: Create `range.html` with HTML shell, styles, and an empty engine block**

Reuses `index.html`'s exact CSS (same suite look), swaps copy for the range tool, and leaves the engine block ready for Task 1's first real functions.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Golf Caddy — Range Analyzer</title>
<style>
  :root { --bg:#0f1512; --card:#1a231e; --ink:#e8f0ea; --dim:#9ab3a3; --line:#2c3a32;
          --good:#5dd39e; --bad:#e07a5f; --accent:#8ecae6; --warn:#f2cc8f; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font:15px/1.45 -apple-system,'Segoe UI',Roboto,sans-serif; }
  .wrap { max-width:860px; margin:0 auto; padding:14px; }
  h1 { font-size:20px; margin:6px 0 2px; } h1 span{color:var(--good);}
  .sub { color:var(--dim); font-size:12.5px; margin-bottom:12px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px;
          padding:14px; margin-bottom:12px; }
  .card h2 { font-size:13px; text-transform:uppercase; letter-spacing:.08em;
             color:var(--dim); margin:0 0 8px; }
  textarea { width:100%; min-height:110px; background:#101815; color:var(--ink);
             border:1px solid var(--line); border-radius:8px; padding:8px; font-size:12px; }
  select, input[type=text], input[type=number] {
    background:#101815; color:var(--ink); border:1px solid var(--line); border-radius:8px;
    padding:7px; font-size:13px;
  }
  button { background:var(--good); color:#0c130f; border:0; border-radius:8px;
           padding:9px 14px; font-weight:700; font-size:14px; cursor:pointer; margin:6px 6px 0 0; }
  button.ghost { background:transparent; color:var(--dim); border:1px solid var(--line); }
  .verdict { font-size:15px; margin:8px 0; padding:10px 12px; border-left:4px solid var(--accent);
             background:#131c17; border-radius:0 8px 8px 0; }
  .verdict.good { border-color:var(--good); } .verdict.bad { border-color:var(--bad); }
  .verdict.warn { border-color:var(--warn); }
  .verdict b { color:var(--accent); } .verdict.good b{color:var(--good);} .verdict.bad b{color:var(--bad);}
  .verdict.warn b{color:var(--warn);}
  table { width:100%; border-collapse:collapse; font-size:12.5px; }
  th,td { padding:5px 7px; text-align:right; border-bottom:1px solid var(--line); white-space:nowrap; }
  th:first-child,td:first-child { text-align:left; }
  th { color:var(--dim); font-weight:600; }
  .up{color:var(--good);} .down{color:var(--bad);} .flat{color:var(--dim);}
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:10px; }
  .tagrow { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px; }
  .foot { color:var(--dim); font-size:11px; margin:14px 0 30px; }
  #msg { color:var(--warn); font-size:12.5px; min-height:16px; }
  details summary { cursor:pointer; color:var(--dim); font-size:12.5px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>⛳ Golf Caddy — <span>Range</span></h1>
  <div class="sub">Paste your Trackman range session → real clean-shot yardages, gapping, and a trend that survives mishits. All local, no account. <a href="index.html" style="color:var(--accent)">Round analyzer →</a></div>

  <div class="card">
    <h2>Add a session</h2>
    <select id="source" style="width:100%;margin-bottom:8px">
      <option value="trackman">Trackman — paste one club's session table</option>
      <option value="generic">Other launch monitor — CSV / table</option>
    </select>
    <div class="tagrow">
      <select id="tagBall"><option value="">Ball: unknown</option><option value="range">Range ball</option><option value="premium">Premium ball</option></select>
      <select id="tagVenue"><option value="">Venue: unknown</option><option value="indoor">Indoor</option><option value="outdoor">Outdoor</option></select>
      <input type="number" id="tagTemp" placeholder="Temp °F (optional)" style="width:150px">
      <input type="text" id="tagFacility" placeholder="Facility (optional)" style="width:160px">
    </div>
    <select id="clubOverride" style="width:100%;margin-bottom:8px"><option value="">Club: auto-detect from paste</option></select>
    <textarea id="paste" placeholder="Trackman: select the whole per-club shot table (header through the Consistency row) → copy → paste. Re-pasting is safe — duplicate shots merge."></textarea>
    <button onclick="doParse()">Parse &amp; save</button>
    <button class="ghost" onclick="doExport()">Export JSON</button>
    <button class="ghost" onclick="document.getElementById('imp').click()">Import</button>
    <button class="ghost" onclick="doClear()">Clear all</button>
    <input type="file" id="imp" style="display:none" onchange="doImport(event)">
    <div id="msg"></div>
  </div>

  <div id="dash"></div>
  <div class="foot">Gapping uses the clean-shot median after mishit quarantine, not Trackman's on-screen average, which includes duffs. Trend compares your most recent 2 sessions per club against the previous 3. Nothing leaves your browser.</div>
</div>

<script>
/*ENGINE-START*/
/*ENGINE-END*/

// ── UI ───────────────────────────────────────────────────────────────────────
render();
</script>
</body>
</html>
```

- [ ] **Step 2: Create `test-range-engine.js` with the extraction harness**

Mirrors `test-engine.js` line for line — same read-file-then-slice-the-engine-block-then-run-it-in-process technique that file already uses successfully:

```js
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/range.html', 'utf8');
eval(html.split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0]);
const R = v => v == null || isNaN(v) ? null : Math.round(v * 10) / 10;
let fails = 0;
const chk = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; };

console.log('\n' + (fails ? fails + ' FAILURES' : 'ALL PASS'));
```

- [ ] **Step 3: Run it to confirm the harness itself works with an empty engine**

Run: `node test-range-engine.js`
Expected: `ALL PASS` (zero checks yet, so trivially passes — this just proves the extraction/eval mechanism works before any real code exists).

- [ ] **Step 4: Write failing tests for the numeric helpers and club table**

Insert before the final `console.log` line in `test-range-engine.js`:

```js
// T1. Unit conversion + numeric helpers
chk('T1 median of [1,2,3]', median([1,2,3]) === 2);
chk('T1 mean of [1,2,3]', mean([1,2,3]) === 2);
chk('T1 M_TO_YD roughly 1.094', Math.abs(M_TO_YD - 1.09361) < 1e-4);
chk('T1 MS_TO_MPH roughly 2.237', Math.abs(MS_TO_MPH - 2.23694) < 1e-4);

// T2. canonicalClub recognizes known codes and falls back gracefully
chk('T2 7i → 7-Iron, iron class', canonicalClub('7i').name === '7-Iron' && canonicalClub('7i').klass === 'iron');
chk('T2 Dr → Driver', canonicalClub('Dr').name === 'Driver' && canonicalClub('Dr').klass === 'driver');
chk('T2 PW → PW, wedge class', canonicalClub('PW').name === 'PW' && canonicalClub('PW').klass === 'wedge');
chk('T2 unknown code degrades gracefully', canonicalClub('Zzz9').name === 'Zzz9' && canonicalClub('Zzz9').klass === 'unknown' && canonicalClub('Zzz9').order === 999);
chk('T2 driver sorts before 7-iron', canonicalClub('Dr').order < canonicalClub('7i').order);
chk('T2 7-iron sorts before PW', canonicalClub('7i').order < canonicalClub('PW').order);
```

- [ ] **Step 5: Run to verify failure**

Run: `node test-range-engine.js`
Expected: throws a `ReferenceError` (e.g. `median is not defined`) — the engine block is still empty.

- [ ] **Step 6: Implement the numeric helpers and club table**

Replace the empty engine block in `range.html` (between the markers) with:

```js
/*ENGINE-START*/
// ── Unit conversion ──────────────────────────────────────────────────────────
const M_TO_YD = 1.09361;
const MS_TO_MPH = 2.23694;

// ── Shared numeric helpers (same as index.html's engine) ─────────────────────
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos);
  return lo + 1 < sorted.length ? sorted[lo] + (sorted[lo + 1] - sorted[lo]) * (pos - lo) : sorted[lo];
}
const median = a => quantile([...a].sort((x, y) => x - y), 0.5);
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const r1 = v => v === null || v === undefined || isNaN(v) ? null : Math.round(v * 10) / 10;

// ── Club table: canonical name, bag order (driver→wedges), club class for
// smash-factor floors. Regexes match Trackman's short codes case-insensitively.
const CLUB_TABLE = [
  { re:/^(dr|driver|1w)$/i, name:'Driver',   order:0,  klass:'driver' },
  { re:/^(2w)$/i,           name:'2-Wood',   order:1,  klass:'wood' },
  { re:/^(3w)$/i,           name:'3-Wood',   order:2,  klass:'wood' },
  { re:/^(4w)$/i,           name:'4-Wood',   order:3,  klass:'wood' },
  { re:/^(5w)$/i,           name:'5-Wood',   order:4,  klass:'wood' },
  { re:/^(7w)$/i,           name:'7-Wood',   order:5,  klass:'wood' },
  { re:/^(2h|h2)$/i,        name:'2-Hybrid', order:6,  klass:'hybrid' },
  { re:/^(3h|h3)$/i,        name:'3-Hybrid', order:7,  klass:'hybrid' },
  { re:/^(4h|h4)$/i,        name:'4-Hybrid', order:8,  klass:'hybrid' },
  { re:/^(5h|h5)$/i,        name:'5-Hybrid', order:9,  klass:'hybrid' },
  { re:/^(2i)$/i,           name:'2-Iron',   order:10, klass:'iron' },
  { re:/^(3i)$/i,           name:'3-Iron',   order:11, klass:'iron' },
  { re:/^(4i)$/i,           name:'4-Iron',   order:12, klass:'iron' },
  { re:/^(5i)$/i,           name:'5-Iron',   order:13, klass:'iron' },
  { re:/^(6i)$/i,           name:'6-Iron',   order:14, klass:'iron' },
  { re:/^(7i)$/i,           name:'7-Iron',   order:15, klass:'iron' },
  { re:/^(8i)$/i,           name:'8-Iron',   order:16, klass:'iron' },
  { re:/^(9i)$/i,           name:'9-Iron',   order:17, klass:'iron' },
  { re:/^(pw)$/i,           name:'PW',       order:18, klass:'wedge' },
  { re:/^(gw|aw)$/i,        name:'GW',       order:19, klass:'wedge' },
  { re:/^(sw)$/i,           name:'SW',       order:20, klass:'wedge' },
  { re:/^(lw)$/i,           name:'LW',       order:21, klass:'wedge' },
];
function canonicalClub(code) {
  const c = (code || '').trim();
  for (const row of CLUB_TABLE) if (row.re.test(c)) return { code: c, name: row.name, order: row.order, klass: row.klass };
  return { code: c, name: c || 'Unknown', order: 999, klass: 'unknown' };
}
function clubByName(name) {
  const row = CLUB_TABLE.find(c => c.name === name);
  return row ? { code: name, name: row.name, order: row.order, klass: row.klass } : null;
}

// Escape any string that came from a paste before it touches innerHTML.
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
/*ENGINE-END*/
```

- [ ] **Step 7: Run to verify the new tests pass**

Run: `node test-range-engine.js`
Expected: `ALL PASS` with all `T1`/`T2` lines showing `PASS`.

- [ ] **Step 8: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Scaffold range.html with numeric helpers and club canonicalization table"
```

---

## Task 2: Trackman header/unit/date/club detection

**Files:**
- Modify: `range.html` (engine block)
- Modify: `test-range-engine.js`

This builds the parsing infrastructure `parseTrackman` needs before it can read shot rows: finding the header line by keyword (ignoring the leading garbage cell Trackman's paste includes), reading the unit row, and locating the date/club-code lines that precede the header.

- [ ] **Step 1: Write failing tests**

Append to `test-range-engine.js`:

```js
// T3. Header/unit/date/club detection building blocks
const SAMPLE_7I = `2026-08-22
7i
7IronHide
Change Datachange data icon\tClub Speed\tAttack Ang.\tBall Speed\tSpin Rate\tCarry\tSide\t\t\t\t
m, m/schange unit icon
m/s\tDeg\tm/s\tRpm\tm\tm
1.\tEye icon
Ball icon
31.9\t3.0\t42.3\t5390\t116.0\t8.4L
2.\tEye icon
Ball icon
32.6\t2.0\t36.3\t1616\t69.8\t21.6R
3.\tEye icon
Ball icon
32.7\t3.8\t43.1\t2990\t119.3\t1.7R
4.\tEye icon
Ball icon
33.3\t4.0\t39.6\t5550\t105.1\t2.6R
5.\tEye icon
Ball icon
32.4\t1.6\t38.9\t5660\t101.1\t18.6R
6.\tEye icon
Ball icon
32.5\t1.4\t43.6\t6750\t115.7\t9.1R
7.\tEye icon
Ball icon
33.3\t1.8\t43.8\t6800\t116.1\t19.2R
8.\tEye icon
Ball icon
32.6\t2.6\t40.9\t6240\t108.1\t10.2R
9.\tEye icon
Ball icon
32.9\t3.0\t44.0\t3160\t122.6\t14.5L
10.\tEye icon
Ball icon
32.8\t2.2\t43.4\t1970\t94.6\t9.2L
11.\tEye icon
Ball icon
33.2\t1.4\t42.5\t5200\t117.3\t3.0L
12.\tEye icon
Ball icon
33.0\t2.6\t41.4\t7000\t107.5\t17.1R
Average\tBalls icon\t32.8\t2.5\t41.6\t4861\t107.8\t5.4R
Consistency\t0.4\t0.8\t2.3\t1839\t13.9\t11.9`;

const sampleLines = SAMPLE_7I.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim() !== '');
const h3 = findHeaderCols(sampleLines);
chk('T3 header found', h3 !== null);
chk('T3 header cols in paste order', h3 && h3.cols.join(',') === 'clubSpeed,attackAngle,ballSpeed,spin,carry,side');
const unitRow3 = findUnitRow(sampleLines, h3.idx, h3.cols.length);
chk('T3 unit row found', unitRow3 !== null && unitRow3.length === 6);
const units3 = unitsFromRow(h3.cols, unitRow3);
chk('T3 units are metric', units3.distance === 'm' && units3.speed === 'm/s');
const date3 = findDate(sampleLines, h3.idx);
chk('T3 date found', date3 && date3.date === '2026-08-22');
const club3 = findClubCode(sampleLines, h3.idx, date3.idx);
chk('T3 club code found', club3 === '7i');

// T4. Missing date line still finds header/club, flags nothing here (date handled in parseTrackman)
const noDateLines = sampleLines.slice(1); // drop the date line
const h4 = findHeaderCols(noDateLines);
const date4 = findDate(noDateLines, h4.idx);
chk('T4 no date line → findDate returns null', date4 === null);
const club4 = findClubCode(noDateLines, h4.idx, -1);
chk('T4 club code still found without date', club4 === '7i');
```

- [ ] **Step 2: Run to verify failure**

Run: `node test-range-engine.js`
Expected: `ReferenceError: findHeaderCols is not defined`.

- [ ] **Step 3: Implement header/unit/date/club detection**

Insert inside the engine block in `range.html`, after the club table code and before the closing `/*ENGINE-END*/`:

```js
// ── Trackman paste parsing infrastructure ─────────────────────────────────────
// Metric keywords, in the priority order used to identify a column. Order here
// does NOT determine output column order — the header's left-to-right order does.
const METRIC_KEYWORDS = [
  { key:'clubSpeed',   kws:['club speed'] },
  { key:'attackAngle', kws:['attack ang'] },
  { key:'ballSpeed',   kws:['ball speed'] },
  { key:'spin',        kws:['spin rate', 'spin'] },
  { key:'launch',      kws:['launch ang'] },
  { key:'carry',       kws:['carry'] },
  { key:'total',       kws:['total'] },
  { key:'side',        kws:['side'] },
  { key:'height',      kws:['height', 'apex'] },
  { key:'curve',       kws:['curve'] },
  { key:'smash',       kws:['smash'] },
];
function splitCells(line) { return line.split('\t').map(c => c.trim()); }

// Finds the header line by scanning for known metric keywords. Column order in
// the RESULT follows the order keywords appear in the line, NOT their raw cell
// index — Trackman's header has a leading garbage cell that data rows lack, so
// index-based alignment would be wrong (see design decision #4 above).
function findHeaderCols(lines) {
  for (let i = 0; i < lines.length; i++) {
    const cells = splitCells(lines[i]);
    const cols = [];
    cells.forEach(cell => {
      const h = cell.toLowerCase();
      if (!h) return;
      for (const m of METRIC_KEYWORDS) {
        if (m.kws.some(k => h.includes(k))) { cols.push(m.key); return; }
      }
    });
    if (cols.includes('clubSpeed') && cols.includes('ballSpeed') && cols.includes('carry'))
      return { idx: i, cols };
  }
  return null;
}

// The unit row is within a few lines after the header and has exactly N
// unit-shaped tokens (m/s, mph, deg, rpm, m, yds).
function findUnitRow(lines, headerIdx, n) {
  for (let i = headerIdx + 1; i < Math.min(lines.length, headerIdx + 4); i++) {
    const toks = splitCells(lines[i]).filter(t => t);
    if (toks.length === n && toks.every(t => /^(m\/s|mph|deg|rpm|m|yds?|kph)$/i.test(t)))
      return toks;
  }
  return null;
}
function unitsFromRow(cols, unitRow) {
  if (!unitRow) return { distance: 'm', speed: 'm/s' };
  const ci = cols.indexOf('carry'), si = cols.indexOf('clubSpeed');
  const distance = ci >= 0 && /yd/i.test(unitRow[ci]) ? 'yd' : 'm';
  const speed = si >= 0 && /mph/i.test(unitRow[si]) ? 'mph' : 'm/s';
  return { distance, speed };
}

// Date is a bare ISO line (Trackman's own format) above the header.
function findDate(lines, headerIdx) {
  for (let i = 0; i < headerIdx; i++) {
    const m = lines[i].trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return { date: lines[i].trim(), idx: i };
  }
  return null;
}
// Club code: first non-empty, non-icon, non-date line above the header. The
// nickname line that follows it is deliberately ignored (design Q&A: parse
// the short code, not the user's custom nickname).
function findClubCode(lines, headerIdx, dateIdx) {
  for (let i = 0; i < headerIdx; i++) {
    if (i === dateIdx) continue;
    const l = lines[i].trim();
    if (!l || /icon/i.test(l)) continue;
    return l;
  }
  return null;
}
```

- [ ] **Step 4: Run to verify all tests pass**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Add Trackman header/unit/date/club-code detection"
```

---

## Task 3: Complete `parseTrackman` — shot rows + footer self-check

**Files:**
- Modify: `range.html` (engine block)
- Modify: `test-range-engine.js`

- [ ] **Step 1: Write failing tests using the real sample paste**

Append to `test-range-engine.js` (reuses `SAMPLE_7I` from Task 2):

```js
// T5. Full parseTrackman on the real 7-iron sample
const p5 = parseTrackman(SAMPLE_7I);
chk('T5 one session parsed', p5.sessions.length === 1);
const s5 = p5.sessions[0];
chk('T5 date correct', s5.date === '2026-08-22');
chk('T5 club is 7-Iron', s5.club.name === '7-Iron');
chk('T5 12 shots parsed', s5.shots.length === 12);
chk('T5 date not assumed', s5.dateAssumed === false);
// shot 1: 31.9 clubSpeed, 3.0 attack, 42.3 ballSpeed, 5390 spin, 116.0 carry, 8.4L → side -8.4
chk('T5 shot1 clubSpeed', s5.shots[0].clubSpeed === 31.9);
chk('T5 shot1 side is negative (L)', s5.shots[0].side === -8.4);
// shot 2: 21.6R → side +21.6
chk('T5 shot2 side is positive (R)', s5.shots[1].side === 21.6);
chk('T5 shot2 carry', s5.shots[1].carry === 69.8);
chk('T5 no skipped noise lines leak into shots', s5.shots.every(s => s.clubSpeed > 20 && s.clubSpeed < 50));
chk('T5 nothing unparseable left over', p5.skipped.length === 0);

// T6. Footer self-check: reported average present and matches computed mean
chk('T6 check produced', p5.checks.length === 1);
chk('T6 check reports ok (paste matches its own footer)', p5.checks[0].ok === true);

// T7. Deliberately corrupted paste (one shot's carry manually altered far from
// the stated Average) → self-check must catch it
const corrupted = SAMPLE_7I.replace('31.9\t3.0\t42.3\t5390\t116.0\t8.4L', '31.9\t3.0\t42.3\t5390\t400.0\t8.4L');
const p7 = parseTrackman(corrupted);
chk('T7 corrupted paste flagged not ok', p7.checks[0].ok === false);
chk('T7 mismatch names carry', p7.checks[0].mismatches.some(m => m.key === 'carry'));
```

- [ ] **Step 2: Run to verify failure**

Run: `node test-range-engine.js`
Expected: `ReferenceError: parseTrackman is not defined`.

- [ ] **Step 3: Implement `parseTrackman`**

Insert after the header/unit/date/club detection code, before `/*ENGINE-END*/`:

```js
// ── Trackman shot-row and footer parsing ──────────────────────────────────────
function parseSideToken(tok) {
  const m = String(tok).trim().match(/^(-?\d+\.?\d*)\s*([LR])?$/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  if (isNaN(v)) return null;
  return (m[2] && m[2].toUpperCase() === 'L') ? -v : v;
}
function parseNum(tok) { const v = parseFloat(tok); return isNaN(v) ? null : v; }

// A shot row's non-empty tab-split tokens must exactly match the column count.
// Icon/index noise lines never have this shape and fall through untouched.
function tryParseShotRow(line, cols) {
  const toks = splitCells(line).filter(t => t !== '');
  if (toks.length !== cols.length) return null;
  const shot = {};
  for (let i = 0; i < cols.length; i++) {
    const key = cols[i], tok = toks[i];
    const v = key === 'side' ? parseSideToken(tok) : parseNum(tok);
    if (v === null) return null;
    shot[key] = v;
  }
  return shot;
}
// Average/Consistency rows carry a label and sometimes an icon placeholder
// token before the numbers — filter to numeric-shaped tokens and take the
// last N (N = column count), which sidesteps the label/icon entirely.
function parseFooterRow(line, cols) {
  const label = (line.match(/^(Average|Consistency)\b/i) || [])[1];
  if (!label) return null;
  const toks = splitCells(line).filter(t => t !== '');
  const nums = toks.filter(t => parseSideToken(t) !== null || !isNaN(parseFloat(t)));
  const vals = nums.slice(-cols.length);
  if (vals.length !== cols.length) return null;
  const row = {};
  for (let i = 0; i < cols.length; i++) {
    const key = cols[i];
    row[key] = key === 'side' ? parseSideToken(vals[i]) : parseNum(vals[i]);
  }
  return { label: label.toLowerCase(), row };
}
function normalizeShotUnits(shot, units) {
  const s = { ...shot };
  const dFactor = units.distance === 'yd' ? (1 / M_TO_YD) : 1;
  const vFactor = units.speed === 'mph' ? (1 / MS_TO_MPH) : 1;
  ['carry', 'total', 'side', 'height'].forEach(k => { if (s[k] != null) s[k] = s[k] * dFactor; });
  ['clubSpeed', 'ballSpeed'].forEach(k => { if (s[k] != null) s[k] = s[k] * vFactor; });
  return s;
}
// Compares the session's own computed column means against Trackman's stated
// Average row. A mismatch beyond tolerance means the parse likely misread this
// specific paste — shown as a data-quality verdict, not silently trusted.
function checkAgainstReported(session, reportedAverage) {
  const mismatches = [];
  Object.keys(reportedAverage).forEach(k => {
    const rv = reportedAverage[k];
    if (rv == null) return;
    const vals = session.shots.map(s => s[k]).filter(v => v != null);
    if (!vals.length) return;
    const cm = vals.reduce((a, b) => a + b, 0) / vals.length;
    const tol = Math.max(Math.abs(rv) * 0.08, 0.5);
    if (Math.abs(cm - rv) > tol) mismatches.push({ key: k, reported: r1(rv), computed: r1(cm) });
  });
  return { date: session.date, club: session.club.name, ok: mismatches.length === 0, mismatches };
}

function parseTrackman(text) {
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim() !== '');
  const h = findHeaderCols(lines);
  if (!h) return { sessions: [], skipped: [text], checks: [] };
  const { idx: headerIdx, cols } = h;
  const unitRow = findUnitRow(lines, headerIdx, cols.length);
  const units = unitsFromRow(cols, unitRow);
  const dateInfo = findDate(lines, headerIdx);
  const dateAssumed = !dateInfo;
  const date = dateInfo ? dateInfo.date : new Date().toISOString().slice(0, 10);
  const clubCode = findClubCode(lines, headerIdx, dateInfo ? dateInfo.idx : -1) || '';
  const club = canonicalClub(clubCode);

  let scanFrom = headerIdx + 1;
  for (let i = headerIdx + 1; i < Math.min(lines.length, headerIdx + 4); i++) {
    const toks = splitCells(lines[i]).filter(t => t);
    if (toks.length === cols.length && toks.every(t => /^(m\/s|mph|deg|rpm|m|yds?|kph)$/i.test(t))) {
      scanFrom = i + 1; break;
    }
  }

  const shots = [], skipped = [];
  let reportedAverage = null;
  for (let i = scanFrom; i < lines.length; i++) {
    const line = lines[i];
    const footer = parseFooterRow(line, cols);
    if (footer) {
      if (footer.label === 'average') reportedAverage = normalizeShotUnits(footer.row, units);
      continue;
    }
    const shot = tryParseShotRow(line, cols);
    if (shot) { shots.push(normalizeShotUnits(shot, units)); continue; }
    if (/icon/i.test(line) || /^\d+\.$/.test(line.trim())) continue; // known noise
    skipped.push(line);
  }
  if (!shots.length) return { sessions: [], skipped: [text], checks: [] };

  const session = { date, dateAssumed, clubCode, club, tags: {}, shots };
  const checks = reportedAverage ? [checkAgainstReported(session, reportedAverage)] : [];
  return { sessions: [session], skipped, checks };
}
```

- [ ] **Step 4: Run to verify all tests pass**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Implement parseTrackman: shot rows + Average/Consistency self-check"
```

---

## Task 4: `parseGenericLM` adapter + `SOURCES` registry

**Files:**
- Modify: `range.html` (engine block)
- Modify: `test-range-engine.js`

- [ ] **Step 1: Write failing tests**

Append to `test-range-engine.js`:

```js
// T8. Generic launch-monitor CSV fallback (well-formed, index-based mapping)
const genCsv = `Date,Club,Club Speed,Ball Speed,Spin Rate,Carry,Side\n` +
  `2026-08-15,7 Iron,90.5,120.3,6200,145.2,-3.1\n` +
  `2026-08-15,7 Iron,91.0,121.0,6100,147.0,2.4\n` +
  `2026-08-15,Driver,105.2,155.0,2400,240.0,5.0`;
const p8 = parseGenericLM(genCsv);
chk('T8 two club-sessions grouped (7 Iron, Driver)', p8.sessions.length === 2);
const s8seven = p8.sessions.find(s => s.club.name === '7-Iron');
chk('T8 7-Iron session has 2 shots', s8seven && s8seven.shots.length === 2);
chk('T8 date parsed', s8seven && s8seven.date === '2026-08-15');
chk('T8 side numeric passthrough (no L/R suffix needed)', s8seven && s8seven.shots[0].side === -3.1);

// T9. SOURCES registry wires both adapters
chk('T9 trackman source present', typeof SOURCES.trackman.parse === 'function');
chk('T9 generic source present', typeof SOURCES.generic.parse === 'function');
chk('T9 trackman source parses the sample', SOURCES.trackman.parse(SAMPLE_7I).sessions.length === 1);
```

- [ ] **Step 2: Run to verify failure**

Run: `node test-range-engine.js`
Expected: `ReferenceError: parseGenericLM is not defined`.

- [ ] **Step 3: Implement `parseGenericLM` and the `SOURCES` registry**

Insert after `parseTrackman`, before `/*ENGINE-END*/`:

```js
// ── Generic adapter: any launch monitor export with a header row ─────────────
// Well-formed table (unlike Trackman's paste), so columns are found by keyword
// once and then read by raw index — same approach as index.html's parseGeneric.
const p2 = x => String(x).padStart(2, '0');
function parseDateLoose(s) {
  s = (s || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${p2(m[2])}-${p2(m[3])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${p2(m[1])}-${p2(m[2])}`;
  return s || '0000-00-00';
}
// Other launch monitors typically export spelled-out club names ("7 Iron",
// "Pitching Wedge") rather than Trackman's short codes ("7i", "PW"). CLUB_TABLE
// already accepts the spelled-out word for Driver (its regex includes "driver"),
// but the numbered classes only match short codes — T8's "7 Iron" test data
// would otherwise fall through to canonicalClub's unknown-code fallback. This
// translates common long forms to short codes before handing off to
// canonicalClub, deliberately left OUT of the shared CLUB_TABLE so it doesn't
// affect the Trackman adapter (which only ever emits short codes).
function normalizeClubCode(raw) {
  const s = (raw || '').trim();
  let m = s.match(/^(\d+)\s*-?\s*iron$/i);
  if (m) return m[1] + 'i';
  m = s.match(/^(\d+)\s*-?\s*wood$/i);
  if (m) return m[1] + 'w';
  m = s.match(/^(\d+)\s*-?\s*hybrid$/i);
  if (m) return m[1] + 'h';
  if (/^pitching\s*-?\s*wedge$/i.test(s)) return 'pw';
  if (/^(gap|approach)\s*-?\s*wedge$/i.test(s)) return 'gw';
  if (/^sand\s*-?\s*wedge$/i.test(s)) return 'sw';
  if (/^lob\s*-?\s*wedge$/i.test(s)) return 'lw';
  return s;
}
function parseGenericLM(text) {
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim());
  if (lines.length < 2) return { sessions: [], skipped: [], checks: [] };
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const split = l => {
    if (delim === '\t') return l.split('\t').map(c => c.trim().replace(/^"|"$/g, ''));
    const out = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === ',' && !q) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(c => c.trim());
  };
  const H = split(lines[0]).map(h => h.toLowerCase());
  const find = (...keys) => H.findIndex(h => keys.some(k => h.includes(k)));
  // Plain find('club') would match 'club speed'/'clubhead speed' too (both
  // contain "club"), silently binding col.club to the wrong column whenever a
  // speed column is listed before the club-name column — found in code review.
  // Exact match first, then a substring fallback that excludes speed columns.
  const findClub = () => {
    const exact = H.findIndex(h => h === 'club' || h === 'club type' || h === 'club name');
    if (exact >= 0) return exact;
    return H.findIndex(h => h.includes('club') && !h.includes('speed'));
  };
  const col = {
    date: find('date'), club: findClub(),
    clubSpeed: find('club speed', 'clubhead speed'), attackAngle: find('attack'),
    ballSpeed: find('ball speed'), spin: find('spin'), launch: find('launch'),
    carry: find('carry'), total: find('total'), side: find('side', 'offline'),
    height: find('height', 'apex'), smash: find('smash'),
  };
  const num = (c, i) => {
    if (i < 0 || c[i] === undefined || c[i] === '') return null;
    const v = parseFloat(String(c[i]).replace('%', ''));
    return isNaN(v) ? null : v;
  };
  const side = (c, i) => (i < 0 || c[i] === undefined || c[i] === '') ? null : parseSideToken(c[i]);
  const skipped = [], byKey = {};
  lines.slice(1).forEach(line => {
    const c = split(line);
    const clubCode = col.club >= 0 ? c[col.club] : '';
    if (!clubCode || (col.clubSpeed < 0 && col.ballSpeed < 0 && col.carry < 0)) { skipped.push(line); return; }
    const date = parseDateLoose(col.date >= 0 ? c[col.date] : '');
    const club = canonicalClub(normalizeClubCode(clubCode));
    const shot = {
      clubSpeed: num(c, col.clubSpeed), attackAngle: num(c, col.attackAngle),
      ballSpeed: num(c, col.ballSpeed), spin: num(c, col.spin), launch: num(c, col.launch),
      carry: num(c, col.carry), total: num(c, col.total), side: side(c, col.side),
      height: num(c, col.height), smash: num(c, col.smash),
    };
    const key = `${date}|${club.name}`;
    (byKey[key] = byKey[key] || { date, dateAssumed: col.date < 0, clubCode, club, tags: {}, shots: [] }).shots.push(shot);
  });
  return { sessions: Object.values(byKey), skipped, checks: [] };
}

// var, not const: T9 references SOURCES by bare name outside the eval() that
// loads this block, and direct eval only leaks var/function declarations to
// the caller's scope, never const/let (see Task 1's finding on this exact issue).
var SOURCES = {
  trackman: { label: 'Trackman (range table)', parse: parseTrackman },
  generic:  { label: 'Other launch monitor (CSV/table)', parse: parseGenericLM },
};
```

- [ ] **Step 4: Run to verify all tests pass**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Add generic launch-monitor CSV adapter and SOURCES registry"
```

- [ ] **Step 6: Fix — club-column detection collision (found in code review)**

`find('club')` is a substring match, and `'club speed'`/`'clubhead speed'` both
contain `"club"` — `find()` returns the FIRST header cell matching, so a header
listing a speed column before the club-name column (e.g.
`Date,Club Speed,Club,Ball Speed,Carry`) silently binds `col.club` to the speed
column, fabricating a numeric "club name". T8's own header happens to list
`Club` first, so it never caught this. Fix: exact match first, substring
fallback that excludes speed columns.

Replace:
```js
  const H = split(lines[0]).map(h => h.toLowerCase());
  const find = (...keys) => H.findIndex(h => keys.some(k => h.includes(k)));
  const col = {
    date: find('date'), club: find('club'),
    clubSpeed: find('club speed', 'clubhead speed'), attackAngle: find('attack'),
```
with:
```js
  const H = split(lines[0]).map(h => h.toLowerCase());
  const find = (...keys) => H.findIndex(h => keys.some(k => h.includes(k)));
  // Plain find('club') would match 'club speed'/'clubhead speed' too (both
  // contain "club"), silently binding col.club to the wrong column whenever a
  // speed column is listed before the club-name column — found in code review.
  // Exact match first, then a substring fallback that excludes speed columns.
  const findClub = () => {
    const exact = H.findIndex(h => h === 'club' || h === 'club type' || h === 'club name');
    if (exact >= 0) return exact;
    return H.findIndex(h => h.includes('club') && !h.includes('speed'));
  };
  const col = {
    date: find('date'), club: findClub(),
    clubSpeed: find('club speed', 'clubhead speed'), attackAngle: find('attack'),
```

Append regression tests to `test-range-engine.js`:

```js
// T10a. Regression: club-speed column appearing BEFORE the club-name column
// must not hijack col.club via substring match ("club speed".includes("club")).
const genCsvSpeedFirst = `Date,Club Speed,Club,Ball Speed,Carry\n` +
  `2026-08-15,90.5,7 Iron,120.3,145.2\n` +
  `2026-08-15,91.0,7 Iron,121.0,147.0`;
const p10a = parseGenericLM(genCsvSpeedFirst);
chk('T10a club column not hijacked by Club Speed column', p10a.sessions.length === 1);
const s10a = p10a.sessions[0];
chk('T10a club name is not a numeric string', s10a && !/^\d+(\.\d+)?$/.test(s10a.club.name));
chk('T10a club correctly identified as 7-Iron', s10a && s10a.club.name === '7-Iron' && s10a.club.klass === 'iron');
chk('T10a clubSpeed still reads from the Club Speed column', s10a && s10a.shots[0].clubSpeed === 90.5);

// T10b. No club-like column at all → findClub misses (-1), every row is
// skipped (clubCode is '' since col.club < 0), and no sessions are produced.
// This must not throw.
const genCsvNoClub = `Date,Speed,Distance\n2026-08-15,90.5,145.2\n2026-08-15,91.0,147.0`;
let p10b, threw10b = false;
try { p10b = parseGenericLM(genCsvNoClub); } catch (e) { threw10b = true; }
chk('T10b no club column does not throw', !threw10b);
chk('T10b col.club is a genuine miss (-1) → no sessions', p10b && p10b.sessions.length === 0);
chk('T10b both data rows land in skipped', p10b && p10b.skipped.length === 2);
```

Run: `node test-range-engine.js` — expect `ALL PASS`, including T8 unaffected.

Commit:
```bash
git add range.html test-range-engine.js
git commit -m "Fix parseGenericLM club-column detection: substring match on 'club' was matching 'Club Speed' columns"
```

---

## Task 5: `mergeClubSessions`

**Files:**
- Modify: `range.html` (engine block)
- Modify: `test-range-engine.js`

- [ ] **Step 1: Write failing tests**

```js
// T10. Merge: new club-session added, shots dedup within same date+club
const existing10 = parseTrackman(SAMPLE_7I).sessions;
const m10a = mergeClubSessions([], existing10);
chk('T10 first merge adds all 12 shots', m10a.addedShots === 12 && m10a.all.length === 1);
const m10b = mergeClubSessions(m10a.all, parseTrackman(SAMPLE_7I).sessions);
chk('T10 re-pasting the same session adds 0 shots (idempotent)', m10b.addedShots === 0);
chk('T10 still one club-session, still 12 shots', m10b.all.length === 1 && m10b.all[0].shots.length === 12);

// T11. Different club same date → separate club-session
const driverSample = SAMPLE_7I.replace('7i\n7IronHide', 'Dr\nDriverHide');
const m11 = mergeClubSessions(m10b.all, parseTrackman(driverSample).sessions);
chk('T11 driver session added separately', m11.all.length === 2);
chk('T11 sorted driver before 7-iron', m11.all[0].club.name === 'Driver' && m11.all[1].club.name === '7-Iron');
```

- [ ] **Step 2: Run to verify failure**

Run: `node test-range-engine.js`
Expected: `ReferenceError: mergeClubSessions is not defined`.

- [ ] **Step 3: Implement `mergeClubSessions`**

Insert after the `SOURCES` registry, before `/*ENGINE-END*/`:

```js
// ── Merge: same date + same club = one club-session; shots dedup exactly ─────
function shotKey(s) {
  // 1 decimal, not 3: matches Trackman's actual display precision (e.g. 31.9,
  // 116.0, 8.4 in real paste data). This substantially reduces (but does not
  // fully eliminate) mismatches from unit-conversion round-trip noise
  // (yards<->meters) if the SAME physical shots are re-pasted after a display-
  // unit change — a real but likely rare scenario. The tested, common case
  // (re-pasting identical text) is unaffected: identical input always produces
  // identical floats regardless of rounding precision.
  return ['clubSpeed', 'attackAngle', 'ballSpeed', 'spin', 'carry', 'side', 'total', 'launch', 'height', 'smash']
    .map(k => s[k] == null ? '' : s[k].toFixed(1)).join('|');
}
function mergeClubSessions(existing, incoming) {
  const key = cs => `${cs.date}|${cs.club.name}`;
  const map = {};
  existing.forEach(cs => { map[key(cs)] = { ...cs, shots: [...cs.shots], tags: { ...cs.tags } }; });
  let addedShots = 0;
  incoming.forEach(cs => {
    const k = key(cs);
    if (!map[k]) {
      map[k] = { ...cs, shots: [...cs.shots], tags: { ...cs.tags } };
      addedShots += cs.shots.length;
    } else {
      const seen = new Set(map[k].shots.map(shotKey));
      cs.shots.forEach(s => {
        const sk = shotKey(s);
        if (!seen.has(sk)) { map[k].shots.push(s); seen.add(sk); addedShots++; }
      });
      map[k].tags = { ...cs.tags, ...map[k].tags };
    }
  });
  const all = Object.values(map).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.club.order - b.club.order);
  return { all, addedShots };
}
```

Note: `tags: { ...cs.tags }` on BOTH the existing-seeding line and the
wholesale-add branch (not just `...cs`) is deliberate — a plain
`{...cs, shots:[...cs.shots]}` would alias `tags` to the same object
reference as the caller's session, a shared-mutation hazard caught in code
review across two passes (the first pass fixed only the wholesale-add branch;
a second review found the identical hazard on the existing-seeding line one
function up, since any existing session with no same-date+club counterpart in
a given merge call would otherwise keep its aliased tags). The merge branch
(inside the `else`) already clones tags safely via its own spread.

- [ ] **Step 4: Run to verify all tests pass**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Add mergeClubSessions with date+club keying and shot-level dedup"
```

- [ ] **Step 6: Fixes from code review — tag precedence test + partial-dedup test**

Code review confirmed the implementation matches spec and passes, but flagged
two untested behaviors that are easy to silently break later: the tag-merge
precedence (`{...cs.tags, ...map[k].tags}` — existing session wins on conflict
— reads confusingly, since it looks like it should favor the incoming
argument), and partial/mixed dedup (current tests only cover 100%-new and
100%-duplicate re-pastes, never a re-paste with SOME overlap — the realistic
"accumulate history" case).

Append to `test-range-engine.js`:

```js
// T12. Tag merge precedence: on a same date+club merge, the EXISTING
// (pre-existing map[k]) session's tags must win over the incoming session's
// tags on key conflict. `{ ...cs.tags, ...map[k].tags }` reads like it favors
// cs (the incoming argument) but actually favors map[k] because later spread
// keys win — code review flagged this as easy to accidentally invert.
const clubT12 = canonicalClub('7i');
const existingT12 = [{ date: '2026-08-15', club: clubT12, tags: { note: 'existing-note' },
  shots: [{ clubSpeed: 90.5, ballSpeed: 120.3, carry: 145.2, side: -3.1 }] }];
const incomingT12 = [{ date: '2026-08-15', club: clubT12, tags: { note: 'incoming-note' },
  shots: [{ clubSpeed: 91.0, ballSpeed: 121.0, carry: 147.0, side: 2.4 }] }];
const m12 = mergeClubSessions(existingT12, incomingT12);
chk('T12 tag merge precedence: existing session tag value wins over incoming on conflict', m12.all[0].tags.note === 'existing-note');

// T13. Partial/mixed dedup: a re-paste where SOME shots already exist and
// SOME are genuinely new (the realistic "accumulate history" case) — only
// the genuinely-new shots should be counted/added, not double-counted and
// not dropped.
const clubT13 = canonicalClub('7i');
const dupShotA = { clubSpeed: 90.5, ballSpeed: 120.3, carry: 145.2, side: -3.1 };
const dupShotB = { clubSpeed: 91.0, ballSpeed: 121.0, carry: 147.0, side: 2.4 };
const existingT13 = [{ date: '2026-08-15', club: clubT13, tags: {},
  shots: [dupShotA, dupShotB, { clubSpeed: 89.0, ballSpeed: 118.0, carry: 140.0, side: 0.0 }] }];
const incomingT13 = [{ date: '2026-08-15', club: clubT13, tags: {},
  shots: [
    { clubSpeed: 90.5, ballSpeed: 120.3, carry: 145.2, side: -3.1 }, // duplicate of dupShotA (same values, new object)
    { clubSpeed: 91.0, ballSpeed: 121.0, carry: 147.0, side: 2.4 },  // duplicate of dupShotB
    { clubSpeed: 95.0, ballSpeed: 130.0, carry: 155.0, side: 5.0 },  // genuinely new
    { clubSpeed: 96.0, ballSpeed: 131.0, carry: 157.0, side: -2.0 }, // genuinely new
  ] }];
const m13 = mergeClubSessions(existingT13, incomingT13);
chk('T13 partial dedup: addedShots counts only the genuinely-new shots', m13.addedShots === 2);
chk('T13 partial dedup: final shot count is 3 existing + 2 new, not double-counted or missing', m13.all[0].shots.length === 5);
```

Run: `node test-range-engine.js` — expect `ALL PASS`, all prior tests unaffected.

Commit:
```bash
git add range.html test-range-engine.js
git commit -m "Code-review fixes for Task 5 merge (shotKey precision, tags aliasing, coverage)"
```

- [ ] **Step 7: Second-pass fix — the same tags-aliasing hazard, one line up**

Step 6's fix only cloned `tags` on the wholesale-add branch (inside
`incoming.forEach`). A second review pass found the identical hazard on the
line that seeds `map` from `existing`, one function up — any existing session
with no same-date+club counterpart in a given merge call keeps its `tags`
aliased to the caller's original object.

Change:
```js
existing.forEach(cs => { map[key(cs)] = { ...cs, shots: [...cs.shots] }; });
```
to:
```js
existing.forEach(cs => { map[key(cs)] = { ...cs, shots: [...cs.shots], tags: { ...cs.tags } }; });
```

Also soften the `shotKey` precision comment — the 1-decimal fix substantially
reduces but does not fully eliminate unit round-trip mismatches (a follow-up
numeric check found real per-field mismatch rates of 11-23% at 1 decimal on a
genuine metric↔imperial round-trip, down from ~99% at 3 decimals), and the
original wording read as implying the problem was fully solved:

```js
function shotKey(s) {
  // 1 decimal, not 3: matches Trackman's actual display precision (e.g. 31.9,
  // 116.0, 8.4 in real paste data). This substantially reduces (but does not
  // fully eliminate) mismatches from unit-conversion round-trip noise
  // (yards<->meters) if the SAME physical shots are re-pasted after a display-
  // unit change — a real but likely rare scenario. The tested, common case
  // (re-pasting identical text) is unaffected: identical input always produces
  // identical floats regardless of rounding precision.
  return ['clubSpeed', 'attackAngle', 'ballSpeed', 'spin', 'carry', 'side', 'total', 'launch', 'height', 'smash']
    .map(k => s[k] == null ? '' : s[k].toFixed(1)).join('|');
}
```

Append tests:

```js
// T14. Regression: seeding `map` from `existing` must clone tags, not alias
// them — otherwise mutating a merged session's tags mutates the caller's
// original input object for any existing session with no matching incoming
// (the common case: merging one new day's paste against a large persisted
// history, where most existing sessions aren't touched by `incoming`).
const clubT14 = canonicalClub('7i');
const existingT14 = [{ date: '2026-08-15', club: clubT14, tags: { note: 'original' },
  shots: [{ clubSpeed: 90.5, ballSpeed: 120.3, carry: 145.2, side: -3.1 }] }];
const m14 = mergeClubSessions(existingT14, []);
m14.all[0].tags.note = 'mutated';
chk('T14 existing-only session tags are cloned, not aliased to caller input', existingT14[0].tags.note === 'original');

// T15. Round-trip sanity check: converting a real parsed shot to yd/mph and
// back through the engine's own conversion functions should still produce
// the same shotKey at 1-decimal precision. This exercises the code's own
// round-trip math (multiply then divide by the same constant), not an
// independent re-paste with independently-rounded source data — it does not
// prove real cross-unit re-pastes always match, only that the conversion
// math itself is not lossy beyond 1-decimal rounding.
const shot15 = s5.shots[0];
const forward15 = { ...shot15 };
['carry', 'total', 'side', 'height'].forEach(k => { if (forward15[k] != null) forward15[k] = forward15[k] * M_TO_YD; });
['clubSpeed', 'ballSpeed'].forEach(k => { if (forward15[k] != null) forward15[k] = forward15[k] * MS_TO_MPH; });
const roundtrip15 = normalizeShotUnits(forward15, { distance: 'yd', speed: 'mph' });
chk('T15 round-trip yd/mph -> m/m-s via engine math preserves shotKey at 1 decimal', shotKey(roundtrip15) === shotKey(shot15));
```

Run: `node test-range-engine.js` — expect `ALL PASS`.

Commit:
```bash
git add range.html test-range-engine.js
git commit -m "Second-pass code-review fixes: tags aliasing on seed branch, softer shotKey comment"
```

---

## Task 6: `quarantineClub` (mishit detection)

**Files:**
- Modify: `range.html` (engine block)
- Modify: `test-range-engine.js`

- [ ] **Step 1: Write failing tests using the real sample's known mishits**

```js
// T12. Quarantine on the real 7i session: shot2 (smash 1.11, bad strike) and
// shot10 (spin 1970 vs ~5470 median AND lowest-but-one carry) are the only two
// flagged. Shots 3 and 9 are low-spin too but are the LONGEST shots — must
// survive, because the rule is "low spin AND low carry", not spin alone.
const q12 = quarantineClub([{ ...parseTrackman(SAMPLE_7I).sessions[0] }]);
const shots12 = q12[0].shots;
chk('T12 shot1 clean', shots12[0].quarantined === false);
chk('T12 shot2 quarantined (bad strike)', shots12[1].quarantined === true && shots12[1].quarantineReason === 'bad_strike');
chk('T12 shot3 clean (longest shot, not a flier)', shots12[2].quarantined === false);
// shots 4 and 5 are the near-boundary case that broke the first draft of this
// rule: smash 1.189 and 1.201, BELOW a textbook-plausible 1.25 iron floor but
// ordinary shots, not mishits. Locks the calibrated 1.15 floor in place.
chk('T12 shot4 clean (smash 1.189, near boundary, not a mishit)', shots12[3].quarantined === false);
chk('T12 shot5 clean (smash 1.201, near boundary, not a mishit)', shots12[4].quarantined === false);
chk('T12 shot8 clean (smash 1.255, near boundary)', shots12[7].quarantined === false);
chk('T12 shot9 clean (2nd longest, not a flier)', shots12[8].quarantined === false);
chk('T12 shot10 quarantined (thin flier)', shots12[9].quarantined === true && shots12[9].quarantineReason === 'thin_flier');
chk('T12 shot11 clean (smash 1.280, near boundary)', shots12[10].quarantined === false);
chk('T12 shot12 clean (smash 1.255, near boundary)', shots12[11].quarantined === false);
chk('T12 exactly 2 of 12 quarantined', shots12.filter(s => s.quarantined).length === 2);

// T13. Fewer than 6 shots in a club-session with no cross-session history:
// thin-flier rule must be skipped (no crash, no false positives from an
// unstable 2-shot median), smash-factor rule still applies.
const tiny = { date: '2026-08-01', dateAssumed: false, clubCode: 'sw', club: canonicalClub('sw'), tags: {},
  shots: [
    { clubSpeed: 30, attackAngle: -4, ballSpeed: 24, spin: 9000, carry: 40, side: 0 },   // smash 0.8 → bad strike (floor 1.15)
    { clubSpeed: 30, attackAngle: -4, ballSpeed: 34.5, spin: 2000, carry: 15, side: 0 }, // low spin+carry but N<6, no history
  ] };
const q13 = quarantineClub([tiny]);
chk('T13 shot0 quarantined (smash floor)', q13[0].shots[0].quarantined === true && q13[0].shots[0].quarantineReason === 'bad_strike');
chk('T13 shot1 NOT quarantined (thin-flier rule skipped, no stable reference)', q13[0].shots[1].quarantined === false);
```

- [ ] **Step 2: Run to verify failure**

Run: `node test-range-engine.js`
Expected: `ReferenceError: quarantineClub is not defined`.

- [ ] **Step 3: Implement `quarantineClub`**

Insert after `mergeClubSessions`, before `/*ENGINE-END*/`:

```js
// ── Mishit quarantine ──────────────────────────────────────────────────────────
// Smash-factor floor by club class — below this, the strike itself was bad
// regardless of where the ball ended up. Tunable, like index.html's EXP_PUTT_GIR.
// iron:1.15 is calibrated against the real 7i sample, not a textbook number: the
// 12 real shots cluster 1.19-1.34 except shot2 (1.11, clearly a mishit) — a
// textbook-plausible 1.25 floor would incorrectly also flag shots 4 (1.189) and
// 5 (1.201), which are ordinary shots, not mishits. driver/wood/hybrid are
// unverified estimates (no real sample for those classes yet) and may need the
// same calibration once one exists.
const SMASH_FLOOR = { driver: 1.35, wood: 1.30, hybrid: 1.28, iron: 1.15, wedge: 1.15, unknown: 1.20 };
const SPIN_FLIER_RATIO = 0.5;   // thin-flier spin threshold, as a fraction of reference median spin
const MIN_SHOTS_STABLE = 6;     // below this, a session's own median is unreliable as a reference

function smashFactor(shot) {
  if (shot.smash != null) return shot.smash;
  if (shot.ballSpeed != null && shot.clubSpeed) return shot.ballSpeed / shot.clubSpeed;
  return null;
}
// A reference is "stable" when it has enough shots with USABLE (non-null)
// spin AND carry to trust a median computed from them — not merely enough
// raw shots. A session can have plenty of shots but only a couple with real
// spin/carry (e.g. a partial-column launch-monitor export); gating on raw
// count would let a 2-value "median" masquerade as a 6-shot-stable one.
function stableRef(shots) {
  const spins = shots.map(s => s.spin).filter(v => v != null);
  const carries = shots.map(s => s.carry).filter(v => v != null);
  return (spins.length >= MIN_SHOTS_STABLE && carries.length >= MIN_SHOTS_STABLE)
    ? { medSpin: median(spins), medCarry: median(carries) } : null;
}
// sessions: all stored club-sessions for ONE club, any order. Returns the same
// shape with each shot annotated { smash, quarantined, quarantineReason }.
// Reference medians for the thin-flier rule fall back session→cross-session→
// skip-the-rule, per the design spec's "How to apply" note on SPIN_FLIER_RATIO.
function quarantineClub(sessions) {
  if (!sessions.length) return sessions;
  const allShots = sessions.flatMap(s => s.shots);
  const klass = sessions[0].club.klass;
  const floor = SMASH_FLOOR[klass] || SMASH_FLOOR.unknown;

  return sessions.map(sess => {
    // Reference for the thin-flier medians: this session's own shots if there
    // are enough with usable spin/carry to trust; otherwise the pooled
    // cross-session history for this club IF that pool itself has enough
    // usable shots; otherwise null, which disables the thin-flier check
    // entirely (medSpin/medCarry stay null below) rather than computing an
    // "unstable" median from too few shots either way.
    const own = stableRef(sess.shots);
    const pooled = own ? null : stableRef(allShots);
    const { medSpin, medCarry } = own || pooled || { medSpin: null, medCarry: null };
    const shots = sess.shots.map(s => {
      const sm = smashFactor(s);
      const badStrike = sm != null && sm < floor;
      const thinFlier = !badStrike && medSpin != null && medCarry != null && s.spin != null && s.carry != null &&
        s.spin < medSpin * SPIN_FLIER_RATIO && s.carry < medCarry;
      const reason = badStrike ? 'bad_strike' : (thinFlier ? 'thin_flier' : null);
      return { ...s, smash: sm, quarantined: !!reason, quarantineReason: reason };
    });
    return { ...sess, tags: { ...sess.tags }, shots };
  });
}
```

Note on Step 3: the stability gate must count shots with **usable (non-null)
spin AND carry**, not raw shot count — a session can have 6+ shots by count
but only 2 with real spin/carry (e.g. a partial-column export), and gating on
raw count would let an unstable 2-value median masquerade as a stable one.
`tags: { ...sess.tags }` on the return (not just `...sess`) is likewise
deliberate — the same aliasing hazard `mergeClubSessions` was fixed for in
Task 5, reintroduced here and caught in this task's own code review.

- [ ] **Step 4: Run to verify all tests pass**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Add quarantineClub: bad-strike/thin-flier mishit detection with fallback references"
```

- [ ] **Step 6: Fixes from code review — stability gate + tags aliasing**

Code review found two issues in the Step 3 code above (already corrected in
that code block, but called out explicitly here since they were caught after
initial implementation): the stability gate originally checked raw shot count
(`sess.shots.length >= MIN_SHOTS_STABLE`) instead of the count of shots with
usable spin/carry data, which could let an unstable 2-value median pass as
"stable" given 6+ total shots with mostly-null spin/carry; and the return
statement originally did `{ ...sess, shots }`, aliasing `tags` to the same
object reference as the input — the identical bug class `mergeClubSessions`
was fixed for in Task 5.

Append a regression test for the stability-gate fix:

```js
// T16. Regression: stability must gate on the count of shots with USABLE
// (non-null) spin AND carry, not the raw shot count. 6 shots (raw count meets
// MIN_SHOTS_STABLE) but only 2 have real spin/carry — a partial-column
// launch-monitor export. Pre-fix, the raw-count gate passed and the median
// was computed from just those 2 values; with n=2 the median sits exactly
// between them, so the smaller-spin/smaller-carry shot got flagged
// thin_flier as an artifact of an unstably small sample, not a real anomaly.
const sixShotsThinData = { date: '2026-08-02', dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'), tags: {},
  shots: [
    { smash: 1.3, spin: 6000, carry: 150, side: 0 },   // real data, normal
    { smash: 1.3, spin: 1900, carry: 90, side: 0 },    // real data, lower spin+carry — must NOT be flagged
    { smash: 1.3, spin: null, carry: null, side: 0 },  // missing spin/carry (partial-column export)
    { smash: 1.3, spin: null, carry: null, side: 0 },
    { smash: 1.3, spin: null, carry: null, side: 0 },
    { smash: 1.3, spin: null, carry: null, side: 0 },
  ] };
const q16 = quarantineClub([sixShotsThinData]);
chk('T16 raw shot count (6) meets MIN_SHOTS_STABLE but only 2 have usable spin/carry', sixShotsThinData.shots.length === 6);
chk('T16 shot1 (lower spin+carry) NOT quarantined as thin_flier (reference correctly deemed unstable)', q16[0].shots[1].quarantined === false && q16[0].shots[1].quarantineReason !== 'thin_flier');
```

Run: `node test-range-engine.js` — expect `ALL PASS`, T12/T13 unchanged (their
data has no nulls, so the refactor doesn't change their outcome).

Commit:
```bash
git add range.html test-range-engine.js
git commit -m "Code-review fixes for Task 6 quarantineClub: gate stability on usable-data count, clone tags"
```

---

## Task 7: `groupByClub` + `computeGapping`

**Files:**
- Modify: `range.html` (engine block)
- Modify: `test-range-engine.js`

- [ ] **Step 1: Write failing tests**

```js
// T14. computeGapping on the real 7i session (single club, single session)
const cs14 = mergeClubSessions([], parseTrackman(SAMPLE_7I).sessions).all;
const groups14 = groupByClub(cs14);
chk('T14 one group (7-Iron)', groups14.length === 1 && groups14[0].name === '7-Iron');
const gaps14 = computeGapping(groups14);
chk('T14 one gapping row', gaps14.length === 1);
// clean median carry: 10 clean shots (12 minus shots 2 and 10), median in
// meters converted to yards should land near 126.7 per the spec's worked example
chk('T14 clean median carry ~126-128 yds', gaps14[0].cleanCarryYd > 126 && gaps14[0].cleanCarryYd < 128);
chk('T14 mishit rate is 2/12', Math.abs(gaps14[0].mishitRate - 2/12) < 1e-9);
chk('T14 n = 10 clean shots', gaps14[0].n === 10);
chk('T14 no next club → gapToNext null', gaps14[0].gapToNext === null);

// T15. Two clubs → gap between them computed and ordered driver-first.
// Hand-constructed driver session (not a relabeled copy of the 7-iron paste,
// following the same direct-object-construction pattern Task 6's own tests
// use) — smash factors here (~1.45) genuinely clear the driver floor (1.35).
// A relabel-in-place of SAMPLE_7I's iron-speed shots as "Driver" was tried
// first and failed: those shots' smash factors (1.11-1.34) all sit BELOW the
// driver floor, so every one gets flagged bad_strike, leaving zero clean
// shots and a null gapToNext — not a bug in groupByClub/computeGapping, just
// the wrong fixture for what this test needs to exercise.
const driverSession15 = { date: '2026-08-22', dateAssumed: false, clubCode: 'Dr', club: canonicalClub('Dr'), tags: {},
  shots: [
    { clubSpeed: 47.0, attackAngle: 2.0, ballSpeed: 68.0, spin: 2400, carry: 225.0, side: 5.0 },
    { clubSpeed: 47.5, attackAngle: 2.5, ballSpeed: 69.0, spin: 2350, carry: 228.0, side: -3.0 },
    { clubSpeed: 47.2, attackAngle: 1.8, ballSpeed: 68.5, spin: 2450, carry: 226.5, side: 2.0 },
  ] };
const cs15 = mergeClubSessions(cs14, [driverSession15]).all;
const gaps15 = computeGapping(groupByClub(cs15));
chk('T15 two gapping rows, Driver first', gaps15.length === 2 && gaps15[0].name === 'Driver');
chk('T15 driver gapToNext is a number', typeof gaps15[0].gapToNext === 'number');
chk('T15 last row gapToNext is null', gaps15[1].gapToNext === null);

// T16. Low-confidence flag fires under 5 clean shots
const fewShotsSession = { date: '2026-08-10', dateAssumed: false, clubCode: '9i', club: canonicalClub('9i'), tags: {},
  shots: [{ clubSpeed: 35, attackAngle: 3, ballSpeed: 45, spin: 7000, carry: 95, side: 2 }] };
const gaps16 = computeGapping(groupByClub([fewShotsSession]));
chk('T16 low confidence with 1 clean shot', gaps16[0].lowConfidence === true);
```

- [ ] **Step 2: Run to verify failure**

Run: `node test-range-engine.js`
Expected: `ReferenceError: groupByClub is not defined`.

- [ ] **Step 3: Implement `groupByClub` and `computeGapping`**

Insert after `quarantineClub`, before `/*ENGINE-END*/`:

```js
// ── Grouping + gapping ────────────────────────────────────────────────────────
// Groups stored club-sessions by club name, sorts each group's sessions by
// date, and runs the mishit quarantine once per group. Downstream consumers
// (gapping table, verdicts) both read from this shared structure rather than
// re-grouping/re-quarantining independently.
function groupByClub(clubSessions) {
  const byClub = {};
  clubSessions.forEach(cs => { (byClub[cs.club.name] = byClub[cs.club.name] || []).push(cs); });
  return Object.keys(byClub).map(name => ({
    name,
    sessions: quarantineClub(byClub[name].slice().sort((a, b) => a.date < b.date ? -1 : (a.date > b.date ? 1 : 0))),
  }));
}
function computeGapping(groups) {
  const rows = groups.map(g => {
    const allShots = g.sessions.flatMap(s => s.shots);
    const clean = allShots.filter(s => !s.quarantined);
    const carries = clean.map(s => s.carry).filter(v => v != null);
    const sides = clean.map(s => s.side).filter(v => v != null);
    const medCarry = median(carries);
    const club = g.sessions[0].club;
    return {
      name: g.name, order: club.order, klass: club.klass,
      cleanCarryYd: medCarry != null ? medCarry * M_TO_YD : null,
      mishitRate: allShots.length ? 1 - clean.length / allShots.length : null,
      sideBiasYd: sides.length ? mean(sides) * M_TO_YD : null,
      n: clean.length, totalN: allShots.length,
      lowConfidence: clean.length < 5,
      sessionCount: g.sessions.length,
      lastSeen: g.sessions[g.sessions.length - 1].date,
    };
  }).sort((a, b) => a.order - b.order);
  for (let i = 0; i < rows.length - 1; i++) {
    if (rows[i].cleanCarryYd != null && rows[i + 1].cleanCarryYd != null) {
      rows[i].gapToNext = rows[i].cleanCarryYd - rows[i + 1].cleanCarryYd;
      rows[i].gapWarning = rows[i].gapToNext < 8 || rows[i].gapToNext > 20;
    } else { rows[i].gapToNext = null; rows[i].gapWarning = false; }
  }
  if (rows.length) { rows[rows.length - 1].gapToNext = null; rows[rows.length - 1].gapWarning = false; }
  return rows;
}
```

- [ ] **Step 4: Run to verify all tests pass**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Add groupByClub and computeGapping (clean-median carry, gap warnings)"
```

---

## Task 8: `computeTrend`

**Files:**
- Modify: `range.html` (engine block)
- Modify: `test-range-engine.js`

- [ ] **Step 1: Write failing tests**

Build a synthetic 5-session history for one club so the 2-vs-3 window and confounder logic are both exercised directly (the single real sample only has one session).

```js
// T17. computeTrend: 5 synthetic 7-iron sessions, recent 2 clearly better
function fakeSession(date, carries, tags) {
  return {
    date, dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'), tags: tags || {},
    shots: carries.map(c => ({ clubSpeed: 32, attackAngle: 2, ballSpeed: 42, spin: 5500, carry: c, side: 1 })),
  };
}
const hist17 = [
  fakeSession('2026-07-01', [115, 116, 114, 117, 115]),
  fakeSession('2026-07-08', [116, 115, 117, 114, 116]),
  fakeSession('2026-07-15', [117, 116, 118, 115, 117]),
  fakeSession('2026-08-01', [122, 123, 121, 124, 122]),
  fakeSession('2026-08-08', [124, 123, 125, 122, 124]),
];
const groups17 = groupByClub(hist17);
const t17 = computeTrend(groups17[0].sessions);
chk('T17 enough data', t17.enough === true);
chk('T17 recent carry higher than baseline', t17.carry.recent > t17.carry.baseline);
chk('T17 caveat fires (no tags at all)', t17.caveat === true);

// T18. Same scenario but with matching tags on both sides → no caveat
const hist18 = hist17.map(s => ({ ...s, tags: { ball: 'range', venue: 'outdoor', tempF: 80 } }));
const t18 = computeTrend(groupByClub(hist18)[0].sessions);
chk('T18 no caveat when conditions match throughout', t18.caveat === false);

// T19. Only 2 sessions total → not enough
const t19 = computeTrend(groupByClub(hist17.slice(0, 2))[0].sessions);
chk('T19 not enough with only 2 sessions', t19.enough === false);

// T20. 3+ sessions but fewer than 5 clean shots on one side → not enough
const thin20 = [
  fakeSession('2026-07-01', [115]),
  fakeSession('2026-07-08', [116]),
  fakeSession('2026-08-01', [122]),
];
const t20 = computeTrend(groupByClub(thin20)[0].sessions);
chk('T20 not enough with thin shot counts', t20.enough === false);
```

- [ ] **Step 2: Run to verify failure**

Run: `node test-range-engine.js`
Expected: `ReferenceError: computeTrend is not defined`.

- [ ] **Step 3: Implement `computeTrend`**

Insert after `computeGapping`, before `/*ENGINE-END*/`:

```js
// ── Trend: most recent 2 sessions vs previous 3, per club ────────────────────
// "Session" here means a club-session for THIS club specifically — sessions
// where the club wasn't hit are absent from the array entirely, so a club hit
// on 5 visits gets a full window even with other clubs' visits interleaved.
function computeTrend(sessions) {
  // Defensive sort: don't trust caller order. groupByClub sorts before calling
  // us today, but index.html shipped this exact bug once (commit 9ba2fc4) —
  // an unsorted array here would silently swap "recent" vs "baseline" and
  // produce an inverted-but-plausible-looking trend verdict.
  sessions = [...sessions].sort((a, b) => a.date < b.date ? -1 : (a.date > b.date ? 1 : 0));
  const n = sessions.length;
  if (n < 3) return { enough: false, reason: 'not enough sessions' };
  const recent = sessions.slice(-2);
  const baseline = sessions.slice(-5, -2);
  if (recent.length < 1 || baseline.length < 2) return { enough: false, reason: 'not enough sessions' };

  const allShots = arr => arr.flatMap(s => s.shots);
  const cleanShots = arr => allShots(arr).filter(sh => !sh.quarantined);
  const recentAll = allShots(recent), baselineAll = allShots(baseline);
  const recentClean = cleanShots(recent), baselineClean = cleanShots(baseline);
  if (recentClean.length < 5 || baselineClean.length < 5) return { enough: false, reason: 'not enough clean shots' };

  // Ball/weather confounder split: caveat unless BOTH sides are fully tagged
  // AND every session on both sides shares identical conditions.
  const tagKey = s => JSON.stringify(s.tags || {});
  const hasKnownTags = s => !!(s.tags && (s.tags.ball || s.tags.venue || s.tags.tempF != null));
  const allTagged = [...recent, ...baseline].every(hasKnownTags);
  const recentKeys = new Set(recent.map(tagKey)), baselineKeys = new Set(baseline.map(tagKey));
  const sameConditions = allTagged && recentKeys.size === 1 && baselineKeys.size === 1 &&
                          [...recentKeys][0] === [...baselineKeys][0];
  const caveat = !sameConditions;

  const med = (shots, key) => median(shots.map(s => s[key]).filter(v => v != null));
  const rate = (all, clean) => all.length ? 1 - clean.length / all.length : null;

  return {
    enough: true, caveat,
    // ball/weather-independent — compared freely
    clubSpeed:   { recent: med(recentClean, 'clubSpeed'),   baseline: med(baselineClean, 'clubSpeed') },
    attackAngle: { recent: med(recentClean, 'attackAngle'), baseline: med(baselineClean, 'attackAngle') },
    sideBias:    { recent: mean(recentClean.map(s => s.side).filter(v => v != null)),
                   baseline: mean(baselineClean.map(s => s.side).filter(v => v != null)) },
    mishitRate:  { recent: rate(recentAll, recentClean), baseline: rate(baselineAll, baselineClean) },
    // ball/weather-dependent — caveated when conditions differ or are unknown
    carry:     { recent: med(recentClean, 'carry'),     baseline: med(baselineClean, 'carry') },
    ballSpeed: { recent: med(recentClean, 'ballSpeed'), baseline: med(baselineClean, 'ballSpeed') },
    spin:      { recent: med(recentClean, 'spin'),      baseline: med(baselineClean, 'spin') },
  };
}
```

- [ ] **Step 4: Run to verify all tests pass**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Add computeTrend: 2-vs-3 session window with ball/weather confounder split"
```

- [ ] **Step 6: Fix from code review — defensive sort**

Code review found `computeTrend` trusts caller order with no internal
validation — a real risk given `index.html`'s own history (commit `9ba2fc4`,
"engine sorts internally (order bug reversed trend verdicts)"). Cheap,
zero-behavior-change fix for the current caller (`groupByClub` already sorts):

```js
function computeTrend(sessions) {
  // Defensive sort: don't trust caller order. groupByClub sorts before calling
  // us today, but index.html shipped this exact bug once (commit 9ba2fc4) —
  // an unsorted array here would silently swap "recent" vs "baseline" and
  // produce an inverted-but-plausible-looking trend verdict.
  sessions = [...sessions].sort((a, b) => a.date < b.date ? -1 : (a.date > b.date ? 1 : 0));
  const n = sessions.length;
  if (n < 3) return { enough: false, reason: 'not enough sessions' };
  const recent = sessions.slice(-2);
  const baseline = sessions.slice(-5, -2);
  if (recent.length < 1 || baseline.length < 2) return { enough: false, reason: 'not enough sessions' };
```

Append a regression test proving the fix actually works (verified by the
implementer to fail if the sort is removed):

```js
// T21. computeTrend must not trust caller order: feed it the SAME 5-session
// history as T17 (post-quarantine, via groups17[0].sessions) but reversed.
// computeTrend's own defensive sort should recover the correct recent/baseline
// split, producing byte-for-byte identical results to T17's correctly-ordered call.
const shuffled17 = [...groups17[0].sessions].reverse();
const t21 = computeTrend(shuffled17);
chk('T21 reversed input still enough data', t21.enough === t17.enough);
chk('T21 reversed input: same recent carry as T17', t21.carry.recent === t17.carry.recent);
chk('T21 reversed input: same baseline carry as T17', t21.carry.baseline === t17.carry.baseline);
chk('T21 reversed input: same caveat as T17', t21.caveat === t17.caveat);
```

Run: `node test-range-engine.js` — expect `ALL PASS`, T17-T20 byte-for-byte
unchanged (proving the sort is a true no-op for already-sorted input).

Commit:
```bash
git add range.html test-range-engine.js
git commit -m "Code-review fix (Task 8): computeTrend sorts defensively, no longer trusts caller order"
```

---

## Task 9: `computeVerdicts`

**Files:**
- Modify: `range.html` (engine block)
- Modify: `test-range-engine.js`

- [ ] **Step 1: Write failing tests**

```js
// T21. Verdicts fire for a clear carry trend, using the T17 synthetic history
const groups21 = groupByClub(hist17);
const gaps21 = computeGapping(groups21);
const v21 = computeVerdicts(groups21, gaps21, []);
chk('T21 at least one verdict produced', v21.length > 0);
chk('T21 carry-up verdict mentions 7-Iron', v21.some(v => v.text.includes('7-Iron') && v.text.toLowerCase().includes('carry')));
chk('T21 carry verdict is toned good (carry increased)', v21.some(v => v.text.includes('7-Iron') && v.tone === 'good'));

// T22. Gap warning verdict fires for two adjacent clubs pasted too close together
const tightGapSessions = [
  { date: '2026-08-01', dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'), tags: {},
    shots: Array.from({length:6},()=>({clubSpeed:32,attackAngle:2,ballSpeed:42,spin:5500,carry:110,side:0})) },
  { date: '2026-08-01', dateAssumed: false, clubCode: '8i', club: canonicalClub('8i'), tags: {},
    shots: Array.from({length:6},()=>({clubSpeed:31,attackAngle:2,ballSpeed:41,spin:5800,carry:107,side:0})) },
];
const groups22 = groupByClub(tightGapSessions);
const gaps22 = computeGapping(groups22);
const v22 = computeVerdicts(groups22, gaps22, []);
chk('T22 tight gap warning present', v22.some(v => v.text.includes('Gap tight')));

// T23. Data-note verdict fires when a check reports a mismatch
const v23 = computeVerdicts(groups21, gaps21, [{ date: '2026-08-08', club: '7-Iron', ok: false, mismatches: [{key:'carry'}] }]);
chk('T23 data note verdict present', v23.some(v => v.text.includes('Data note') && v.text.includes('7-Iron')));

// T24. No data at all → placeholder "not enough data" verdict, never empty array
const v24 = computeVerdicts([], [], []);
chk('T24 fallback verdict when nothing computable', v24.length === 1 && v24[0].text.includes('Not enough data'));
```

- [ ] **Step 2: Run to verify failure**

Run: `node test-range-engine.js`
Expected: `ReferenceError: computeVerdicts is not defined`.

- [ ] **Step 3: Implement `computeVerdicts`**

Insert after `computeTrend`, before `/*ENGINE-END*/`:

```js
// ── Verdicts ───────────────────────────────────────────────────────────────────
function computeVerdicts(groups, gaps, checks) {
  const v = [];
  let anyEnoughData = false;
  groups.forEach(g => {
    const t = computeTrend(g.sessions);
    if (!t.enough) return;
    anyEnoughData = true;
    if (t.carry.recent != null && t.carry.baseline != null) {
      const carryD = (t.carry.recent - t.carry.baseline) * M_TO_YD;
      if (Math.abs(carryD) >= 3) {
        v.push({ tone: carryD > 0 ? 'good' : 'bad',
          text: `<b>${esc(g.name)} carry ${carryD > 0 ? 'up' : 'down'} ${r1(Math.abs(carryD))} yds:</b> last 2 sessions vs previous 3.` +
                (t.caveat ? ' Session conditions differ or are untagged — ball/weather may explain part of this.' : '') });
      }
    }
    if (t.mishitRate.recent != null && t.mishitRate.baseline != null) {
      const mrD = (t.mishitRate.baseline - t.mishitRate.recent) * 100;
      if (Math.abs(mrD) >= 8) {
        v.push({ tone: mrD > 0 ? 'good' : 'bad',
          text: `<b>${esc(g.name)} mishit rate ${mrD > 0 ? 'down' : 'up'} ${r1(Math.abs(mrD))}%:</b> ${Math.round(t.mishitRate.recent * 100)}% recent vs ${Math.round(t.mishitRate.baseline * 100)}% previous.` });
      }
    }
    if (t.sideBias.recent != null && Math.abs(t.sideBias.recent) * M_TO_YD >= 5) {
      v.push({ tone: 'warn',
        text: `<b>${esc(g.name)} side bias:</b> averaging ${r1(Math.abs(t.sideBias.recent) * M_TO_YD)} yds ${t.sideBias.recent > 0 ? 'right' : 'left'} of target recently.` });
    }
  });
  gaps.forEach((g, i) => {
    if (!g.gapWarning || g.gapToNext == null) return;
    // -3 yds, not any negative value: below that a "crossed" gap is
    // rounding/measurement noise (matches the carry-trend verdict's own
    // 3-yd significance floor above), not a real fitting-implicating flip.
    if (g.gapToNext < -3) {
      v.push({ tone: 'bad', text: `<b>Crossed clubs:</b> ${esc(g.name)} carries ${r1(Math.abs(g.gapToNext))} yds LESS than ${esc(gaps[i + 1].name)} — check club fitting or whether mishits are dragging this club's number down.` });
      return;
    }
    const dir = g.gapToNext < 8 ? 'tight' : 'wide';
    v.push({ tone: 'warn', text: `<b>Gap ${dir}:</b> ${esc(g.name)} → ${esc(gaps[i + 1].name)} is ${r1(Math.abs(g.gapToNext))} yds apart.` });
  });
  (checks || []).filter(c => c && !c.ok).forEach(c => {
    v.push({ tone: 'flat',
      text: `<b>Data note:</b> parsed numbers for ${esc(c.club)} on ${esc(c.date)} don't match Trackman's own Average row — this paste may have mis-parsed. Check the shot list.` });
  });
  gaps.filter(g => g.lowConfidence).forEach(g => {
    v.push({ tone: 'flat', text: `<b>Low confidence:</b> ${esc(g.name)} has only ${g.n} clean shot(s) recorded — gapping number is provisional.` });
  });
  if (!v.length) {
    v.push({ tone: 'flat', text: anyEnoughData
      ? 'No notable changes recently — carry, mishit rate, and side bias are all steady versus your baseline.'
      : 'Not enough data yet for trend verdicts — keep pasting sessions.' });
  }
  return v;
}
```

- [ ] **Step 6: Fixes from code review — misleading fallback + crossed-club gaps**

Code review found two user-facing text bugs, both baked into the Step 3 code
above (already corrected there, called out explicitly here since they were
found after initial implementation):

1. **Misleading "Not enough data" fallback.** With plenty of clean shots and
   stable numbers (nothing crosses a threshold), the old fallback said "Not
   enough data yet" — actively wrong when data is fine and just unremarkable.
   Fixed by tracking `anyEnoughData` (set when any group's `computeTrend`
   returns `enough: true`) and branching the fallback message.
2. **Negative-yardage "tight gap" for crossed clubs.** A club carrying LESS
   than the next club down (a real, more serious problem) produced a negative
   `gapToNext`, silently labeled "Gap tight" with a nonsensical negative
   number. Fixed with a distinct `gapToNext < 0` branch ("Crossed clubs") and
   `Math.abs()` on all displayed gap yardages.

Append regression tests:

```js
// T25. Code-review fix regression: 5 real sessions of trend-eligible data (enough:
// true) where carry is rock-stable, nobody mishits, and side bias is negligible —
// i.e. there IS plenty of data, it's just unremarkable. The old fallback wording
// ("Not enough data yet") would be actively misleading here; it must say
// something positive/steady instead. Single club group also means computeGapping
// can't produce a gap warning, so the only path left to the fallback is the
// "nothing crossed a threshold" one.
const hist25 = [
  fakeSession('2026-07-01', [115, 115, 115, 115, 115]),
  fakeSession('2026-07-08', [115, 115, 115, 115, 115]),
  fakeSession('2026-07-15', [115, 115, 115, 115, 115]),
  fakeSession('2026-08-01', [115, 115, 115, 115, 115]),
  fakeSession('2026-08-08', [115, 115, 115, 115, 115]),
];
const groups25 = groupByClub(hist25);
const gaps25 = computeGapping(groups25);
chk('T25 sanity: trend data is actually enough', computeTrend(groups25[0].sessions).enough === true);
chk('T25 sanity: no gap warning (single club)', !gaps25.some(g => g.gapWarning));
const v25 = computeVerdicts(groups25, gaps25, []);
chk('T25 exactly one fallback verdict', v25.length === 1);
chk('T25 fallback is positive/steady, not "not enough data"', !v25[0].text.includes('Not enough data') && /steady|no notable/i.test(v25[0].text));

// T26. Code-review fix regression: a lower-ordered club (7-Iron) carrying LESS
// than the next club down (8-Iron) by more than the 8yd gapWarning threshold —
// a crossed/inverted bag, not a merely "tight" gap. gapToNext is negative in
// this case; the old code labeled it "Gap tight" with a negative, nonsensical
// yardage. Must fire a distinct "Crossed clubs" verdict with a positive number.
const crossedGapSessions = [
  { date: '2026-08-01', dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'), tags: {},
    shots: Array.from({length:6},()=>({clubSpeed:32,attackAngle:2,ballSpeed:42,spin:5500,carry:95,side:0})) },
  { date: '2026-08-01', dateAssumed: false, clubCode: '8i', club: canonicalClub('8i'), tags: {},
    shots: Array.from({length:6},()=>({clubSpeed:31,attackAngle:2,ballSpeed:41,spin:5800,carry:110,side:0})) },
];
const groups26 = groupByClub(crossedGapSessions);
const gaps26 = computeGapping(groups26);
chk('T26 sanity: gapToNext is negative (7-Iron carries less than 8-Iron)', gaps26[0].gapToNext < 0);
chk('T26 sanity: gap warning fires', gaps26[0].gapWarning === true);
const v26 = computeVerdicts(groups26, gaps26, []);
chk('T26 crossed-clubs verdict present', v26.some(v => v.text.includes('Crossed clubs')));
chk('T26 no "Gap tight"/"Gap wide" verdict for the crossed pair', !v26.some(v => v.text.includes('Gap tight') || v.text.includes('Gap wide')));
chk('T26 displayed yardage is positive', v26.some(v => v.text.includes('Crossed clubs') && (() => {
  const m = v.text.match(/carries ([\d.]+) yds LESS/);
  return m && parseFloat(m[1]) > 0;
})()));
```

Run: `node test-range-engine.js` — expect `ALL PASS`, T21-T24 unaffected.

Commit:
```bash
git add range.html test-range-engine.js
git commit -m "Code-review fix (Task 9): honest verdict fallback + fix crossed-club gap sign"
```

- [ ] **Step 7: Second-pass fix — gate the crossed-clubs alarm on magnitude**

A second review pass found Step 6's fix reintroduced a smaller-scale version
of the same problem it closed: `g.gapToNext < 0` fires the alarming "Crossed
clubs" message for ANY negative value, including statistically negligible
crossings (e.g. -0.5 yds, well inside measurement/median noise) — a
rounding-level tie and a genuinely crossed -15 yd bag get identical
alarm-tone treatment.

Change the condition from `< 0` to `< -3` (reusing the same 3-yd significance
floor the carry-trend verdict above already uses, rather than inventing a
third magic number), with a comment explaining why:

```js
gaps.forEach((g, i) => {
  if (!g.gapWarning || g.gapToNext == null) return;
  // -3 yds, not any negative value: below that a "crossed" gap is
  // rounding/measurement noise (matches the carry-trend verdict's own
  // 3-yd significance floor above), not a real fitting-implicating flip.
  if (g.gapToNext < -3) {
    v.push({ tone: 'bad', text: `<b>Crossed clubs:</b> ${esc(g.name)} carries ${r1(Math.abs(g.gapToNext))} yds LESS than ${esc(gaps[i + 1].name)} — check club fitting or whether mishits are dragging this club's number down.` });
    return;
  }
  const dir = g.gapToNext < 8 ? 'tight' : 'wide';
  v.push({ tone: 'warn', text: `<b>Gap ${dir}:</b> ${esc(g.name)} → ${esc(gaps[i + 1].name)} is ${r1(Math.abs(g.gapToNext))} yds apart.` });
});
```

Append a regression test:

```js
// T27. Second code-review fix regression: a near-zero negative gapToNext
// (rounding/measurement noise, well under the 3-yd significance floor used
// elsewhere in this function) must NOT trip the alarming "Crossed clubs"
// wording — it should read as an ordinary "Gap tight" verdict instead, same
// as a near-zero positive gap would. gapToNext still trips gapWarning here
// (it's < 8), so the tight/wide branch is reachable; only the sign is inverted.
const nearZeroCrossedGapSessions = [
  { date: '2026-08-01', dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'), tags: {},
    shots: Array.from({length:6},()=>({clubSpeed:32,attackAngle:2,ballSpeed:42,spin:5500,carry:100,side:0})) },
  { date: '2026-08-01', dateAssumed: false, clubCode: '8i', club: canonicalClub('8i'), tags: {},
    shots: Array.from({length:6},()=>({clubSpeed:31,attackAngle:2,ballSpeed:41,spin:5800,carry:100.65,side:0})) },
];
const groups27 = groupByClub(nearZeroCrossedGapSessions);
const gaps27 = computeGapping(groups27);
chk('T27 sanity: gapToNext is negative but small', gaps27[0].gapToNext < 0 && gaps27[0].gapToNext > -3);
chk('T27 sanity: gap warning still fires (noise gap is still < 8yd)', gaps27[0].gapWarning === true);
const v27 = computeVerdicts(groups27, gaps27, []);
chk('T27 no "Crossed clubs" verdict for noise-level negative gap', !v27.some(v => v.text.includes('Crossed clubs')));
chk('T27 ordinary "Gap tight" verdict fires instead', v27.some(v => v.text.includes('Gap tight')));
// T26 unaffected by the new floor: -16 yd is still well past -3, still "Crossed clubs".
chk('T27 does not affect T26 (strongly-crossed bag)', v26.some(v => v.text.includes('Crossed clubs')));
```

Run: `node test-range-engine.js` — expect `ALL PASS`, T26 still fires
"Crossed clubs" unaffected (its gap is -16 yds, well past the -3 floor).

Commit:
```bash
git add range.html test-range-engine.js
git commit -m "Second code-review fix (Task 9): gate crossed-clubs alarm on -3yd floor"
```

- [ ] **Step 4: Run to verify all tests pass**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Add computeVerdicts: trend, gap-warning, and data-quality verdict cards"
```

---

## Task 10: `coachPrompt`

**Files:**
- Modify: `range.html` (engine block)
- Modify: `test-range-engine.js`

- [ ] **Step 1: Write failing tests**

```js
// T25. Coach prompt includes gapping numbers and verdict text, strips HTML tags
const v25 = computeVerdicts(groups21, gaps21, []);
const prompt25 = coachPrompt(gaps21, v25);
chk('T25 prompt mentions all four coaches', ['FALDO','BRYSON','FAXON','PHIL'].every(name => prompt25.includes(name)));
chk('T25 prompt includes club yardage', prompt25.includes('7-Iron'));
chk('T25 prompt has no leftover HTML tags', !/<\/?b>/.test(prompt25));
```

- [ ] **Step 2: Run to verify failure**

Run: `node test-range-engine.js`
Expected: `ReferenceError: coachPrompt is not defined`.

- [ ] **Step 3: Implement `coachPrompt`**

Insert after `computeVerdicts`, before `/*ENGINE-END*/`:

```js
// ── Coach debrief prompt ──────────────────────────────────────────────────────
function coachPrompt(gaps, verdicts) {
  const rows = gaps.filter(g => g.cleanCarryYd != null).map(g =>
    `${g.name}: ${r1(g.cleanCarryYd)} yds median (n=${g.n}, mishit rate ${g.mishitRate != null ? Math.round(g.mishitRate * 100) + '%' : 'n/a'}` +
    `${g.sideBiasYd != null ? `, bias ${r1(Math.abs(g.sideBiasYd))} ${g.sideBiasYd > 0 ? 'R' : 'L'}` : ''})`
  ).join('\n');
  return `You are my team of four golf coaches. Stay in character, disagree where your philosophies differ, and ground EVERYTHING in my range data below — no generic tips.
- FALDO (swing mechanics): tempo, fundamentals, repeatability.
- BRYSON (data): ruthlessly quantitative, calls out what the numbers do and don't support.
- FAXON (putting): stroke, green reading, speed.
- PHIL (short game): chipping, pitching, scrambling — and gambler's course management.

MY RANGE DATA (Trackman, clean-shot medians after mishit quarantine):
${rows || '(no clean-shot data yet)'}

RECENT SIGNALS:
${verdicts.map(v => '- ' + v.text.replace(/<\/?b>/g, '')).join('\n')}

Debrief my ball-striking as a conversation between the four of you: what's real in the recent trend, what's noise, where you disagree, and end with ONE range priority each (a specific drill with success criteria), then a consensus pick for the single most valuable thing to work on next session.`;
}
```

- [ ] **Step 4: Run to verify all tests pass**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Add coachPrompt for the range tool's debrief button"
```

---

## Task 11: UI wiring — `render()`, `doParse()`, persistence, tags, club override

**Files:**
- Modify: `range.html` (both the engine-adjacent UI script and the `<select id="clubOverride">` options)

This task has no node-testable engine logic — it wires the DOM. Verification is a manual browser smoke test.

- [ ] **Step 1: Confirm the club-override placeholder is already in place**

The `<select id="clubOverride">` element from Task 1 already exists with its default option; no HTML change is needed here. It gets populated by JS in Step 2 below.

- [ ] **Step 2: Write the UI script**

Replace the line `render();` at the bottom of `range.html`'s `<script>` block (after `/*ENGINE-END*/`) with the full UI implementation:

```js
// ── UI ───────────────────────────────────────────────────────────────────────
const LS = 'golfcaddy_range';
const load = () => { try { return JSON.parse(localStorage.getItem(LS)) || []; } catch (e) { return []; } };
const save = cs => localStorage.setItem(LS, JSON.stringify(cs));

function populateClubOverride() {
  const sel = document.getElementById('clubOverride');
  CLUB_TABLE.forEach(row => {
    const o = document.createElement('option');
    o.value = row.name; o.textContent = row.name;
    sel.appendChild(o);
  });
}

function currentTags() {
  const ball = document.getElementById('tagBall').value || null;
  const venue = document.getElementById('tagVenue').value || null;
  const tempRaw = document.getElementById('tagTemp').value;
  const tempF = tempRaw ? parseFloat(tempRaw) : null;
  const facility = document.getElementById('tagFacility').value.trim() || null;
  return { ball, venue, tempF, facility };
}

function spark(vals, invert) {
  vals = (vals || []).filter(v => v != null && !isNaN(v));
  if (vals.length < 2) return '';
  const w = 300, h = 44, mn = Math.min(...vals), mx = Math.max(...vals), rg = mx - mn || 1;
  const pts = vals.map((v, i) =>
    `${(i / (vals.length - 1) * w).toFixed(1)},${(h - 4 - (v - mn) / rg * (h - 8)).toFixed(1)}`).join(' ');
  const lastUp = vals[vals.length - 1] <= median(vals);
  const col = (invert ? !lastUp : lastUp) ? 'var(--bad)' : 'var(--good)';
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="display:block;width:100%;height:44px;margin-top:6px"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2"/></svg>`;
}

function render() {
  const clubSessions = load();
  const dash = document.getElementById('dash');
  if (!clubSessions.length) {
    dash.innerHTML = '<div class="card"><h2>No sessions yet</h2>Paste your Trackman club table above.</div>';
    return;
  }
  const groups = groupByClub(clubSessions);
  const gaps = computeGapping(groups);
  const verdicts = computeVerdicts(groups, gaps, []);
  const prompt = coachPrompt(gaps, verdicts);

  const gapRows = gaps.map(g => `<tr>
    <td>${esc(g.name)}${g.lowConfidence ? ' ⚠' : ''}</td>
    <td>${g.cleanCarryYd != null ? Math.round(g.cleanCarryYd) : '–'}</td>
    <td>${g.gapToNext != null ? (g.gapWarning ? `<span class="down">${Math.round(g.gapToNext)}</span>` : Math.round(g.gapToNext)) : '–'}</td>
    <td>${g.mishitRate != null ? Math.round(g.mishitRate * 100) + '%' : '–'}</td>
    <td>${g.sideBiasYd != null ? `${Math.round(Math.abs(g.sideBiasYd))}${g.sideBiasYd >= 0 ? 'R' : 'L'}` : '–'}</td>
    <td>${g.n}/${g.totalN}</td>
    <td>${esc(g.lastSeen)}</td>
  </tr>`).join('');

  const detailCards = groups.map(g => {
    const allShots = g.sessions.flatMap(s => s.shots);
    const rows = allShots.map(s => `<tr${s.quarantined ? ' style="opacity:.5"' : ''}>
      <td>${r1(s.clubSpeed) ?? '–'}</td><td>${r1(s.ballSpeed) ?? '–'}</td>
      <td>${r1(s.spin) ?? '–'}</td><td>${r1(s.carry) != null ? r1(s.carry * M_TO_YD) : '–'}</td>
      <td>${r1(s.side) != null ? r1(Math.abs(s.side) * M_TO_YD) + (s.side >= 0 ? 'R' : 'L') : '–'}</td>
      <td>${s.quarantined ? `⚠ ${s.quarantineReason === 'bad_strike' ? 'bad strike' : 'thin flier'}` : ''}</td>
    </tr>`).join('');
    return `<details><summary>${esc(g.name)} — ${allShots.length} shots across ${g.sessions.length} session(s)</summary>
      <table style="margin-top:6px"><tr><th>Club spd (m/s)</th><th>Ball spd (m/s)</th><th>Spin</th><th>Carry (yd)</th><th>Side</th><th>Flag</th></tr>${rows}</table>
    </details>`;
  }).join('');

  dash.innerHTML = `
  <div class="card"><h2>Verdicts</h2>
    ${verdicts.map(v => `<div class="verdict ${v.tone}">${v.text}</div>`).join('')}
  </div>
  <div class="card"><h2>Club gapping (clean-shot median, driver → wedges)</h2>
    <table><tr><th>Club</th><th>Carry (yd)</th><th>Gap</th><th>Mishit</th><th>Side</th><th>Clean/Total</th><th>Last seen</th></tr>
    ${gapRows}</table>
  </div>
  <div class="card"><h2>Coach debrief — copy into Claude</h2>
    <textarea id="coach" readonly>${esc(prompt)}</textarea>
    <button onclick="navigator.clipboard.writeText(document.getElementById('coach').value).then(()=>msg('Copied.'))">Copy prompt</button>
  </div>
  <div class="card"><h2>Per-club detail</h2>${detailCards}</div>`;
}

function msg(t) { document.getElementById('msg').textContent = t; }

function doParse() {
  const src = document.getElementById('source').value;
  const pasteText = document.getElementById('paste').value;
  const result = SOURCES[src].parse(pasteText);
  if (!result.sessions.length) {
    msg(src === 'trackman'
      ? 'No shots recognized — paste the whole per-club table, including the header row (Club Speed, Ball Speed, Carry, ...).'
      : 'No rows recognized — the paste needs a header row with at least Date, Club, and one metric column.');
    return;
  }
  const tags = currentTags();
  const overrideName = document.getElementById('clubOverride').value;
  result.sessions.forEach(s => {
    s.tags = tags;
    if (overrideName) { const c = clubByName(overrideName); if (c) { s.club = c; s.clubCode = overrideName; } }
  });
  const { all, addedShots } = mergeClubSessions(load(), result.sessions);
  save(all);
  const shotCount = result.sessions.reduce((n, s) => n + s.shots.length, 0);
  let note = `Parsed ${shotCount} shots, ${addedShots} new (${all.reduce((n, s) => n + s.shots.length, 0)} total).`;
  if (result.skipped.length) note += ` ${result.skipped.length} line(s) unrecognized.`;
  if (result.checks && result.checks.some(c => !c.ok)) note += ` Warning: computed numbers don't match Trackman's own Average row for this paste — check the parse.`;
  msg(note);
  document.getElementById('paste').value = '';
  render();
}

function doExport() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(load(), null, 1)], { type: 'application/json' }));
  a.download = 'golf-range.json'; a.click();
}
function doImport(ev) {
  const f = ev.target.files[0]; if (!f) return;
  f.text().then(t => { const { all, addedShots } = mergeClubSessions(load(), JSON.parse(t)); save(all); msg(`Imported ${addedShots} new shots.`); render(); });
}
function doClear() { if (confirm('Delete all stored range sessions?')) { localStorage.removeItem(LS); render(); } }

populateClubOverride();
render();
```

- [ ] **Step 3: Run the engine test suite to confirm nothing broke**

Run: `node test-range-engine.js`
Expected: `ALL PASS` (this task only adds UI code after `/*ENGINE-END*/`, which the test harness never touches).

- [ ] **Step 4: Manual browser smoke test**

Open `range.html` directly in a browser (double-click or `file://` path). Paste this exact text into the textarea (it's the real 7-iron sample) and click **Parse & save**:

```
2026-08-22
7i
7IronHide
Change Datachange data icon	Club Speed	Attack Ang.	Ball Speed	Spin Rate	Carry	Side				
m, m/schange unit icon
m/s	Deg	m/s	Rpm	m	m				
1.	Eye icon		
Ball icon
31.9	3.0	42.3	5390	116.0	8.4L				
2.	Eye icon		
Ball icon
32.6	2.0	36.3	1616	69.8	21.6R				
3.	Eye icon		
Ball icon
32.7	3.8	43.1	2990	119.3	1.7R				
4.	Eye icon		
Ball icon
33.3	4.0	39.6	5550	105.1	2.6R				
5.	Eye icon		
Ball icon
32.4	1.6	38.9	5660	101.1	18.6R				
6.	Eye icon		
Ball icon
32.5	1.4	43.6	6750	115.7	9.1R				
7.	Eye icon		
Ball icon
33.3	1.8	43.8	6800	116.1	19.2R				
8.	Eye icon		
Ball icon
32.6	2.6	40.9	6240	108.1	10.2R				
9.	Eye icon		
Ball icon
32.9	3.0	44.0	3160	122.6	14.5L				
10.	Eye icon		
Ball icon
32.8	2.2	43.4	1970	94.6	9.2L				
11.	Eye icon		
Ball icon
33.2	1.4	42.5	5200	117.3	3.0L				
12.	Eye icon		
Ball icon
33.0	2.6	41.4	7000	107.5	17.1R				
Average	Balls icon	32.8	2.5	41.6	4861	107.8	5.4R				
Consistency	0.4	0.8	2.3	1839	13.9	11.9	
```

Expected: status message reports 12 shots parsed, 0 unrecognized; the gapping table shows one row for 7-Iron with a clean carry around 127 yards; the per-club detail section, when expanded, shows 12 rows with shots 2 and 10 dimmed and flagged. Re-paste the same text into the textarea (it clears after each parse) and click **Parse & save** again — the status message should report 0 new shots. Refresh the page — the same data should still be there (localStorage persistence).

- [ ] **Step 5: Commit**

```bash
git add range.html
git commit -m "Wire range.html UI: render, parse, tags, club override, persistence"
```

---

## Task 12: Export / import / clear verification + condition tags round-trip

**Files:**
- Modify: `range.html` (bugfix only if the smoke test below finds one — no changes expected)

- [ ] **Step 1: Manual browser smoke test for export/import**

With the 7-iron session from Task 11 still loaded, click **Export JSON**. Confirm a `golf-range.json` file downloads and contains an array with one club-session object with `"name":"7-Iron"` inside `club` and 12 entries in `shots`.

- [ ] **Step 2: Manual browser smoke test for clear + import**

Click **Clear all**, confirm the dialog, confirm the dashboard reverts to "No sessions yet". Click **Import** and select the `golf-range.json` file from Step 1. Confirm the dashboard repopulates with the same 7-Iron gapping row and the status message reports 12 new shots.

- [ ] **Step 3: Manual browser smoke test for session condition tags**

Clear all again. Set **Ball** to "Range ball", **Venue** to "Outdoor", **Temp** to 75, paste the same sample, and parse. Export JSON and confirm the club-session object's `tags` field is `{"ball":"range","venue":"outdoor","tempF":75,"facility":null}`.

- [ ] **Step 4: Commit (only if Step 1–3 required a fix)**

```bash
git add range.html
git commit -m "Fix export/import/tags round-trip issue found in manual smoke test"
```

If no fix was needed, skip this commit — there's nothing to commit.

---

## Task 13: Cross-links + README section

**Files:**
- Modify: `index.html:47-48` (title/subtitle area)
- Modify: `README.md`

- [ ] **Step 1: Add a cross-link from `index.html` to `range.html`**

In `index.html`, the current subtitle line is:

```html
  <div class="sub">Paste your Grint stats table → honest trends, one focus, and a coach debrief. All local, no account.</div>
```

Change it to:

```html
  <div class="sub">Paste your Grint stats table → honest trends, one focus, and a coach debrief. All local, no account. <a href="range.html" style="color:var(--accent)">Range analyzer →</a></div>
```

(`range.html` already links back to `index.html` — added in Task 1, Step 1.)

- [ ] **Step 2: Add a README section for the range tool**

Append to `README.md`, after the existing "Handicap index & good-round recipe" section:

```markdown

## Range analyzer (Trackman)

A second tool, `range.html`, alongside the round analyzer above — same local-only,
no-account philosophy, different data: shot-level launch monitor sessions instead
of round scores. The two never mix; round data carries no Trackman fields and
vice versa.

1. At the range, on the Trackman screen: select one club → select the whole
   per-club table (header row through the Consistency row) → copy.
2. Open `range.html` → optionally set ball/venue/temp tags for the visit →
   paste → **Parse & save**. One paste = one club on one date; do this once per
   club you hit. Re-pasting is safe — duplicate shots merge.
3. Read the verdicts and gapping table; **Copy prompt** to debrief with the same
   four coaches, grounded in your clean-shot yardages.

**Why clean-shot median, not Trackman's on-screen average:** the average
includes duffs. A shot is quarantined as a mishit if its smash factor is below
a club-class floor (bad strike) or its spin AND carry are both far below the
session's own reference (a thin flier) — spin alone isn't enough, since your
longest shots are often your lowest-spin ones too. Quarantined shots are shown,
never silently dropped.

**Why trend compares 2 sessions vs the previous 3, not 5 vs 10 like the round
analyzer:** range visits are far sparser than rounds. Carry, ball speed, spin,
and smash factor get a caveat when session ball/venue/temp tags differ or are
missing, since range balls and weather move carry independent of your swing;
club speed, attack angle, dispersion, and mishit rate compare freely, since
those aren't ball- or weather-dependent.

The `trackman` adapter is deliberately specific to Trackman's paste shape
(icon-noise lines, the two-line club header, the Average/Consistency footer
used only as a same-paste self-check). A generic keyword-mapped CSV/table
adapter is the fallback for any other launch monitor — bring a real export from
one and a named adapter is a few lines in the `SOURCES` registry, same pattern
as the round analyzer's Grint/generic split.
```

- [ ] **Step 3: Commit**

```bash
git add index.html README.md
git commit -m "Cross-link the round and range analyzers; document the range tool in README"
```

---

## Task 14: Remaining adversarial test coverage

**Files:**
- Modify: `test-range-engine.js`

Covers the spec's remaining test list items not already exercised by earlier tasks: yards-unit paste, driver-shaped columns, missing date, all-mishit session, out-of-order session input, unrecognized club code.

- [ ] **Step 1: Write the remaining adversarial tests**

Append to `test-range-engine.js`:

```js
// T26. Yards/mph unit paste normalizes correctly (values converted to metric
// internally, then re-converted to yards for display — round-trip check)
const yardsSample = `2026-08-20
7i
7IronHide
Club Speed\tAttack Ang.\tBall Speed\tSpin Rate\tCarry\tSide
mph\tDeg\tmph\tRpm\tyds\tyds
71.4\t3.0\t94.6\t5390\t126.9\t9.2L
72.9\t2.0\t81.2\t5400\t118.5\t3.0R
73.2\t3.5\t95.5\t5450\t128.5\t2.0R
73.0\t3.0\t96.0\t5500\t129.0\t1.0L
72.5\t2.8\t95.0\t5480\t127.5\t0.5R
73.4\t3.2\t96.5\t5520\t130.0\t2.5L
Average\t72.7\t2.9\t93.1\t5457\t126.7\t0.6R
Consistency\t0.7\t0.5\t5.4\t50\t3.6\t3.2`;
const p26 = parseTrackman(yardsSample);
chk('T26 one session parsed from yards paste', p26.sessions.length === 1);
// carry stored internally in meters: 126.9 yds / 1.09361 ≈ 116.02 m
chk('T26 carry normalized to metric internally', Math.abs(p26.sessions[0].shots[0].carry - 126.9 / M_TO_YD) < 0.01);
chk('T26 club speed normalized to m/s', Math.abs(p26.sessions[0].shots[0].clubSpeed - 71.4 / MS_TO_MPH) < 0.01);

// T27. Driver paste with a different, larger column set (Total/Launch/Height/Curve)
const driverCols = `2026-08-20
Dr
BigStick
Club Speed\tAttack Ang.\tBall Speed\tLaunch Ang.\tSpin Rate\tCarry\tTotal\tHeight\tCurve\tSide
m/s\tDeg\tm/s\tDeg\tRpm\tm\tm\tm\tm\tm
47.0\t2.0\t68.0\t12.0\t2400\t225.0\t240.0\t28.0\t3.0\t5.0R
47.5\t2.5\t69.0\t11.5\t2350\t228.0\t243.0\t27.5\t2.5\t3.0L
47.2\t1.8\t68.5\t12.2\t2450\t226.5\t241.5\t28.2\t4.0\t2.0R
47.8\t2.2\t69.5\t11.8\t2380\t229.0\t244.0\t27.8\t1.5\t1.0R
47.1\t2.0\t68.2\t12.1\t2420\t225.5\t240.5\t28.1\t3.5\t4.0L
Average\t47.3\t2.1\t68.6\t11.9\t2400\t226.8\t241.8\t27.9\t2.9\t0.6R
Consistency\t0.3\t0.3\t0.5\t0.3\t35\t1.5\t1.5\t0.3\t1.0\t2.7`;
const p27 = parseTrackman(driverCols);
chk('T27 driver session parsed with extra columns', p27.sessions.length === 1 && p27.sessions[0].club.name === 'Driver');
chk('T27 launch/total/height/curve all captured', ['launch','total','height','curve'].every(k => p27.sessions[0].shots[0][k] != null));
chk('T27 self-check passes on well-formed data', p27.checks[0].ok === true);

// T28. Missing date line → dateAssumed true, defaults to today, still parses shots
const noDate = SAMPLE_7I.split('\n').slice(1).join('\n'); // drop "2026-08-22"
const p28 = parseTrackman(noDate);
chk('T28 still parses 12 shots without a date line', p28.sessions.length === 1 && p28.sessions[0].shots.length === 12);
chk('T28 dateAssumed is true', p28.sessions[0].dateAssumed === true);
chk('T28 date defaults to a valid ISO date', /^\d{4}-\d{2}-\d{2}$/.test(p28.sessions[0].date));

// T29. All-mishit session: quarantine flags every shot, gapping degrades to
// low-confidence rather than crashing or reporting a fake median
const allBad = { date: '2026-08-05', dateAssumed: false, clubCode: 'lw', club: canonicalClub('lw'), tags: {},
  shots: Array.from({ length: 6 }, () => ({ clubSpeed: 25, attackAngle: -5, ballSpeed: 15, spin: 8000, carry: 10, side: 0 })) };
// smash = 15/25 = 0.6, well under the wedge floor of 1.15 → all quarantined as bad_strike
const groups29 = groupByClub([allBad]);
chk('T29 every shot quarantined', groups29[0].sessions[0].shots.every(s => s.quarantined === true));
const gaps29 = computeGapping(groups29);
chk('T29 gapping n=0, no crash', gaps29[0].n === 0 && gaps29[0].cleanCarryYd === null);
chk('T29 low confidence with zero clean shots', gaps29[0].lowConfidence === true);
const v29 = computeVerdicts(groups29, gaps29, []);
chk('T29 verdicts computed without throwing', Array.isArray(v29));

// T30. Out-of-order session input never reverses the trend — groupByClub must
// sort internally regardless of array order passed in
const shuffled = [hist17[3], hist17[0], hist17[4], hist17[1], hist17[2]]; // scrambled order
const t30 = computeTrend(groupByClub(shuffled)[0].sessions);
const t30sorted = computeTrend(groupByClub(hist17)[0].sessions);
chk('T30 shuffled input yields identical trend to sorted input', t30.carry.recent === t30sorted.carry.recent && t30.carry.baseline === t30sorted.carry.baseline);

// T31. Unrecognized club code degrades gracefully instead of failing the parse
const weirdClub = SAMPLE_7I.replace('7i\n7IronHide', 'XYZ9\nMysteryClub');
const p31 = parseTrackman(weirdClub);
chk('T31 unrecognized code still parses shots', p31.sessions.length === 1 && p31.sessions[0].shots.length === 12);
chk('T31 club falls back to Unknown-class with raw code as name', p31.sessions[0].club.klass === 'unknown' && p31.sessions[0].club.name === 'XYZ9');
```

- [ ] **Step 2: Run to verify current status**

Run: `node test-range-engine.js`

These tests exercise existing implementation, so they're expected to mostly pass already; this step is a genuine check rather than a guaranteed-fail step. Note any `FAIL` lines.

- [ ] **Step 3: Fix any failures found**

If `T26`–`T31` reveal a bug (for example, `findUnitRow`'s regex not matching `mph`/`yds` tokens correctly, or `parseFooterRow`'s numeric-token filter mis-handling a driver paste's wider column set), fix it in `range.html`'s engine block. Do not guess — read the specific `FAIL` line, trace which function produced the wrong value, and correct that function.

- [ ] **Step 4: Run until all pass**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Add remaining adversarial coverage: units, driver columns, missing date, all-mishit, shuffled input, unknown club"
```

---

## Final check

- [ ] Run the full suite one more time end to end: `node test-engine.js && node test-range-engine.js` — both must print `ALL PASS`.
- [ ] Open both `index.html` and `range.html` in a browser, confirm the cross-links in each direction work.
- [ ] Confirm `git log --oneline -15` shows one commit per task above, each with a real descriptive message (not "tweaks"/"updates").
