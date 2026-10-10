'use strict';
// Course-side facts for the debrief. Every function takes plain data plus the
// round-engine accessor E (from load.js) and reuses the page's own analysis
// wherever it already exists. Figures are per 18 holes so 9- and 13-hole
// rounds compare fairly. Unrecorded values are skipped, never counted as misses.

const sum = a => a.reduce((s, v) => s + v, 0);
const mean = a => a.length ? sum(a) / a.length : null;
const r2 = v => v == null || isNaN(v) ? null : Math.round(v * 100) / 100;
const byDate = (a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
const allHoles = details => (details || []).flatMap(d => (d.holes || []).map(h => ({ ...h, date: d.date })));
// Same data-entry quarantine computeMetrics applies (an 11-putt nine).
const suspect = r => r.putts != null && r.putts / r.holes < 1.4;

function puttsSummary(rounds, E) {
  const enrich = E('enrich');
  const r18 = rounds.filter(r => r.holes === 18 && r.putts != null && !suspect(r)).sort(byDate);
  const recent = r18.slice(-10).map(r => r.putts);
  const mu = mean(recent);
  const sd = recent.length > 1 ? Math.sqrt(sum(recent.map(v => (v - mu) ** 2)) / (recent.length - 1)) : null;
  const exp = rounds.filter(r => r.putts != null && r.gir != null && !suspect(r)).map(enrich);
  return {
    perRound18: { n: r18.length, mean: r2(mean(r18.map(r => r.putts))) },
    recent10: { n: recent.length, values: recent, mean: r2(mu), sd: r2(sd) },
    aboveExpectation: {
      n: exp.length,
      meanPer18: r2(mean(exp.map(r => r.puttsVsExpPH * 18))),
      roundsAbove: exp.filter(r => r.puttsVsExp > 0).length,
    },
  };
}

function threePutts(details) {
  const holes = allHoles(details).filter(h => h.putts != null);
  const n = holes.filter(h => h.putts >= 3).length;
  return { holes: holes.length, threePutts: n, per18: holes.length ? r2(n / holes.length * 18) : null };
}

// Cost of a missed driver fairway against a hit one, from the golfer's own
// holes. Par 3s are excluded (no drive) and so are holes with fir unrecorded.
function driverCost(details) {
  const holes = allHoles(details);
  const drives = holes.filter(h => h.teeClub === 'Dr' && h.par !== 3 && h.fir != null && h.score != null);
  const hit = drives.filter(h => h.fir), miss = drives.filter(h => !h.fir);
  const over = a => mean(a.map(h => h.score - h.par));
  const cost = hit.length && miss.length ? over(miss) - over(hit) : null;
  const labels = {};
  miss.forEach(h => { const k = h.driveMiss || 'unrecorded'; labels[k] = (labels[k] || 0) + 1; });
  const sides = a => ({
    left: a.filter(h => h.driveMiss === 'left').length,
    right: a.filter(h => h.driveMiss === 'right').length,
  });
  const allMiss = holes.filter(h => h.par !== 3 && h.fir === false);
  const missesPer18 = holes.length ? miss.length / holes.length * 18 : null;
  return {
    drives: drives.length,
    fairwayRate: drives.length ? r2(hit.length / drives.length) : null,
    overParHit: r2(over(hit)), overParMiss: r2(over(miss)),
    costPerMiss: r2(cost),
    missesPer18: r2(missesPer18),
    costPer18: cost == null ? null : r2(missesPer18 * cost),
    missLabels: labels,
    driverSides: sides(miss),
    allClubSides: sides(allMiss),
  };
}

function blowUps(rounds, details, E) {
  const per = E('blowUpHoles')(E('attachHoleDetail')(rounds, details));
  const holes = sum(per.map(p => p.holes)), n = sum(per.map(p => p.blowUps));
  return {
    rounds: per.length, holes, blowUpHoles: n,
    per18: holes ? r2(n / holes * 18) : null,
    // Strokes beyond bogey on those holes: what avoiding the double would save.
    strokesBeyondBogey: sum(per.map(p => p.strokesFromBlowUps)) - n,
    totalOverPar: sum(per.map(p => p.totalOverPar)),
  };
}

function par3(details) {
  const p3 = allHoles(details).filter(h => h.par === 3);
  const byClub = {};
  p3.forEach(h => {
    const k = h.teeClub || 'unrecorded';
    byClub[k] = byClub[k] || { n: 0, greens: 0 };
    byClub[k].n++;
    if (h.gir) byClub[k].greens++;
  });
  return { holes: p3.length, greens: p3.filter(h => h.gir).length, byClub };
}

function coverage(details) {
  const holes = allHoles(details);
  const fMiss = holes.filter(h => h.par !== 3 && h.fir === false);
  const gMiss = holes.filter(h => h.gir === false);
  const lr = v => v === 'left' || v === 'right';
  const labelled = v => v != null && v !== 'miss';
  return {
    rounds: (details || []).length, holes: holes.length,
    fairwayMisses: { n: fMiss.length, leftRight: fMiss.filter(h => lr(h.driveMiss)).length, anyLabel: fMiss.filter(h => labelled(h.driveMiss)).length },
    greenMisses: { n: gMiss.length, leftRight: gMiss.filter(h => lr(h.girMiss)).length, anyLabel: gMiss.filter(h => labelled(h.girMiss)).length },
    firstPuttDistance: holes.filter(h => h.firstPuttFt != null).length,
    teeClub: holes.filter(h => h.teeClub).length,
  };
}

function puttingDistance(rounds, details, E) {
  const withDetail = E('roundsWithDetail')(E('attachHoleDetail')(rounds, details));
  const cp = E('chipProximity')(withDetail);
  const firsts = allHoles(details).filter(h => typeof h.firstPuttFt === 'number');
  return {
    threePuttByDistance: E('threePuttRates')(withDetail).map(b => ({
      label: b.label, n: b.n, enough: b.enough, threePuttRate: r2(b.threePuttRate),
    })),
    afterMissedGreen: { n: cp.n, medianFt: cp.median },
    firstPutts: { n: firsts.length, under25: firsts.filter(h => h.firstPuttFt < 25).length },
  };
}

function courseFacts(data, E) {
  const { rounds, details } = data;
  return {
    putts: puttsSummary(rounds, E),
    threePutts: threePutts(details),
    driver: driverCost(details),
    blowUps: blowUps(rounds, details, E),
    par3: par3(details),
    puttingDistance: puttingDistance(rounds, details, E),
    coverage: coverage(details),
  };
}

module.exports = { allHoles, puttsSummary, threePutts, driverCost, blowUps, par3, coverage, puttingDistance, courseFacts };
