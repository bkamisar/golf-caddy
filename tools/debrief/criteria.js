'use strict';
// Course tests for a practice priority. Every metric is lower-is-better and
// counted per hole, so a nine counts half an eighteen and the window is
// measured in holes. The pass line comes from the golfer's own recent rounds
// by bootstrap, so "would this pass by luck?" is answered from their spread,
// not from a population norm.

const { allHoles } = require('./course.js');

const suspect = r => r.putts != null && r.putts / r.holes < 1.4;

// Each metric turns the data into one value per round: { date, holes, total }.
const METRICS = {
  'putts': {
    label: 'putts',
    values: (data) => data.rounds
      .filter(r => r.putts != null && r.holes > 0 && !suspect(r))
      .map(r => ({ date: r.date, holes: r.holes, total: r.putts })),
  },
  'putts-vs-expected': {
    label: 'putts above expectation (given greens hit)',
    values: (data, E) => data.rounds
      .filter(r => r.putts != null && r.gir != null && r.holes > 0 && !suspect(r))
      .map(E('enrich'))
      .map(r => ({ date: r.date, holes: r.holes, total: r.puttsVsExp })),
  },
  'three-putts': {
    label: '3-putt holes',
    values: (data) => perRoundHoles(data, h => h.putts != null, h => h.putts >= 3),
  },
  'blow-ups': {
    label: 'double-bogey-or-worse holes',
    values: (data) => perRoundHoles(data, h => h.par != null && h.score != null, h => h.score - h.par >= 2),
  },
};

function perRoundHoles(data, usable, counts) {
  return (data.details || []).map(d => {
    const hs = (d.holes || []).filter(usable);
    return { date: d.date, holes: hs.length, total: hs.filter(counts).length };
  }).filter(v => v.holes > 0);
}

function roundValues(metric, data, E) {
  const m = METRICS[metric];
  if (!m) throw new Error(`Unknown metric "${metric}". Use one of: ${Object.keys(METRICS).join(', ')}`);
  return m.values(data, E).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}

// Small seeded generator so thresholds are identical on every run.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASELINE_ROUNDS = 10, MIN_BASELINE = 5;
const r2 = v => Math.round(v * 100) / 100;

// Rounds dated on or before `since` form the baseline (the last 10); a round
// played the same day as the debrief was part of what the debrief saw.
// Returns null with fewer than MIN_BASELINE rounds: a threshold drawn from
// three rounds would mostly measure which three they were.
function calibrate(values, since, windowHoles, improvementPer18, opts = {}) {
  const trials = opts.trials || 20000, target = opts.falsePass == null ? 0.10 : opts.falsePass;
  const base = values.filter(v => v.date <= since).slice(-BASELINE_ROUNDS);
  if (base.length < MIN_BASELINE) return { insufficient: true, baselineRounds: base.length, needed: MIN_BASELINE };
  const rnd = mulberry32(opts.seed || 1);
  const stats = new Float64Array(trials);
  for (let t = 0; t < trials; t++) {
    let holes = 0, total = 0;
    while (holes < windowHoles) {
      const v = base[Math.floor(rnd() * base.length)];
      holes += v.holes; total += v.total;
    }
    stats[t] = total / holes * 18;
  }
  stats.sort();
  // Largest threshold on a 0.5 grid that passes by luck at most `target` of
  // the time: count(stat <= thr) <= k means thr < stats[k].
  const k = Math.floor(target * trials);
  const threshold = Math.ceil(stats[k] * 2) / 2 - 0.5;
  const share = thr => { let c = 0; for (let i = 0; i < trials; i++) if (stats[i] <= thr + 1e-9) c++; return c / trials; };
  const baseHoles = base.reduce((s, v) => s + v.holes, 0);
  return {
    insufficient: false,
    baselineRounds: base.length,
    baselinePer18: r2(base.reduce((s, v) => s + v.total, 0) / baseHoles * 18),
    threshold, windowHoles, since, improvementPer18,
    falsePass: r2(share(threshold)),
    // A real improvement shifts every round's per-18 rate down by the same
    // amount, so its pass rate is the no-change distribution read at a
    // threshold that much higher.
    passIfImproved: r2(share(threshold + improvementPer18)),
  };
}

// Progress or verdict for a stored test. Rounds after `since` fill the window
// in date order; the round that crosses windowHoles counts whole.
function evaluate(test, values) {
  const after = values.filter(v => v.date > test.since);
  let holes = 0, total = 0, rounds = 0;
  for (const v of after) {
    if (holes >= test.windowHoles) break;
    holes += v.holes; total += v.total; rounds++;
  }
  const per18 = holes ? r2(total / holes * 18) : null;
  const complete = holes >= test.windowHoles;
  return {
    rounds, holes, windowHoles: test.windowHoles, per18, threshold: test.threshold, complete,
    proposed: !complete ? 'insufficient-data' : per18 <= test.threshold ? 'met' : 'not-met',
  };
}

module.exports = { METRICS, roundValues, mulberry32, calibrate, evaluate, BASELINE_ROUNDS, MIN_BASELINE };
