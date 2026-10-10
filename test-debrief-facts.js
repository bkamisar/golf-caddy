const fs = require('fs'), os = require('os'), path = require('path');
const { loadEngines, loadData, engineBlock, localToday } = require('./tools/debrief/load.js');
const C = require('./tools/debrief/course.js');
const K = require('./tools/debrief/criteria.js');
const F = require('./tools/debrief-facts.js');
const { applyPriority } = require('./tools/write-priority.js');
let fails = 0;
const chk = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const E = loadEngines();

// ── L. Loader ────────────────────────────────────────────────────────────────
chk('L1 round engine const readable (EXP_PUTT_GIR 2.15)', E.round('EXP_PUTT_GIR') === 2.15);
chk('L1 range engine var readable (M_TO_YD)', E.range('M_TO_YD') === 1.09361);
chk('L1 the two coachPrompt functions stay separate', E.range('coachPrompt') !== E.round('coachPrompt'));
const tmp = path.join(os.tmpdir(), 'no-engine-' + process.pid + '.html');
fs.writeFileSync(tmp, '<html>no markers</html>');
let threw = false; try { engineBlock(tmp); } catch (e) { threw = /markers missing/.test(e.message); }
fs.unlinkSync(tmp);
chk('L2 missing engine markers throw a clear error', threw);
chk('L3 localToday uses the local calendar date', localToday(new Date(2026, 9, 9, 23, 30)) === '2026-10-09');

// ── C. Course facts on a hand-built fixture ──────────────────────────────────
const hole = (n, par, score, putts, x = {}) => ({ hole: n, par, score, putts, firstPuttFt: null, gir: false, girMiss: null, teeClub: null, fir: null, driveMiss: null, ...x });
const details = [{ date: '2026-01-01', course: 'X', holes: [
  hole(1, 4, 5, 2, { teeClub: 'Dr', fir: true, girMiss: 'miss' }),
  hole(2, 4, 7, 3, { teeClub: 'Dr', fir: false, driveMiss: 'right' }),
  hole(3, 3, 3, 2, { teeClub: '7i', gir: true, firstPuttFt: 30 }),
  hole(4, 5, 7, 2, { teeClub: 'Dr', fir: false }),
  hole(5, 4, 6, 1, { teeClub: '3W', fir: false, driveMiss: 'left' }),
  hole(6, 3, 5, 3, { girMiss: 'short', firstPuttFt: 40 }),
] }];
const rounds = [
  { date: '2026-01-01', course: 'X', score: 33, holes: 6, putts: 13, gir: 17 },
  { date: '2026-02-01', course: 'Y', score: 90, holes: 18, putts: 36, gir: 50 },   // exp 36.9 -> -0.9
  { date: '2026-03-01', course: 'Z', score: 50, holes: 9, putts: 20, gir: 0 },     // exp 17.55 -> +2.45 (4.9 per 18)
  { date: '2026-04-01', course: 'Z', score: 50, holes: 9, putts: 11, gir: 0 },     // suspect: 11-putt nine
  { date: '2026-05-01', course: 'Z', score: 95, holes: 18, putts: 40, gir: null }, // no GIR recorded
];
const ps = C.puttsSummary(rounds.slice(1), E.round);
chk('C1 18-hole putts: suspect excluded, GIR not needed (n 2, mean 38)', ps.perRound18.n === 2 && ps.perRound18.mean === 38);
chk('C1 putts above expectation per 18 (-0.9 and +4.9 -> 2.0, 1 of 2 above)',
  ps.aboveExpectation.n === 2 && ps.aboveExpectation.meanPer18 === 2 && ps.aboveExpectation.roundsAbove === 1);
