const fs = require('fs');
const html = fs.readFileSync(__dirname + '/course.html', 'utf8');
eval(html.split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0]);
const R = v => v == null || isNaN(v) ? null : Math.round(v * 10) / 10;
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

// C4. Parity check for the same fix applied to range.html: a session's full
// identity (name, not just order/klass) is re-derived fresh from its raw
// clubCode via healSession/healClubSessions, since a code that once fell
// through to 'unknown' was stored with its NAME equal to the raw code itself
// ("6h"), not just a stale order number.
const staleHybridSession = {
  date: '2026-08-01', dateAssumed: false, clubCode: '6h',
  club: { code: '6h', name: '6h', order: 999, klass: 'unknown' }, // exactly what canonicalClub('6h') used to return
  tags: {},
  shots: Array.from({ length: 6 }, () => ({ clubSpeed: 32, attackAngle: 2, ballSpeed: 42, spin: 5500, carry: 116, side: 5 })),
};
const staleIronSession = { date: '2026-08-01', dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'), tags: {},
  shots: Array.from({ length: 6 }, () => ({ clubSpeed: 30, attackAngle: 0, ballSpeed: 40, spin: 6000, carry: 110, side: -3 })) };

chk('C4 healSession fixes a stale name, not just a stale order/klass', (() => {
  const h = healSession(staleHybridSession);
  return h.club.name === '6-Hybrid' && h.club.order === canonicalClub('6h').order && h.club.klass === 'hybrid';
})());

const gapsC4 = computeGapping(groupByClub([staleHybridSession, staleIronSession]));
chk('C4 groupByClub buckets the stale-named session under its healed name (no phantom "6h" row)', gapsC4.every(g => g.name !== '6h') && gapsC4.some(g => g.name === '6-Hybrid'));
const hybC4 = gapsC4.find(g => g.name === '6-Hybrid');
chk('C4 6-Hybrid heals to the current CLUB_TABLE order despite a stale stored order', hybC4.order === canonicalClub('6h').order);
chk('C4 6-Hybrid sorts before 7-Iron even with a stale stored name+order', gapsC4.findIndex(g => g.name === '6-Hybrid') < gapsC4.findIndex(g => g.name === '7-Iron'));

// New CLUB_TABLE entries added alongside this fix.
chk('C4 1-Iron and 1-Hybrid recognized', canonicalClub('1i').name === '1-Iron' && canonicalClub('1h').name === '1-Hybrid');
chk('C4 6-Wood, 8-Wood, 9-Wood recognized', canonicalClub('6w').name === '6-Wood' && canonicalClub('8w').name === '8-Wood' && canonicalClub('9w').name === '9-Wood');
chk('C4 8-Hybrid, 9-Hybrid recognized', canonicalClub('8h').name === '8-Hybrid' && canonicalClub('9h').name === '9-Hybrid');

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
  return Math.abs(g.carryIqrYd - 22.5) < 0.5 && g.sideIqrYd != null;
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

console.log('\n' + (fails ? fails + ' FAILURES' : 'ALL PASS'));
