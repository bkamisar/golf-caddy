#!/usr/bin/env node
'use strict';
// Facts for the combined coach debrief. Numbers come from here, never from
// the model's mental arithmetic.
//
//   node tools/debrief-facts.js                         full facts report (JSON)
//   node tools/debrief-facts.js --progress              one line on the open priority
//   node tools/debrief-facts.js --propose <metric> <improvementPer18> [windowHoles]
//
// Reads only the committed data/*.json files. A priority logged on a page but
// not yet saved to data/recommendations.json is invisible here.

const { loadEngines, loadData, localToday } = require('./debrief/load.js');
const { courseFacts } = require('./debrief/course.js');
const { rangeDigest, driverSides, findingsDigest } = require('./debrief/range.js');
const { METRICS, roundValues, calibrate, evaluate } = require('./debrief/criteria.js');

const ALL_SOURCES = ['range', 'video', 'round'];

function openPriority(data, E) {
  const rec = E.round('lastRecommendation')(data.recs, ALL_SOURCES);
  if (!rec) return null;
  const evaluation = rec.test ? evaluate(rec.test, roundValues(rec.test.metric, data, E.round)) : null;
  return { rec: JSON.parse(JSON.stringify(rec)), evaluation };
}

function buildReport(data, E) {
  return {
    open: openPriority(data, E),
    course: courseFacts(data, E.round),
    range: { bySource: rangeDigest(data.range, E.range), driverSides: driverSides(data.range, E.range) },
    findings: findingsDigest(data.findings, E.range),
  };
}

const pct = v => `${Math.round(v * 100)}%`;

function testSentence(test) {
  return `${METRICS[test.metric].label} at or below ${test.threshold} per 18 holes over the next ${test.windowHoles} holes`;
}

function progressLine(data, E) {
  const open = openPriority(data, E);
  if (!open) return 'No open practice priority. Run the coach debrief to set one.';
  const { rec, evaluation: ev } = open;
  const head = `Priority from ${rec.date}: ${rec.priority}`;
  if (!ev) return `${head}. It has no machine-checkable course test; judge it by hand in the next debrief.`;
  const test = `Test: ${testSentence(rec.test)}.`;
  if (!ev.holes) return `${head}. ${test} No rounds logged since ${rec.test.since} yet.`;
  const sofar = `${ev.holes} of ${ev.windowHoles} holes over ${ev.rounds} round${ev.rounds === 1 ? '' : 's'}, ${ev.per18} per 18`;
  if (!ev.complete) return `${head}. ${test} So far: ${sofar}.`;
  return `${head}. ${test} Window complete: ${sofar} against ${ev.threshold}, which looks ${ev.proposed === 'met' ? 'MET' : 'NOT MET'}. Run the coach debrief to confirm the outcome and set the next priority.`;
}

function proposeTest(data, E, metric, improvementPer18, windowHoles = 54, since = localToday()) {
  const c = calibrate(roundValues(metric, data, E.round), since, windowHoles, improvementPer18);
  return { metric, ...c };
}

function proposalSentence(p) {
  if (p.insufficient) return `Not enough rounds to set a fair test for ${METRICS[p.metric].label}: ${p.baselineRounds} on record, ${p.needed} needed.`;
  return `Test: ${testSentence(p)} (recent average ${p.baselinePer18}). ` +
    `With no real change this passes about ${pct(p.falsePass)} of the time; ` +
    `with a real improvement of ${p.improvementPer18} per 18 it passes about ${pct(p.passIfImproved)}.`;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const data = loadData(), E = loadEngines();
  if (args[0] === '--progress') {
    console.log(progressLine(data, E));
  } else if (args[0] === '--propose') {
    const [metric, imp, win] = args.slice(1);
    if (!METRICS[metric] || isNaN(Number(imp))) {
      console.error(`Usage: --propose <${Object.keys(METRICS).join('|')}> <improvementPer18> [windowHoles]`);
      process.exit(1);
    }
    const p = proposeTest(data, E, metric, Number(imp), win ? Number(win) : 54);
    console.log(proposalSentence(p));
    console.log(JSON.stringify(p));
  } else {
    console.log(JSON.stringify(buildReport(data, E), null, 1));
  }
}

module.exports = { ALL_SOURCES, openPriority, buildReport, progressLine, proposeTest, proposalSentence, testSentence };