chk('C2 3-putts: 2 of 6 holes = 6 per 18', same(C.threePutts(details), { holes: 6, threePutts: 2, per18: 6 }));
const dc = C.driverCost(details);
chk('C3 driver hit 1.0 vs miss 2.5 over par -> 1.5 per miss', dc.drives === 3 && dc.overParHit === 1 && dc.overParMiss === 2.5 && dc.costPerMiss === 1.5);
chk('C3 driver cost per 18 (2 misses in 6 holes -> 6 per 18 x 1.5 = 9)', dc.missesPer18 === 6 && dc.costPer18 === 9);
chk('C3 unrecorded miss side stays unrecorded, not a miss direction',
  same(dc.missLabels, { right: 1, unrecorded: 1 }) && same(dc.driverSides, { left: 0, right: 1 }) && same(dc.allClubSides, { left: 1, right: 1 }));
chk('C4 blow-ups: 4 holes, 5 strokes beyond bogey, 10 over par',
  same(C.blowUps(rounds, details, E.round), { rounds: 1, holes: 6, blowUpHoles: 4, per18: 12, strokesBeyondBogey: 5, totalOverPar: 10 }));
chk('C5 par 3s by club', same(C.par3(details), { holes: 2, greens: 1, byClub: { '7i': { n: 1, greens: 1 }, unrecorded: { n: 1, greens: 0 } } }));
chk('C6 coverage counts only real labels', same(C.coverage(details), {
  rounds: 1, holes: 6,
  fairwayMisses: { n: 3, leftRight: 2, anyLabel: 2 },
  greenMisses: { n: 5, leftRight: 0, anyLabel: 1 },
  firstPuttDistance: 2, teeClub: 5 }));
const pd = C.puttingDistance(rounds, details, E.round);
chk('C7 first putts and chip proximity', same(pd.firstPutts, { n: 2, under25: 0 }) && same(pd.afterMissedGreen, { n: 1, medianFt: 40 }));
chk('C7 3-putt bucket below its 10-hole minimum is withheld', pd.threePuttByDistance[2].n === 2 && pd.threePuttByDistance[2].threePuttRate === null);

// ── K. Criteria ──────────────────────────────────────────────────────────────
const kd = { rounds, details };
const pv = K.roundValues('putts', kd, E.round);
chk('K1 putts values skip the suspect round and keep the hole count', pv.length === 4 && same(pv[2], { date: '2026-03-01', holes: 9, total: 20 }));
chk('K1 putts-vs-expected skips rounds without GIR', K.roundValues('putts-vs-expected', kd, E.round).length === 3);
chk('K1 three-putts and blow-ups come from hole detail',
  same(K.roundValues('three-putts', kd, E.round), [{ date: '2026-01-01', holes: 6, total: 2 }]) &&
  same(K.roundValues('blow-ups', kd, E.round), [{ date: '2026-01-01', holes: 6, total: 4 }]));
threw = false; try { K.roundValues('nope', kd, E.round); } catch (e) { threw = /Unknown metric/.test(e.message); }
chk('K1 unknown metric is a clear error', threw);

const series = (vals, holes = 18, start = 1) => vals.map((t, i) => ({ date: `2026-01-${String(start + i).padStart(2, '0')}`, holes, total: t }));
const flat = K.calibrate(series([36, 36, 36, 36, 36, 36]), '2026-12-31', 54, 1);
chk('K2 constant 36s: threshold 35.5, never passes by luck, always passes after a 1-putt gain',
  flat.threshold === 35.5 && flat.falsePass === 0 && flat.passIfImproved === 1 && flat.baselinePer18 === 36);
const nines = K.calibrate(series([18, 18, 18, 18, 18, 18], 9), '2026-12-31', 54, 1);
chk('K3 nines are normalised per hole (18 a nine = 36 per 18)', nines.threshold === 35.5 && nines.baselinePer18 === 36);
const real = series([44, 42, 40, 49, 47, 38, 46, 38, 44, 38]);
const c1 = K.calibrate(real, '2026-12-31', 54, 4), c2 = K.calibrate(real, '2026-12-31', 54, 4);
chk('K4 seeded bootstrap is deterministic', same(c1, c2));
chk('K4 threshold sits on a 0.5 grid below the mean, passes by luck <= 10%',
  c1.threshold * 2 === Math.round(c1.threshold * 2) && c1.threshold < 42.6 && c1.falsePass <= 0.10);
