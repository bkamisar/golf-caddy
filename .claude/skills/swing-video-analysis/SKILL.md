---
name: swing-video-analysis
description: Use when the user sends a golf swing video for analysis. Measures body positions (early extension, weight transfer, swing plane, tempo, etc.) from real pixel measurements in the video using tools/swing-harness.html, and writes standing findings into data/findings.json for the coach debrief in range.html to reference.
---

# Analyzing a golf swing video

There is no in-app upload for this. The user sends a video file directly in
a Claude Code session; this skill turns that into measured, honestly-graded
findings in `data/findings.json`.

## 1. Hard rules — read before touching anything

- **Never commit a clip, a frame, or any likeness of the user.** This repo
  is public and already ties a name to home courses, exact dates, and
  scores — a face is the one piece that can't be un-published once
  committed, and git history doesn't forget. `tools/clips/` and
  `tools/frames/` are gitignored; verify `git status` shows no media before
  every commit in a video session, not just the first.
- The local server (`.claude/range-server.py`, config `golf-caddy-http`)
  binds to `127.0.0.1` only and must not be left running after the session —
  `preview_stop` it at teardown.
- Deliver conclusions as text into `data/findings.json` (syncs to the phone
  through `range.html`). Deliver pictures as screenshots in the
  conversation. Never both in the same place — see step 10.

## 2. Setup

1. Copy the clip into `tools/clips/` (create the directory if needed; it's
   gitignored).
2. `preview_start({name: "golf-caddy-http"})` — starts the local server and
   opens a browser tab.
3. `navigate` to `http://localhost:8940/tools/swing-harness.html`.
4. `await SH.load('/tools/clips/<filename>')`. This resolves to
   `{duration, width, height}` on success.
5. **If it rejects** (decode failure): stop and report this plainly. The one
   case actually worth naming is HEVC-encoded video (common for iPhone
   slow-mo) — Chromium on Windows generally can't decode it, and that is the
   one real scenario where ffmpeg (still not installed) would be needed.
   Don't guess at other causes.

## 3. Ask which club was hit, and confirm the camera angle

Ask the user which club this swing was. Record it — it goes in the
finding's `clubs` field, and a driver swing and a wedge swing are legitimately
different.

State what camera angle you observe (`down-the-line`, `front-on`, or
`other`) and have the user confirm it rather than assume. This gates the
whole taxonomy: `angleSupports()`/`gradeFinding()` in `range.html`
automatically downgrade any finding to `speculative` if the confirmed angle
can't support it (e.g. swing plane needs `down-the-line`; weight transfer
needs `front-on`).

## 4. Locate the swings

`await SH.scanMotion(0, duration, 0.25)` returns `{time, energy}` pairs —
numbers, not images, so this costs nothing per sample. The swing (or
swings, for a multi-shot clip) shows up as an energy peak.

If no peak clearly stands out from the median, **don't guess** — ask the
user for rough timestamps instead. This is a real, expected outcome, not a
tool failure: motion energy is a weak signal when the golfer is a small
fraction of a wide frame, and has been observed to sometimes locate
follow-through instead of the actual swing (see step 5).

**On a multi-swing clip**, do the full position-by-position analysis
(steps 5–7) on ONE representative swing, then spot-check every candidate
finding against the others (step 8) rather than fully re-measuring each —
a single swing's number is exactly the kind of small-sample claim this
project avoids stating as fact, and a full re-measurement of every swing is
usually not worth its cost in this budget.

## 5. Locate the four key positions

Try audio first: `await SH.findImpactAudio(t0, t1)` (t0/t1 bracketing the
candidate swing). It returns `{time, jump, prominence}` or `null`. **Both
are valid** — a clip's audio track can exist but carry no clear strike
sound. State plainly which method (audio or motion) actually located
impact, since it affects how precisely that timestamp should be trusted:
audio pins the exact instant; motion's peak is smeared by blur and frame
sampling, and on at least one real test clip it located the middle of
follow-through instead of the actual strike — the club and arms keep
moving fast well past the ball, and that continued motion can dominate the
signal more than the impact instant itself.

