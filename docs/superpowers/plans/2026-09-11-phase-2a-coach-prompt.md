# Phase 2a — Coach Prompt Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four-persona "debrief as a conversation" prompt on both analyzers with a structured, confound-aware analyst prompt that reports sample size and dispersion, refuses to manufacture findings, and ends with one measurable priority.

**Architecture:** Three engine additions (carry/side dispersion on gapping rows, a confounds builder per page, a rewritten `coachPrompt`) plus mirrored copies into `course.html`, whose shared engine block must stay byte-identical to `range.html`'s.

**Tech Stack:** Vanilla JS, no dependencies. Node for the three test harnesses.

**Spec:** `docs/superpowers/specs/2026-09-11-analysis-platform-design.md` (Phase 2)

---

## Why this exists

The current prompt asks four named golfers to disagree with each other and produce a conversational debrief. It has four concrete defects:

1. **Manufactured conflict.** Instructing personas to "disagree where your philosophies differ" invites disagreement invented for narrative reasons rather than found in data.
2. **No basis for separating signal from noise.** It sends medians with no sample size and no spread, so the model cannot tell a real move from normal variation across 6–12 shots.
3. **No confound handling.** The user's last five rounds span a seven-week layoff across three courses at a higher average slope than career. None of that reaches the prompt, so a nine-stroke "improvement" reads as pure skill gain.
4. **No continuity.** Every debrief starts cold, so nothing is ever checked against what was recommended last time.

Phase 2b adds the recommendations store that feeds the continuity check. Until then the continuity section renders `none on record` and degrades cleanly.

---

## Critical conventions

1. **`var`, not `const`, for engine bindings referenced by bare name in tests.** The harness extracts the `/*ENGINE-START*/`–`/*ENGINE-END*/` block and evals it; only `var`/`function` declarations leak to the caller's scope. Function declarations are fine.
2. **`course.html`'s shared engine block must stay byte-identical to `range.html`'s.** It carries its own copy of `computeGapping` and `coachPrompt`. Every engine edit in `range.html` is mirrored verbatim. Verify with the parity command in Task 6.
3. **Escape dynamic strings reaching innerHTML via `esc()`.** Verdict `.text` is the deliberate exception — engine-generated, already escaped internally, contains intentional `<b>` tags.
4. **The prompt is plain text, not HTML.** Strip `<b>` tags when folding verdict text into it, exactly as the current code does with `.replace(/<\/?b>/g, '')`.
5. **Two known false-positive security hooks** may block a write once per (file, rule) per session. Retry the identical write once.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `range.html` | Modify | Dispersion on gapping rows, range confounds, rewritten range prompt |
| `index.html` | Modify | Round confounds, rewritten rounds prompt |
| `course.html` | Modify | Mirror the shared-engine edits verbatim |
| `test-range-engine.js` | Modify | Dispersion, confounds, prompt-shape assertions |
| `test-engine.js` | Modify | Round confounds, prompt-shape assertions |
| `test-course-engine.js` | Modify | Parity assertions for the mirrored changes |

---

## Task 1: Carry and side dispersion on gapping rows

The prompt currently sends a median per club and nothing about spread. A 7-iron with every shot inside four yards and one scattered across thirty have identical medians. Dispersion is what separates "my distances moved" from "I struck it inconsistently" — which is exactly the read the user made unaided about their 8-iron/9-iron overlap.

**Files:**
- Modify: `range.html` (`computeGapping`)
- Test: `test-range-engine.js`

- [ ] **Step 1: Write the failing tests**

Append to `test-range-engine.js`, immediately before the final `console.log`:

```js
// T43. Dispersion per club. A median alone cannot distinguish a tight club
// from a scattered one, and the prompt needs that distinction to tell a real
// distance change from inconsistent striking.
const dispShots = carries => carries.map(c => ({
  clubSpeed: 33, attackAngle: 2, ballSpeed: 43, spin: 5400,
  carry: c / M_TO_YD, side: 0,
}));
const dispSess = carries => ({
  date: '2026-09-01', dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'),
  source: 'trackman', tags: {}, shots: dispShots(carries),
});

chk('T43 carryIqrYd is the p75-p25 spread in yards', (() => {
  // 10 clean carries 100..145; p25 = 110, p75 = 135, IQR = 25.
  const g = computeGapping(groupByClub([dispSess([100,105,110,115,120,125,130,135,140,145])]))[0];
  return Math.abs(g.carryIqrYd - 25) < 0.5;
})());
chk('T43 a tight club reports a small IQR', (() => {
  const g = computeGapping(groupByClub([dispSess([118,119,120,120,121,122,120,119])]))[0];
  return g.carryIqrYd < 3;
})());
chk('T43 a scattered club reports a large IQR', (() => {
  const g = computeGapping(groupByClub([dispSess([95,140,105,135,100,145,110,130])]))[0];
  return g.carryIqrYd > 25;
})());
chk('T43 IQR is null below 4 clean shots, where it is meaningless', (() => {
  const g = computeGapping(groupByClub([dispSess([118,120,122])]))[0];
  return g.carryIqrYd === null;
})());
chk('T43 sideIqrYd reports left-right scatter independently of mean bias', (() => {
  // Mean side bias is 0 but the scatter is wide: the club is not "straight".
  const sess = {
    date: '2026-09-01', dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'),
    source: 'trackman', tags: {},
    shots: [-20,-15,-10,10,15,20,-18,18].map(s => ({
      clubSpeed: 33, attackAngle: 2, ballSpeed: 43, spin: 5400,
      carry: 120 / M_TO_YD, side: s / M_TO_YD,
    })),
  };
  const g = computeGapping(groupByClub([sess]))[0];
  return Math.abs(g.sideBiasYd) < 1 && g.sideIqrYd > 25;
})());
chk('T43 dispersion ignores quarantined shots', (() => {
  const sess = dispSess([118,119,120,121,122,120,119,120]);
  sess.shots.push({ clubSpeed: 33, attackAngle: 2, ballSpeed: 20, spin: 5400, carry: 20 / M_TO_YD, side: 0 });
  const g = computeGapping(groupByClub([sess]))[0];
  return g.carryIqrYd < 3;  // the duff is quarantined, so it cannot widen the IQR
})());
```

- [ ] **Step 2: Run to confirm failure**

Run: `node test-range-engine.js`
Expected: the `T43` checks fail — `carryIqrYd` and `sideIqrYd` are `undefined`.

- [ ] **Step 3: Compute dispersion in `computeGapping`**

In `range.html`, inside `computeGapping`'s `groups.map(...)` callback, find:

```js
    const medCarry = median(carries);
```

and insert immediately after it:

```js
    // Interquartile spread, not standard deviation: the shot population is
    // small and skewed by near-mishits that survive quarantine, and an IQR is
    // not dragged around by one outlier the way an SD is. Null below 4 clean
    // shots, where quartiles interpolate between too few points to mean
    // anything. sideIqr is reported separately from sideBias because a club
    // can average dead straight while scattering badly in both directions —
    // that is a consistency problem, not an aim problem, and the two call for
    // different practice.
    const iqr = vals => {
      if (vals.length < 4) return null;
      const sorted = [...vals].sort((a, b) => a - b);
      return quantile(sorted, 0.75) - quantile(sorted, 0.25);
    };
    const carryIqr = iqr(carries);
    const sideIqr = iqr(sides);
```

Then, in the returned object, find:

```js
      n: clean.length, totalN: allShots.length,
```

and insert immediately before it:

```js
      carryIqrYd: carryIqr != null ? carryIqr * M_TO_YD : null,
      sideIqrYd: sideIqr != null ? sideIqr * M_TO_YD : null,
```