chk('K4 a real 4-putt gain passes far more often than luck', c1.passIfImproved > 0.5 && c1.passIfImproved > c1.falsePass);
chk('K4 baseline is the last 10 rounds', K.calibrate(series([60, 60, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36]), '2026-12-31', 54, 1).baselinePer18 === 36);
const four = series([40, 41, 42, 43]);
chk('K5 fewer than 5 baseline rounds -> insufficient', same(K.calibrate(four, '2026-12-31', 54, 4), { insufficient: true, baselineRounds: 4, needed: 5 }));
chk('K5 a round dated on the debrief day joins the baseline',
  K.calibrate(four.concat([{ date: '2026-02-01', holes: 18, total: 40 }]), '2026-02-01', 54, 4).insufficient === false);

const test = { since: '2026-02-01', windowHoles: 54, threshold: 39.5 };
const ev0 = K.evaluate(test, [{ date: '2026-02-01', holes: 18, total: 30 }]);
chk('K6 empty window (same-day round excluded) -> insufficient-data, no rate',
  ev0.holes === 0 && ev0.per18 === null && ev0.complete === false && ev0.proposed === 'insufficient-data');
const part = K.evaluate(test, [{ date: '2026-02-02', holes: 18, total: 36 }]);
chk('K6 partial window -> insufficient-data with progress', part.holes === 18 && part.per18 === 36 && part.proposed === 'insufficient-data');
const over = K.evaluate(test, [
  { date: '2026-02-02', holes: 18, total: 38 }, { date: '2026-02-03', holes: 18, total: 38 },
  { date: '2026-02-04', holes: 9, total: 19 }, { date: '2026-02-05', holes: 18, total: 44 },
  { date: '2026-02-06', holes: 18, total: 20 }]);
chk('K6 the round that crosses the window counts whole, later rounds do not',
  over.rounds === 4 && over.holes === 63 && over.complete && over.per18 === 39.71 && over.proposed === 'not-met');
chk('K6 met when the window rate is at or below the threshold',
  K.evaluate(test, series([36, 36, 36], 18, 10).map(v => ({ ...v, date: '2026-03-' + v.date.slice(-2) }))).proposed === 'met');

// ── F. Report and progress line ──────────────────────────────────────────────
const fdata = recs => ({ rounds, details, range: [], findings: [], recs });
chk('F1 no open priority', F.progressLine(fdata([]), E) === 'No open practice priority. Run the coach debrief to set one.');
const freeText = { date: '2026-01-15', source: 'range', priority: 'Wedge ladder', criterion: '8 of 10 inside 6 yd', outcome: 'pending', outcomeNote: null, outcomeDate: null };
chk('F2 a page-logged priority with no test is judged by hand', /no machine-checkable course test/.test(F.progressLine(fdata([freeText]), E)));
const withTest = (since, windowHoles = 18) => ({ ...freeText, source: 'round', test: { metric: 'putts', threshold: 39.5, windowHoles, since, falsePass: 0.09, passIfImproved: 0.7, improvementPer18: 4 } });
chk('F3 nothing logged since the priority', /No rounds logged since 2026-05-01 yet/.test(F.progressLine(fdata([withTest('2026-05-01')]), E)));
chk('F3 window in progress', /So far: 18 of 36 holes over 1 round, 40 per 18./.test(F.progressLine(fdata([withTest('2026-04-15', 36)]), E)));
// After 02-15: the 9-hole 03-01 round (20) is short of 18, the suspect 04-01 nine is skipped, 05-01 (40) completes it.
const notMet = F.progressLine(fdata([withTest('2026-02-15')]), E);
chk('F3 complete window over target proposes NOT MET and asks for a debrief',
  /Window complete: 27 of 18 holes over 2 rounds, 40 per 18 against 39.5, which looks NOT MET/.test(notMet) && /confirm the outcome/.test(notMet));