With impact located (by whichever method), read the rest off the same
motion-energy series around it: address is the last quiet frame before the
energy rises, top of the backswing is the local dip between the rise and
the impact spike, finish is where energy settles back down.

**Visually confirm every position before using it** — `SH.seek(t)` then a
screenshot. These are heuristics, not certainties.

If the impact frame is too motion-blurred to place a landmark on
confidently, use the nearest sharp frame instead and say so explicitly, or
decline that specific measurement. Never place a landmark on a blur and
report the result as precise.

Four positions is the default, not a ceiling — pull an extra frame
(e.g. mid-downswing, shaft-parallel) only when a specific candidate finding
actually needs it. Extracting a fixed larger set every time costs images to
re-confirm things already established.

## 6. Measure

Before measuring a candidate, check the confirmed camera angle against
`FINDING_TAXONOMY`'s `angles` list for it (step 3). **If the angle can't
support it, don't spend a measurement pass on it at all** —
`gradeFinding()` in `range.html` will force it to `speculative` regardless
of what's measured, so the harness/screenshot budget is better spent on
candidates the angle can actually support.

`SH.points()` returns one flat, unscoped list of every mark currently set —
labels are the only thing distinguishing them, marks are never
frame-scoped, and `correctedDelta`'s reference arrays are matched **by
array position, not by label** (`refsA[i]` and `refsB[i]` must be the same
physical point). Getting either of those wrong produces a wrong number with
no error. Use this exact worked pattern per candidate, with concrete
labels — not placeholders:

```js
// 1. Clear anything left over from a prior candidate. Marks persist across
//    seeks and are drawn on top of whatever frame is currently loaded, so a
//    leftover label from a previous measurement can silently collide.
SH.clearPoints();

// 2. Frame A (e.g. address). Mark the landmark, then 2+ static references,
//    in this order, and use the SAME reference labels at frame B.
await SH.seek(addressTime); SH.setView(cropX, cropY, zoom);
SH.mark('hip_a');    // click the hip
SH.mark('ref1_a');   // click a static point, e.g. a fence post
SH.mark('ref2_a');   // click a second static point, e.g. a tree trunk

// 3. Frame B (e.g. impact). Same landmark, same two physical reference
//    points, re-clicked at their new (or unchanged) screen position.
await SH.seek(impactTime); SH.setView(cropX, cropY, zoom);
SH.mark('hip_b');
SH.mark('ref1_b');   // the SAME fence post as ref1_a
SH.mark('ref2_b');   // the SAME tree trunk as ref2_a

// 4. Assemble the four arguments correctedDelta actually needs. refsA/refsB
//    must list the same physical points in the same order (ref1 then ref2
//    in both) -- cameraDrift pairs them by index, not by label.
const pts = SH.points();
const byLabel = (l) => pts.find(p => p.label === l);
correctedDelta(
  byLabel('hip_a'), byLabel('hip_b'),
  [byLabel('ref1_a'), byLabel('ref2_a')],
  [byLabel('ref1_b'), byLabel('ref2_b')]
);
```

Take a screenshot after each `SH.mark()` + click to confirm the crosshair
landed on the intended point before moving on — this is the one visual
judgment call in the whole pipeline; everything after it is arithmetic. If
a crosshair is off, `SH.mark()` the same label again and re-click — the
harness replaces the prior point under that label rather than keeping both.

**Reading the result — check in this order, since a `null`-vs-real-object
check alone is not enough:**

1. **Result is `null`** — this only happens with zero static references
   (`cameraDrift` refuses outright). No correction was attempted at all —
   see the `visual` tier in step 7.
2. **Result is a real object with `refCount < 2`** (i.e. exactly one
   reference) — `correctedDelta` still computes a number here, but with
   only one point there's nothing to check that reference against, so
   `signal` is unconditionally `false` regardless of the movement's size.
   Route this to the **`visual`** tier too, the same as case 1 — don't let
   `signal: false` here read as "measured and found nothing," because no
   reliable correction was actually possible.
