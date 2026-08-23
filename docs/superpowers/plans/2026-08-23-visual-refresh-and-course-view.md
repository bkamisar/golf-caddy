# Visual Refresh & Mobile Course View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `index.html` and `range.html` with an approved new visual language (deep green/gold/cream, hairline dividers, serif+sans+mono typography, ladder rows, annotated notes), and add a new mobile-first read-only `course.html` for on-course reference.

**Architecture:** Three self-contained static HTML files, no build step, matching the suite's existing conventions. The shared visual language lives as a duplicated `<style>` block in each file (same duplication tradeoff the engine block already makes — no bundler exists here). `course.html` carries a verbatim copy of `range.html`'s full engine block plus two new pure functions of its own, and is node-tested via a new `test-course-engine.js` following the established extraction-harness pattern.

**Tech Stack:** Vanilla JS/CSS, no dependencies. Node.js only for the test harnesses.

**Spec:** `docs/superpowers/specs/2026-08-23-visual-refresh-and-course-view-design.md`

---

## Critical conventions (read before implementing any task)

These are hard-won from the 14-task build that produced `range.html`. Violating them causes real bugs that already happened once:

1. **`var`, not `const`, for engine-block bindings referenced by name in tests.** The test harness extracts the `/*ENGINE-START*/…/*ENGINE-END*/` block and runs it through the harness's dynamic-evaluation step. That mechanism only leaks `var`/`function` declarations into the caller's scope — `const`/`let` stay trapped. `range.html` already declares `M_TO_YD`, `MS_TO_MPH`, `median`, `mean`, `r1`, and `SOURCES` as `var` for exactly this reason. Any NEW engine value a test references by bare name must also be `var`. Function declarations are unaffected.
2. **Never interpolate user-controlled text into an `onclick="..."` attribute**, even after escaping. HTML-entity decoding happens before the JS is parsed, so an escaped quote still closes a JS string literal nested in an attribute. Club names can be arbitrary raw pasted text (unrecognized codes fall back to the raw string). `range.html`'s `doDeleteSession(i)` takes an integer index into a module-scoped array precisely to avoid this. Follow that pattern.
3. **Escape every dynamic string that reaches the DOM via a markup string.** The `esc()` helper in the engine block is the suite's standard for this and must wrap club names, dates, and any label text built from stored data. Verdict text is the one deliberate exception — it is engine-generated, contains intentional `<b>` tags, and every dynamic value inside it was already escaped by `computeVerdicts` at construction time. Insert it unescaped, exactly as the current shipped code does.
4. **Two known false-positive security hooks** may block file writes in this repo: one on the dynamic-evaluation call used by the test harnesses, one on assigning markup strings to elements. Both fire once per (file, rule) per session. When one blocks a write, retry the identical write once and it succeeds.
5. **Restyle tasks must not change engine logic.** Tasks 1–3 are CSS and DOM-structure only. If a restyle appears to require an engine change, stop and report — that's a spec gap, not something to improvise.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `range.html` | Modify (style + render DOM) | Range analyzer — full management surface. Unchanged engine. |
| `index.html` | Modify (style + render DOM) | Round analyzer. Unchanged engine. |
| `course.html` | **Create** | Mobile read-only on-course reference. Copied engine + 2 new functions. |
| `test-course-engine.js` | **Create** | Node tests for `course.html`'s engine block. |
| `README.md` | Modify | Document the course view. |

---

## Task 1: Shared stylesheet — build it once against `range.html`

**Files:**
- Modify: `range.html` (the `<style>` block, and the masthead markup)

This task establishes the visual language. Tasks 2–3 copy the resulting stylesheet verbatim, so getting it right here is what makes the rest mechanical.

- [ ] **Step 1: Replace the `:root` palette and base styles**

In `range.html`, replace the entire contents of the `<style>` element (everything between `<style>` and `</style>`) with:

```css
  :root {
    --bg:#0e2818; --surface:#0d1f14; --ink:#f2ecd8; --dim:#a8b8a0; --label:#7d9276;
    --gold:#c9a961; --good:#6ea36f; --bad:#b5654a; --line:rgba(201,169,97,.16);
    --line-strong:rgba(201,169,97,.28);
    --serif:Georgia,'Times New Roman',serif;
    --sans:-apple-system,'Segoe UI',Roboto,sans-serif;
    --mono:ui-monospace,'SF Mono',Consolas,monospace;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 var(--sans); }
  .wrap { max-width:900px; margin:0 auto; padding:22px 20px 40px; }

  /* Header */
  .masthead { display:flex; justify-content:space-between; align-items:flex-end;
              padding-bottom:16px; border-bottom:1px solid var(--line-strong); margin-bottom:22px; }
  h1 { font:400 italic 24px/1.1 var(--serif); margin:0; letter-spacing:.01em; }
  h1 span { color:var(--gold); font-style:normal; }
  .sub { color:var(--label); font-size:10.5px; text-transform:uppercase;
         letter-spacing:.09em; margin-top:5px; }
  .sub a { color:var(--gold); text-decoration:none; }
  .sub a:hover { text-decoration:underline; }

  /* Sections replace cards: hairline rules, no boxes/shadows */
  .sec { padding:20px 0; border-bottom:1px solid var(--line); }
  .sec:last-child { border-bottom:0; }
  .sec > h2 { font:600 10.5px/1 var(--sans); text-transform:uppercase; letter-spacing:.1em;
              color:var(--label); margin:0 0 14px; }

  /* Annotated notes (verdicts) */
  .note { display:flex; gap:9px; align-items:baseline; padding:7px 0; }
  .note .dot { width:6px; height:6px; border-radius:50%; flex:0 0 6px;
               position:relative; top:5px; background:var(--label); }
  .note.good .dot { background:var(--good); }
  .note.warn .dot { background:var(--gold); }
  .note.bad  .dot { background:var(--bad); }
  .note .txt { font-size:13.5px; color:var(--dim); line-height:1.5; }
  .note .txt b { color:var(--ink); font-weight:600; }

  /* Ladder rows */
  .ladder { display:flex; align-items:center; padding:10px 0; border-bottom:1px solid var(--line); }
  .ladder:last-child { border-bottom:0; }
  .ladder .nm { width:76px; flex:0 0 76px; font-size:13px; font-weight:600; color:var(--ink); }
  .ladder .track { flex:1; height:5px; border-radius:3px; margin:0 12px;
                   background:rgba(201,169,97,.12); position:relative; }
  .ladder .fill { position:absolute; left:0; top:0; height:5px; border-radius:3px; background:var(--gold); }
  .ladder .fill.good { background:var(--good); }
  .ladder .val { width:66px; flex:0 0 66px; text-align:right; font:600 17px/1 var(--mono);
                 font-variant-numeric:tabular-nums; color:var(--ink); }
  .ladder .val small { font:400 10.5px var(--sans); color:var(--label); }

  /* Two-column: main + notes rail, stacks under 720px */
  .split { display:grid; grid-template-columns:1fr 230px; gap:0 26px; }
  .split > .rail { border-left:1px solid var(--line); padding-left:22px; }
  @media (max-width:720px) {
    .split { grid-template-columns:1fr; }
    .split > .rail { border-left:0; padding-left:0; border-top:1px solid var(--line);
                     padding-top:16px; margin-top:8px; }
  }

  /* Tables */
  table { width:100%; border-collapse:collapse; font-size:12.5px; }
  th,td { padding:8px 8px; text-align:right; border-bottom:1px solid var(--line); white-space:nowrap; }
  th:first-child,td:first-child { text-align:left; }
  th { color:var(--label); font-weight:600; font-size:10px; text-transform:uppercase;
       letter-spacing:.07em; }
  td { color:var(--dim); }
  td.num, .num { font-family:var(--mono); font-variant-numeric:tabular-nums; color:var(--ink); }
  .up{color:var(--good);} .down{color:var(--bad);} .flat{color:var(--label);}

  /* Stat tiles (index.html trends) */
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:1px;
          background:var(--line); border:1px solid var(--line); }
  .stat { background:var(--bg); padding:13px 14px; }
  .stat .n { font:600 23px/1 var(--mono); font-variant-numeric:tabular-nums; color:var(--ink); }
  .stat .l { color:var(--label); font-size:10.5px; margin-top:5px; line-height:1.4; }
  .stat svg { display:block; width:100%; height:40px; margin-top:8px; }

  /* Forms */
  textarea { width:100%; min-height:104px; background:var(--surface); color:var(--ink);
             border:1px solid var(--line-strong); border-radius:4px; padding:9px;
             font:12px/1.5 var(--mono); }
  select, input[type=text], input[type=number] {
    background:var(--surface); color:var(--ink); border:1px solid var(--line-strong);
    border-radius:4px; padding:7px 8px; font:13px var(--sans);
  }
  button { background:var(--gold); color:#12231a; border:0; border-radius:4px;
           padding:8px 15px; font:700 13px var(--sans); cursor:pointer; margin:8px 8px 0 0;
           letter-spacing:.01em; }
  button:hover { filter:brightness(1.08); }
  button.ghost { background:transparent; color:var(--dim); border:1px solid var(--line-strong); }
  button.ghost:hover { color:var(--ink); border-color:var(--gold); filter:none; }
  button.danger { color:var(--bad); border-color:rgba(181,101,74,.45); }
  button.small { padding:4px 10px; font-size:11.5px; margin:0; }
  .tagrow { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:9px; }

  .foot { color:var(--label); font-size:10.5px; margin-top:26px;
          padding-top:14px; border-top:1px solid var(--line); line-height:1.6; }
  #msg { color:var(--gold); font-size:12.5px; min-height:17px; margin-top:8px; }
  details summary { cursor:pointer; color:var(--label); font-size:12px; padding:5px 0; }
  details summary:hover { color:var(--dim); }
```

