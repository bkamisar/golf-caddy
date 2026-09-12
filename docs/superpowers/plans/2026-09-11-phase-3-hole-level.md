# Phase 3 — Hole-Level Rollups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn hole-by-hole scorecard data into rollups that separate a putting problem from a chipping problem, quantify blow-up holes, and isolate par-3 approach performance — then feed all of it to the coach prompt with honest sample sizes.

**Architecture:** One committed `data/hole-detail.json`, joined to rounds by date+course at load. New pure engine functions in `index.html` only (`range.html`/`course.html` are untouched — this is round data, not shot data). Same baseline-fetch pattern as every other store.

**Tech Stack:** Vanilla JS, no dependencies. Node for `test-engine.js`.

**Spec:** `docs/superpowers/specs/2026-09-11-analysis-platform-design.md` (Phase 3)

---

## Why this exists, and what changed

The top leak on the rounds analyzer reads "Putting + chip proximity: 8.3 strokes/round." That single number fuses two different skills, and the prompt is explicitly instructed to say so rather than guess which one to practice. This phase unfuses it.

**A correction carried in from the spec:** an earlier design used a self-calibrating expected-putts-by-distance table. It is circular — if expected putts from 12 feet is the user's own average from 12 feet, putts-vs-expected sums to zero by construction. It is replaced by two directly interpretable measures that need no baseline curve:

- **Chipping** → where the first putt is left after a green miss (a description, not a comparison).
- **Putting** → 3-putt rate conditional on distance, anchored to two-putt regulation, which is a definition of the game rather than a reference to any population of golfers.

**The most valuable rollup needs no new data at all.** Putts conditional on hitting the green is computable from par/score/putts/GIR — fields already captured in the one existing sample round. The existing bogey-golfer norms encode the expectation that putts after a *miss* run **lower** than after a hit (you chip on close; a green in regulation often leaves a long first putt). When the miss number is *higher*, chips are not finishing close, and what presents as bad putting is bad chipping. On the one round captured so far that is exactly the pattern: 2.33 putts after a green hit, 2.47 after a miss, against norms of 2.15 and 1.95. Phase 3 therefore delivers a real signal from round one, rather than waiting for first-putt distances to accumulate.

---

## Critical conventions

1. **`var`, not `const`, for engine bindings referenced by bare name in tests.** The harness extracts the `/*ENGINE-START*/`–`/*ENGINE-END*/` block and evals it; only `var`/`function` declarations leak to the caller's scope. `EXP_PUTT_GIR`/`EXP_PUTT_MISS` are existing `const`s — do **not** change them; the new functions return their values in result objects so tests never reference them bare.
2. **Every rollup reports its own sample size.** The hole-level and distance-aware tiers are far smaller than the 43-round corpus and must never be presented as equally solid. A rate below its minimum sample is returned as `null` with `enough: false`, not as a noisy number.
3. **Never interpolate user-controlled text into an `onclick`**, even escaped. Course names are free-form. Use the integer-index pattern already used by `doDeleteRec`.
4. **Escape every dynamic string reaching innerHTML via `esc()`.**
5. **`range.html` and `course.html` are not touched by this phase.** These are round metrics. Do not mirror anything into them.
6. **Two known false-positive security hooks** may block a write once per (file, rule) per session. Retry the identical write once.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `data/hole-detail.json` | **Create** | All hole-level records, one array |
| `data/hole-detail/2026-09-05-pinehurst-10.json` | **Delete** | Migrated into the above |
| `index.html` | Modify | Join + rollup engine, storage, prompt, display |
| `test-engine.js` | Modify | Rollup assertions |

---

## Task 1: Consolidate hole-detail storage and join it to rounds

The existing sample lives in a per-round file under `data/hole-detail/`. That does not scale over HTTP: GitHub Pages cannot list a directory, so the page would need a manifest that can drift out of sync with the files it names. One array in one file is a single fetch with nothing to keep in sync.

**Files:**
- Create: `data/hole-detail.json`
- Delete: `data/hole-detail/2026-09-05-pinehurst-10.json` (and the now-empty directory)
- Modify: `index.html` (engine)
- Test: `test-engine.js`

- [ ] **Step 1: Write the failing tests**

Append to `test-engine.js` before the final `console.log`:

```js
// A13. Hole detail is stored as one array and joined to rounds by date+course.
const mkHD = (date, course, holes) => ({ date, course, holes });
const hd3 = [
  { hole: 1, par: 4, score: 5, putts: 2, gir: false, firstPuttFt: 18 },
  { hole: 2, par: 3, score: 4, putts: 3, gir: true,  firstPuttFt: 30 },
  { hole: 3, par: 5, score: 7, putts: 3, gir: false, firstPuttFt: 40 },
];

chk('A13 holeDetailKey is date plus normalized course', (() => {
  return holeDetailKey('2026-09-05', '  Pinehurst   Resort ') === '2026-09-05|Pinehurst Resort';
})());
chk('A13 attachHoleDetail attaches by matching date+course', (() => {
  const rounds = [mkR('2026-09-05','Pinehurst',129,99,44,17,62)];
  const out = attachHoleDetail(rounds, [mkHD('2026-09-05','Pinehurst',hd3)]);
  return out[0].holeDetail && out[0].holeDetail.length === 3;
})());
chk('A13 a round with no matching detail gets no holeDetail field set', (() => {
  const rounds = [mkR('2026-09-05','Pinehurst',129,99,44,17,62)];
  const out = attachHoleDetail(rounds, [mkHD('2026-01-01','Elsewhere',hd3)]);
  return out[0].holeDetail == null;
})());
chk('A13 attach does not mutate the input rounds', (() => {
  const rounds = [mkR('2026-09-05','Pinehurst',129,99,44,17,62)];
  attachHoleDetail(rounds, [mkHD('2026-09-05','Pinehurst',hd3)]);
  return rounds[0].holeDetail === undefined;
})());
chk('A13 r.holes (the hole COUNT) is not clobbered by the detail array', (() => {
  const rounds = [mkR('2026-09-05','Pinehurst',129,99,44,17,62)];
  const out = attachHoleDetail(rounds, [mkHD('2026-09-05','Pinehurst',hd3)]);
  return out[0].holes === 18 && Array.isArray(out[0].holeDetail);
})());
chk('A13 empty and undefined inputs are safe', (() => {
  return attachHoleDetail([], []).length === 0
    && attachHoleDetail(undefined, undefined).length === 0;
})());
chk('A13 roundsWithDetail filters to only rounds carrying detail', (() => {
  const rounds = [
    mkR('2026-09-05','Pinehurst',129,99,44,17,62),
    mkR('2026-09-06','Elsewhere',129,101,45,12,60),
  ];
  const out = attachHoleDetail(rounds, [mkHD('2026-09-05','Pinehurst',hd3)]);
  return roundsWithDetail(out).length === 1;
})());
```