3. **Result is a real object with `refCount >= 2` and `signal: false`** —
   two or more references were available, drift was genuinely correctable,
   and the corrected movement still didn't clearly exceed the noise floor.
   **This is the only case that means "report no signal and write nothing
   from this measurement."** Not a weak finding — nothing, and not
   `speculative` either.
4. **Result is a real object with `signal: true`** — a `measured` finding
   (step 7). Proceed to write it.

Check `refCount` before looking at `signal` — a `signal: false` object with
`refCount` 0 or 1 means something different from one with `refCount` 2+,
and treating them the same silently discards an honest `visual` observation
as if it were a checked-and-empty measurement.

## 7. Confidence

Every finding you actually write gets exactly one of these — they are
mutually exclusive, not a spectrum:

- **`measured`** — `correctedDelta(...)` was computed and returned
  `signal: true`.
- **`visual`** — either there's no clean landmark-pair delta for this kind
  of observation at all (grip, finish balance — these are read directly off
  a frame, not from a computed delta), or `correctedDelta(...)`'s result
  falls into case 1 or 2 above (`null`, or a real object with `refCount < 2`)
  — fewer than two usable static references, so no reliable correction was
  possible regardless of what `signal` says. Either way, this is an honest,
  eyeballed observation, not a computed one — say so in the `note` field.
- **`speculative`** — the confirmed camera angle can't support this finding
  per `FINDING_TAXONOMY`'s `angles`. `gradeFinding()` in `range.html`
  applies this automatically regardless of what confidence is set, so this
  is a safety net, not something to compute by hand — but per step 6, you
  shouldn't be measuring angle-unsupported candidates in the first place.

A **case-3** result specifically (`refCount >= 2` and `signal: false` — see
step 6) never becomes a finding under any confidence tier. A case-2 result
(`refCount < 2`) is not this — it can and should still become a `visual`
finding. If you're tempted to write a case-3 result anyway because the
number "looked close," that's exactly the instinct this gate exists to
override.

## 8. Spot-check consistency across other swings (if multi-swing)

For each finding that survived step 6, repeat *only that one measurement*
on the other located swings — not the full position-location pass. Record
the result as "observed in N of M swings" in the finding's free-text
`measurement` field. A finding seen in 1 of 5 swings is worth recording
differently than one seen in 5 of 5, and this is the only place that
distinction gets captured.

## 9. Write findings to `data/findings.json`

There is no write UI for this (unlike recommendations, which have a form in
`range.html`) — **edit `data/findings.json` directly** with your file tools,
following the schema below, then commit it (step 13 covers the pre-commit
media check).

Schema (see `FINDING_TAXONOMY`, `gradeFinding`, `mergeFindings` in
`range.html` for the authoritative definitions):

```json
{ "id": "<finding>-<clubs joined by '-'>-<cameraAngle>",
  "finding": "<taxonomy key>",
  "clubs": ["<club from step 3>"],
  "assessment": "fault" | "strength" | "neutral",
  "confidence": "measured" | "visual" | "speculative",
  "measurement": "magnitude: <px>px, noiseFloor: <px>px, observed in <N> of <M> swings",
  "cameraAngle": "down-the-line" | "front-on" | "other",
  "firstNoted": "<date>", "lastConfirmed": "<date>",
  "status": "open" | "improving" | "resolved",
  "note": "<free text>" }
```

There's no structured numeric field, only `measurement` as free text — but
`isImprovement` needs the PRIOR entry's magnitude to compare against. Always
lead `measurement` with `magnitude: <px>px, noiseFloor: <px>px` in exactly
that form (only for `measured`-confidence findings, where these numbers
exist) so a future session can parse the prior value back out rather than
having nothing to compare against.

- **The taxonomy is fixed.** Use only keys already in `FINDING_TAXONOMY`
  (`early-extension`, `swing-plane`, `low-point-control`,
  `weight-transfer-quality`, `static-lower-body-transition`,
  `backswing-width-turn`, `finish-balance`, `grip-setup`,
  `tempo-sequencing`). Never invent a new key here — extending the taxonomy
  is a code change in `range.html`, not something this skill does.
