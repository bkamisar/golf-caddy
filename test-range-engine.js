const fs = require('fs');
const html = fs.readFileSync(__dirname + '/range.html', 'utf8');
eval(html.split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0]);
const R = v => v == null || isNaN(v) ? null : Math.round(v * 10) / 10;
let fails = 0;
const chk = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; };

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

// T32. Bug report: 6-Hybrid (and 7-Hybrid) fell through to 'unknown'/order 999
// and sorted to the bottom of the gapping table instead of with the other
// hybrids. CLUB_TABLE jumped straight from 5-Hybrid to 2-Iron with no 6h/7h
// entry — same gap pattern already flagged for woods (5w->7w skips 6w).
chk('T32 6h recognized as 6-Hybrid, hybrid class', canonicalClub('6h').name === '6-Hybrid' && canonicalClub('6h').klass === 'hybrid');
chk('T32 h6 (alt notation) also recognized', canonicalClub('h6').name === '6-Hybrid' && canonicalClub('h6').klass === 'hybrid');
chk('T32 7h recognized as 7-Hybrid, hybrid class', canonicalClub('7h').name === '7-Hybrid' && canonicalClub('7h').klass === 'hybrid');
chk('T32 6-Hybrid sorts with the other hybrids, not at the bottom', canonicalClub('6h').order > canonicalClub('5h').order && canonicalClub('6h').order < canonicalClub('2i').order);
chk('T32 7-Hybrid sorts before irons', canonicalClub('7h').order < canonicalClub('2i').order);
// "6 Hybrid" from a generic CSV import must resolve the same way (normalizeClubCode -> canonicalClub)
chk('T32 spelled-out "6 Hybrid" from generic CSV also resolves correctly', canonicalClub(normalizeClubCode('6 Hybrid')).name === '6-Hybrid');

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

// T8. Generic launch-monitor CSV fallback (well-formed, index-based mapping)
const genCsv = `Date,Club,Club Speed,Ball Speed,Spin Rate,Carry,Side\n` +
  `2026-08-15,7 Iron,90.5,120.3,6200,145.2,-3.1\n` +
  `2026-08-15,7 Iron,91.0,121.0,6100,147.0,2.4\n` +
  `2026-08-15,Driver,105.2,155.0,2400,240.0,5.0`;
// Explicit metric units: this test checks column-mapping/grouping logic, not
// unit conversion (covered separately by T36), so pass through unconverted.
const p8 = parseGenericLM(genCsv, { distance: 'm', side: 'm', speed: 'ms' });
chk('T8 two club-sessions grouped (7 Iron, Driver)', p8.sessions.length === 2);
const s8seven = p8.sessions.find(s => s.club.name === '7-Iron');
chk('T8 7-Iron session has 2 shots', s8seven && s8seven.shots.length === 2);
chk('T8 date parsed', s8seven && s8seven.date === '2026-08-15');
chk('T8 side numeric passthrough (no L/R suffix needed)', s8seven && s8seven.shots[0].side === -3.1);

// T9. SOURCES registry wires both adapters
chk('T9 trackman source present', typeof SOURCES.trackman.parse === 'function');
chk('T9 generic source present', typeof SOURCES.generic.parse === 'function');
chk('T9 trackman source parses the sample', SOURCES.trackman.parse(SAMPLE_7I).sessions.length === 1);

// T10a. Regression: club-speed column appearing BEFORE the club-name column
// must not hijack col.club via substring match ("club speed".includes("club")).
// Code review (post-1844f9b) found parseGenericLM's find('club') picks the
// FIRST header cell containing "club", so a header listing Club Speed before
// Club bound col.club to the speed column, producing a fabricated numeric
// "club name" like "90.5" with klass 'unknown'.
const genCsvSpeedFirst = `Date,Club Speed,Club,Ball Speed,Carry\n` +
  `2026-08-15,90.5,7 Iron,120.3,145.2\n` +
  `2026-08-15,91.0,7 Iron,121.0,147.0`;
// Explicit metric units: this test checks the club/club-speed column-hijack
// regression, not unit conversion (covered separately by T36).
const p10a = parseGenericLM(genCsvSpeedFirst, { distance: 'm', side: 'm', speed: 'ms' });
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

// T21. (computeVerdicts) Verdicts fire for a clear carry trend, using the T17 synthetic history
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