- [ ] **Step 2: Update the masthead markup to match the new classes**

Replace the existing `<h1>` and `.sub` lines (immediately after `<div class="wrap">`) with:

```html
  <div class="masthead">
    <div>
      <h1>Golf Caddy <span>/ Range</span></h1>
      <div class="sub">Trend that survives mishits · <a href="index.html">Round analyzer →</a> · <a href="course.html">Course view →</a></div>
    </div>
  </div>
```

- [ ] **Step 3: Verify nothing broke functionally**

Run: `node test-range-engine.js`
Expected: `ALL PASS`. This is a CSS/markup-only change; the engine block is untouched, so any failure means something was edited that shouldn't have been.

- [ ] **Step 4: Sanity-check the one un-approved color**

Every color above came from a mockup the user reviewed and approved, with one
exception the spec calls out explicitly: `--bad:#b5654a` (muted brick-red). No
approved mockup contained a "bad"-tone verdict, so this value was chosen, not
approved.

Serve the page and force a bad-tone note into view to confirm it reads as a
warning without clashing against the green/gold palette. In the DevTools console
on `range.html`:

```js
document.getElementById('dash').insertAdjacentHTML('afterbegin',
  '<div class="sec"><div class="note bad"><span class="dot"></span><span class="txt"><b>Bad-tone sample</b> — checking this red against the palette.</span></div></div>');
```

If it looks wrong (too muddy against the green, or too alarming for the
otherwise-restrained palette), adjust `--bad` and note the new value in the
report so the spec can be updated to match. Reload to clear the injected sample.

- [ ] **Step 5: Commit**

```bash
git add range.html
git commit -m "Add new visual language stylesheet and masthead to range.html"
```

---

## Task 2: Restyle `range.html`'s rendered dashboard

**Files:**
- Modify: `range.html` (`render()` only, and the "Add a session" card markup)

Task 1 changed the stylesheet; the `render()` function still emits old `.card`/`.verdict` markup. This task rewrites that markup to use the new patterns.

- [ ] **Step 1: Convert the "Add a session" card to a section**

In the static HTML, change `<div class="card">` (the one containing the paste form — there is exactly one static `.card` in the file, currently around line 54) to `<div class="sec">`. Its `<h2>Add a session</h2>` stays as-is — the `.sec > h2` rule already styles it.

After Step 2, verify no `.card` references survive anywhere in the file:

```bash
grep -n 'class="card"' range.html
```

Expected: no output. Every other `.card` in the file lives inside `render()`'s template, which Step 2 replaces wholesale.

- [ ] **Step 2: Rewrite `render()`'s output markup**

Replace the entire body of `render()` (from `const clubSessions = load();` through its closing `}`) with:

