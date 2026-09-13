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

Per finding candidate, between two chosen frames A and B:

1. `SH.seek(timeA)`, `SH.setView(cropX, cropY, zoom)` to zoom in on the
   relevant body part for precision.
2. `SH.mark('<landmark>')`, click the landmark, screenshot to confirm the
   crosshair actually landed on it. This is the one visual judgment call
   in the whole pipeline — everything after this point is arithmetic. If
   the crosshair is off, `SH.mark('<landmark>')` the same label again and
   re-click; the harness replaces the prior point rather than keeping both.
3. Repeat step 1–2 for frame B, same landmark label change (e.g.
   `'<landmark>_b'` or reuse a session-scoped naming scheme — `SH.points()`
   returns everything currently marked if you need to check).
4. Mark **two or more static background references** (a tree, a fence post
   — anything that did not move) in both frames. Fewer than two references
   means `correctedDelta` can never report `signal: true`, by design.
5. Read back `SH.points()` and compute `correctedDelta(landmarkA, landmarkB, refsA, refsB)` (from the harness's MEASURE block — call it directly in
   the page via `javascript_tool`, passing the actual point objects).
6. **If `signal` is false, report no signal.** Not a weak finding — nothing.
   This applies whether the cause is genuinely-small movement, too few
   references, or the movement being smaller than the frames' own noise
   floor (camera shake). Don't soften this into "a slight change was
   observed."

## 7. Confidence

Map the result onto the existing taxonomy enum:

- **`measured`** — `correctedDelta().signal` was `true`.
- **`visual`** — no clean landmark pair exists for this observation (grip,
  finish balance), or fewer than two static references were available in
  frame, so no correction could be attempted at all.
- **`speculative`** — the confirmed camera angle can't support this
  finding (per `FINDING_TAXONOMY`'s `angles`), or the measurement came back
  with `signal: false`.

## 8. Spot-check consistency across other swings (if multi-swing)

For each finding that survived step 6, repeat *only that one measurement*
on the other located swings — not the full position-location pass. Record
the result as "observed in N of M swings" in the finding's free-text
`measurement` field. A finding seen in 1 of 5 swings is worth recording
differently than one seen in 5 of 5, and this is the only place that
distinction gets captured.

## 9. Write findings to `data/findings.json`

Schema (see `FINDING_TAXONOMY`, `gradeFinding`, `mergeFindings` in
`range.html` for the authoritative definitions):

```json
{ "id": "<unique>",
  "finding": "<taxonomy key>",
  "clubs": ["<club from step 3>"],
  "assessment": "fault" | "strength" | "neutral",
  "confidence": "measured" | "visual" | "speculative",
  "measurement": "<free text: the numbers, and N-of-M consistency>",
  "cameraAngle": "down-the-line" | "front-on" | "other",
  "firstNoted": "<date>", "lastConfirmed": "<date>",
  "status": "open" | "improving" | "resolved",
  "note": "<free text>" }
```

- **The taxonomy is fixed.** Use only keys already in `FINDING_TAXONOMY`
  (`early-extension`, `swing-plane`, `low-point-control`,
  `weight-transfer-quality`, `static-lower-body-transition`,
  `backswing-width-turn`, `finish-balance`, `grip-setup`,
  `tempo-sequencing`). Never invent a new key here — extending the taxonomy
  is a code change in `range.html`, not something this skill does.
- A genuinely new finding gets `firstNoted`/`lastConfirmed` set to today and
  `status: "open"`.
- A recurring finding updates `lastConfirmed`. Move it to `"improving"`
  only when `isImprovement(prevMagnitude, currMagnitude, noiseFloor)`
  (from the MEASURE block) actually returns `true` — not just because the
  new number looks smaller by eye.
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

`SH.setView(cropX, cropY, zoom)` to crop in on the player so the relevant
detail is legible, `SH.annotate(labelA, labelB, caption)` to draw the
measured line, then **screenshot immediately** — the annotation is not
persisted and disappears on the next `seek`/`setView`/click/`clearPoints`
call. Put that screenshot directly in the conversation.

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
