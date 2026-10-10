'use strict';
// Loads each page's engine block into its own vm context. The two blocks
// cannot share one scope: they redeclare names such as p2 and median
// differently, and both define SOURCES and coachPrompt with different
// meanings, so concatenating them is a SyntaxError.
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

function engineBlock(file) {
  const src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const a = src.indexOf('/*ENGINE-START*/'), b = src.indexOf('/*ENGINE-END*/');
  if (a < 0 || b < 0 || b < a) throw new Error(`Engine markers missing in ${file}`);
  return src.slice(a + '/*ENGINE-START*/'.length, b);
}

// Returns an accessor, not the context: top-level const/let are not
// properties of the context object, so they can only be read by evaluating
// their name inside it.
function loadEngine(file) {
  const ctx = vm.createContext({});
  vm.runInContext(engineBlock(file), ctx, { filename: file });
  return name => vm.runInContext(name, ctx);
}

function loadEngines(root = ROOT) {
  return {
    range: loadEngine(path.join(root, 'range.html')),
    round: loadEngine(path.join(root, 'index.html')),
  };
}

function loadData(root = ROOT) {
  const J = f => JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8'));
  return {
    rounds: J('rounds.json'),
    details: J('hole-detail.json'),
    range: J('range.json'),
    findings: J('findings.json'),
    recs: J('recommendations.json'),
  };
}

// Local calendar date. toISOString() is UTC, which in New York turns every
// evening into tomorrow.
function localToday(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

module.exports = { ROOT, engineBlock, loadEngine, loadEngines, loadData, localToday };