- [ ] **Step 2: Run to confirm failure**

Run: `node test-engine.js`
Expected: fails — `holeDetailKey is not defined`.

- [ ] **Step 3: Create the consolidated data file**

Create `data/hole-detail.json` as an array containing one record, migrated from the existing per-round file. Read `data/hole-detail/2026-09-05-pinehurst-10.json` and carry its content across, reshaped so the per-hole array sits under `holes` and the round-identifying fields sit at the top level:

```json
[
  {
    "date": "2026-09-05",
    "course": "#10 | Pinehurst Resort",
    "rating": 68.2,
    "slope": 129,
    "score": 99,
    "putts": 44,
    "girPct": 17,
    "firPct": 62,
    "penalties": 0.5,
    "verified": {
      "parSum": "35 out / 35 in / 70 total — matches card",
      "scoreSum": "47 out / 52 in / 99 total — matches card",
      "puttsSum": "22 out / 22 in / 44 total — matches card",
      "girCount": "3 of 18 (holes 2, 4, 12) = 17% — matches card"
    },
    "unresolved": [
      "Tee club for holes 8 and 16 was not legible in the screenshots.",
      "Driving marks appear on some par 3s (hole 14 shows a red X) but par 3s are excluded from Grint's own FIR ratio. fir is therefore recorded as null on par 3s.",
      "Hole 16 is counted as a fairway miss by subtraction rather than from a directly legible symbol.",
      "Grint's PENALTIES row carries lie codes (S = greenside bunker on hole 11) as well as penalty counts, and the round total reads 0.5 rather than a whole number. Semantics unresolved; penalties are not consumed by any rollup.",
      "firstPuttFt is null throughout — the DISTANCE (ft) row was empty for this round."
    ],
    "holes": [
      { "hole": 1,  "par": 4, "score": 5, "putts": 2, "firstPuttFt": null, "gir": false, "girMiss": "miss",  "teeClub": "Dr",  "fir": true,  "driveMiss": null },
      { "hole": 2,  "par": 3, "score": 4, "putts": 3, "firstPuttFt": null, "gir": true,  "girMiss": null,    "teeClub": "PW",  "fir": null,  "driveMiss": null },
      { "hole": 3,  "par": 5, "score": 7, "putts": 3, "firstPuttFt": null, "gir": false, "girMiss": "miss",  "teeClub": "Dr",  "fir": false, "driveMiss": "right" },
      { "hole": 4,  "par": 4, "score": 4, "putts": 2, "firstPuttFt": null, "gir": true,  "girMiss": null,    "teeClub": "4H",  "fir": false, "driveMiss": "right" },
      { "hole": 5,  "par": 4, "score": 4, "putts": 1, "firstPuttFt": null, "gir": false, "girMiss": "miss",  "teeClub": "Dr",  "fir": false, "driveMiss": "severe" },
      { "hole": 6,  "par": 4, "score": 6, "putts": 3, "firstPuttFt": null, "gir": false, "girMiss": "miss",  "teeClub": "Dr",  "fir": true,  "driveMiss": null },
      { "hole": 7,  "par": 3, "score": 6, "putts": 3, "firstPuttFt": null, "gir": false, "girMiss": "miss",  "teeClub": "PW",  "fir": null,  "driveMiss": null },
      { "hole": 8,  "par": 4, "score": 6, "putts": 3, "firstPuttFt": null, "gir": false, "girMiss": "miss",  "teeClub": null,  "fir": true,  "driveMiss": null },
      { "hole": 9,  "par": 4, "score": 5, "putts": 2, "firstPuttFt": null, "gir": false, "girMiss": "miss",  "teeClub": "Dr",  "fir": true,  "driveMiss": null },
      { "hole": 10, "par": 5, "score": 8, "putts": 3, "firstPuttFt": null, "gir": false, "girMiss": "miss",  "teeClub": "Dr",  "fir": false, "driveMiss": "severe" },
      { "hole": 11, "par": 3, "score": 6, "putts": 2, "firstPuttFt": null, "gir": false, "girMiss": "short", "teeClub": "7i",  "fir": null,  "driveMiss": null, "lie": "S" },
      { "hole": 12, "par": 5, "score": 5, "putts": 2, "firstPuttFt": null, "gir": true,  "girMiss": null,    "teeClub": "Dr",  "fir": true,  "driveMiss": null },
      { "hole": 13, "par": 4, "score": 5, "putts": 2, "firstPuttFt": null, "gir": false, "girMiss": "miss",  "teeClub": "Dr",  "fir": true,  "driveMiss": null },
      { "hole": 14, "par": 3, "score": 4, "putts": 2, "firstPuttFt": null, "gir": false, "girMiss": "short", "teeClub": "7i",  "fir": null,  "driveMiss": null },
      { "hole": 15, "par": 4, "score": 8, "putts": 3, "firstPuttFt": null, "gir": false, "girMiss": "miss",  "teeClub": "Dr",  "fir": true,  "driveMiss": null },
      { "hole": 16, "par": 4, "score": 6, "putts": 3, "firstPuttFt": null, "gir": false, "girMiss": "miss",  "teeClub": null,  "fir": false, "driveMiss": null },
      { "hole": 17, "par": 3, "score": 4, "putts": 2, "firstPuttFt": null, "gir": false, "girMiss": "miss",  "teeClub": "PW",  "fir": null,  "driveMiss": null },
      { "hole": 18, "par": 4, "score": 6, "putts": 3, "firstPuttFt": null, "gir": false, "girMiss": "miss",  "teeClub": "Dr",  "fir": true,  "driveMiss": null }
    ]
  }
]
```