```js
function render() {
  const clubSessions = load();
  const dash = document.getElementById('dash');
  if (!clubSessions.length) {
    dash.innerHTML = '<div class="sec"><h2>No sessions yet</h2><div class="note"><span class="dot"></span><span class="txt">Paste your Trackman club table above to get started.</span></div></div>';
    return;
  }
  const groups = groupByClub(clubSessions);
  const gaps = computeGapping(groups);
  const verdicts = computeVerdicts(groups, gaps, []);
  const prompt = coachPrompt(gaps, verdicts, groups);

  savedSessionRows = computeSavedSessionRows(groups);
  const savedRowsHtml = savedSessionRows.map((row, i) => `<tr>
    <td>${esc(row.clubName)}</td>
    <td>${esc(row.date)}</td>
    <td class="num">${row.clean}/${row.total}</td>
    <td class="num">${row.mishitRate != null ? row.mishitRate + '%' : '–'}</td>
    <td><button class="ghost danger small" onclick="doDeleteSession(${i})">Delete</button></td>
  </tr>`).join('');

  // Ladder: bar width is each club's carry relative to the longest club in the bag.
  const carries = gaps.map(g => g.cleanCarryYd).filter(v => v != null);
  const maxCarry = carries.length ? Math.max(...carries) : 0;
  const ladderHtml = gaps.map(g => {
    const pct = (g.cleanCarryYd != null && maxCarry) ? (g.cleanCarryYd / maxCarry * 100) : 0;
    const bits = [];
    if (g.sideBiasYd != null) bits.push(Math.abs(g.sideBiasYd) < 1 ? 'straight' : `${Math.round(Math.abs(g.sideBiasYd))} yds ${g.sideBiasYd >= 0 ? 'right' : 'left'}`);
    if (g.mishitRate != null) bits.push(`${Math.round(g.mishitRate * 100)}% mishit`);
    if (g.gapToNext != null) bits.push(`${Math.round(Math.abs(g.gapToNext))} yd gap`);
    return `<div class="ladder">
      <span class="nm">${esc(g.name)}${g.lowConfidence ? ' <span class="flat">⚠</span>' : ''}</span>
      <span class="track"><span class="fill${g.gapWarning ? '' : ' good'}" style="width:${pct.toFixed(1)}%"></span></span>
      <span class="val">${g.cleanCarryYd != null ? Math.round(g.cleanCarryYd) : '–'}<small> yd</small></span>
    </div>
    <div style="font-size:11px;color:var(--label);padding:0 0 8px 76px;margin-top:-6px">${esc(bits.join(' · '))}</div>`;
  }).join('');

  const notesHtml = verdicts.map(v => `<div class="note ${v.tone}"><span class="dot"></span><span class="txt">${v.text}</span></div>`).join('');

  const detailCards = groups.map(g => {
    const allShots = g.sessions.flatMap(s => s.shots);
    const rows = allShots.map(s => `<tr${s.quarantined ? ' style="opacity:.45"' : ''}>
      <td class="num">${r1(s.clubSpeed) ?? '–'}</td><td class="num">${r1(s.ballSpeed) ?? '–'}</td>
      <td class="num">${r1(s.spin) ?? '–'}</td><td class="num">${r1(s.carry) != null ? r1(s.carry * M_TO_YD) : '–'}</td>
      <td class="num">${r1(s.side) != null ? r1(Math.abs(s.side) * M_TO_YD) + (s.side >= 0 ? 'R' : 'L') : '–'}</td>
      <td>${s.quarantined ? `⚠ ${s.quarantineReason === 'bad_strike' ? 'bad strike' : 'thin flier'}` : ''}</td>
    </tr>`).join('');
    return `<details><summary>${esc(g.name)} — ${allShots.length} shots across ${g.sessions.length} session(s)</summary>
      <table style="margin-top:6px"><tr><th>Club spd</th><th>Ball spd</th><th>Spin</th><th>Carry (yd)</th><th>Side</th><th>Flag</th></tr>${rows}</table>
    </details>`;
  }).join('');

  dash.innerHTML = `
  <div class="sec">
    <div class="split">
      <div>
        <h2>The bag — driver → wedges, clean-shot median</h2>
        ${ladderHtml}
      </div>
      <div class="rail">
        <h2>Notes</h2>
        ${notesHtml}
      </div>
    </div>
  </div>
  <div class="sec"><h2>Saved sessions</h2>
    <table><tr><th>Club</th><th>Date</th><th>Clean/Total</th><th>Mishit</th><th></th></tr>
    ${savedRowsHtml}</table>
  </div>
  <div class="sec"><h2>Coach debrief — copy into Claude</h2>
    <textarea id="coach" readonly>${esc(prompt)}</textarea>
    <button onclick="navigator.clipboard.writeText(document.getElementById('coach').value).then(()=>msg('Copied.'))">Copy prompt</button>
  </div>
  <div class="sec"><h2>Per-club detail</h2>${detailCards}</div>`;
}
```

