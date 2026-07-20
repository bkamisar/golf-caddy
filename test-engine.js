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

console.log('\n' + (fails ? fails + ' FAILURES' : 'ALL PASS'));