Then delete the old file and its directory:

```bash
git rm data/hole-detail/2026-09-05-pinehurst-10.json
```

- [ ] **Step 4: Implement the join**

In `index.html`, insert immediately **above** `function computeMetrics(`:

```js
// ── Hole-level detail ────────────────────────────────────────────────────────
// Stored as one array in data/hole-detail.json rather than a file per round:
// GitHub Pages cannot list a directory, so per-round files would need a
// manifest, and a manifest is one more thing that can drift out of sync with
// the files it names.
//
// Joined to rounds by date + course. Two rounds at the same course on the same
// day would collide; that is a 36-hole day, has not happened in 43 rounds, and
// is left unhandled deliberately rather than carrying a synthetic id around.
function holeDetailKey(date, course) {
  return `${date}|${(course || '').replace(/\s+/g, ' ').trim()}`;
}

// Returns a new array; never mutates. The attached field is `holeDetail` --
// NOT `holes`, which already means the hole COUNT (18 / 9 / 13) on a round.
function attachHoleDetail(rounds, details) {
  const byKey = {};
  (details || []).forEach(d => { byKey[holeDetailKey(d.date, d.course)] = d; });
  return (rounds || []).map(r => {
    const d = byKey[holeDetailKey(r.date, r.course)];
    return d && Array.isArray(d.holes) ? { ...r, holeDetail: d.holes } : { ...r };
  });
}

function roundsWithDetail(rounds) {
  return (rounds || []).filter(r => Array.isArray(r.holeDetail) && r.holeDetail.length);
}
```

- [ ] **Step 5: Run the tests**

Run: `node test-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 6: Commit**

Step 3's `git rm` already staged the old file's deletion, so it needs no
separate handling here.

```bash
git add index.html test-engine.js data/hole-detail.json
git commit -m "Consolidate hole detail into one file and join it to rounds by date+course"
```

Confirm the old path is gone from both the index and the working tree before
committing:

```bash
git status --short data/hole-detail
ls data/hole-detail 2>/dev/null || echo "directory gone"
```

---

## Task 2: Rollups that work with today's data

None of these need first-putt distance. They run on the one round already captured.

**Files:**
- Modify: `index.html` (engine)
- Test: `test-engine.js`

- [ ] **Step 1: Write the failing tests**

Append to `test-engine.js` before the final `console.log`:

```js
// A14. Rollups computable from par/score/putts/GIR alone — no first-putt
// distance required, so they produce signal from the first captured round.
const pinehurstHoles = [
  { hole:1,  par:4, score:5, putts:2, gir:false }, { hole:2,  par:3, score:4, putts:3, gir:true  },
  { hole:3,  par:5, score:7, putts:3, gir:false }, { hole:4,  par:4, score:4, putts:2, gir:true  },
  { hole:5,  par:4, score:4, putts:1, gir:false }, { hole:6,  par:4, score:6, putts:3, gir:false },
  { hole:7,  par:3, score:6, putts:3, gir:false }, { hole:8,  par:4, score:6, putts:3, gir:false },
  { hole:9,  par:4, score:5, putts:2, gir:false }, { hole:10, par:5, score:8, putts:3, gir:false },
  { hole:11, par:3, score:6, putts:2, gir:false }, { hole:12, par:5, score:5, putts:2, gir:true  },
  { hole:13, par:4, score:5, putts:2, gir:false }, { hole:14, par:3, score:4, putts:2, gir:false },
  { hole:15, par:4, score:8, putts:3, gir:false }, { hole:16, par:4, score:6, putts:3, gir:false },
  { hole:17, par:3, score:4, putts:2, gir:false }, { hole:18, par:4, score:6, putts:3, gir:false },
];
const pineRound = [{ ...mkR('2026-09-05','Pinehurst',129,99,44,17,62), holeDetail: pinehurstHoles }];

