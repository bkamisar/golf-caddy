const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
eval(html.split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0]);
const R = v => v == null || isNaN(v) ? null : Math.round(v * 10) / 10;
let fails = 0;
const chk = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; };

// A1. CSV with a quoted comma inside a course name (classic CSV trap)
const q = `Date,Course,Rating,Slope,Score,Putts
2026-07-19,"Pebble Beach, CA",68.4,121,98,38
2026-07-08,"St. Andrews, Old",68.9,134,102,38`;
const a1 = parseGeneric(q);
chk('A1 quoted-comma course parses 2 rows', a1.rounds.length === 2);
chk('A1 rating not shifted by comma (68.4)', a1.rounds[0] && a1.rounds[0].rating === 68.4);
chk('A1 course kept whole', a1.rounds[0] && a1.rounds[0].course.includes('Pebble Beach'));

// A2. Handicap index hand-check: 20 diffs, lowest 8 avg *0.96
const twenty = Array.from({length:20},(_,i)=>({date:'2026-01-'+String(i+1).padStart(2,'0'),course:'x',rating:70,slope:113,score:100,holes:18,putts:36,gir:10,fir:50,diff:20+i}));
// diffs 20..39, lowest 8 = 20..27 avg=23.5, *0.96=22.56
chk('A2 index = 22.6 (best-8-of-20 x0.96)', R(handicapIndex(twenty.map(r=>r.diff)))===22.6);

// A3. Generic re-paste is idempotent (dup detection with generic course names)
const csv = `date,score,rating,slope,putts\n2026-07-19,98,68.4,121,38\n2026-07-08,102,68.9,134,40`;
const first = parseGeneric(csv).rounds;
const m1 = mergeRounds(first, parseGeneric(csv).rounds);
chk('A3 re-paste adds 0 duplicates', m1.added === 0 && m1.all.length === 2);

// A4. Malformed / hostile inputs must not throw
let threw = false;
try {
  parseGeneric('');
  parseGeneric('justoneline');
  parseGeneric('Date,Score\n');            // header only
  parseGeneric('Date,Score\n,,\n2026-07-19,');  // empty score
  parseGrint('garbage\nno dates here');
  computeMetrics([]);
  computeMetrics(parseGeneric('date,score\n2026-07-19,98').rounds); // 1 round, no rating
} catch(e) { threw = true; console.log('  threw:', e.message); }
chk('A4 hostile inputs never throw', !threw);

// A5. All-9-hole dataset → no 18h corpus → enough=false, no crash
const nines = `date,score,holes,rating,slope,putts\n2026-07-19,50,9,34.3,114,18\n2026-07-08,52,9,34.3,114,19\n2026-07-01,49,9,34.3,114,17`;
const m5 = computeMetrics(parseGeneric(nines).rounds);
chk('A5 all-9-hole → enough=false (no fake trend)', m5.enough === false);

// A6. Header keyword collisions: "Adjusted Gross Score" + "Score Differential"
const coll = `Date,Adjusted Gross Score,Score Differential,Slope\n2026-07-19,98,27.6,121`;
const a6 = parseGeneric(coll).rounds[0];
chk('A6 score=98 (not the differential)', a6 && a6.score === 98);
chk('A6 diff=27.6 (from differential col)', a6 && a6.diff === 27.6);

// A7. Percent signs and stray whitespace in generic cells
const pct = `Date , Score , GIR , FIR \n 2026-07-19 , 98 , 11% , 46% `;
const a7 = parseGeneric(pct).rounds[0];
chk('A7 trims + strips %: gir=11 fir=46', a7 && a7.gir === 11 && a7.fir === 46);

// A8. Duplicate same-day rounds (two rounds one date) — must both survive
const dup = `07/19/26\tCourse A
White 68.0 | 120

98
18
38
11%
46%
27.6
View |
07/19/26\tCourse B
White 70.0 | 130

104
18
44
6%
50%
30.0
View |`;
const a8 = parseGrint(dup).rounds;
const m8 = mergeRounds([], a8);
chk('A8 two rounds same date both kept', m8.all.length === 2);

// A9. Partial rounds (a walk-off before 18) count for per-hole component
// metrics but never for the handicap differential trend. Found when a real
// 13-hole round was about to be pasted: the component filter matched only
// holes===9 or holes===18, so 13 contributed to nothing, and the differential
// fallback had no hole-count guard, so it invented a differential by treating
// a 13-hole score as an 18-hole one.
const mkRound = (date, holes, score, putts) => ({
  date, course: 'Test GC', rating: 68.2, slope: 129,
  score, holes, putts, gir: 17, fir: 62, diff: null,
});

chk('A9 the differential fallback fires for a full 18', (() => {
  const r = finalizeRound(mkRound('2026-09-05', 18, 99, 44));
  return r.diff != null && Math.abs(r.diff - 27.0) < 0.1;
})());
chk('A9 the differential fallback does NOT fire for a 13-hole round', (() => {
  return finalizeRound(mkRound('2026-09-06', 13, 72, 32)).diff === null;
})());
chk('A9 a differential the source app supplied for a short round is preserved', (() => {
  const r = finalizeRound({ ...mkRound('2026-09-06', 13, 72, 32), diff: 31.4 });
  return r.diff === 31.4;
})());
chk('A9 a 13-hole round reaches the component corpus', (() => {
  const rounds = [
    finalizeRound(mkRound('2026-09-01', 18, 99, 44)),
    finalizeRound(mkRound('2026-09-02', 18, 101, 45)),
    finalizeRound(mkRound('2026-09-03', 18, 98, 43)),
    finalizeRound(mkRound('2026-09-06', 13, 72, 32)),
  ];
  const m = computeMetrics(rounds);
  return m.all.some(r => r.holes === 13 && r.puttsPH != null);
})());
chk('A9 the 13-hole round stays out of the differential trend corpus', (() => {
  const rounds = [
    finalizeRound(mkRound('2026-09-01', 18, 99, 44)),
    finalizeRound(mkRound('2026-09-02', 18, 101, 45)),
    finalizeRound(mkRound('2026-09-03', 18, 98, 43)),
    finalizeRound(mkRound('2026-09-06', 13, 72, 32)),
  ];
  // n counts only 18-hole rounds carrying a differential.
  return computeMetrics(rounds).n === 3;
})());
chk('A9 putts/hole is computed off actual holes played, not assumed 18', (() => {
  const r = finalizeRound(mkRound('2026-09-06', 13, 72, 32));
  const m = computeMetrics([r,
    finalizeRound(mkRound('2026-09-01', 18, 99, 44)),
    finalizeRound(mkRound('2026-09-02', 18, 101, 45)),
    finalizeRound(mkRound('2026-09-03', 18, 98, 43))]);
  const short = m.all.find(x => x.holes === 13);
  return Math.abs(short.puttsPH - 32 / 13) < 1e-9;
})());

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

// A16. computeMetrics surfaces the hole tier with its own sample sizes, and
// never lets the smaller tier masquerade as the full round corpus.
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

console.log('\n' + (fails ? fails + ' FAILURES' : 'ALL PASS'));