// T25. Coach prompt includes gapping numbers and verdict text, strips HTML tags
// NOTE: variable named v25b (not v25) — `const v25` is already declared above
// for Task 9's fix-round regression test, which also carries the "T25" label;
// reusing `v25` here would be a real SyntaxError (duplicate const), not just a
// cosmetic label clash, so this test's local variables are suffixed "b".
const v25b = computeVerdicts(groups21, gaps21, []);
const prompt25 = coachPrompt(gaps21, v25b);
chk('T25 prompt mentions all four coaches', ['FALDO','BRYSON','FAXON','PHIL'].every(name => prompt25.includes(name)));
chk('T25 prompt includes club yardage', prompt25.includes('7-Iron'));
chk('T25 prompt has no leftover HTML tags', !/<\/?b>/.test(prompt25));

// T28. shotKey must never throw regardless of field types — this is the root-
// cause fix for a bug class found across 3 prior doImport validation rounds:
// a shot with a non-numeric field (e.g. corrupted/imported data) must degrade
// safely (empty string in that field's fingerprint slot), not crash.
const garbageShot = { clubSpeed: 32, carry: '150', side: NaN };
let threw28 = false;
let key28;
try { key28 = shotKey(garbageShot); } catch (e) { threw28 = true; }
chk('T28 shotKey does not throw on non-numeric/NaN fields', !threw28);
chk('T28 shotKey still returns a string', typeof key28 === 'string');

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

// T30. Out-of-order session input never reverses the trend. Two things are
// checked separately: groupByClub's OWN sort (asserted directly on its output
// dates, isolating that specific mechanism — computeTrend has its own
// independent defensive sort too, so routing through computeTrend alone would
// still pass even if groupByClub's sort were deleted, giving false confidence)
// and the end-to-end trend result staying correct either way.
const shuffled = [hist17[3], hist17[0], hist17[4], hist17[1], hist17[2]]; // scrambled order
const shuffledGroup = groupByClub(shuffled)[0];
chk('T30 groupByClub itself sorts sessions ascending by date', shuffledGroup.sessions.map(s => s.date).join(',') === hist17.map(s => s.date).join(','));
const t30 = computeTrend(shuffledGroup.sessions);
const t30sorted = computeTrend(groupByClub(hist17)[0].sessions);
chk('T30 shuffled input yields identical end-to-end trend to sorted input', t30.carry.recent === t30sorted.carry.recent && t30.carry.baseline === t30sorted.carry.baseline);

// T31. Unrecognized club code degrades gracefully instead of failing the parse
const weirdClub = SAMPLE_7I.replace('7i\n7IronHide', 'XYZ9\nMysteryClub');
const p31 = parseTrackman(weirdClub);
chk('T31 unrecognized code still parses shots', p31.sessions.length === 1 && p31.sessions[0].shots.length === 12);
chk('T31 club falls back to Unknown-class with raw code as name', p31.sessions[0].club.klass === 'unknown' && p31.sessions[0].club.name === 'XYZ9');

// T33. computeSavedSessionRows: one row per stored (date, club) entry, sorted
// most-recent-first, with quarantine already applied to clean/total/mishitRate.
const savedRows33 = computeSavedSessionRows(groups14);
chk('T33 one row for the single real 7i session', savedRows33.length === 1);
chk('T33 row names the right club and date', savedRows33[0].clubName === '7-Iron' && savedRows33[0].date === '2026-08-22');
chk('T33 row carries the known quarantine result (10 clean of 12)', savedRows33[0].clean === 10 && savedRows33[0].total === 12);
chk('T33 mishit rate matches (2/12 rounded)', savedRows33[0].mishitRate === Math.round(2 / 12 * 100));

const twoClubSessions33 = [
  { date: '2026-08-01', dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'), tags: {},
    shots: Array.from({ length: 4 }, () => ({ clubSpeed: 32, attackAngle: 2, ballSpeed: 42, spin: 5500, carry: 115, side: 0 })) },
  { date: '2026-08-10', dateAssumed: false, clubCode: 'Dr', club: canonicalClub('Dr'), tags: {},
    shots: Array.from({ length: 3 }, () => ({ clubSpeed: 47, attackAngle: 2, ballSpeed: 68, spin: 2400, carry: 225, side: 0 })) },
];
const savedRows33b = computeSavedSessionRows(groupByClub(twoClubSessions33));
chk('T33 two different clubs on two different dates both appear', savedRows33b.length === 2);
chk('T33 sorted most-recent-first (Driver 08-10 before 7-Iron 08-01)', savedRows33b[0].date === '2026-08-10' && savedRows33b[1].date === '2026-08-01');