chk('A14 putts after a green hit, computed over the real round', (() => {
  const g = puttsByGreenResult(pineRound);
  // holes 2, 4, 12 were hit: putts 3, 2, 2 -> 2.333...
  return g.nGir === 3 && Math.abs(g.afterGir - 7 / 3) < 0.01;
})());
chk('A14 putts after a green miss, computed over the real round', (() => {
  const g = puttsByGreenResult(pineRound);
  // the other 15 holes total 37 putts -> 2.466...
  return g.nMiss === 15 && Math.abs(g.afterMiss - 37 / 15) < 0.01;
})());
chk('A14 the norms come back in the result so tests never touch the consts', (() => {
  const g = puttsByGreenResult(pineRound);
  return g.expGir === 2.15 && g.expMiss === 1.95;
})());
chk('A14 this round shows the inverted pattern that indicts chipping', (() => {
  const g = puttsByGreenResult(pineRound);
  // Healthy short game puts afterMiss BELOW afterGir. Here it is above.
  return g.afterMiss > g.afterGir;
})());
chk('A14 empty input is safe and reports nulls, not zeros', (() => {
  const g = puttsByGreenResult([]);
  return g.afterGir === null && g.afterMiss === null && g.nGir === 0;
})());

chk('A14 blow-up holes counted as double bogey or worse', (() => {
  const b = blowUpHoles(pineRound)[0];
  // +2 or worse on holes 3,6,7,8,10,11,15,16,18 = 9 holes
  return b.blowUps === 9 && b.holes === 18;
})());
chk('A14 strokes attributable to blow-ups, and total over par', (() => {
  const b = blowUpHoles(pineRound)[0];
  return b.strokesFromBlowUps === 23 && b.totalOverPar === 29;
})());
chk('A14 blowUpHoles skips rounds with no detail rather than emitting zeros', (() => {
  return blowUpHoles([mkR('2026-09-05','Pinehurst',129,99,44,17,62)]).length === 0;
})());

chk('A14 over-par split by par type isolates par-3 play', (() => {
  const p = overParByParType(pineRound);
  // par 3s: holes 2,7,11,14,17 -> +1,+3,+3,+1,+1 = 9/5 = 1.8
  return p.n3 === 5 && Math.abs(p.par3 - 1.8) < 0.01;
})());
chk('A14 par 4 and par 5 buckets are reported separately', (() => {
  const p = overParByParType(pineRound);
  return p.n4 === 10 && p.n5 === 3 && p.par4 != null && p.par5 != null;
})());
chk('A14 a par type with no holes reports null, not NaN', (() => {
  const only3s = [{ ...mkR('2026-01-01','X',113,30,10,0,0),
    holeDetail: [{ hole:1, par:3, score:4, putts:2, gir:false }] }];
  const p = overParByParType(only3s);
  return p.par4 === null && p.n4 === 0;
})());
```

- [ ] **Step 2: Run to confirm failure**

Run: `node test-engine.js`
Expected: fails — `puttsByGreenResult is not defined`.

- [ ] **Step 3: Implement the rollups**

In `index.html`, insert immediately after `roundsWithDetail` from Task 1:

```js
// Putts conditional on whether the green was hit. The existing bogey-golfer
// norms encode the expectation that putts after a MISS run LOWER than after a
// hit: you chip on close and one- or two-putt, where a green in regulation
// often leaves a long first putt. When the miss number is HIGHER, chips are not
// finishing close, and what presents as a putting problem is a chipping
// problem. Needs only par/score/putts/GIR, so it works on every hole-level
// round from the first one.
function puttsByGreenResult(rounds) {
  const hit = [], miss = [];
  roundsWithDetail(rounds).forEach(r => {
    r.holeDetail.forEach(h => {
      if (!h || h.putts == null) return;
      (h.gir ? hit : miss).push(h.putts);
    });
  });
  return {
    afterGir: hit.length ? mean(hit) : null,
    afterMiss: miss.length ? mean(miss) : null,
    nGir: hit.length, nMiss: miss.length,
    // Returned rather than read from the consts by callers/tests: these are
    // `const` in this engine block and do not survive the test harness's eval.
    expGir: EXP_PUTT_GIR, expMiss: EXP_PUTT_MISS,
  };
}

// Double bogey or worse. Counted per round so the trend is against the user's
// own history rather than an absolute standard — "four holes were 45% of my
// strokes over par" is close to arithmetic for any high handicap and means
// nothing without that self-comparison.
function blowUpHoles(rounds) {
  return roundsWithDetail(rounds).map(r => {
    const scored = r.holeDetail.filter(h => h && h.par != null && h.score != null);
    if (!scored.length) return null;
    const over = scored.map(h => h.score - h.par);
    const blow = over.filter(v => v >= 2);
    return {
      date: r.date, course: r.course, holes: scored.length,
      blowUps: blow.length,
      strokesFromBlowUps: blow.reduce((s, v) => s + v, 0),
      totalOverPar: over.reduce((s, v) => s + v, 0),
    };
  }).filter(Boolean);
}

