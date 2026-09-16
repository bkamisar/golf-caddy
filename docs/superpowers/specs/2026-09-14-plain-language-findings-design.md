# Plain-language swing findings — design

**Date:** 2026-09-14
**Status:** approved, ready for implementation plan

## Problem

`range.html`'s "Open swing findings" section renders findings by calling
`findingsForPrompt()` — the same function that builds the LLM coach prompt.
The dashboard is therefore displaying a prompt string as if it were UI:

```
early extension on Iron (neutral, measured, open, first noted 2026-09-13)
[magnitude: 31.4px, noiseFloor: 2px (of which vertical rise 20.3px = 0.28
head-heights), observed in 1 of 1 swings measured] — Range session,
2026-07-04 clip, swing at 9.6-10.5s. Head crown tracked from address
(9.600s) to impact (10.450s), corrected for camera drift using two static
treeline silhouette tips; the two references agreed to within 0.245px...
```

That text was written for a model to reason over, not for a golfer to read.
One function is serving two audiences with opposite needs.

The fix cannot happen at render time: the dashboard is static JS with no model
behind it and no API key by design, so it cannot rephrase stored text. The
plain-language version must be **written at analysis time and stored**.

## Decisions

**1. Two text layers, two audiences.**

| Field | Audience | Rendered in UI? | Feeds coach prompt? |
|---|---|---|---|
| `note` (existing, unchanged) | a future analysis session; the coach prompt | **No** | Yes |
| `plain` (new) | the golfer reading the dashboard | **Yes — the only thing shown** | No |

`note` stays exactly as it is. It is the audit trail — how a thing was
measured, what could have gone wrong, what a later session needs in order to
compare correctly via `isImprovement`. Removing or diluting it would break the
project's core discipline. It simply stops being shown to a human.

**2. Confidence is spoken, not badged.**

The dashboard shows no confidence chip, no provenance line, no expander, no
sample-size metadata. Instead the `plain` text itself says what is and is not
trustworthy, in ordinary words:

> "I'm fairly confident the rise is real — the camera was steady enough to
> rule out shake. I'm less confident in the exact amount..."

This was an explicit user decision: hide the measurement detail, but keep a
discussion of higher and lower confidence, in prose.

**3. Terminology explainers live in the taxonomy, not in each finding.**

What early extension *is* never changes; what a given swing *did* changes every
session. Keeping them in one field means rewriting the definition every time and
letting it drift. `FINDING_TAXONOMY` therefore carries the evergreen half.

**4. Prescription is allowed, but conditional.**

`plain` may suggest a drill, and must mark it provisional — tied to the finding
holding up across more evidence. It must never assert that a measurement is a
fault: this project carries no population baseline by design, which is why
assessments are `neutral`. "If it shows up again, the usual work is X" is in
bounds. "You have early extension and it's costing you distance" is not.

## Schema changes

**`FINDING_TAXONOMY` entries** (in `range.html`, mirrored to `course.html` only
if the shared engine block requires it — see "What does not change") gain two
string fields:

```js
'early-extension': {
  label: 'early extension',
  angles: ['down-the-line'],
  plainName: 'standing up through the ball',
  explainer: 'Your body rises out of its setup posture coming into impact ' +
             'instead of holding the angles you started with. It matters ' +
             'because it changes how far the club is from the ball at ' +
             'contact, which makes strikes inconsistent.'
}
```

All nine existing taxonomy entries get `plainName` and `explainer`:
`early-extension`, `swing-plane`, `low-point-control`, `weight-transfer-quality`,
`static-lower-body-transition`, `backswing-width-turn`, `finish-balance`,
`grip-setup`, `tempo-sequencing`.

**Finding records** (in `data/findings.json`) gain one string field:

```js
{ ..., "plain": "In the one swing I could measure, your head finished about ..." }
```

## New engine function