chk('F3 complete window at or under target proposes MET', /which looks MET/.test(F.progressLine(fdata([withTest('2026-01-15')]), E)));
const rep = F.buildReport(loadData(), E);
chk('F4 full report builds on the committed data',
  rep.course.coverage.holes > 0 && rep.range.bySource.length > 0 && Array.isArray(rep.findings) && 'open' in rep);
chk('F4 instruments are never pooled: one entry per source', new Set(rep.range.bySource.map(s => s.source)).size === rep.range.bySource.length);
const prop = F.proposeTest(loadData(), E, 'putts', 4, 54, '2026-10-09');
const sentence = F.proposalSentence(prop);
chk('F5 proposal sentence states both pass rates', /passes about \d+% of the time/.test(sentence) && /it passes about \d+%/.test(sentence));

// ── W. Priority writer ───────────────────────────────────────────────────────
const t1 = { metric: 'putts', threshold: 39.5, windowHoles: 54, since: '2026-10-09', falsePass: 0.09, passIfImproved: 0.73, improvementPer18: 4 };
const base = { date: '2026-10-09', priority: 'Lag ladder', criterion: 'Putts at or below 39.5 per 18', test: t1 };
const w1 = applyPriority([], base, E.round);
chk('W1 writes one pending round record with the page fields plus test',
  w1.length === 1 && same(Object.keys(w1[0]), ['date', 'source', 'priority', 'criterion', 'outcome', 'outcomeNote', 'outcomeDate', 'test']) &&
  w1[0].source === 'round' && w1[0].outcome === 'pending' && same(w1[0].test, t1));
chk('W1 output is plain objects (safe to serialise, not vm-realm)', Object.getPrototypeOf(w1[0]) === Object.prototype && Array.isArray(w1));
const w2 = applyPriority(w1, { ...base, priority: 'Lag ladder, 3 balls' }, E.round);
chk('W2 same-day open round priority is revised in place', w2.length === 1 && w2[0].priority === 'Lag ladder, 3 balls' && w2[0].outcome === 'pending');
threw = false; try { applyPriority([freeText], base, E.round); } catch (e) { threw = /still open/.test(e.message) && /--close/.test(e.message); }
chk('W3 an open priority must be closed with a confirmed outcome', threw);
const w3 = applyPriority([freeText], { ...base, close: 'met', closeNote: 'hit 8 of 10' }, E.round);
chk('W3 the open one is closed as confirmed and exactly one stays open',
  w3.length === 2 && w3[0].outcome === 'met' && w3[0].outcomeNote === 'hit 8 of 10' && w3[0].outcomeDate === '2026-10-09' &&
  w3.filter(r => r.outcome === 'pending').length === 1);
const older = { ...freeText, date: '2026-01-01', source: 'video' };
const w4 = applyPriority([older, freeText], { ...base, close: 'not-met' }, E.round);
chk('W4 extra open priorities are closed as superseded, the newest gets the outcome',
  w4.find(r => r.source === 'range').outcome === 'not-met' && w4.find(r => r.source === 'video').outcome === 'insufficient-data' &&
  /superseded/.test(w4.find(r => r.source === 'video').outcomeNote));
const closedToday = { ...w1[0], outcome: 'met', outcomeDate: '2026-10-09' };
threw = false; try { applyPriority([closedToday], base, E.round); } catch (e) { threw = /already exists/.test(e.message); }
chk('W5 a closed round priority dated today blocks a colliding second one', threw);
threw = false; try { applyPriority([freeText], { ...base, close: 'great' }, E.round); } catch (e) { threw = /must be one of/.test(e.message); }
chk('W6 invalid outcome rejected', threw);
threw = false; try { applyPriority([], { ...base, close: 'met' }, E.round); } catch (e) { threw = /no priority is open/.test(e.message); }
chk('W6 --close with nothing open rejected', threw);
const freeW = applyPriority([], { date: '2026-10-09', priority: 'Wedge gaps', criterion: 'PW/GW gap 10-15 yd on Trackman' }, E.round);
chk('W7 free-text priority has no test field', !('test' in freeW[0]));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
