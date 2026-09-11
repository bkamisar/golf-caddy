// One-time repair for data captured before per-source units existed (Task 1).
// Those sessions came from a Trackman CSV export in yards/feet/mph but were
// stored raw, and the engine reads carry/side as metres and speeds as m/s.
//
// Also stamps the known date and source: both uploads were Trackman on
// 2026-08-22, confirmed by the user. Re-running is NOT safe — it would convert
// twice — so it refuses unless every session still looks unconverted.
const fs = require('fs');
const M_TO_YD = 1.09361, FT_PER_M = 3.28084, MS_TO_MPH = 2.23694;

const inPath = process.argv[2], outPath = process.argv[3];
if (!inPath || !outPath) { console.error('usage: node tools/repair-units.js <in.json> <out.json>'); process.exit(1); }

const data = JSON.parse(fs.readFileSync(inPath, 'utf8'));

// Guard against a double conversion, which would silently shrink every number
// by another 9% with no error. Keyed on the two stamps this script itself
// applies — a real date and a source on every session — rather than on value
// magnitudes. A magnitude heuristic looked tempting (m/s speeds are ~40, mph
// ~90) but breaks on fast clubs: a 151 mph Toptracer drive is 67 m/s, which
// would read as "still imperial" and invite a second pass.
const repaired = data.length > 0
  && data.every(s => s.source) && data.every(s => s.date !== '0000-00-00');
if (repaired) {
  console.error('Refusing: every session already has a date and source. This file looks repaired.');
  console.error('Converting twice would shrink every distance by a further 9%.');
  process.exit(1);
}

let shots = 0;
const out = data.map(s => ({
  ...s,
  date: s.date === '0000-00-00' ? '2026-08-22' : s.date,
  dateAssumed: s.date === '0000-00-00' ? false : s.dateAssumed,
  source: s.source || 'trackman',
  shots: s.shots.map(x => {
    shots++;
    const y = { ...x };
    ['carry', 'total', 'height'].forEach(k => { if (y[k] != null) y[k] = y[k] / M_TO_YD; });
    if (y.side != null) y.side = y.side / FT_PER_M;
    ['clubSpeed', 'ballSpeed'].forEach(k => { if (y[k] != null) y[k] = y[k] / MS_TO_MPH; });
    return y;
  }),
}));

fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`Repaired ${out.length} club-sessions, ${shots} shots -> ${outPath}`);
out.forEach(s => {
  const c = s.shots.map(x => x.carry).filter(v => v != null).sort((a, b) => a - b);
  const m = c.length ? c[Math.floor(c.length / 2)] : null;
  console.log('  ' + (s.club.name + '        ').slice(0, 10) + (m != null ? Math.round(m * M_TO_YD) + ' yd' : '-'));
});