Note the deliberate unescaped insertion of `v.text` (convention #3) — that matches the pre-existing shipped behavior exactly and is not an oversight.

- [ ] **Step 3: Verify**

Run: `node test-range-engine.js`
Expected: `ALL PASS` (engine untouched).

- [ ] **Step 4: Manual browser check**

Serve the directory (`python -m http.server 8940`) and open `http://127.0.0.1:8940/range.html`. Paste the sample 7-iron table from `test-range-engine.js`'s `SAMPLE_7I` fixture (or any real Trackman table). Confirm: the ladder renders with a gold/green bar per club, notes appear in the right-hand rail, the saved-sessions delete button still works, and the coach prompt still populates. Narrow the window below 720px and confirm the notes rail stacks below the ladder instead of squashing.

- [ ] **Step 5: Commit**

```bash
git add range.html
git commit -m "Restyle range.html dashboard: ladder rows, annotated notes, hairline sections"
```

---

## Task 3: Restyle `index.html`

**Files:**
- Modify: `index.html` (`<style>` block, masthead, `render()`)

- [ ] **Step 1: Copy the stylesheet**

Replace `index.html`'s entire `<style>` block contents with the **exact same CSS** written in Task 1 Step 1. It is intentionally identical — both pages share one visual language, and the duplication matches how the engine block is already duplicated across files in this suite.

- [ ] **Step 2: Update the masthead**

Replace `index.html`'s `<h1>` and `.sub` lines with:

```html
  <div class="masthead">
    <div>
      <h1>Golf Caddy <span>/ Rounds</span></h1>
      <div class="sub">Honest trends, one focus, a coach debrief · <a href="range.html">Range analyzer →</a> · <a href="course.html">Course view →</a></div>
    </div>
  </div>
```

- [ ] **Step 3: Convert the "Add rounds" card to a section**

Change the `<div class="card">` wrapping the paste form (the file's only static `.card`, currently around line 50) to `<div class="sec">`.

After Step 4, verify no `.card` references survive:

```bash
grep -n 'class="card"' index.html
```

Expected: no output.

- [ ] **Step 4: Rewrite `render()`'s markup**

In `index.html`'s `render()`, replace the two early-return strings and the main template. The early returns become:

```js
  if (!rounds.length) { dash.innerHTML = '<div class="sec"><h2>No rounds yet</h2><div class="note"><span class="dot"></span><span class="txt">Paste your Grint table above to get started.</span></div></div>'; return; }
  const m = computeMetrics(rounds);
  if (!m.enough) { dash.innerHTML = '<div class="sec"><h2>Need at least 3 eighteen-hole rounds</h2></div>'; return; }
```

and the main template becomes:

```js
  dash.innerHTML = `
  <div class="sec"><h2>Verdicts — ${m.n} rounds${m.hcpIndex !== null ? ` · est. index ${r1(m.hcpIndex)}` : ''}</h2>
    ${m.verdicts.map(v => `<div class="note ${v.tone}"><span class="dot"></span><span class="txt">${v.text}</span></div>`).join('')}
  </div>
  <div class="sec"><h2>Trends — 18-hole rounds, oldest → newest</h2>
    <div class="grid">
      <div class="stat"><div class="n">${r1(m.last5Med)}</div><div class="l">last-5 median differential (career ${r1(m.medDiff)})</div>${spark(f.map(r => r.diff), true)}</div>
      <div class="stat"><div class="n">${r1(m.putts5) ?? '–'}</div><div class="l">putts/hole last-5 (career ${r1(m.puttsAll) ?? 'n/a'})</div>${spark(f.map(r => r.puttsPH), true)}</div>
      <div class="stat"><div class="n">${m.pve5 !== null ? '+' + r1(m.pve5 * 18) : '–'}</div><div class="l">putts vs expected /round, last-5 (career ${m.pveAll !== null ? '+' + r1(m.pveAll * 18) : 'n/a'})</div>${spark(f.filter(r => r.puttsVsExpPH !== null).map(r => r.puttsVsExpPH), true)}</div>
      <div class="stat"><div class="n">${r1(m.long5) ?? '–'}</div><div class="l">long-game strokes/hole last-5 (career ${r1(m.longAll) ?? 'n/a'})</div>${spark(f.map(r => r.longPH), true)}</div>
    </div>
    <table style="margin-top:14px"><tr><th>Last 5 vs career median</th><th>Δ</th></tr>
      <tr><td>Differential</td><td class="num">${trendCell(m.last5Med, m.medDiff, true)}</td></tr>
      <tr><td>Putts/hole</td><td class="num">${trendCell(m.putts5, m.puttsAll, true)}</td></tr>
      <tr><td>Putts vs expected (/hole)</td><td class="num">${trendCell(m.pve5, m.pveAll, true)}</td></tr>
      <tr><td>Long game strokes/hole</td><td class="num">${trendCell(m.long5, m.longAll, true)}</td></tr>
    </table>
  </div>
  <div class="sec"><h2>Coach debrief — copy into Claude</h2>
    <textarea id="coach" readonly>${esc(coachPrompt(m))}</textarea>
    <button onclick="navigator.clipboard.writeText(document.getElementById('coach').value).then(()=>msg('Copied.'))">Copy prompt</button>
  </div>
  <div class="sec"><details><summary>All rounds (${rounds.length}, incl. 9-hole)</summary>
    <table><tr><th>Date</th><th>Course</th><th>H</th><th>Score</th><th>Putts</th><th>GIR</th><th>FIR</th><th>Diff</th></tr>
    ${[...m.all].reverse().map(r => `<tr><td>${esc(r.date)}${r.suspect ? ' ⚠' : ''}</td><td>${esc(r.course)}</td><td class="num">${r.holes}</td><td class="num">${r.score}</td><td class="num">${r.putts}</td><td class="num">${r.gir !== null ? r.gir + '%' : ''}</td><td class="num">${r.fir !== null ? r.fir + '%' : ''}</td><td class="num">${r.diff}</td></tr>`).join('')}
    </table></details>
  </div>`;
```

- [ ] **Step 5: Verify**

Run: `node test-engine.js`
Expected: `ALL PASS` (engine untouched).

- [ ] **Step 6: Manual browser check**

Open `http://127.0.0.1:8940/index.html`. If no round data is stored, paste any Grint-format sample (the fixtures in `test-engine.js` work). Confirm verdicts render as annotated notes, the stat grid uses hairline separators, sparklines still draw inside the stat tiles, and the cross-links to `range.html`/`course.html` are present and correct.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "Restyle index.html to match the new suite visual language"
```

---

## Task 4: Create `course.html` — structure, engine, and the two new functions

**Files:**
- Create: `course.html`
- Create: `test-course-engine.js`

- [ ] **Step 1: Create `test-course-engine.js` with the harness and failing tests**

Mirror the first three lines of `test-range-engine.js` exactly (read that file and copy its harness preamble verbatim, changing only the filename it reads to `course.html`), then append:

```js
let fails = 0;
const chk = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; };

// C1. Engine parity — the copied block behaves like range.html's original.
chk('C1 canonicalClub works', canonicalClub('7i').name === '7-Iron' && canonicalClub('6h').name === '6-Hybrid');
chk('C1 median works', median([1,2,3]) === 2);
chk('C1 M_TO_YD present', Math.abs(M_TO_YD - 1.09361) < 1e-4);
chk('C1 quarantine/gapping pipeline works end to end', (() => {
  const sess = { date:'2026-08-22', dateAssumed:false, clubCode:'7i', club:canonicalClub('7i'), tags:{},
    shots: Array.from({length:6},()=>({clubSpeed:32,attackAngle:2,ballSpeed:42,spin:5500,carry:116,side:5})) };
  const g = computeGapping(groupByClub([sess]));
  return g.length === 1 && g[0].name === '7-Iron' && g[0].cleanCarryYd > 125 && g[0].cleanCarryYd < 128;
})());

// C2. pickReminders — non-flat tones first (bad, warn, good), flat fills remaining, cap 3.
const vs = [
  { tone:'flat', text:'flat one' }, { tone:'good', text:'good one' },
  { tone:'bad', text:'bad one' },   { tone:'warn', text:'warn one' },
  { tone:'flat', text:'flat two' },
];
const picked = pickReminders(vs);
chk('C2 caps at 3', picked.length === 3);
chk('C2 orders bad, warn, good', picked[0].text === 'bad one' && picked[1].text === 'warn one' && picked[2].text === 'good one');
chk('C2 flat fills only leftover slots', pickReminders([{tone:'flat',text:'a'},{tone:'good',text:'b'}]).map(v=>v.text).join(',') === 'b,a');
chk('C2 fewer than 3 available returns what exists', pickReminders([{tone:'warn',text:'only'}]).length === 1);
chk('C2 empty input returns empty array', pickReminders([]).length === 0);
chk('C2 does not mutate its input', (() => { const src=[{tone:'flat',text:'x'},{tone:'bad',text:'y'}]; pickReminders(src); return src[0].text === 'x'; })());

// C3. ladderRows — excludes no-data clubs, widths relative to the longest club.
const gapsFixture = [
  { name:'Driver', cleanCarryYd:240, sideBiasYd:5, mishitRate:.2 },
  { name:'7-Iron', cleanCarryYd:120, sideBiasYd:-6, mishitRate:.1 },
  { name:'SW',     cleanCarryYd:null, sideBiasYd:null, mishitRate:null },
];
const lad = ladderRows(gapsFixture);
chk('C3 drops clubs with no clean-carry data', lad.length === 2 && !lad.some(r => r.name === 'SW'));
chk('C3 longest club is 100%', lad[0].name === 'Driver' && Math.abs(lad[0].pct - 100) < .01);
chk('C3 half-distance club is 50%', Math.abs(lad[1].pct - 50) < .01);
chk('C3 carries rounded carry value', lad[0].carry === 240 && lad[1].carry === 120);
chk('C3 empty input returns empty array, no divide-by-zero', ladderRows([]).length === 0);
chk('C3 all-null input returns empty array', ladderRows([{name:'X',cleanCarryYd:null}]).length === 0);

console.log('\n' + (fails ? fails + ' FAILURES' : 'ALL PASS'));
```

If a security hook blocks this write (convention #4), retry the identical write once.

- [ ] **Step 2: Run to confirm it fails**

Run: `node test-course-engine.js`
Expected: fails with `ENOENT` — `course.html` does not exist yet.

- [ ] **Step 3: Create `course.html`**

Build the file with this exact structure:

1. `<!DOCTYPE html>` … `<head>` with `<meta charset="utf-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1">`, and `<title>Golf Caddy — Course View</title>`.
2. A `<style>` block: the Task 1 stylesheet, then the mobile-specific rules below appended.
3. `<body>` with the markup skeleton below.
4. A `<script>` containing, in order: `/*ENGINE-START*/`, **a verbatim copy of `range.html`'s entire engine block** (everything between its two markers — copy it, do not retype it), the two new functions below, `/*ENGINE-END*/`, then the UI code below.

Mobile-specific CSS to append to the copied stylesheet:

```css
  /* Course view is mobile-first: narrower wrap, bigger touch targets/numerals */
  .wrap { max-width:460px; }
  .ladder .val { font-size:22px; width:74px; flex:0 0 74px; }
  .ladder .nm { font-size:14px; }
  .subline { font-size:11.5px; color:var(--label); padding:0 0 10px 76px; margin-top:-4px;
             display:flex; justify-content:space-between; gap:10px; }
  .reminders { border:1px solid var(--line-strong); border-radius:6px; padding:12px 14px;
               margin-bottom:20px; }
  .reminders h2 { color:var(--gold); margin:0 0 8px; font:600 10.5px/1 var(--sans);
                  text-transform:uppercase; letter-spacing:.1em; }
  .empty { color:var(--dim); font-size:13.5px; line-height:1.6; }
```

Body markup:

```html
<div class="wrap">
  <div class="masthead">
    <div>
      <h1>Golf Caddy <span>/ Course</span></h1>
      <div class="sub" id="updated">On-course reference</div>
    </div>
  </div>
  <div id="view"></div>
  <div class="foot">
    Read-only. Distances are clean-shot medians after mishit quarantine.
    <a href="#" onclick="document.getElementById('imp').click();return false" style="color:var(--gold)">Refresh data (import)</a>
    · <a href="range.html" style="color:var(--gold)">Full analyzer →</a>
    <input type="file" id="imp" style="display:none" onchange="doImport(event)">
    <div id="msg"></div>
  </div>
</div>
```

The two new engine functions (after the copied engine code, before `/*ENGINE-END*/`):

```js
// ── Course-view helpers ───────────────────────────────────────────────────────
// Up to 3 verdicts for the on-course reminder box. Non-flat tones rank first
// (a real problem or a real positive signal outranks a routine data-quality
// note), then flat fills any remaining slots. Never mutates the input array.
var REMINDER_CAP = 3;
function pickReminders(verdicts) {
  const rank = { bad: 0, warn: 1, good: 2 };
  const ranked = (verdicts || []).filter(v => v && rank[v.tone] !== undefined)
    .slice().sort((a, b) => rank[a.tone] - rank[b.tone]);
  const flat = (verdicts || []).filter(v => v && rank[v.tone] === undefined);
  return ranked.concat(flat).slice(0, REMINDER_CAP);
}

// Ladder rows for the bag: each club's bar width is its carry relative to the
// longest club that has data. Clubs with no clean-shot carry are dropped
// entirely — a course reference has no use for a "no data" row — and are
// excluded from the max, so they can't skew the scale.
function ladderRows(gaps) {
  const usable = (gaps || []).filter(g => g && g.cleanCarryYd != null);
  if (!usable.length) return [];
  const maxCarry = Math.max(...usable.map(g => g.cleanCarryYd));
  return usable.map(g => ({
    name: g.name,
    carry: Math.round(g.cleanCarryYd),
    pct: maxCarry ? (g.cleanCarryYd / maxCarry * 100) : 0,
    sideBiasYd: g.sideBiasYd,
    mishitRate: g.mishitRate,
  }));
}
```

UI code (after `/*ENGINE-END*/`):

```js
// ── UI ───────────────────────────────────────────────────────────────────────
// Same storage key as range.html: if this page is opened in the same browser
// that entered the data, it just works. Cross-device (paste on laptop, read on
// phone) goes through the import link, which merges rather than replaces.
const LS = 'golfcaddy_range';
const load = () => { try { return JSON.parse(localStorage.getItem(LS)) || []; } catch (e) { return []; } };
const save = cs => localStorage.setItem(LS, JSON.stringify(cs));
function msg(t) { document.getElementById('msg').textContent = t; }

function render() {
  const clubSessions = load();
  const view = document.getElementById('view');
  if (!clubSessions.length) {
    view.innerHTML = '<div class="sec"><h2>No data on this device</h2><div class="empty">Export your range data from the analyzer on your computer, get the file onto this phone, then tap <b>Refresh data (import)</b> below.</div></div>';
    return;
  }
  const groups = groupByClub(clubSessions);
  const gaps = computeGapping(groups);
  const verdicts = computeVerdicts(groups, gaps, []);
  const reminders = pickReminders(verdicts);
  const rows = ladderRows(gaps);

  const lastSeen = gaps.map(g => g.lastSeen).filter(Boolean).sort().pop();
  document.getElementById('updated').textContent = lastSeen ? `Updated ${lastSeen}` : 'On-course reference';

  const remindersHtml = reminders.length ? `<div class="reminders">
    <h2>Today's reminders</h2>
    ${reminders.map(v => `<div class="note ${v.tone}"><span class="dot"></span><span class="txt">${v.text}</span></div>`).join('')}
  </div>` : '';

  const bagHtml = rows.length ? rows.map(r => {
    const side = r.sideBiasYd == null ? ''
      : (Math.abs(r.sideBiasYd) < 1 ? 'Straight, on average'
        : `${Math.round(Math.abs(r.sideBiasYd))} yds ${r.sideBiasYd >= 0 ? 'right' : 'left'}, on average`);
    const mishit = r.mishitRate == null ? '' : `${Math.round(r.mishitRate * 100)}% mishit`;
    return `<div class="ladder">
      <span class="nm">${esc(r.name)}</span>
      <span class="track"><span class="fill" style="width:${r.pct.toFixed(1)}%"></span></span>
      <span class="val">${r.carry}<small> yd</small></span>
    </div>
    <div class="subline"><span>${esc(side)}</span><span>${esc(mishit)}</span></div>`;
  }).join('') : '<div class="empty">No clubs with clean-shot data yet.</div>';

  view.innerHTML = `${remindersHtml}<div class="sec"><h2>Your bag</h2>${bagHtml}</div>`;
}

// Import: identical validation to range.html's doImport — this is the hardened
// version that took three code-review rounds (malformed JSON silently failing,
// then shots:[null] persisting and permanently breaking render, then
// non-numeric shot fields crashing shotKey on the NEXT merge). Do not simplify.
function doImport(ev) {
  const f = ev.target.files[0]; if (!f) return;
  f.text().then(t => {
    let parsed;
    try {
      parsed = JSON.parse(t);
      if (!Array.isArray(parsed)) throw new Error('not an array');
      parsed.forEach(cs => {
        if (!cs || typeof cs.date !== 'string' || !cs.club || typeof cs.club.name !== 'string' || typeof cs.club.order !== 'number' || !Array.isArray(cs.shots)) {
          throw new Error('malformed club-session');
        }
        const NUM_FIELDS = ['clubSpeed', 'attackAngle', 'ballSpeed', 'spin', 'launch', 'carry', 'total', 'side', 'height', 'smash'];
        if (!cs.shots.every(s => s && typeof s === 'object' && NUM_FIELDS.every(k => s[k] == null || typeof s[k] === 'number'))) {
          throw new Error('malformed shot');
        }
      });
    } catch (e) {
      msg('Import failed — that file doesn\'t look like a valid golf-range export.');
      return;
    }
    try {
      const { all, addedShots } = mergeClubSessions(load(), parsed);
      save(all);
      msg(`Imported ${addedShots} new shots.`);
      render();
    } catch (e) {
      console.error(e);
      msg('Import failed unexpectedly after the file was read — please report this.');
    }
  }).catch(() => msg('Import failed — could not read the file.'));
}

render();
```

- [ ] **Step 4: Run the tests**

Run: `node test-course-engine.js`
Expected: `ALL PASS`. If C1 (engine parity) fails, the engine block was not copied verbatim — re-copy it rather than patching the difference.

- [ ] **Step 5: Commit**

```bash
git add course.html test-course-engine.js
git commit -m "Add course.html: mobile read-only on-course reference with reminder/ladder helpers"
```

---

## Task 5: Verify `course.html` in a real browser

**Files:**
- Modify: `course.html` (only if the smoke test finds a bug)

- [ ] **Step 1: Serve and load with existing data**

Start a server (`python -m http.server 8940`), open `http://127.0.0.1:8940/range.html`, paste a Trackman sample so localStorage has data, then open `http://127.0.0.1:8940/course.html`.

Expected: reminders box (if any verdicts exist), the bag ladder with one row per club that has clean-shot data, each row showing carry plus a side-bias/mishit subline, and the header showing "Updated <most recent date>".

- [ ] **Step 2: Verify the empty state**

In the DevTools console: `localStorage.removeItem('golfcaddy_range'); location.reload();`
Expected: the "No data on this device" message with import instructions — not a crash, not a blank page.

- [ ] **Step 3: Verify import**

Export JSON from `range.html`, then on `course.html` (with storage cleared) use "Refresh data (import)" to load that file.
Expected: `Imported N new shots.` and the bag renders. Import the *same* file again — expected: `Imported 0 new shots.` (merge is idempotent).

- [ ] **Step 4: Verify import rejects malformed data**

In the DevTools console on `course.html`:

```js
doImport({ target: { files: [new File(['[{"date":"x","club":{"name":"7i"},"shots":[null]}]'], 'bad.json')] } });
```

Expected after a moment: the "doesn't look like a valid golf-range export" message, and `localStorage.getItem('golfcaddy_range')` unchanged — nothing persisted.

- [ ] **Step 5: Verify mobile width**

Resize to ~375px wide (or use DevTools device emulation).
Expected: no horizontal scrolling, numerals remain large and legible, the subline sits under each club without awkward wrapping.

- [ ] **Step 6: Commit (only if a fix was needed)**

```bash
git add course.html
git commit -m "Fix course.html issue found in manual smoke test"
```

If no fix was needed, skip this commit — there is nothing to commit.

---

## Task 6: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a course-view section**

Append after the existing "Range analyzer (Trackman)" section:

```markdown

## Course view (phone)

`course.html` is a third page: a read-only, mobile-first reference for when you're
actually on the course. It shows your top few reminders and the whole bag as a
yardage ladder — carry, typical miss direction, and mishit rate per club — and
nothing else. No paste form, no editing.

It reads the same browser storage as `range.html`, so on the same device it just
works. To get data from the computer you paste on to the phone you carry: hit
**Export JSON** in `range.html`, move that file to your phone however you like
(AirDrop, email, a cloud-drive folder), then tap **Refresh data (import)** on
`course.html`. Importing merges rather than replaces, so re-importing after a new
range session is safe.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Document the course view in the README"
```

---

## Final check

- [ ] `node test-engine.js && node test-range-engine.js && node test-course-engine.js` — all three print `ALL PASS`.
- [ ] All three pages load in a browser and the cross-links between them work in every direction.
- [ ] `range.html` and `index.html` read as the same product; `course.html` reads as the same product at phone width.
- [ ] `git log --oneline -10` shows one descriptive commit per task.
