# Plain-Language Findings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `range.html`'s "Open swing findings" section readable by a golfer, by separating a new plain-language layer from the existing technical record.

**Architecture:** `findingsForPrompt()` currently serves both the LLM prompt and the dashboard. Add a second function, `findingsForDisplay()`, that returns structured rows carrying only golfer-facing text. Evergreen terminology explainers move into `FINDING_TAXONOMY` (written once); per-swing plain text becomes a new `plain` field on each finding (written at analysis time). The technical `note` stays untouched and stays out of the UI.

**Tech Stack:** Plain ES5-style JS inside HTML `<script>` blocks, extracted and tested in Node via `eval` of the `/*ENGINE-START*/…/*ENGINE-END*/` block. No dependencies, no build step.

**Working rules for this repo:** Work directly on `master` — do NOT create a branch or worktree. Local commits only; never `git push`. End every commit message with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

**Critical convention:** Everything inside `/*ENGINE-START*/…/*ENGINE-END*/` must be declared with `var`/`function`, never `const`/`let` — the block is extracted and `eval`'d, and `const`/`let` do not become visible to the calling scope.

**Spec:** `docs/superpowers/specs/2026-09-14-plain-language-findings-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `range.html` | Engine + dashboard UI | Taxonomy gains 2 fields/entry; new `findingsForDisplay()`; dashboard render swapped |
| `course.html` | Mirrors range's engine block byte-for-byte | Re-mirrored (it carries `FINDING_TAXONOMY`; displays no findings) |
| `test-range-engine.js` | Engine tests | New T48 block |
| `test-course-engine.js` | Parity tests | No edit; must still pass |
| `data/findings.json` | Stored findings | 3 records gain a `plain` field |
| `.claude/skills/swing-video-analysis/SKILL.md` | How findings get written | New section: voice rules for `plain` |

---

## Task 1: Taxonomy gains plain names and explainers

**Files:**
- Modify: `range.html` (the `FINDING_TAXONOMY` block, currently lines 952–962)
- Modify: `test-range-engine.js`

- [ ] **Step 1: Write the failing test**

Insert into `test-range-engine.js` immediately before the final `console.log` line:

```js
// T48. The taxonomy carries the evergreen half of the explanation: what a
// pattern IS never changes, only what a given swing did. Keeping it here means
// the definition is written once rather than improvised per session.
chk('T48 every taxonomy entry has a plainName and an explainer', (() => {
  return Object.keys(FINDING_TAXONOMY).every(k => {
    const t = FINDING_TAXONOMY[k];
    return typeof t.plainName === 'string' && t.plainName.length > 0
        && typeof t.explainer === 'string' && t.explainer.length > 20;
  });
})());
chk('T48 plainName avoids the jargon term it is replacing', (() => {
  return FINDING_TAXONOMY['early-extension'].plainName.indexOf('extension') < 0;
})());
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd "C:/Users/bkami/Desktop/AI Tools/golf-caddy" && node test-range-engine.js
```

Expected: two `FAIL T48 …` lines and a failure count, because `plainName`/`explainer` do not exist yet.

- [ ] **Step 3: Replace the taxonomy block**

In `range.html`, replace the entire `var FINDING_TAXONOMY = { … };` block with:

```js
var FINDING_TAXONOMY = {
  'early-extension': {
    label: 'early extension', angles: ['down-the-line'],
    plainName: 'standing up through the ball',
    explainer: 'Whether you hold the posture you set up in through impact, or your hips and chest rise and drift toward the ball. It matters because standing up takes away the space your arms need to swing through, so the body has to find a compensation somewhere else.'
  },
  'swing-plane': {
    label: 'swing plane', angles: ['down-the-line'],
    plainName: 'how steep or shallow the club swings',
    explainer: 'The tilt of the arc the club swings on — steep and upright, or shallow and more around your body. It matters because the direction the club is travelling at impact is one of the two things that decide where the ball starts and how it curves; the other is where the clubface points, which video from behind cannot show.'
  },
  'low-point-control': {
    label: 'low point control', angles: ['front-on'],
    plainName: 'where the club bottoms out',
    explainer: 'Where the club reaches the bottom of its arc, relative to the ball. It matters because an iron strikes best when the low point is just past the ball; when it falls behind the ball you catch it fat, and the instinctive fix of rising up to miss the ground is where most thin shots come from.'
  },
  'weight-transfer-quality': {
    label: 'weight transfer quality', angles: ['front-on'],
    plainName: 'shifting your weight forward',
    explainer: 'Whether your weight actually moves onto your front foot through the downswing, or hangs back on your trail foot. It matters because hanging back moves the bottom of your swing behind the ball.'
  },
  'static-lower-body-transition': {
    label: 'static lower body at transition', angles: ['front-on'],
    plainName: 'starting down with your upper body',
    explainer: 'Whether your lower body starts the downswing, or your arms and shoulders start it while your legs stay put. It matters because the order things move in is where most easy speed comes from.'
  },
  'backswing-width-turn': {
    label: 'backswing width and turn', angles: null,
    plainName: 'how far back and how wide you swing',
    explainer: 'How far your hands stay from your body and how far your shoulders rotate on the way back. It matters because together they set how much room you have to build speed coming down.'
  },
  'finish-balance': {
    label: 'finish balance', angles: null,
    plainName: 'holding your finish',
    explainer: 'Whether you finish in a settled, balanced position and hold it, or have to step or stumble to catch yourself. It matters because losing balance at the end usually means something was off balance earlier.'
  },
  'grip-setup': {
    label: 'grip and setup', angles: null,
    plainName: 'how you hold the club and stand to it',
    explainer: 'How you hold the club and how you stand to the ball before anything moves. It matters because it is the one part of the swing you can fix at full speed, without needing athletic timing.'
  },
  'tempo-sequencing': {
    label: 'tempo and sequencing', angles: null,
    plainName: 'rhythm, and the order things move',
    explainer: 'Two related things: the rhythm of the swing — how long you take going back compared with coming down — and the order your body moves in on the way down. It matters because a repeatable rhythm does more for repeatable contact than any single position does, and because moving from the ground up is where easy speed comes from.'
  },
};
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd "C:/Users/bkami/Desktop/AI Tools/golf-caddy" && node test-range-engine.js
```

Expected: `ALL PASS`. The pre-existing `T47 every taxonomy entry declares a label and angle rule` must still pass — the `label` and `angles` fields were preserved for every entry.

- [ ] **Step 5: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Give each finding type a plain name and an evergreen explainer

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Add findingsForDisplay()

**Files:**
- Modify: `range.html` (inside the engine block, immediately after `findingsForPrompt`)
- Modify: `test-range-engine.js`

- [ ] **Step 1: Write the failing tests**

Insert into `test-range-engine.js` immediately before the final `console.log` line:

```js
chk('T48 findingsForDisplay pulls plainName and explainer from the taxonomy', (() => {
  const r = findingsForDisplay([mkF({ plain: 'Your head rose a little.' })])[0];
  return r.plainName === 'standing up through the ball'
      && r.explainer === FINDING_TAXONOMY['early-extension'].explainer
      && r.label === 'early extension';
})());
chk('T48 findingsForDisplay returns the finding own plain text', (() => {
  const r = findingsForDisplay([mkF({ plain: 'Your head rose a little.' })])[0];
  return r.plain === 'Your head rose a little.' && r.missingPlain === false;
})());
chk('T48 a finding with no plain text is flagged, not silently blank', (() => {
  const r = findingsForDisplay([mkF({})])[0];
  return r.missingPlain === true && r.plain === '';
})());
chk('T48 whitespace-only plain counts as missing', (() => {
  return findingsForDisplay([mkF({ plain: '   ' })])[0].missingPlain === true;
})());
chk('T48 an unknown taxonomy key degrades to the raw key with no explainer', (() => {
  const r = findingsForDisplay([mkF({ finding: 'feels-a-bit-off', plain: 'x' })])[0];
  return r.plainName === 'feels-a-bit-off' && r.label === 'feels-a-bit-off' && r.explainer === '';
})());
chk('T48 resolved findings are excluded, same as the prompt view', (() => {
  return findingsForDisplay([mkF({ status: 'resolved', plain: 'x' })]).length === 0;
})());
chk('T48 display carries no technical text, while the prompt still does', (() => {
  const f = mkF({ plain: 'Your head rose a little.', note: 'noiseFloor 2px, signal 15.7x' });
  const disp = JSON.stringify(findingsForDisplay([f]));
  const prompt = findingsForPrompt([f])[0];
  return disp.indexOf('noiseFloor') < 0 && disp.indexOf('15.7x') < 0
      && prompt.indexOf('noiseFloor') >= 0;
})());
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd "C:/Users/bkami/Desktop/AI Tools/golf-caddy" && node test-range-engine.js
```

Expected: `ReferenceError: findingsForDisplay is not defined`.

- [ ] **Step 3: Add the function**

In `range.html`, immediately after the closing brace of `findingsForPrompt`, insert:

```js
// Structured rows for the dashboard. Deliberately separate from
// findingsForPrompt: that one serves a model and carries the full technical
// record, this one serves the golfer reading the page and carries none of it.
// Returns objects rather than strings so the page can lay out the heading, the
// evergreen explainer and the per-swing text separately.
function findingsForDisplay(findings) {
  return openFindings(findings).map(function (f) {
    var t = FINDING_TAXONOMY[f.finding];
    var plain = (f.plain || '').trim();
    return {
      key: f.finding,
      plainName: t ? t.plainName : f.finding,
      label: t ? t.label : f.finding,
      explainer: t ? t.explainer : '',
      plain: plain,
      clubs: f.clubs || [],
      // A finding with no plain-language summary renders a visible notice
      // rather than an empty card -- silent blankness would hide the fact that
      // a session skipped writing one, which is exactly the kind of quiet gap
      // this project surfaces instead of swallowing.
      missingPlain: !plain
    };
  });
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd "C:/Users/bkami/Desktop/AI Tools/golf-caddy" && node test-range-engine.js
```

Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add range.html test-range-engine.js
git commit -m "Add findingsForDisplay, a golfer-facing view separate from the prompt

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Mirror the engine block into course.html

**Read this before running anything.** The spec described `course.html` as carrying a "byte-identical copy" of range's engine block. That is **wrong**, and a wholesale replace based on it destroys working code. The true structure, verified:

```
course.html's engine block  =  range.html's shared block  +  ~1.4KB of course-only helpers
```

Those helpers (`pickReminders`, `ladderRows`, under a `// ── Course-view helpers` banner) exist **only** in `course.html`, live inside the same `/*ENGINE-START*/…/*ENGINE-END*/` markers, and are called by the on-course dashboard at roughly `course.html:1295`. A naive splice deletes them, breaking that page in the browser — `test-course-engine.js` catches it with `ReferenceError: pickReminders is not defined`.

Two further traps: `course.html` is **CRLF** throughout while `range.html` is **LF**, so any comparison must normalise line endings or every line appears to differ; and the splice must restore CRLF on write or the file's endings get mangled.

**Mirror programmatically — never hand-edit.** Splice at the helpers marker so the shared half is refreshed and the course-only half survives.

**Files:**
- Modify: `course.html`

- [ ] **Step 1: Splice, preserving the course-only helpers**

```bash
cd "C:/Users/bkami/Desktop/AI Tools/golf-caddy" && node -e "
const fs = require('fs');
const MARK = '// ── Course-view helpers';

const range = fs.readFileSync('range.html','utf8').replace(/\r\n/g,'\n');
const course = fs.readFileSync('course.html','utf8').replace(/\r\n/g,'\n');

const sharedBlock = range.split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0];
const courseBlock = course.split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0];

// Keep everything from the helpers banner onward; refresh everything before it.
// Guard, not cosmetic: indexOf returns -1 if MARK is ever missing (e.g. the
// banner gets reworded), and slice(-1) would then silently return just the
// LAST CHARACTER of the block instead of throwing -- collapsing pickReminders
// and ladderRows to one stray character with no error anywhere. Fail loudly
// instead, matching how a missing ENGINE-START/ENGINE-END marker already
// crashes every script that relies on it.
const markerIndex = courseBlock.indexOf(MARK);
if (markerIndex === -1) throw new Error('Course-view helpers banner not found -- did the comment get reworded? Fix MARK before re-running this splice.');
const helpers = courseBlock.slice(markerIndex);
const rebuilt = sharedBlock + helpers;

const head = course.split('/*ENGINE-START*/')[0];
const tail = course.split('/*ENGINE-END*/')[1];
const out = head + '/*ENGINE-START*/' + rebuilt + '/*ENGINE-END*/' + tail;

fs.writeFileSync('course.html', out.replace(/\n/g,'\r\n'));  // restore CRLF
console.log('spliced; helpers preserved:', helpers.length, 'chars');
"
```

- [ ] **Step 2: Verify the shared half matches and the course-only half survived**

```bash
cd "C:/Users/bkami/Desktop/AI Tools/golf-caddy" && node -e "
const fs=require('fs');
const norm = s => s.replace(/\r\n/g,'\n');
const blk = f => norm(fs.readFileSync(f,'utf8')).split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0];
const r = blk('range.html'), c = blk('course.html');
console.log('course block starts with range shared block:', c.startsWith(r));
console.log('course retains pickReminders:', c.includes('pickReminders'), '| ladderRows:', c.includes('ladderRows'));
console.log('course has findingsForDisplay:', c.includes('findingsForDisplay'));
console.log('still all CRLF:', (fs.readFileSync('course.html','utf8').match(/(?<!\r)\n/g)||[]).length === 0);
"
```

Expected: `true` on all four lines. Anything else means stop — do not commit a partially mirrored `course.html`.

- [ ] **Step 3: Run both engine test suites**

```bash
cd "C:/Users/bkami/Desktop/AI Tools/golf-caddy" && node test-course-engine.js && node test-range-engine.js
```

Expected: `ALL PASS` from both.

- [ ] **Step 4: Commit**

```bash
git add course.html
git commit -m "Mirror the findings display layer into course.html's engine block

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Render the plain layer in the dashboard

**Files:**
- Modify: `range.html` (the "Open swing findings" section, currently lines 1531–1538)

This is DOM/template code, not engine code — it is not covered by the Node suites and is verified by loading the page.

- [ ] **Step 1: Replace the render block**

In `range.html`, replace this block:

```js
  <div class="sec"><h2>Open swing findings</h2>
    ${(() => {
      const lines = findingsForPrompt(loadFindings());
      return lines.length
        ? lines.map(l => `<div class="note"><span class="dot"></span><span class="txt">${esc(l)}</span></div>`).join('')
        : '<div class="note"><span class="dot"></span><span class="txt">None recorded. Video findings are written here from a Claude Code session — see the README.</span></div>';
    })()}
  </div>
```

with:

```js
  <div class="sec"><h2>Open swing findings</h2>
    ${(() => {
      const rows = findingsForDisplay(loadFindings());
      if (!rows.length) return '<div class="note"><span class="dot"></span><span class="txt">None recorded. Video findings are written here from a Claude Code session — see the README.</span></div>';
      return rows.map(r => {
        const clubs = r.clubs.length ? ` — ${esc(r.clubs.join(', '))}` : '';
        // The <em> notice is authored here, so it is intentionally not passed
        // through esc(); r.plain is stored text and always is.
        const body = r.missingPlain
          ? '<em>No plain-language summary was written for this finding yet.</em>'
          : esc(r.plain);
        return '<div class="note"><span class="dot"></span><span class="txt">'
          + `<b>${esc(r.plainName)}</b> <span class="flat">(${esc(r.label)})</span>${clubs}<br>`
          + (r.explainer ? `<span class="flat">${esc(r.explainer)}</span><br>` : '')
          + body
          + '</span></div>';
      }).join('');
    })()}
  </div>
```

- [ ] **Step 2: Confirm the technical view is gone from the UI but alive in the prompt**

```bash
cd "C:/Users/bkami/Desktop/AI Tools/golf-caddy" && node -e "
const fs = require('fs');
const h = fs.readFileSync('range.html','utf8');
// Fixed-width window after the heading rather than splitting on the first
// </div>: the render block contains '</span></div>' inside a template string,
// so a </div> split would cut early and could report a false pass.
const ui = h.slice(h.indexOf('Open swing findings'), h.indexOf('Open swing findings') + 1200);
console.log('dashboard still calls findingsForPrompt:', ui.indexOf('findingsForPrompt') >= 0);
console.log('dashboard calls findingsForDisplay:', ui.indexOf('findingsForDisplay') >= 0);
console.log('coachPrompt still uses findingsForPrompt:', h.indexOf('findingsForPrompt(findings') >= 0);
"
```

Expected: `false`, `true`, `true` in that order.

- [ ] **Step 3: Commit**

```bash
git add range.html
git commit -m "Render findings as coaching text instead of a prompt string

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Backfill plain text for the three existing findings

**Files:**
- Modify: `data/findings.json`

Add a `plain` field to each of the three records. **Edit surgically** (targeted string replacement), do not reserialize the whole file — a `JSON.stringify` rewrite reformats every untouched record and buries the real change in noise.

- [ ] **Step 1: Add `plain` to `tempo-sequencing-driver-other`**

Insert a `"plain"` field immediately after that record's `"status": "open",` line:

```json
    "plain": "Your driver swing takes about half a second going back and a bit under a third of a second coming down — a rhythm of roughly 1.6 to 1. The timing itself is solid, because the strike is clearly audible and I could pin it to the frame. But this is the first swing of yours on record, so there is nothing yet to say whether that rhythm suits you. It is here as a starting point: if a later video comes back noticeably quicker or slower, that change will mean something.",
```

- [ ] **Step 2: Add `plain` to `finish-balance-driver-other`**

Insert immediately after that record's `"status": "open",` line:

```json
    "plain": "You hold your finish for about a second after the ball is gone, with no step or stumble to catch yourself. This one I could only eyeball — I tried to put a number on it and the measurement failed, because the wind was moving the reeds behind you about as much as your body was moving. So treat it as a real observation but not a measured one. Nothing to work on here; it is the kind of thing worth not losing.",
```

- [ ] **Step 3: Add `plain` to `early-extension-iron-down-the-line`**

Insert immediately after that record's `"status": "open",` line:

```json
    "plain": "In the one swing I could measure, your head finished about a quarter of a head-height higher at impact than it was at address. I am fairly confident the rise is real — the camera was steady enough to rule out shake as the cause. I am less confident about exactly how much, partly because some of it is your head turning to look toward the target rather than lifting, and partly because it is a single swing: the rest of the movement in that clip turned out to be walking and camera handling, not more swings. I would not change anything on this alone. If it shows up again in a second video, the usual work is keeping your chest over the ball a beat longer through impact.",
```

- [ ] **Step 4: Verify the file is valid and the diff is minimal**

```bash
cd "C:/Users/bkami/Desktop/AI Tools/golf-caddy" && node -e "
const f = JSON.parse(require('fs').readFileSync('data/findings.json','utf8'));
console.log('records:', f.length);
console.log('all have plain:', f.every(x => typeof x.plain === 'string' && x.plain.length > 50));
const banned = /noiseFloor|noise floor|\bpx\b|signal is|15\.7x|n=1|isImprovement|toInches|correctedDelta/i;
console.log('plain text is free of jargon:', f.every(x => !banned.test(x.plain)));
" && git diff --stat data/findings.json
```

Expected: `records: 3`, `all have plain: true`, `plain text is free of jargon: true`, and a diff touching only 3 added lines.

- [ ] **Step 5: Commit**

```bash
git add data/findings.json
git commit -m "Write plain-language summaries for the three existing findings

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Teach the skill to write the plain layer

**Files:**
- Modify: `.claude/skills/swing-video-analysis/SKILL.md`

- [ ] **Step 1: Add the voice rules section**

In `.claude/skills/swing-video-analysis/SKILL.md`, find the section headed `## 9. Write findings to \`data/findings.json\`` and insert this immediately before it:

```markdown
## 8b. Write the `plain` layer — what the golfer actually reads

Every finding carries two text fields with different audiences, and they must
not be confused:

- `note` — the full technical record. Method, pixel counts, noise floors,
  frame choices, what could have gone wrong. Feeds the coach prompt and future
  sessions. **Never shown in the app.**
- `plain` — 2–5 sentences the golfer reads on `range.html`. **The only findings
  text the app displays.**

`plain` must do three things:

1. Say what was seen **in this specific swing**, in ordinary language.
2. Say what is and is not trustworthy, **and why**, in ordinary language —
   confidence is spoken, never shown as a badge or a number.
3. Offer a next step **explicitly conditioned** on the finding holding up
   ("if it shows up again in a second video, the usual work is…"), or say
   plainly that it is too early to change anything.

**Never assert a fault.** This project carries no population baseline, which is
why assessments are `neutral`. "If this holds up, the usual work is X" is in
bounds. "You have early extension and it is costing you distance" is not.

**Banned from `plain`:** pixel counts, noise floors, signal-to-noise ratios
("15.7x"), drift correction, click precision, frame timestamps, and internal
function names (`isImprovement`, `toInches`, `correctedDelta`). Write "one
swing," never "n=1." All of it belongs in `note` instead.

Do not restate what the pattern *is* — `FINDING_TAXONOMY` already carries a
written-once `explainer` for each finding type, and the app shows it above your
text. Write only what *this golfer's swing* did.
```

- [ ] **Step 2: Verify the section landed in the right place**

```bash
cd "C:/Users/bkami/Desktop/AI Tools/golf-caddy" && grep -n "^## " .claude/skills/swing-video-analysis/SKILL.md
```

Expected: `## 8b. Write the \`plain\` layer` appears between `## 8. Spot-check…` and `## 9. Write findings…`.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/swing-video-analysis/SKILL.md
git commit -m "Teach the video skill to write the golfer-facing findings layer

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Verify the whole thing in a browser

**Files:** none modified — this is verification.

- [ ] **Step 1: Serve the repo and open the range analyzer**

Start the preview server with the `golf-caddy-http` config from `.claude/launch.json`, then open `http://localhost:8940/range.html`.

- [ ] **Step 2: Read the "Open swing findings" section**

Confirm by eye:
- Three findings render, each with a bold plain name, the jargon label in muted grey beside it, the explainer beneath, then the coaching text.
- **No pixel counts, noise floors, "15.7x", or frame timestamps appear anywhere in that section.**
- Confidence is discussed in sentences ("I am fairly confident… less confident about…"), not shown as a badge.

- [ ] **Step 3: Confirm the coach prompt still carries the technical detail**

Click **Copy prompt**, paste the result somewhere readable, and confirm the
`OPEN SWING FINDINGS` block still contains the full technical notes — the two
layers must have stayed separate.

- [ ] **Step 4: Stop the server**

Stop the preview server started in Step 1.

---

## Done when

- `node test-range-engine.js` and `node test-course-engine.js` both print `ALL PASS`.
- The engine blocks in `range.html` and `course.html` are byte-identical.
- The dashboard shows coaching text with no measurement jargon; the coach prompt still shows the full technical record.
- All three existing findings have a `plain` field.
- The skill documents the voice rules for future sessions.
