#!/usr/bin/env node
'use strict';
// Saves the debrief's priority to data/recommendations.json, so it reaches
// both dashboards on the next push with no download or file swap.
//
//   node tools/write-priority.js --priority "<drill>" --metric putts --improvement 4 [--window 54]
//   node tools/write-priority.js --priority "<drill>" --criterion "<free text>"   (range-originated, judged by hand)
//   add --close met|not-met|insufficient-data [--close-note "..."] when a priority is open
//   --date YYYY-MM-DD overrides today; --dry-run prints instead of writing
//
// Run only after the user has confirmed the priority and, if one is open, its
// outcome. Outcomes are never inferred.

const fs = require('fs'), path = require('path');
const { ROOT, loadEngines, loadData, localToday } = require('./debrief/load.js');
const { proposeTest, testSentence, ALL_SOURCES } = require('./debrief-facts.js');

const OUTCOMES = ['met', 'not-met', 'insufficient-data'];
const plain = v => JSON.parse(JSON.stringify(v));   // out of the vm realm

// Pure: returns the new list or throws with a message meant for the user.
// E is either engine accessor; both define the same recommendation functions.
function applyPriority(recs, opts, E) {
  const { date, priority, criterion, test, close, closeNote } = opts;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error(`Bad date "${date}".`);
  if (!priority || !criterion) throw new Error('A priority and a criterion are both required.');
  const recKey = E('recKey');
  const open = E('lastRecommendation')(recs, ALL_SOURCES);

  // recKey is date|source: a second 'round' record today would overwrite the
  // first in mergeRecommendations, so today's open one is revised in place.
  if (open && open.source === 'round' && open.date === date) {
    return plain(recs.map(r => recKey(r) === recKey(open)
      ? { ...r, priority, criterion, test: test || null } : { ...r }));
  }

  let out = plain(recs);
  const pending = out.filter(r => r.outcome === 'pending' && ALL_SOURCES.indexOf(r.source) >= 0);
  if (pending.length) {
    if (!close) throw new Error(`A priority from ${open.date} (${open.source}) is still open: "${open.priority}". Confirm its outcome with --close ${OUTCOMES.join('|')}.`);
    if (OUTCOMES.indexOf(close) < 0) throw new Error(`--close must be one of ${OUTCOMES.join(', ')}.`);
    // The newest open one gets the confirmed outcome; any older ones (only
    // possible from page edits) are closed as superseded so one stays open.
    out = out.map(r => {
      if (r.outcome !== 'pending' || ALL_SOURCES.indexOf(r.source) < 0) return r;
      return recKey(r) === recKey(open)
        ? { ...r, outcome: close, outcomeNote: closeNote || null, outcomeDate: date }
        : { ...r, outcome: 'insufficient-data', outcomeNote: `superseded by the ${date} priority`, outcomeDate: date };
    });
  } else if (close) {
    throw new Error('--close given but no priority is open.');
  }
  if (out.some(r => recKey(r) === `${date}|round`)) {
    throw new Error(`A round priority dated ${date} already exists and is closed; writing another today would overwrite it.`);
  }
  const rec = { date, source: 'round', priority, criterion, outcome: 'pending', outcomeNote: null, outcomeDate: null };
  if (test) rec.test = test;
  return plain(E('mergeRecommendations')(out, [rec]));
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') { o.dryRun = true; continue; }
    if (!a.startsWith('--') || i + 1 >= argv.length) throw new Error(`Unexpected argument "${a}".`);
    o[a.slice(2)] = argv[++i];
  }
  return o;
}

function main(argv) {
  const a = parseArgs(argv);
  const data = loadData(), E = loadEngines();
  const date = a.date || localToday();
  let test = null, criterion = a.criterion;
  if (a.metric) {
    if (isNaN(Number(a.improvement))) throw new Error("--metric needs --improvement <per 18 holes>, the change the drill is meant to make.");
    const p = proposeTest(data, E, a.metric, Number(a.improvement), a.window ? Number(a.window) : 54, date);
    if (p.insufficient) throw new Error(`Not enough rounds for a ${a.metric} test (${p.baselineRounds} of ${p.needed}).`);
    test = { metric: p.metric, threshold: p.threshold, windowHoles: p.windowHoles, since: p.since,
      falsePass: p.falsePass, passIfImproved: p.passIfImproved, improvementPer18: p.improvementPer18 };
    criterion = criterion || `${testSentence(test)[0].toUpperCase()}${testSentence(test).slice(1)}.`;
  }
  const recs = applyPriority(data.recs, { date, priority: a.priority, criterion, test, close: a.close, closeNote: a['close-note'] }, E.round);
  // Same format the pages' "Save priorities to data file" button writes.
  const json = JSON.stringify(recs, null, 1) + '\n';
  if (a.dryRun) { process.stdout.write(json); return; }
  fs.writeFileSync(path.join(ROOT, 'data', 'recommendations.json'), json);
  console.log(`Saved: ${criterion}`);
}

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(1); }
}

module.exports = { applyPriority, parseArgs, OUTCOMES };
