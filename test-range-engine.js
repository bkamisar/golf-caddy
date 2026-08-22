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

// T10a. Regression: club-speed column appearing BEFORE the club-name column
// must not hijack col.club via substring match ("club speed".includes("club")).
// Code review (post-1844f9b) found parseGenericLM's find('club') picks the
// FIRST header cell containing "club", so a header listing Club Speed before
// Club bound col.club to the speed column, producing a fabricated numeric
// "club name" like "90.5" with klass 'unknown'.
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

console.log('\n' + (fails ? fails + ' FAILURES' : 'ALL PASS'));