// T34. coachPrompt's OBJECTIVE DATA SUMMARY: exhaustive per-club facts, a full
// trend line for clubs with enough session history, an explicit "not enough
// history" line for clubs without, and the ball/weather caveat note when tags
// are missing/differ (hist17 has no tags at all on any of its 5 sessions).
const prompt34 = coachPrompt(gaps21, v21, groups21);
chk('T34 has the objective summary section', prompt34.includes('OBJECTIVE DATA SUMMARY'));
chk('T34 has a full trend line for 7-Iron (5 sessions, enough history)', prompt34.includes('Trend (last 2 sessions vs previous 3):'));
chk('T34 trend line reports all 7 tracked metrics', ['carry', 'ball speed', 'spin', 'club speed', 'attack angle', 'side bias', 'mishit rate'].every(k => prompt34.includes(k)));
chk('T34 caveat note appears (hist17 has no tags anywhere)', prompt34.includes('conditions vary or untagged'));
chk('T34 no leftover HTML tags', !/<\/?b>/.test(prompt34));

const prompt34b = coachPrompt(computeGapping(groups14), computeVerdicts(groups14, computeGapping(groups14), []), groups14);
chk('T34 club with only 1 session gets the "not enough history" line, not a trend', prompt34b.includes('(not enough session history yet for a trend line)') && !prompt34b.includes('Trend (last 2 sessions'));

// T35. Bug report: 6-Hybrid showing out of order in the clubs display. The
// deeper root cause wasn't just a stale order NUMBER (fixed in a first pass)
// — it was that a session saved before 6-Hybrid existed in CLUB_TABLE was
// stored with its NAME wrong too: canonicalClub('6h') used to fall through
// to the 'unknown' branch, which names the club after the raw code itself
// ("6h"), not "6-Hybrid". That fragments the club into a separate,
// permanently-mis-sorted row rather than just sorting the right row wrong.
// Fix: healSession/healClubSessions re-derive the full identity (name AND
// order AND klass) from the immutable clubCode on every read, and every
// consumer (groupByClub, load(), mergeClubSessions' dedup key) goes through
// that instead of trusting whatever was computed and stored at parse time.
const staleHybridSession = {
  date: '2026-08-01', dateAssumed: false, clubCode: '6h',
  club: { code: '6h', name: '6h', order: 999, klass: 'unknown' }, // exactly what canonicalClub('6h') used to return
  tags: {},
  shots: Array.from({ length: 6 }, () => ({ clubSpeed: 32, attackAngle: 2, ballSpeed: 42, spin: 5500, carry: 116, side: 5 })),
};
const staleIronSession = { date: '2026-08-01', dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'), tags: {},
  shots: Array.from({ length: 6 }, () => ({ clubSpeed: 30, attackAngle: 0, ballSpeed: 40, spin: 6000, carry: 110, side: -3 })) };

chk('T35 healSession fixes a stale name, not just a stale order/klass', (() => {
  const h = healSession(staleHybridSession);
  return h.club.name === '6-Hybrid' && h.club.order === canonicalClub('6h').order && h.club.klass === 'hybrid';
})());
chk('T35 healClubSessions maps every session, preserves shots untouched', (() => {
  const healed = healClubSessions([staleHybridSession]);
  return healed.length === 1 && healed[0].shots === staleHybridSession.shots;
})());
chk('T35 healClubSessions on empty/undefined input returns empty array', healClubSessions([]).length === 0 && healClubSessions(undefined).length === 0);

const gaps35 = computeGapping(groupByClub([staleHybridSession, staleIronSession]));
chk('T35 groupByClub buckets the stale-named session under its healed name (no phantom "6h" row)', gaps35.every(g => g.name !== '6h') && gaps35.some(g => g.name === '6-Hybrid'));
const hyb35 = gaps35.find(g => g.name === '6-Hybrid');
chk('T35 6-Hybrid heals to the current CLUB_TABLE order despite a stale stored order', hyb35.order === canonicalClub('6h').order);
chk('T35 6-Hybrid sorts before 7-Iron even with a stale stored name+order', gaps35.findIndex(g => g.name === '6-Hybrid') < gaps35.findIndex(g => g.name === '7-Iron'));

