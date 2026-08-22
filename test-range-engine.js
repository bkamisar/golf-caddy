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

console.log('\n' + (fails ? fails + ' FAILURES' : 'ALL PASS'));
