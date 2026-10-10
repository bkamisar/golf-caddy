'use strict';
// Range-side facts, always one instrument at a time. E is the range-engine
// accessor from load.js. Shot side is stored in metres (+ = right).

const r1 = v => v == null || isNaN(v) ? null : Math.round(v * 10) / 10;

function sourcesOf(range, E) {
  const heal = E('healSession');
  return [...new Set((range || []).map(cs => heal(cs).source))].sort();
}

// The page's own gapping table, per instrument, never pooled.
function rangeDigest(range, E) {
  const heal = E('healSession'), groupByClub = E('groupByClub'), computeGapping = E('computeGapping');
  return sourcesOf(range, E).map(source => {
    const sessions = range.filter(cs => heal(cs).source === source);
    const clubs = computeGapping(groupByClub(sessions)).map(g => ({
      name: g.name, n: g.n, cleanCarryYd: r1(g.cleanCarryYd), carryIqrYd: r1(g.carryIqrYd),
      sideBiasYd: r1(g.sideBiasYd), sideIqrYd: r1(g.sideIqrYd), mishitRate: g.mishitRate == null ? null : Math.round(g.mishitRate * 100) / 100,
      sessionCount: g.sessionCount, lastSeen: g.lastSeen, lowConfidence: g.lowConfidence,
    }));
    return { source, sessions: sessions.length, clubs };
  });
}

// Side statistics for each driver session, clean shots only, in yards.
// Grouped per instrument first so the mishit quarantine never mixes them.
function driverSides(range, E) {
  const heal = E('healSession'), groupByClub = E('groupByClub'), quantile = E('quantile');
  const M_TO_YD = E('M_TO_YD');
  const out = [];
  sourcesOf(range, E).forEach(source => {
    const group = groupByClub(range.filter(cs => heal(cs).source === source)).find(g => g.name === 'Driver');
    if (!group) return;
    group.sessions.forEach(s => {
      const yd = s.shots.filter(x => !x.quarantined && typeof x.side === 'number')
        .map(x => x.side * M_TO_YD).sort((a, b) => a - b);
      if (!yd.length) return;
      out.push({
        date: s.date, source, n: yd.length,
        medianYd: r1(quantile(yd, 0.5)),
        iqrYd: yd.length >= 4 ? r1(quantile(yd, 0.75) - quantile(yd, 0.25)) : null,
        widthYd: r1(yd[yd.length - 1] - yd[0]),
        right: yd.filter(v => v > 0).length,
        left: yd.filter(v => v < 0).length,
      });
    });
  });
  return out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}

function findingsDigest(findings, E) {
  const grade = E('gradeFinding');
  return E('findingsForPrompt')((findings || []).map(grade));
}

module.exports = { rangeDigest, driverSides, findingsDigest };