// A re-paste of the SAME club under a NOW-correct name must merge into the
// stale-named session's row, not sit alongside it as a second "6-Hybrid".
const freshHybridSameDate = { date: '2026-08-01', dateAssumed: false, clubCode: '6h', club: canonicalClub('6h'), tags: {},
  shots: Array.from({ length: 3 }, () => ({ clubSpeed: 33, attackAngle: 2, ballSpeed: 43, spin: 5400, carry: 118, side: 4 })) };
const merged35 = mergeClubSessions([staleHybridSession], [freshHybridSameDate]);
chk('T35 merge keys a stale-named existing session against a fresh-named incoming one as the SAME club-session (not split into two rows)', merged35.all.length === 1);

// New CLUB_TABLE entries added alongside this fix — every gap in the
// numeric run (woods 2-9, hybrids 1-9, irons 1-9) is now covered.
chk('T35 1-Iron recognized, sorts before 2-Iron', canonicalClub('1i').name === '1-Iron' && canonicalClub('1i').klass === 'iron' && canonicalClub('1i').order < canonicalClub('2i').order);
chk('T35 6-Wood recognized, sorts between 5-Wood and 7-Wood', canonicalClub('6w').name === '6-Wood' && canonicalClub('6w').order > canonicalClub('5w').order && canonicalClub('6w').order < canonicalClub('7w').order);
chk('T35 8-Wood and 9-Wood recognized, sort before hybrids', canonicalClub('8w').name === '8-Wood' && canonicalClub('9w').name === '9-Wood' && canonicalClub('9w').order < canonicalClub('1h').order);
chk('T35 1-Hybrid recognized, sorts before 2-Hybrid', canonicalClub('1h').name === '1-Hybrid' && canonicalClub('1h').klass === 'hybrid' && canonicalClub('1h').order < canonicalClub('2h').order);
chk('T35 8-Hybrid and 9-Hybrid recognized, sort before irons', canonicalClub('8h').name === '8-Hybrid' && canonicalClub('9h').name === '9-Hybrid' && canonicalClub('9h').order < canonicalClub('1i').order);
chk('T35 klass also heals from "unknown" to "hybrid"', hyb35.klass === 'hybrid');

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

// T38. source is part of the stored model, normalized on read.
chk('T38 healSession normalizes a missing source to "unknown"',
  healSession({ date: '2026-08-01', clubCode: '7i', club: canonicalClub('7i'), tags: {}, shots: [] }).source === 'unknown');
chk('T38 healSession preserves an explicit source',
  healSession({ date: '2026-08-01', clubCode: '7i', club: canonicalClub('7i'), source: 'toptracer', tags: {}, shots: [] }).source === 'toptracer');
chk('T38 healSession rejects an unrecognized source as "unknown"',
  healSession({ date: '2026-08-01', clubCode: '7i', club: canonicalClub('7i'), source: 'nonsense', tags: {}, shots: [] }).source === 'unknown');

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

// T40. Fallback quarantine for sources with no club speed.
// Real values from the project's Toptracer session: a 19-yard 7-iron off a
// 2 ft peak, and a 45-yard drive launched at 1 degree with 1 ft of height.
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

// T37. Sources are never pooled. Bug found on the live site: range.html
// defaulted to an "All sources" view that ran computeGapping over both
// instruments' shots at once. The result was a median that landed wherever the
// shot-count ratio put it — 7-Iron showed 127 yds when Trackman said 121 and
// Toptracer said 139, matching neither, and leaning a different direction per
// club. preferredSource picks exactly one, and no caller may blend.
const poolTm = (date, code, carryM) => ({
  date, dateAssumed: false, clubCode: code, club: canonicalClub(code),
  source: 'trackman', tags: {},
  shots: Array.from({ length: 8 }, (_, i) => ({
    clubSpeed: 33, attackAngle: 2, ballSpeed: 43, spin: 5400,
    carry: carryM + i * 0.1, side: 2,
  })),
});
const poolTt = (date, code, carryM) => ({ ...poolTm(date, code, carryM), source: 'toptracer' });

