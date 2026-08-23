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

// C4. Parity check for the same fix applied to range.html: computeGapping
// re-derives order/klass from CLUB_TABLE by name rather than trusting a
// stale order baked into an already-stored session's club object.
const staleHybridSession = {
  date: '2026-08-01', dateAssumed: false, clubCode: '6h',
  club: { code: '6h', name: '6-Hybrid', order: 999, klass: 'unknown' },
  tags: {},
  shots: Array.from({ length: 6 }, () => ({ clubSpeed: 32, attackAngle: 2, ballSpeed: 42, spin: 5500, carry: 116, side: 5 })),
};
const staleIronSession = { date: '2026-08-01', dateAssumed: false, clubCode: '7i', club: canonicalClub('7i'), tags: {},
  shots: Array.from({ length: 6 }, () => ({ clubSpeed: 30, attackAngle: 0, ballSpeed: 40, spin: 6000, carry: 110, side: -3 })) };
const gapsC4 = computeGapping(groupByClub([staleHybridSession, staleIronSession]));
const hybC4 = gapsC4.find(g => g.name === '6-Hybrid');
chk('C4 6-Hybrid heals to the current CLUB_TABLE order despite a stale stored order', hybC4.order === canonicalClub('6h').order);
chk('C4 6-Hybrid sorts before 7-Iron even with stale stored order:999', gapsC4.findIndex(g => g.name === '6-Hybrid') < gapsC4.findIndex(g => g.name === '7-Iron'));

console.log('\n' + (fails ? fails + ' FAILURES' : 'ALL PASS'));