```js
// Structured rows for the dashboard. Returns objects, not strings, so the
// page can lay out heading/explainer/body separately. Deliberately separate
// from findingsForPrompt: the two have different audiences and must be free
// to diverge.
findingsForDisplay(findings) -> [{
  key,          // taxonomy key, e.g. 'early-extension'
  plainName,    // 'standing up through the ball', or the raw key if unknown
  label,        // 'early extension', or the raw key if unknown
  explainer,    // taxonomy explainer, or '' if unknown key
  plain,        // the finding's plain text, or '' if missing
  clubs,        // array, may be empty
  missingPlain  // true when plain is absent/empty — render a visible notice
}]
```

Filters to open findings only (`status !== 'resolved'`), same as
`findingsForPrompt`.

**Degradation is visible, never silent.** A finding with no `plain` renders its
explainer plus an explicit notice that no plain-language summary was written,
rather than an empty card. A finding whose taxonomy key is unknown falls back to
the raw key for both names, with an empty explainer.

## Voice rules for writing `plain`

Added to `.claude/skills/swing-video-analysis/SKILL.md`. Every `plain` must:

1. Say what was seen **in this specific swing**, in ordinary language.
2. State what is trustworthy and what is not, **and why**, in ordinary language.
3. Offer a next step **explicitly conditioned** on the finding holding up, or
   say plainly that it is too early to change anything.
4. Run 2–5 sentences.

**Banned from `plain`:** pixel counts, noise floors, signal-to-noise ratios
("15.7x"), drift correction, click precision, frame timestamps, and internal
function names (`isImprovement`, `toInches`, `correctedDelta`). Write "one
swing," never "n=1." Any of these belong in `note`.

## What does not change

- `findingsForPrompt()` and the coach prompt keep the full technical note. The
  downstream session needs "upper bound," "one frame late reads 2.6x worse," and
  "one swing only" in order to write an honest debrief. `plain` is **not** added
  to the prompt — the debrief writes its own voice and should reason from
  evidence, not paraphrase a summary.
- `course.html` displays no findings to the user, and that does not change (a
  previously resolved decision: swing mechanics do not belong in the on-course
  moment).

  It does, however, carry `FINDING_TAXONOMY` and `findingsForPrompt` inside its
  copy of the shared engine block, so **re-mirroring `course.html` is a required
  implementation step, not optional**.

  **Correction (found during implementation):** an earlier draft of this spec
  called `course.html`'s block a "byte-identical copy." It is not, and acting on
  that claim deletes working code. The real structure is:

  ```
  course.html's engine block = range.html's shared block + course-only helpers
  ```

  `pickReminders` and `ladderRows` live inside the same markers, exist only in
  `course.html`, and are called by its own dashboard. A wholesale block replace
  removes them and breaks the on-course page. Mirror by splicing at the
  `// ── Course-view helpers` banner: refresh everything before it, keep
  everything from it onward. Also note `course.html` is CRLF and `range.html` is
  LF, so comparisons must normalise line endings and the write must restore CRLF.
  Confirm with `test-course-engine.js`, which catches the deletion outright
  (`ReferenceError: pickReminders is not defined`).
- `data/findings.json`'s existing `note`, `measurement`, `confidence`,
  `assessment`, `cameraAngle`, and `status` fields are untouched.
- No new dependencies, no render-time model, no API key.

## Backfill

The three existing findings each get a `plain` written as part of implementation:
`tempo-sequencing-driver-other`, `finish-balance-driver-other`,
`early-extension-iron-down-the-line`. The early-extension one is drafted above and
in the approved design discussion.

## Testing

New cases in `test-range-engine.js` (next free number, T48):

- `findingsForDisplay` pulls `plainName` and `explainer` from the taxonomy.
- It returns the finding's own `plain` text.
- A finding missing `plain` sets `missingPlain: true` rather than returning blank.
- An unknown taxonomy key degrades to the raw key with an empty explainer.
- Resolved findings are excluded.
- **Regression guard:** `findingsForPrompt` still emits the technical
  `measurement` and `note` content, proving the two layers stayed separate.

Existing parity tests in `test-course-engine.js` must still pass, since the
shared engine block is mirrored.

## Out of scope

- The published schematic diagram for the range (still deferred; revisit after
  using the text-only version in the field).
- Any render-time language model or API call.
- Changes to the recommendations engine or the round analyzer.
- Changes to how findings are measured — this is a presentation layer only.