// Over-par by par type. Par 3s have no drive, so FIR never applies to them and
// their approach play is otherwise diluted into the same bucket as par 4s and
// 5s. Splitting them is the only way to see iron play separately from what the
// tee shot set up.
function overParByParType(rounds) {
  const byPar = { 3: [], 4: [], 5: [] };
  roundsWithDetail(rounds).forEach(r => {
    r.holeDetail.forEach(h => {
      if (!h || h.par == null || h.score == null) return;
      if (byPar[h.par]) byPar[h.par].push(h.score - h.par);
    });
  });
  return {
    par3: byPar[3].length ? mean(byPar[3]) : null, n3: byPar[3].length,
    par4: byPar[4].length ? mean(byPar[4]) : null, n4: byPar[4].length,
    par5: byPar[5].length ? mean(byPar[5]) : null, n5: byPar[5].length,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `node test-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add index.html test-engine.js
git commit -m "Add hole-level rollups: putts by green result, blow-ups, par-type split"
```

---

## Task 3: Distance-aware rollups

These need `firstPuttFt`, which no captured round has yet. They must return `enough: false` cleanly rather than dividing by zero, and must stay silent until real data exists.

**Files:**
- Modify: `index.html` (engine)
- Test: `test-engine.js`

- [ ] **Step 1: Write the failing tests**

Append to `test-engine.js` before the final `console.log`:

```js
// A15. Distance-aware rollups. No baseline curve: 3-putt rate is anchored to
// two-putt regulation, and chip proximity is a description rather than a
// comparison. Rates below the minimum sample are withheld, not shown noisy.
const distHole = (ft, putts, gir) => ({ par: 4, score: 5, putts, gir, firstPuttFt: ft });
const mkDistRound = (holes) => ({ ...mkR('2026-10-01','Somewhere',120,95,40,20,60), holeDetail: holes });

chk('A15 puttBucket sorts distances into the three buckets', (() => {
  return puttBucket(4) === 'under10' && puttBucket(10) === '10to25'
    && puttBucket(24) === '10to25' && puttBucket(25) === 'over25' && puttBucket(60) === 'over25';
})());
chk('A15 puttBucket rejects null and non-numeric', (() => {
  return puttBucket(null) === null && puttBucket(undefined) === null && puttBucket(NaN) === null;
})());

chk('A15 a bucket under the minimum sample withholds its rate', (() => {
  const rounds = [mkDistRound([distHole(5, 3, true), distHole(6, 2, true)])];
  const b = threePuttRates(rounds).find(x => x.key === 'under10');
  return b.n === 2 && b.enough === false && b.threePuttRate === null;
})());
chk('A15 a bucket at the minimum sample reports its rate', (() => {
  // 10 holes inside 10 ft, 2 of them three-putted -> 0.2
  const holes = Array.from({ length: 10 }, (_, i) => distHole(5, i < 2 ? 3 : 2, true));
  const b = threePuttRates([mkDistRound(holes)]).find(x => x.key === 'under10');
  return b.n === 10 && b.enough === true && Math.abs(b.threePuttRate - 0.2) < 1e-9;
})());
chk('A15 one-putt rate is reported alongside', (() => {
  const holes = Array.from({ length: 10 }, (_, i) => distHole(5, i < 4 ? 1 : 2, true));
  const b = threePuttRates([mkDistRound(holes)]).find(x => x.key === 'under10');
  return Math.abs(b.onePuttRate - 0.4) < 1e-9;
})());
chk('A15 holes with no recorded distance are excluded entirely', (() => {
  const holes = [distHole(null, 3, true), distHole(null, 3, true)];
  return threePuttRates([mkDistRound(holes)]).every(b => b.n === 0);
})());
chk('A15 all three buckets are always returned, even when empty', (() => {
  const r = threePuttRates([]);
  return r.length === 3 && r.every(b => b.n === 0 && b.enough === false);
})());

chk('A15 chipProximity measures only holes where the green was missed', (() => {
  const holes = [distHole(30, 2, false), distHole(8, 2, true), distHole(40, 3, false)];
  const c = chipProximity([mkDistRound(holes)]);
  return c.n === 2 && Math.abs(c.median - 35) < 0.01;
})());
chk('A15 chipProximity reports the share landing in each bucket', (() => {
  const holes = [distHole(30, 2, false), distHole(40, 3, false), distHole(5, 1, false), distHole(12, 2, false)];
  const c = chipProximity([mkDistRound(holes)]);
  const over25 = c.buckets.find(b => b.key === 'over25');
  return c.n === 4 && over25.count === 2 && Math.abs(over25.share - 0.5) < 1e-9;
})());
chk('A15 chipProximity with no distance data reports n=0 and null median', (() => {
  const c = chipProximity([mkDistRound([distHole(null, 2, false)])]);
  return c.n === 0 && c.median === null && c.buckets === null;
})());
chk('A15 the whole distance tier is silent on the existing data, not wrong', (() => {
  // pineRound has firstPuttFt nowhere; nothing should claim a rate.
  return threePuttRates(pineRound).every(b => b.n === 0 && b.threePuttRate === null)
    && chipProximity(pineRound).n === 0;
})());
```

- [ ] **Step 2: Run to confirm failure**

Run: `node test-engine.js`
Expected: fails — `puttBucket is not defined`.

- [ ] **Step 3: Implement**

In `index.html`, insert immediately after `overParByParType` from Task 2:

```js
// Three buckets, not five: with roughly 15 recorded first putts per round, more
// buckets would mean each one waits far longer to reach a usable sample. The
// boundaries are chosen to be diagnostic rather than even — inside 10 feet a
// three-putt is a real putting fault, beyond 25 it is mostly lag speed.
var PUTT_BUCKETS = [
  { key: 'under10', label: 'inside 10 ft', min: 0,  max: 10 },
  { key: '10to25',  label: '10-25 ft',     min: 10, max: 25 },
  { key: 'over25',  label: 'beyond 25 ft', min: 25, max: Infinity },
];
var PUTT_BUCKET_MIN_N = 10;

function puttBucket(ft) {
  if (ft == null || typeof ft !== 'number' || isNaN(ft)) return null;
  for (let i = 0; i < PUTT_BUCKETS.length; i++) {
    const b = PUTT_BUCKETS[i];
    if (ft >= b.min && ft < b.max) return b.key;
  }
  return null;
}

// 3-putt rate by distance. Anchored to two-putt regulation — a definition of
// the game, not a reference to any population of golfers — so no baseline curve
// is needed and none can be wrong. A rate below PUTT_BUCKET_MIN_N holes is
// withheld rather than shown noisy, matching computeGapping's lowConfidence
// gate on the range side.
function threePuttRates(rounds) {
  const acc = {};
  PUTT_BUCKETS.forEach(b => { acc[b.key] = { n: 0, three: 0, one: 0 }; });
  roundsWithDetail(rounds).forEach(r => {
    r.holeDetail.forEach(h => {
      if (!h || h.putts == null) return;
      const k = puttBucket(h.firstPuttFt);
      if (!k) return;
      acc[k].n++;
      if (h.putts >= 3) acc[k].three++;
      if (h.putts === 1) acc[k].one++;
    });
  });
  return PUTT_BUCKETS.map(b => {
    const a = acc[b.key];
    const enough = a.n >= PUTT_BUCKET_MIN_N;
    return {
      key: b.key, label: b.label, n: a.n, enough,
      threePuttRate: enough ? a.three / a.n : null,
      onePuttRate: enough ? a.one / a.n : null,
    };
  });
}

// Chipping quality: where the first putt is left after a green miss. This is a
// description, not a comparison — "chips finish beyond 25 ft half the time" is
// actionable without any external reference, which is the whole reason it
// replaced an expected-putts curve.
function chipProximity(rounds) {
  const dists = [];
  roundsWithDetail(rounds).forEach(r => {
    r.holeDetail.forEach(h => {
      if (!h || h.gir) return;
      if (puttBucket(h.firstPuttFt) === null) return;
      dists.push(h.firstPuttFt);
    });
  });
  if (!dists.length) return { n: 0, median: null, buckets: null };
  const counts = {};
  PUTT_BUCKETS.forEach(b => { counts[b.key] = 0; });
  dists.forEach(d => { counts[puttBucket(d)]++; });
  return {
    n: dists.length,
    median: median(dists),
    buckets: PUTT_BUCKETS.map(b => ({
      key: b.key, label: b.label,
      count: counts[b.key], share: counts[b.key] / dists.length,
    })),
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `node test-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add index.html test-engine.js
git commit -m "Add distance-aware rollups: 3-putt rate by bucket and chip proximity"
```

---

## Task 4: Storage, bootstrap, and metrics wiring

**Files:**
- Modify: `index.html`
- Test: `test-engine.js`

- [ ] **Step 1: Write the failing test**

Append to `test-engine.js` before the final `console.log`:

```js
// A16. computeMetrics surfaces the hole tier with its own sample sizes, and
// never lets the smaller tier masquerade as the 43-round corpus.
chk('A16 computeMetrics reports hole-tier coverage', (() => {
  const rounds = [
    mkR('2026-07-05','A',123,111,47,17,77), mkR('2026-07-08','A',123,102,38,12,62),
    mkR('2026-07-10','A',123,104,46,17,54), mkR('2026-07-19','B',123,98,38,11,46),
    { ...mkR('2026-09-05','Pinehurst',129,99,44,17,62), holeDetail: pinehurstHoles },
  ];
  const m = computeMetrics(rounds);
  return m.holeTier.nRounds === 1 && m.n === 5;
})());
chk('A16 the hole tier carries the rollups', (() => {
  const rounds = [
    mkR('2026-07-05','A',123,111,47,17,77), mkR('2026-07-08','A',123,102,38,12,62),
    mkR('2026-07-10','A',123,104,46,17,54),
    { ...mkR('2026-09-05','Pinehurst',129,99,44,17,62), holeDetail: pinehurstHoles },
  ];
  const t = computeMetrics(rounds).holeTier;
  return t.putts.nGir === 3 && t.blowUps.length === 1 && t.parType.n3 === 5;
})());
chk('A16 with no hole detail the tier reports zero rounds, not null', (() => {
  const rounds = [
    mkR('2026-07-05','A',123,111,47,17,77), mkR('2026-07-08','A',123,102,38,12,62),
    mkR('2026-07-10','A',123,104,46,17,54),
  ];
  const t = computeMetrics(rounds).holeTier;
  return t.nRounds === 0 && t.putts.afterGir === null;
})());
```

- [ ] **Step 2: Run to confirm failure**

Run: `node test-engine.js`
Expected: fails — `m.holeTier` is undefined.

- [ ] **Step 3: Add `holeTier` to `computeMetrics`**

In `index.html`, inside `computeMetrics`, find the `const m = {` object literal and add this entry immediately before the closing `};`:

```js
    // Hole-level tier. Separate from every round-level figure above and
    // carrying its own sample size, because it covers a small and slowly
    // growing subset of rounds — presenting it beside a 43-round trend without
    // that distinction would imply confidence it has not earned.
    holeTier: {
      nRounds: roundsWithDetail(all).length,
      putts: puttsByGreenResult(all),
      blowUps: blowUpHoles(all),
      parType: overParByParType(all),
      threePutt: threePuttRates(all),
      chip: chipProximity(all),
    },
```

`all` is the already-computed full round list in scope at that point. If the variable holding every round is named something else at that location, use whatever that real name is and report it.

- [ ] **Step 4: Add the storage layer**

In `index.html`, immediately after the recommendations storage block (`loadRecs`), insert:

```js
const HD_URL = 'data/hole-detail.json';
let holeDetailBaseline = [];
```

There is no staging layer and no localStorage key for hole detail: it is written into the repo by Claude during a session and committed, never entered in the browser. A staging path would be a second, diverging way into the same file.

- [ ] **Step 5: Fetch it in the bootstrap**

In the bootstrap chain, after the recommendations `.catch(() => { recBaseline = []; })`, insert:

```js
  .then(() => fetch(HD_URL, { cache: 'no-store' }))
  .then(r => r.ok ? r.json() : [])
  .then(d => { holeDetailBaseline = Array.isArray(d) ? d : []; })
  .catch(() => { holeDetailBaseline = []; })
```

- [ ] **Step 6: Join at load**

Find `const load = () => ...` in `index.html` and wrap its result so every consumer sees rounds with detail attached:

```js
const load = () => attachHoleDetail(mergeRounds(baseline, loadStaging()).all, holeDetailBaseline);
```

If the existing `load` has a different shape, keep its existing body and wrap the returned array in `attachHoleDetail(..., holeDetailBaseline)` — report the original line.

- [ ] **Step 7: Run the tests**

Run: `node test-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 8: Commit**

```bash
git add index.html test-engine.js
git commit -m "Load hole detail at bootstrap and surface a hole tier in computeMetrics"
```

---

## Task 5: Prompt and dashboard

**Files:**
- Modify: `index.html`
- Test: `test-engine.js`

- [ ] **Step 1: Write the failing tests**

Append to `test-engine.js` before the final `console.log`:

```js
// A17. The prompt reports the hole tier with its sample size and states the
// putting/chipping split in the terms the spec settled on.
const A17rounds = [
  mkR('2026-07-05','A',123,111,47,17,77), mkR('2026-07-08','A',123,102,38,12,62),
  mkR('2026-07-10','A',123,104,46,17,54), mkR('2026-07-19','B',123,98,38,11,46),
  { ...mkR('2026-09-05','Pinehurst',129,99,44,17,62), holeDetail: pinehurstHoles },
];
const PA17 = coachPrompt(computeMetrics(A17rounds));

chk('A17 the prompt has a hole-level section', /HOLE-LEVEL/.test(PA17));
chk('A17 it states how many rounds back the hole tier', /1 round/.test(PA17));
chk('A17 it reports putts after a green hit and after a miss', (() => {
  return /after a green hit/i.test(PA17) && /after a miss/i.test(PA17);
})());
chk('A17 it names the inverted pattern as a chipping signal', (() => {
  return /chip/i.test(PA17.split('HOLE-LEVEL')[1] || '');
})());
chk('A17 it reports blow-up holes', /blow-up|double bogey or worse/i.test(PA17));
chk('A17 the distance tier says it has no data rather than inventing a rate', (() => {
  const sec = PA17.split('HOLE-LEVEL')[1] || '';
  return /not yet recorded|no first-putt/i.test(sec);
})());
chk('A17 no hole-level section at all when no round carries detail', (() => {
  const plain = computeMetrics([
    mkR('2026-07-05','A',123,111,47,17,77), mkR('2026-07-08','A',123,102,38,12,62),
    mkR('2026-07-10','A',123,104,46,17,54),
  ]);
  return !/HOLE-LEVEL/.test(coachPrompt(plain));
})());
```

- [ ] **Step 2: Run to confirm failure**

Run: `node test-engine.js`
Expected: fails — no `HOLE-LEVEL` section exists.

- [ ] **Step 3: Build the prompt section**

In `index.html`'s `coachPrompt`, immediately after `const confounds = roundConfounds(m);`, insert:

```js
  const ht = m.holeTier || { nRounds: 0 };
  const pct = v => v == null ? 'n/a' : Math.round(v * 100) + '%';
  let holeSection = '';
  if (ht.nRounds) {
    const p = ht.putts;
    const chipFlag = (p.afterGir != null && p.afterMiss != null && p.afterMiss > p.afterGir)
      ? ' — note this is INVERTED: putts after a miss should run lower than after a hit, because a chip should finish closer than a long first putt on a green hit. Higher after a miss points at chip proximity, not the putting stroke.'
      : '';
    const bu = ht.blowUps;
    const buTotal = bu.reduce((s, b) => s + b.blowUps, 0);
    const buStrokes = bu.reduce((s, b) => s + b.strokesFromBlowUps, 0);
    const buOver = bu.reduce((s, b) => s + b.totalOverPar, 0);
    const distReady = ht.threePutt.filter(b => b.enough);
    const distLine = distReady.length
      ? distReady.map(b => `${b.label}: 3-putt ${pct(b.threePuttRate)}, 1-putt ${pct(b.onePuttRate)} (n=${b.n})`).join('; ')
      : `not yet recorded — first-putt distance has been logged on ${ht.chip.n} hole(s), and a bucket needs ${PUTT_BUCKET_MIN_N} before any rate is reported`;
    const chipLine = ht.chip.n
      ? `median first putt after a green miss ${r1(ht.chip.median)} ft over ${ht.chip.n} hole(s); ` +
        ht.chip.buckets.map(b => `${b.label} ${pct(b.share)}`).join(', ')
      : 'no first-putt distances recorded yet';

    holeSection = `

HOLE-LEVEL DATA (${ht.nRounds} round(s) of the ${m.n} above — treat every figure in this block as provisional against that much smaller sample):
- Putts after a green hit: ${r1(p.afterGir)} over ${p.nGir} hole(s). Putts after a miss: ${r1(p.afterMiss)} over ${p.nMiss} hole(s). Bogey-golfer reference: ${p.expGir} on a hit, ${p.expMiss} after a miss.${chipFlag}
- Blow-up holes (double bogey or worse): ${buTotal} across ${ht.nRounds} round(s), accounting for ${buStrokes} of ${buOver} strokes over par.
- Over par by hole type: par 3s ${r1(ht.parType.par3)} (n=${ht.parType.n3}), par 4s ${r1(ht.parType.par4)} (n=${ht.parType.n4}), par 5s ${r1(ht.parType.par5)} (n=${ht.parType.n5}).
- 3-putt rate by first-putt distance: ${distLine}
- Chip proximity: ${chipLine}`;
  }
```

Then insert `${holeSection}` into the returned template immediately after the `LAST 5 ROUNDS:` block and before `CONFOUNDS IN THIS SAMPLE:`.

- [ ] **Step 4: Display it on the dashboard**

In `render()`'s `dash.innerHTML` template, insert this section immediately before the `Priority history` section:

```js
  ${m.holeTier && m.holeTier.nRounds ? `<div class="sec"><h2>Hole-level — ${m.holeTier.nRounds} round(s)</h2>
    <table>
      <tr><th>Measure</th><th>Value</th><th>Reference</th></tr>
      <tr><td>Putts after a green hit</td><td class="num">${r1(m.holeTier.putts.afterGir) ?? '–'}</td><td class="num">${m.holeTier.putts.expGir}</td></tr>
      <tr><td>Putts after a miss</td><td class="num">${r1(m.holeTier.putts.afterMiss) ?? '–'}</td><td class="num">${m.holeTier.putts.expMiss}</td></tr>
      <tr><td>Blow-up holes (double+)</td><td class="num">${m.holeTier.blowUps.reduce((s, b) => s + b.blowUps, 0)}</td><td class="num"></td></tr>
      <tr><td>Over par — par 3s</td><td class="num">${r1(m.holeTier.parType.par3) ?? '–'}</td><td class="num"></td></tr>
      <tr><td>Over par — par 4s</td><td class="num">${r1(m.holeTier.parType.par4) ?? '–'}</td><td class="num"></td></tr>
    </table>
    ${m.holeTier.putts.afterMiss > m.holeTier.putts.afterGir
      ? '<div class="note warn"><span class="dot"></span><span class="txt"><b>Putts after a miss exceed putts after a hit.</b> That is backwards — a chip should leave you closer than a long first putt does. Points at chip proximity rather than the putting stroke.</span></div>'
      : ''}
  </div>` : ''}
```

- [ ] **Step 5: Run the tests**

Run: `node test-engine.js`
Expected: `ALL PASS`.

- [ ] **Step 6: Commit**

```bash
git add index.html test-engine.js
git commit -m "Report the hole-level tier in the rounds prompt and dashboard"
```

---

## Task 6: README and live verification

**Files:**
- Modify: `README.md`
- Modify: `index.html` only if the smoke test finds a defect

- [ ] **Step 1: Document it**

Append to `README.md`:

```markdown

## Hole-level data

`data/hole-detail.json` holds per-hole records for rounds where the scorecard
was captured: par, score, putts, first-putt distance, GIR, fairway, tee club,
and miss direction. Send scorecard screenshots in a Claude Code session and the
data is extracted, cross-checked against the card's own printed subtotals, and
committed — there is no paste form for it.

What it unlocks that round totals cannot:

- **Putting versus chipping.** Putts after a green hit compared against putts
  after a miss. A healthy short game puts the *miss* number lower — a chip
  should finish closer than a long first putt on a green you hit. When the miss
  number is higher, the problem is chip proximity, not the stroke.
- **Blow-up holes**, counted concretely as double bogey or worse, and the share
  of your strokes over par they account for.
- **Par-3 play isolated** from par 4s and 5s, so iron play is visible
  separately from what the tee shot set up.
- **3-putt rate by first-putt distance**, once enough distances are logged.
  Three-putting from 40 feet is unremarkable; from 8 feet it is not, and a
  round-level putts total cannot tell those apart.

There is deliberately no "strokes lost to putting" figure for this split. That
number requires a baseline for how a golfer *should* putt from each distance,
published versions are calibrated for scratch or tour players, and a
self-calibrated one is circular — measuring yourself against your own average
yields zero by construction. 3-putt rate is anchored to two-putt regulation
instead, which is a rule of the game rather than a claim about other golfers.

This tier covers far fewer rounds than the 43-round differential trend, so every
figure in it carries its own sample size and the prompt is told to treat it as
provisional.
```

- [ ] **Step 2: Verify against the real committed round**

Serve the directory and open `index.html`. Confirm:
1. A **Hole-level — 1 round(s)** section appears.
2. Putts after a hit reads ≈2.3, after a miss ≈2.5, against references 2.15 / 1.95.
3. The inverted-pattern warning note is showing, since 2.47 > 2.33.
4. Blow-up holes reads 9.
5. Par 3s reads 1.8.
6. The coach prompt contains a `HOLE-LEVEL DATA (1 round(s) of the 43 above` block, and its 3-putt line says distance is not yet recorded rather than printing a rate.

- [ ] **Step 3: Verify the distance tier activates**

In the DevTools console, inject distances onto the committed round and confirm the tier wakes up:

```js
holeDetailBaseline[0].holes.forEach((h, i) => { h.firstPuttFt = [4,30,35,6,2,28,40,33,12,38,25,9,14,20,45,31,11,36][i]; });
render();
```

Expected: the 3-putt line now reports rates for any bucket reaching 10 holes and withholds the others, and chip proximity reports a median and bucket shares. Then reload the page to discard the injection — it was only in memory, and nothing writes `holeDetailBaseline` back to disk.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Document the hole-level tier and why it carries no strokes-lost figure"
```

---

## Final check

- [ ] `node test-engine.js && node test-range-engine.js && node test-course-engine.js` — three `ALL PASS`.
- [ ] `data/hole-detail.json` is tracked; `data/hole-detail/` is gone.
- [ ] `grep -rn "hole-detail/" index.html` returns nothing — no stale per-file path survives.
- [ ] `range.html` and `course.html` are untouched by this phase: `git diff --stat <first-task-commit>..HEAD -- range.html course.html` is empty.
- [ ] `git log --oneline -7` shows one descriptive commit per task.
- [ ] Remind the user to push, reporting the count from `git log origin/master..HEAD --oneline | wc -l` **re-read at that moment** rather than carried forward.