chk('T37 preferredSource picks the most recent session\'s source', (() => {
  return preferredSource([poolTm('2026-08-22', '7i', 108), poolTt('2026-09-11', '7i', 125)]) === 'toptracer';
})());
chk('T37 preferredSource is unaffected by session ordering in the array', (() => {
  return preferredSource([poolTt('2026-09-11', '7i', 125), poolTm('2026-08-22', '7i', 108)]) === 'toptracer';
})());
chk('T37 preferredSource on a single-source bag returns that source', (() => {
  return preferredSource([poolTm('2026-08-22', '7i', 108)]) === 'trackman';
})());
chk('T37 preferredSource on empty input returns null, does not throw', preferredSource([]) === null);
chk('T37 an untagged legacy session heals to "unknown" rather than undefined', (() => {
  const legacy = { date: '2026-01-01', clubCode: '7i', club: canonicalClub('7i'), tags: {}, shots: [] };
  return preferredSource([legacy]) === 'unknown';
})());

chk('T37 filtering to one source reproduces that source\'s own carry exactly', (() => {
  const mixed = [poolTm('2026-08-22', '7i', 108), poolTt('2026-09-11', '7i', 125)];
  const tmOnly = mixed.filter(cs => healSession(cs).source === 'trackman');
  const soloCarry = computeGapping(groupByClub([poolTm('2026-08-22', '7i', 108)]))[0].cleanCarryYd;
  const filteredCarry = computeGapping(groupByClub(tmOnly))[0].cleanCarryYd;
  return Math.abs(soloCarry - filteredCarry) < 1e-9;
})());

chk('T37 pooling both sources would land between them — which is why it is not offered', (() => {
  const mixed = [poolTm('2026-08-22', '7i', 108), poolTt('2026-09-11', '7i', 125)];
  const tm = computeGapping(groupByClub(mixed.filter(c => healSession(c).source === 'trackman')))[0].cleanCarryYd;
  const tt = computeGapping(groupByClub(mixed.filter(c => healSession(c).source === 'toptracer')))[0].cleanCarryYd;
  const pooled = computeGapping(groupByClub(mixed))[0].cleanCarryYd;
  // Guards the premise of this whole fix: the blend genuinely matches neither.
  return pooled > tm + 1 && pooled < tt - 1;
})());

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
  // 10 clean carries 100..145, run through this file's existing quantile()
  // (linear-interpolation / numpy-default definition, same one median() uses):
  // p25 = 111.25, p75 = 133.75, IQR = 22.5.
  const g = computeGapping(groupByClub([dispSess([100,105,110,115,120,125,130,135,140,145])]))[0];
  return Math.abs(g.carryIqrYd - 22.5) < 0.5;
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

// T44. Confounds are computed and handed to the model rather than left for it
// to infer. Each is a plain sentence; the prompt embeds them verbatim.
const t44Sess = carries => ({
  date: '2026-09-01', dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'),
  source: 'trackman', tags: {},
  shots: carries.map(c => ({ clubSpeed: 33, attackAngle: 2, ballSpeed: 43, spin: 5400, carry: c / M_TO_YD, side: 0 })),
});

chk('T44 names the measurement source and warns against cross-instrument reads', (() => {
  const c = rangeConfounds(computeGapping(groupByClub([t44Sess([118,120,122,120,119,121])])), 'toptracer');
  return c.some(x => /toptracer/i.test(x)) && c.some(x => /instrument|Trackman/i.test(x));
})());
chk('T44 flags clubs with too few clean shots to trust', (() => {
  const c = rangeConfounds(computeGapping(groupByClub([t44Sess([118,120,122])])), 'trackman');
  return c.some(x => /fewer than 5 clean shots|7-Iron/i.test(x));
})());
chk('T44 flags clubs seen in only one session as having no trend', (() => {
  const c = rangeConfounds(computeGapping(groupByClub([t44Sess([118,120,122,120,119,121])])), 'trackman');
  return c.some(x => /one session/i.test(x));
})());
chk('T44 returns an array of plain strings with no HTML', (() => {
  const c = rangeConfounds(computeGapping(groupByClub([t44Sess([118,120,122,120,119,121])])), 'trackman');
  return Array.isArray(c) && c.every(x => typeof x === 'string' && !/[<>]/.test(x));
})());
chk('T44 tolerates empty gapping without throwing', Array.isArray(rangeConfounds([], null)));

console.log('\n' + (fails ? fails + ' FAILURES' : 'ALL PASS'));