- [ ] **Step 4: Run the tests**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Report carry and side dispersion per club alongside the median"
```

---

## Task 2: Range confounds builder

**Files:**
- Modify: `range.html` (new `rangeConfounds` function)
- Test: `test-range-engine.js`

- [ ] **Step 1: Write the failing tests**

Append to `test-range-engine.js` before the final `console.log`:

```js
// T44. Confounds are computed and handed to the model rather than left for it
// to infer. Each is a plain sentence; the prompt embeds them verbatim.
chk('T44 names the measurement source and warns against cross-instrument reads', (() => {
  const c = rangeConfounds(computeGapping(groupByClub([dispSess([118,120,122,120,119,121])])), 'toptracer');
  return c.some(x => /toptracer/i.test(x)) && c.some(x => /instrument|Trackman/i.test(x));
})());
chk('T44 flags clubs with too few clean shots to trust', (() => {
  const c = rangeConfounds(computeGapping(groupByClub([dispSess([118,120,122])])), 'trackman');
  return c.some(x => /fewer than 5 clean shots|7-Iron/i.test(x));
})());
chk('T44 flags clubs seen in only one session as having no trend', (() => {
  const c = rangeConfounds(computeGapping(groupByClub([dispSess([118,120,122,120,119,121])])), 'trackman');
  return c.some(x => /one session/i.test(x));
})());
chk('T44 returns an array of plain strings with no HTML', (() => {
  const c = rangeConfounds(computeGapping(groupByClub([dispSess([118,120,122,120,119,121])])), 'trackman');
  return Array.isArray(c) && c.every(x => typeof x === 'string' && !/[<>]/.test(x));
})());
chk('T44 tolerates empty gapping without throwing', Array.isArray(rangeConfounds([], null)));
```

- [ ] **Step 2: Run to confirm failure**

Run: `node test-range-engine.js`
Expected: fails — `rangeConfounds is not defined`.

- [ ] **Step 3: Implement `rangeConfounds`**

In `range.html`, immediately above `function coachPrompt(`, insert:

```js
// Conditions that could explain a number without any change in the swing.
// Computed here rather than left to the model to infer, because the model
// cannot see what is absent from the data it was handed — a club backed by
// three shots and one backed by forty look identical once both are reduced to
// a median.
function rangeConfounds(gaps, sourceName) {
  const out = [];
  const rows = gaps || [];
  if (sourceName) {
    out.push(`Every number below is from ${sourceName} only. Launch monitors disagree substantially on the same swing — measured on this bag, Toptracer reads 15 to 26 yards longer than Trackman on mid and long clubs — so do not compare these against figures from another instrument.`);
  }
  const thin = rows.filter(g => g.n != null && g.n > 0 && g.n < 5).map(g => g.name);
  if (thin.length) {
    out.push(`Backed by fewer than 5 clean shots, so their medians are provisional: ${thin.join(', ')}.`);
  }
  const single = rows.filter(g => g.sessionCount === 1).map(g => g.name);
  if (single.length) {
    out.push(`Seen in only one session, so no trend exists for them yet and any change you infer is unsupported: ${single.join(', ')}.`);
  }
  const dates = rows.map(g => g.lastSeen).filter(Boolean).sort();
  if (dates.length && dates[0] !== dates[dates.length - 1]) {
    out.push(`Sessions in this data span ${dates[0]} to ${dates[dates.length - 1]}; clubs last hit at different times are not directly comparable.`);
  }
  return out;
}
```

- [ ] **Step 4: Run the tests**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Compute range confounds instead of leaving them for the model to infer"
```

---

## Task 3: Rewrite `range.html`'s coach prompt

**Files:**
- Modify: `range.html` (`coachPrompt`, and its call site in `render()`)
- Test: `test-range-engine.js`

- [ ] **Step 1: Write the failing tests**

Append to `test-range-engine.js` before the final `console.log`:

```js
// T45. The rewritten range prompt. Asserts shape, not prose: the personas are
// gone, every section is present, and the honesty rules survive edits.
const promptFixture = (() => {
  const sess = n => ({
    date: n, dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'),
    source: 'toptracer', tags: {},
    shots: Array.from({ length: 8 }, (_, i) => ({
      clubSpeed: 33, attackAngle: 2, ballSpeed: 43, spin: 5400,
      carry: (120 + i * 0.5) / M_TO_YD, side: 2 / M_TO_YD,
    })),
  });
  const sessions = ['2026-08-01','2026-08-08','2026-08-15','2026-09-01','2026-09-08'].map(sess);
  const groups = groupByClub(sessions);
  const gaps = computeGapping(groups);
  return { gaps, groups, verdicts: computeVerdicts(groups, gaps, []) };
})();
const P45 = coachPrompt(promptFixture.gaps, promptFixture.verdicts, promptFixture.groups, 'toptracer');

chk('T45 no personas remain', !/FALDO|BRYSON|FAXON|PHIL/i.test(P45));
chk('T45 no conversational-debrief framing remains', !/conversation between|disagree where/i.test(P45));
chk('T45 all five sections present', ['CONTINUITY CHECK','WHAT IS REAL','CONSISTENCY','GAPPING','ONE PRIORITY']
  .every(h => P45.includes(h)));
chk('T45 carries the honesty rules', /could plausibly be normal variation/i.test(P45) && /not enough data/i.test(P45));
chk('T45 forbids manufacturing a finding', /do not invent|not manufacture|nothing significant/i.test(P45));
chk('T45 demands a numeric success criterion', /numeric success criterion/i.test(P45));
chk('T45 states the measurement source', /toptracer/i.test(P45));
chk('T45 includes a confounds block', /CONFOUNDS/.test(P45));
chk('T45 reports sample size and spread per club', /clean of/i.test(P45) && /spread/i.test(P45));
chk('T45 continuity degrades to none on record with no prior recommendation', /none on record/i.test(P45));
chk('T45 echoes a prior recommendation when one is supplied', (() => {
  const prior = { date: '2026-09-01', priority: 'Ten 7-irons at 80% tempo', criterion: '8 of 10 within 5 yards of median' };
  const p = coachPrompt(promptFixture.gaps, promptFixture.verdicts, promptFixture.groups, 'toptracer', prior);
  return p.includes('Ten 7-irons at 80% tempo') && p.includes('8 of 10 within 5 yards of median');
})());
chk('T45 no leftover HTML tags', !/<\/?b>/.test(P45));
```

- [ ] **Step 2: Run to confirm failure**

Run: `node test-range-engine.js`
Expected: the `T45` checks fail — the personas are still present and the sections do not exist.

- [ ] **Step 3: Replace `coachPrompt`'s returned template**

In `range.html`, leave the `objectiveLines` construction at the top of `coachPrompt` in place but change the signature and the per-club fact line to carry dispersion, then replace the returned template.

Change the signature from:

```js
function coachPrompt(gaps, verdicts, groups) {
```

to:

```js
// lastRec is Phase 2b's recommendations store; until that lands every caller
// passes nothing and the continuity section renders "none on record" rather
// than being omitted, so the model still reports on it and the absence is
// visible instead of silently skipped.
function coachPrompt(gaps, verdicts, groups, sourceName, lastRec) {
```

Then find the `facts` template inside `objectiveLines` and replace it with:

```js
    const facts = `${g.name}: ${g.cleanCarryYd != null ? r1(g.cleanCarryYd) + ' yds median' : 'no clean-shot data'} ` +
      `(${g.n} clean of ${g.totalN}, mishit ${g.mishitRate != null ? Math.round(g.mishitRate * 100) + '%' : 'n/a'}` +
      `${g.carryIqrYd != null ? `, carry spread ${r1(g.carryIqrYd)} yds` : ''}` +
      `${g.sideBiasYd != null ? `, bias ${r1(Math.abs(g.sideBiasYd))}${g.sideBiasYd >= 0 ? 'R' : 'L'}` : ''}` +
      `${g.sideIqrYd != null ? `, side spread ${r1(g.sideIqrYd)} yds` : ''})` +
      `${g.gapToNext != null ? `, gap to next ${r1(g.gapToNext)} yds${gapLabel(g.gapToNext) ? ` [${gapLabel(g.gapToNext)}]` : ''}` : ''}` +
      `, last hit ${g.lastSeen}`;
```

Then replace the entire `return \`You are my team of four golf coaches...\`;` statement with:

```js
  const confounds = rangeConfounds(gaps, sourceName);
  const priorLine = lastRec
    ? `${lastRec.priority} (success criterion: ${lastRec.criterion}, set ${lastRec.date})`
    : 'none on record';

  return `You are my golf performance analyst. Give me one clear, prioritized read of my ball-striking. No personas, no debate format, no conversation. Ground every claim in the specific numbers below, and do not offer generic golf advice that is not tied to something in this data.

I am still learning golf terminology — define any term that is not obvious the first time you use it.

BEFORE YOU ANALYZE — rules about being honest with this data:
- Sample sizes are small. Where a difference could plausibly be normal variation between sessions, say so instead of building a story on it. A handful of shots per club is not enough to establish a trend.
- Read the CONFOUNDS block and factor it in. If a confound explains a number, say that rather than crediting or blaming my swing.
- Spread matters as much as the median. A club whose carry spread is wide is a consistency problem, not a distance problem, and the two call for different practice.
- If a section below is not supported by the data, write "not enough data" for that section. Do not invent a finding so that every section has content, and if nothing in this data is significant, say that plainly.

Structure your response exactly as:

1. CONTINUITY CHECK — My last priority was: ${priorLine}. Did I meet it? Answer met, not met, or not enough data, and say which numbers show it.
2. WHAT IS REAL — What in the recent trend is a genuine change, and what is noise? Say how confident you are and why.
3. CONSISTENCY — What do the mishit rates and the carry and side spreads say about strike quality? Name the least consistent clubs.
4. GAPPING — Any real problems in the distance ladder: overlapping clubs, gaps too wide to cover, or a club that is not earning its place in the bag.
5. ONE PRIORITY — One specific drill for my next range session, with a numeric success criterion I can check (for example "8 of 10 inside a 6-yard window"). Tie it to the single biggest thing above. If the biggest problem is ambiguous, pick the drill that would diagnose it rather than guessing at a fix.

MEASUREMENT SOURCE: ${sourceName || 'unknown'}

PER-CLUB DATA (facts only — read before forming any opinion):
${objectiveLines || '(no clean-shot data yet)'}

RECENT SIGNALS:
${verdicts.map(v => '- ' + v.text.replace(/<\/?b>/g, '')).join('\n') || '- (none)'}

CONFOUNDS IN THIS SAMPLE:
${confounds.length ? confounds.map(c => '- ' + c).join('\n') : '- (none identified)'}`;
}
```

- [ ] **Step 4: Pass the source at the call site**

In `render()`, find:

```js
  const prompt = coachPrompt(gaps, verdicts, groups);
```

and replace with:

```js
  const prompt = coachPrompt(gaps, verdicts, groups, chosen);
```

`chosen` is the single selected source already computed earlier in `render()`.

- [ ] **Step 5: Run the tests**

Run: `node test-range-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 6: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Rewrite the range coach prompt as a structured analyst brief"
```

---

## Task 4: Round confounds builder

**Files:**
- Modify: `index.html` (new `roundConfounds` function)
- Test: `test-engine.js`

- [ ] **Step 1: Write the failing tests**

Append to `test-engine.js` before the final `console.log`:

```js
// A10. Round confounds. The real sample that motivated this: five rounds
// spanning a seven-week layoff across three courses at a higher average slope
// than career, presented to the model as a clean nine-stroke improvement.
const mkR = (date, course, slope, score, putts, gir, fir, holes) => ({
  date, course, rating: 68.2, slope, score, holes: holes || 18, putts,
  gir, fir, diff: Math.round((score - 68.2) * 113 / slope * 10) / 10,
});

chk('A10 flags a long layoff inside the comparison window', (() => {
  const rounds = [
    mkR('2026-07-05','A',123,111,47,17,77), mkR('2026-07-08','A',123,102,38,null,62),
    mkR('2026-07-10','A',123,104,46,17,54), mkR('2026-07-19','B',123,98,38,11,46),
    mkR('2026-09-05','C',129,99,44,17,62),
  ];
  return roundConfounds(computeMetrics(rounds)).some(x => /gap|layoff|weeks/i.test(x));
})());
chk('A10 flags a course-difficulty shift', (() => {
  const rounds = [
    mkR('2026-01-01','A',110,105,44,12,60), mkR('2026-01-08','A',110,104,44,12,60),
    mkR('2026-01-15','A',110,103,44,12,60), mkR('2026-01-22','A',110,106,44,12,60),
    mkR('2026-02-01','H',140,102,43,13,61), mkR('2026-02-08','H',140,101,43,13,61),
    mkR('2026-02-15','H',140,100,43,13,61), mkR('2026-02-22','H',140,102,43,13,61),
    mkR('2026-03-01','H',140,99,42,14,62),
  ];
  return roundConfounds(computeMetrics(rounds)).some(x => /slope|course/i.test(x));
})());
chk('A10 flags rounds missing a component field', (() => {
  const rounds = [
    mkR('2026-07-05','A',123,111,47,17,77), mkR('2026-07-08','A',123,102,38,null,62),
    mkR('2026-07-10','A',123,104,46,17,54), mkR('2026-07-19','B',123,98,38,11,46),
    mkR('2026-08-05','C',123,99,44,17,62),
  ];
  return roundConfounds(computeMetrics(rounds)).some(x => /GIR|missing/i.test(x));
})());
chk('A10 states the sample size', (() => {
  const rounds = [
    mkR('2026-07-05','A',123,111,47,17,77), mkR('2026-07-08','A',123,102,38,12,62),
    mkR('2026-07-10','A',123,104,46,17,54), mkR('2026-07-19','B',123,98,38,11,46),
    mkR('2026-08-05','C',123,99,44,17,62),
  ];
  return roundConfounds(computeMetrics(rounds)).some(x => /last-5|5 rounds|sample/i.test(x));
})());
chk('A10 returns plain strings with no HTML', (() => {
  const rounds = [
    mkR('2026-07-05','A',123,111,47,17,77), mkR('2026-07-08','A',123,102,38,12,62),
    mkR('2026-07-10','A',123,104,46,17,54), mkR('2026-07-19','B',123,98,38,11,46),
    mkR('2026-08-05','C',123,99,44,17,62),
  ];
  const c = roundConfounds(computeMetrics(rounds));
  return Array.isArray(c) && c.every(x => typeof x === 'string' && !/[<>]/.test(x));
})());
```

- [ ] **Step 2: Run to confirm failure**

Run: `node test-engine.js`
Expected: fails — `roundConfounds is not defined`.

- [ ] **Step 3: Implement `roundConfounds`**

In `index.html`, immediately above `function coachPrompt(`, insert:

```js
// Conditions that could explain a differential move without any change in
// skill. The course-mix check reuses slope5/slopeAll, which already drives an
// on-page caveat verdict above a 6-point gap; here the threshold is lower and
// the number is always stated, because the model needs the magnitude even
// when it is not large enough to be worth interrupting the user about.
function roundConfounds(m) {
  const out = [];
  const l5 = (m.full || []).slice(-5);
  out.push(`All "last-5" comparisons below rest on ${l5.length} round(s) against a career corpus of ${m.n}. Five rounds is a small sample for any claim about a trend.`);

  const dates = l5.map(r => r.date).filter(Boolean).sort();
  let maxGap = 0, gapFrom = null, gapTo = null;
  for (let i = 1; i < dates.length; i++) {
    const days = Math.round((new Date(dates[i]) - new Date(dates[i - 1])) / 86400000);
    if (days > maxGap) { maxGap = days; gapFrom = dates[i - 1]; gapTo = dates[i]; }
  }
  if (maxGap >= 21) {
    out.push(`These rounds are not consecutive play: there is a ${Math.round(maxGap / 7)}-week gap between ${gapFrom} and ${gapTo}. Rounds either side of a layoff are not directly comparable.`);
  }

  if (m.slope5 != null && m.slopeAll != null && Math.abs(m.slope5 - m.slopeAll) >= 3) {
    const harder = m.slope5 > m.slopeAll;
    out.push(`My last 5 rounds averaged slope ${Math.round(m.slope5)} against a career average of ${Math.round(m.slopeAll)} — ${harder ? 'harder' : 'easier'} courses than usual. The differential adjusts for this, but raw putts, GIR and FIR trends do not.`);
  }

  const courses = [...new Set(l5.map(r => r.course).filter(Boolean))];
  if (courses.length > 1) {
    out.push(`Those 5 rounds span ${courses.length} different courses, so raw per-round stats partly reflect where I played.`);
  }

  const missing = [];
  if (l5.some(r => r.gir == null)) missing.push('GIR');
  if (l5.some(r => r.fir == null)) missing.push('FIR');
  if (l5.some(r => r.putts == null)) missing.push('putts');
  if (missing.length) {
    out.push(`At least one of the last 5 rounds is missing ${missing.join(' / ')}, so any average over that window is computed from fewer than 5 rounds.`);
  }

  const partial = (m.all || []).filter(r => r.holes !== 18 && r.holes >= 9).length;
  if (partial) {
    out.push(`${partial} round(s) in the component stats were not full 18s. Their per-hole rates are valid and included; their differentials are not, and are excluded.`);
  }
  return out;
}
```

- [ ] **Step 4: Run the tests**

Run: `node test-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add index.html test-engine.js
git commit -m "Compute round confounds for the coach prompt"
```

---

## Task 5: Rewrite `index.html`'s coach prompt

**Files:**
- Modify: `index.html` (`coachPrompt`)
- Test: `test-engine.js`

- [ ] **Step 1: Write the failing tests**

Append to `test-engine.js` before the final `console.log`:

```js
// A11. The rewritten rounds prompt, structured to the contract the user
// approved: continuity, trend, improving, not improving, biggest leak, one
// priority — with an explicit instruction not to guess which skill a fused
// metric implicates.
const A11rounds = [
  mkR('2026-07-05','A',123,111,47,17,77), mkR('2026-07-08','A',123,102,38,12,62),
  mkR('2026-07-10','A',123,104,46,17,54), mkR('2026-07-19','B',123,98,38,11,46),
  mkR('2026-09-05','C',129,99,44,17,62),
];
const A11m = computeMetrics(A11rounds);
const PA11 = coachPrompt(A11m);

chk('A11 no personas remain', !/FALDO|BRYSON|FAXON|PHIL/i.test(PA11));
chk('A11 no conversational-debrief framing remains', !/conversation between|disagree where/i.test(PA11));
chk('A11 all six sections present', ['CONTINUITY CHECK','TREND CHECK','WHAT IS IMPROVING','WHAT IS NOT IMPROVING','BIGGEST LEAK','ONE PRIORITY']
  .every(h => PA11.includes(h)));
chk('A11 carries the honesty rules', /could plausibly be normal variation/i.test(PA11) && /not enough data/i.test(PA11));
chk('A11 instructs that a fused metric must not be guessed apart', /fuses two|two different skills/i.test(PA11));
chk('A11 demands a numeric success criterion', /numeric success criterion/i.test(PA11));
chk('A11 asks for plain-language definitions', /define any term/i.test(PA11));
chk('A11 includes a confounds block', /CONFOUNDS/.test(PA11));
chk('A11 continuity degrades to none on record', /none on record/i.test(PA11));
chk('A11 echoes a prior recommendation when supplied', (() => {
  const prior = { date: '2026-08-01', priority: 'Lag putting from 30 feet', criterion: '7 of 10 inside 3 feet' };
  return coachPrompt(A11m, prior).includes('Lag putting from 30 feet');
})());
chk('A11 no leftover HTML tags', !/<\/?b>/.test(PA11));
```

- [ ] **Step 2: Run to confirm failure**

Run: `node test-engine.js`
Expected: the `A11` checks fail.

- [ ] **Step 3: Replace `coachPrompt`**

In `index.html`, replace the whole `function coachPrompt(m) { ... }` with:

```js
function coachPrompt(m, lastRec) {
  const l5 = m.full.slice(-5);
  const rows = l5.map(r =>
    `${r.date} ${r.course} (rating ${r.rating != null ? r.rating : 'n/a'}, slope ${r.slope != null ? r.slope : 'n/a'}): score ${r.score}, diff ${r.diff}` +
    (r.putts != null ? `, putts ${r.putts}` : '') +
    (r.gir !== null ? `, GIR ${r.gir}%` : '') + (r.fir !== null ? `, FIR ${r.fir}%` : '')).join('\n');
  const confounds = roundConfounds(m);
  const priorLine = lastRec
    ? `${lastRec.priority} (success criterion: ${lastRec.criterion}, set ${lastRec.date})`
    : 'none on record';

  return `You are my golf performance analyst. Give me one clear, prioritized breakdown. No personas, no debate format, no conversation. Ground every claim in the specific numbers below, and do not offer generic golf advice that is not tied to something in this data.

I am still learning golf terminology — define any term that is not obvious (GIR, scrambling, differential, bogey-golfer baseline) the first time you use it.

BEFORE YOU ANALYZE — rules about being honest with this data:
- Sample sizes are small. Where a difference could plausibly be normal round-to-round variation, say so instead of building a story on it.
- Read the CONFOUNDS block and factor it in. If a confound explains a trend, say that rather than crediting my swing.
- If a metric fuses two different skills, do not guess which one is the problem. Say so, and name what data would separate them.
- If a section is not supported by the data, write "not enough data" for it. Do not invent a finding so that every section has content.

Structure your response exactly as:

1. CONTINUITY CHECK — My last priority was: ${priorLine}. Did I meet it? Answer met, not met, or not enough data, and say which numbers show it.
2. TREND CHECK — Is my recent trend real improvement or noise? Compare recent rounds to the career baseline, account for the confounds, and state how confident you are.
3. WHAT IS IMPROVING — The specific stat or stats showing real gains, and what part of my game that reflects.
4. WHAT IS NOT IMPROVING — The stats that are flat or still weak despite the trend, with strokes-per-round impact where the data supports it.
5. BIGGEST LEAK — The single largest strokes-per-round leak, explained plainly. If that metric fuses two skills, say so and name what would separate them.
6. ONE PRIORITY — One specific drill for my next practice session with a numeric success criterion (for example "8 of 10 balls within 6 feet"), tied to the biggest leak. If the biggest leak is ambiguous, pick the priority that would DIAGNOSE it rather than guessing at a fix.

MY DATA (${m.n} eighteen-hole rounds with a differential):
- Median differential ${r1(m.medDiff)} (good-day 20th pct ${r1(m.ceiling)}, blow-up 80th pct ${r1(m.floor)})
- Last-5 median ${r1(m.last5Med)}${m.priorMed !== null ? ` vs ${r1(m.priorMed)} prior baseline` : ''}
- ${m.recentEliteCt} of last ${m.recentEliteN} rounds in my career-best decile (diff at or below ${r1(m.bestDecileCut)})
${m.puttsAll !== null ? `- Putts/hole: ${r1(m.puttsAll)} career, ${r1(m.putts5)} last-5.${m.pveAll !== null ? ` Putts vs bogey-golfer expectation given my GIR: +${r1(m.pveAll * 18)}/round` : ' (No GIR data, so putting cannot be separated from chip proximity.)'}` : '- (No putts data in this export.)'}
${m.longAll !== null ? `- Long game (score minus putts)/hole: ${r1(m.longAll)} career, ${r1(m.long5)} last-5` : ''}
- GIR ${m.girAll !== null ? Math.round(m.girAll) + '%' : 'n/a'}, FIR ${m.firAll !== null ? Math.round(m.firAll) + '%' : 'n/a'}
- Ranked leaks (strokes/round): ${m.leaks.map(x => `${x.label} ${r1(x.strokes)}`).join(' · ')}

LAST 5 ROUNDS:
${rows}

CONFOUNDS IN THIS SAMPLE:
${confounds.length ? confounds.map(c => '- ' + c).join('\n') : '- (none identified)'}`;
}
```

- [ ] **Step 4: Check the call site still matches**

Run: `grep -n "coachPrompt(" index.html`
Expected: the definition plus one call of the form `coachPrompt(m)`. The new second parameter is optional, so the existing call needs no change. If the grep shows any other call shape, update it to pass `m` first.

- [ ] **Step 5: Run the tests**

Run: `node test-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 6: Commit**

```bash
git add index.html test-engine.js
git commit -m "Rewrite the rounds coach prompt as a structured analyst brief"
```

---

## Task 6: Mirror the engine changes into `course.html`

`course.html` carries its own copy of the shared engine, including `computeGapping` and `coachPrompt`. It never calls `coachPrompt`, but the block must stay byte-identical so a future engine fix remains one mechanical copy rather than a three-way merge.

**Files:**
- Modify: `course.html`
- Test: `test-course-engine.js`

- [ ] **Step 1: Copy the shared block verbatim**

`course.html`'s engine block is `range.html`'s block followed by its own
page-specific helpers, which begin at the `// ── Course-view helpers` comment.
Splice the new shared portion in front of those helpers rather than editing
`course.html` by hand — a hand-merge is how the two copies drift.

Run this from the repo root:

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

Expected: `spliced; helpers preserved: <n> chars` with a non-zero `n`. If it
prints the ABORT line instead, the marker comment was renamed — find the real
boundary before proceeding rather than working around it.

- [ ] **Step 2: Verify byte-parity**

Run:

```bash
node -e "
const fs=require('fs');const n=s=>s.replace(/\r\n/g,'\n');
const r=n(fs.readFileSync('range.html','utf8')).split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0];
const c=n(fs.readFileSync('course.html','utf8')).split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0];
const i=c.indexOf('// ── Course-view helpers');
console.log('shared prefix identical:', r.trim()===(i>=0?c.slice(0,i):c).trim());
"
```

Expected: `shared prefix identical: true`

- [ ] **Step 3: Add parity assertions**

Append to `test-course-engine.js` before the final `console.log`:

```js
// C7. The mirrored engine changes are present in course.html's own copy.
chk('C7 computeGapping reports carry dispersion here too', (() => {
  const sess = {
    date: '2026-09-01', dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'),
    source: 'trackman', tags: {},
    shots: [100,105,110,115,120,125,130,135,140,145].map(c => ({
      clubSpeed: 33, attackAngle: 2, ballSpeed: 43, spin: 5400, carry: c / M_TO_YD, side: 0,
    })),
  };
  const g = computeGapping(groupByClub([sess]))[0];
  return Math.abs(g.carryIqrYd - 25) < 0.5 && g.sideIqrYd != null;
})());
chk('C7 rangeConfounds is present in the mirrored block', typeof rangeConfounds === 'function');
chk('C7 the mirrored coachPrompt carries no personas', (() => {
  const sess = {
    date: '2026-09-01', dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'),
    source: 'trackman', tags: {},
    shots: Array.from({ length: 6 }, () => ({
      clubSpeed: 33, attackAngle: 2, ballSpeed: 43, spin: 5400, carry: 120 / M_TO_YD, side: 0,
    })),
  };
  const groups = groupByClub([sess]);
  const gaps = computeGapping(groups);
  const p = coachPrompt(gaps, computeVerdicts(groups, gaps, []), groups, 'trackman');
  return !/FALDO|BRYSON/i.test(p) && p.includes('ONE PRIORITY');
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
git commit -m "Mirror the prompt and dispersion engine changes into course.html"
```

---

## Task 7: Live verification

**Files:** none modified unless a defect is found.

- [ ] **Step 1: Serve and open both analyzers**

Start the preview server and open `range.html`, which has real Trackman and Toptracer data committed.

- [ ] **Step 2: Confirm the range prompt**

Read the coach-debrief textarea and confirm: no persona names; the five section headers present; `MEASUREMENT SOURCE:` naming the currently selected instrument; a `CONFOUNDS IN THIS SAMPLE:` block with at least one entry; per-club lines showing `clean of`, `carry spread`, and `side spread`.

- [ ] **Step 3: Confirm the prompt follows the source picker**

Switch the source selector from Toptracer to Trackman, then re-read the textarea. The `MEASUREMENT SOURCE:` line must change and the per-club medians must change with it. This catches a prompt built from unfiltered sessions rather than the selected source.

- [ ] **Step 4: Confirm the rounds prompt**

Open `index.html` with the 43 committed rounds and confirm: six section headers; a confounds block naming the seven-week gap and the slope shift; `none on record` in the continuity section; last-5 round lines carrying rating and slope.

- [ ] **Step 5: Commit only if a fix was needed**

If no defect was found there is nothing to commit.

---

## Final check

- [ ] `node test-engine.js && node test-range-engine.js && node test-course-engine.js` — three `ALL PASS`.
- [ ] Shared engine parity command from Task 6 Step 2 prints `true`.
- [ ] `grep -c "FALDO" index.html range.html course.html` returns 0 for all three.
- [ ] `git log --oneline -8` shows one descriptive commit per task.
- [ ] Remind the user to push; report the count from `git log origin/master..HEAD --oneline | wc -l`, re-read at that moment rather than carried forward from earlier in the session.