- **`id` must be deterministic, not freshly minted each session** — build it
  as `<finding>-<clubs joined by '-'>-<cameraAngle>` (e.g.
  `early-extension-driver-down-the-line`). `mergeFindings` recognizes "the
  same finding as last time" purely by matching `id`; a random or
  session-specific id means every future session's finding looks brand new
  forever, and `lastConfirmed`/`"improving"` can never actually fire. Before
  writing, read the CURRENT `data/findings.json` and check whether this
  exact id already exists — if so, this is the recurring case below, not a
  new one.
- A genuinely new finding (id not already present) gets `firstNoted`/
  `lastConfirmed` set to today and `status: "open"`.
- A recurring finding (id already present) updates `lastConfirmed`. Move it
  to `"improving"` only when `isImprovement(prevMagnitude, currMagnitude,
  noiseFloor)` (from the MEASURE block) actually returns `true` against the
  PRIOR entry's recorded magnitude — not just because the new number looks
  smaller by eye.
- **Absence in one video never resolves a finding.** A finding only moves
  to `"resolved"` when the user or a later session explicitly decides that,
  never automatically from one clean-looking clip.
- Optionally log one `video`-source practice priority via the existing
  recommendations flow in `range.html` — close any currently-open one
  first (the app already blocks logging a second open priority for the
  same source).
- Commit `data/findings.json` with a descriptive message. **Before
  committing, run `git status` and confirm no file under `tools/clips/` or
  `tools/frames/` is staged.**

## 10. Deliver

`render()` draws every current mark on top of whichever single frame is
currently loaded — it has no idea a mark was placed at a different
timestamp. `annotate(labelA, labelB, caption)` between two marks from
DIFFERENT frames (e.g. address vs. impact) will draw a line whose endpoints
don't both correspond to anything visible in whichever frame happens to be
on screen. Deliver each frame's own mark on its own frame instead of trying
to show the whole delta as one overlay:

1. `SH.seek(timeA)`, `SH.setView(cropX, cropY, zoom)` cropped on the
   relevant body part, screenshot — shows frame A's crosshair in place.
2. `SH.seek(timeB)`, `SH.setView(...)`, screenshot — shows frame B's
   crosshair in place.
3. `annotate()` is for a caption/line WITHIN one already-displayed frame
   (e.g. two reference points on the same frame, or a distance you want
   drawn for that frame specifically) — use it there, immediately followed
   by a screenshot, since the annotation disappears on the next
   `seek`/`setView`/click/`clearPoints` call.

State the measured numbers (magnitude, noise floor) in the conversation
text alongside the two screenshots — the pictures show *where*, the text
carries the actual delta.

Conclusions (the findings text, the measurement, the confidence) reach the
phone as data through `data/findings.json` → `range.html`. Pictures stay in
the conversation only. Never commit an annotated frame — see rule 1.

## 11. Filming guidance for future clips — advisory, never a gate

Tell the user, once, without making it a condition of analysis: face-on or
down-the-line, phone at hip height, 10–12 feet away, good light, and
**propped on something rather than handheld** — camera shake is the single
largest source of measurement noise this whole pipeline exists to correct
for.

This is guidance for clips not yet filmed. **Never refuse or downgrade an
already-existing clip for not meeting it** — an old handheld clip in poor
light just yields fewer `measured` findings and more `no signal` results,
which is the pipeline working correctly, not a reason to decline the
analysis.

## 12. What this skill never produces

- No 0–100 score or single-number "grade" for the swing.
- No comparison to a tour or population average — this project has no
  baseline for that, by design (see the putting/chipping section of
  `README.md` for the same reasoning applied elsewhere).
- No invented practice drills. A drill belongs in the coach debrief in
  `range.html`, next to real launch-monitor data, not manufactured here.
- No claim about what a "correct" swing looks like. Findings describe a
  measured position and its confidence — never an idealized target.

## 13. Teardown

- `preview_stop` the server.
- Empty `tools/clips/` (and `tools/frames/` if anything was ever written
  there).
- `git status` — confirm clean of any media before ending the session.
