# Swing video analysis — design

**Status:** designed 2026-09-12, not yet implemented.

**Deliverable:** A Claude Code skill that turns a swing clip into measured,
honestly-graded entries in `data/findings.json`, plus a browser-based harness
that makes the measurements without installing anything.

Supersedes the "Companion — video analysis skill" section of
`2026-09-11-analysis-platform-design.md`, which assumed ffmpeg. The method
below needs no ffmpeg and no third-party packages.

## What changed since the 2026-09-11 sketch

That sketch assumed frame extraction via ffmpeg, which is not installed. The
user declined to install it, reasonably: unfamiliar downloads are the kind of
thing to be careful about.

Testing during the 2026-09-12 session established a better route. A Chromium
browser decodes the clip natively, and JavaScript can read the decoded video's
pixels through a canvas. That makes the browser not merely a frame grabber but
a *measurement instrument* — it returns numbers, not just pictures. Verified
end to end: a 2.97s clip and a 47.67s multi-shot clip both loaded, sought to
arbitrary timestamps, and rendered sharp frames.

One prerequisite surfaced during that test: Python's built-in `http.server`
ignores HTTP Range requests, so seeking past the initially buffered chunk
silently fails on longer clips. `.claude/range-server.py` (committed 2026-09-12)
is a stdlib-only replacement that supports Range.

**Videos must be served over HTTP, not `file://`.** The browser sandbox rejects
`file://` media outright ("Media load rejected by URL safety check"), and
canvas pixel reads require the video to be same-origin with the page. Both
constraints point the same way: one local server serving both harness and clip.

## Privacy and security constraints

These are requirements, not preferences.

**No likeness in the repo, ever.** The repo is public on GitHub and Pages, and
already ties a real name to home courses, exact dates played, scores, and
handicap. A face is the one addition that makes that aggregate identifying, and
git history is permanent — a committed frame cannot be cleanly removed later.
Clips and extracted frames live in gitignored directories. Only derived text is
published.

**Verify before committing.** Any video session must confirm `git status` shows
no clips or frames staged before it commits findings.

**The server binds to `127.0.0.1` only.** The current `('', port)` binding
answers on every interface, which would expose a private swing clip to anything
else on the network while the server runs. Binding to loopback makes that a
kernel-level refusal rather than a matter of which network the user is on.

**No write endpoint.** Getting annotated PNGs onto disk from the page would
require the server to accept writes, and a local service that accepts writes
can be reached by any page in the user's normal browser. Annotated frames are
delivered as screenshots in conversation instead. If durable files are wanted
later, the endpoint must check `Origin`, restrict to one directory, allow only
`.png`, and cap body size.

**The server runs only during a session**, started and stopped through
`preview_start` / `preview_stop`.

## Architecture

| Component | Location | Responsibility |
|---|---|---|
| Range server | `.claude/range-server.py` | Serve repo over HTTP with Range support. Change: bind loopback only. |
| Harness page | `tools/swing-harness.html` | Load clip, scan motion, seek, click-to-measure, annotate. Not part of the deployed app. |
| Measurement math | `/*MEASURE-START*/…/*MEASURE-END*/` inside the harness | Pure functions: delta, drift subtraction, noise-floor gate. |
| Unit tests | `test-swing-measure.js` | Extract and test that block, same dynamic-eval pattern as the three existing harnesses. |
| The skill | `.claude/skills/swing-video-analysis/SKILL.md` | Encodes the method reproducibly. |
| Ignored dirs | `tools/clips/`, `tools/frames/` | Session-local media, gitignored. Only `clips/` is written in v1; `frames/` is ignored defensively so a later change cannot leak media by forgetting to. |

**No changes to `range.html`, `index.html`, or `course.html`.** The findings
schema already carries every field this produces, `range.html` already displays
findings and already reads `video`-sourced recommendations via
`lastRecommendation(recs, ['range', 'video'])`. Preserving this property is a
design goal, not an accident — it is why consistency data goes in the existing
free-text `measurement` field rather than a new one.

## Filming guidance — advisory, never a gate

Better input yields more `measured` findings and fewer `no signal` results:
face-on or down-the-line, phone at hip height, 10–12 feet away, good light, and
above all **propped on something rather than handheld** — camera drift is the
single largest source of measurement noise, and a stationary phone removes it at
the source.

This is advice for future clips only. Existing footage cannot be re-shot, so the
method must degrade rather than refuse:

| Shortfall | Consequence |
|---|---|
| Handheld shake | Drift correction absorbs it; noise floor rises, so small movements return no signal |
| Awkward angle | Angle gating downgrades unsupportable findings; fewer findings, not a failure |
| Poor light or too distant | Landmarks harder to place; confidence caps at `visual`, or the measurement is declined |
| No usable audio transient | Motion-peak fallback for impact, method stated |

The invariant: a degraded clip produces fewer confident findings, never a
confident guess.

## Method

### 1. Setup

Copy the clip into `tools/clips/`. Start the server. Load the harness. Read
duration and dimensions. If the clip does not decode, stop and report — HEVC is
the one genuine ffmpeg case, and guessing past it is not an option.

### 2. Locate the swings

A JavaScript pass samples the clip at low resolution and computes frame-to-frame
pixel difference, returning `{time, energy}` pairs. Swings are the energy
spikes. This costs zero images, which is what makes a multi-swing clip
affordable.

If the energy signal is ambiguous — walking between shots, camera panning,
continuous motion — ask the user for rough timestamps rather than guess.

### 3. Locate the four positions

Impact is found from **audio first**: the strike is a sharp transient, decodable
through the Web Audio API, and it pins impact far more precisely than motion
does — the motion peak is smeared by blur and frame sampling. Both known clips
carry an audio track, but a track can be near-silent, so the transient must be
verified rather than assumed. With no usable transient, fall back to the motion
peak and **state which method was used**, since it affects how precisely impact
is pinned.

The energy curve locates the rest: address is the last quiet frame before the
rise, top of backswing is the local dip (the club momentarily stops), finish is
where motion settles.

These are heuristics, so each position is visually confirmed before use. Those
four screenshots are the main image cost of a session.

Four is the default set, not a limit. Pull additional positions on demand when a
candidate finding needs one — shaft-parallel in the downswing, for instance, is
where casting and plane problems actually show. Extracting a fixed larger set
every time would cost images to re-confirm what is already established.

Record **which club was hit**, supplied by the user, into the finding's `clubs`
field. A driver swing and a wedge swing legitimately differ, and a finding that
does not say which it came from cannot be compared later.

### 4. Camera angle

State the observed angle; the user confirms. Never inferred silently — it gates
the taxonomy, and `gradeFinding` downgrades any finding whose angle cannot
support it. This encodes the retracted swing-plane claim that a front-on clip
could not have supported.

### 5. Measurement

Per candidate finding:

1. Identify the landmark pair the finding requires (early extension → head
   crown or hip line, address vs impact).
2. Click the landmark on frame A. The harness draws a marker and reports the
   exact coordinate in video-pixel space.
3. Screenshot to confirm the marker landed on the landmark. This is the crux:
   the eye is never trusted for *the comparison*, only for "is this dot on the
   head" — a far easier and directly checkable task.
4. Repeat on frame B.
5. Click two or more static background references (tree trunk, fence post) in
   both frames. Their shift is the camera drift.
6. Corrected delta = landmark movement − camera drift.
7. If the corrected delta is not clearly larger than the disagreement among the
   static references, report **no signal** — not a weak finding, nothing.

Report pixels always. Convert to inches only when a credible scale reference is
in frame; otherwise do not.

**Why drift correction is mandatory rather than optional.** Both known clips are
handheld outdoors with moving trees and clouds. Ten pixels of phone drift
between address and impact reads identically to ten pixels of head rise. Without
the correction, the method would produce confident artifacts — the exact failure
this project rejects everywhere else.

### 6. Consistency spot-check

For each surviving finding, repeat only that single measurement on each other
swing in the clip. Record as "observed in 4 of 5 swings."

Full four-position analysis runs on one representative swing only. Analyzing
every swing fully would cost 30+ frames on a six-swing clip, most of them
re-confirming what is already established.

### 7. Confidence

Maps onto the existing enum unchanged:

- `measured` — corrected delta clearly exceeds the noise floor.
- `visual` — visible in the frames but no clean landmark pair exists (grip and
  setup, finish balance), or no static reference was available to correct drift.
- `speculative` — the camera angle cannot support the finding (applied
  automatically by `gradeFinding`), or measurement returned within noise.

### 8. Write findings

- New finding: new id, `firstNoted` and `lastConfirmed` = video date, status
  `open`.
- Recurring: update `lastConfirmed`. Status moves to `improving` only when the
  corrected delta has shrunk by more than the noise floor of the current
  measurement — a smaller number inside the noise is not improvement.
- Absent: do **not** resolve on one video's evidence. Leave `open` with a note.
  Status `resolved` requires it measured absent across the spot-checked swings.
- Consistency and the corrected delta go in the existing free-text `measurement`
  field, which `findingsForPrompt` already surfaces to the coach prompt.

Optionally log one `video`-source practice priority. Only one priority may be
open per source, so any existing open one must be closed first (`met`,
`not-met`, or `insufficient-data`). The criterion must be checkable by either
the next range session or the next video, and must state which.

Then verify `git status` shows no media, and commit.

### 9. Deliver

Annotated frames are screenshotted into the conversation, zoomed to a crop
around the player so detail is legible. They are never committed.

## Testing

`test-swing-measure.js` extracts the `/*MEASURE-START*/…/*MEASURE-END*/` block
and tests:

- delta arithmetic between two landmark coordinates;
- camera drift correctly subtracted from a landmark delta;
- a drift-dominated input returns no-signal rather than a number;
- noise floor derived from disagreement among static references.

Angle gating is not retested here — `gradeFinding` lives in `range.html` and is
already covered by T47 in `test-range-engine.js`.

Judgment steps — which frame is the top, where the crown of the head is — are
not unit-testable and stay as prose in the skill.

## Failure modes

| Failure | Response |
|---|---|
| Clip will not decode (HEVC) | Stop and report; the one real ffmpeg case |
| Motion scan ambiguous | Ask the user for rough timestamps |
| No static background reference (sky-only, camera panned) | Cannot correct drift; confidence caps at `visual` |
| Impact frame motion-blurred | Use nearest sharp frame and say so, or decline the measurement |
| Finding's angle unsupported | Auto-downgraded to `speculative` by existing code |

## Deferred

**Published schematic diagram.** Discussed 2026-09-12 and deliberately deferred.
The idea: publish one committed image per active finding so it can be viewed at
the range on a phone. Resolved constraints, should it be built:

- It must be an **abstract schematic** — line geometry, no likeness. A single
  published photo is the same category problem as several.
- It must **depict the measurement**, not an idealized "correct" swing. Drawing
  an ideal asserts a model of the golf swing that Claude is not qualified to
  author, and a diagram carries more apparent authority than a number does.
- It would be the one change that breaks the zero-app-change property, since
  `range.html` would need to display it beside its finding.

Deferred because the finding text, its measurement, and the active priority
already display in `range.html` and already sync to the phone. Build it only
after a real session shows the text is insufficient at the range.

**Pose estimation (MediaPipe).** Would replace manual landmark clicking with
model-detected joints and make the analysis fully automatic. Pending
verification that a Python 3.14 build exists. This is the upgrade path.

## Rejected, with reasons

Considered while reviewing competing tools (BirdieSwing, Sportsbox 3D, 18Birdies)
on 2026-09-12 and deliberately not adopted.

**No population or tour baseline comparison.** Sportsbox compares measurements
against tour and amateur ranges; that is a real capability this design will not
have, and the gap should be stated honestly rather than papered over. It is the
same problem the putting analysis already faced and answered: published
baselines are tour- or scratch-calibrated, and a self-calibrated one is circular.
The answer is the same here — **track change in the user's own measurement over
time**, which needs no population baseline and is what actually matters for
improvement. Do not bolt on "tour average" comparisons later.

**No 0–100 swing score.** A single summary number implies a rubric that does not
exist and is not reproducible — the same false precision this project rejects
everywhere else.

**No auto-generated drill prescriptions.** Prescription is the least reliable
output available here. Where a drill belongs at all is the coach debrief, which
sees findings alongside real launch-monitor data.

A fair criticism from that review, worth keeping in mind: AI swing feedback
without fixed rubrics produces variable assessments of identical swings. That
applies to `visual`-confidence findings here (grip, finish balance) and is an
argument for measuring wherever possible and being stingy with `visual`.
Measured findings are reproducible by construction.

## Out of scope

- Automatic silhouette detection via background differencing — too fragile
  against the moving trees and clouds present in both known clips.
- Inches conversion without a credible in-frame scale reference.
- Comparing two videos from different sessions.
- Any in-app write UI for findings; Claude writes `data/findings.json` directly,
  as with hole detail.
- Committing clips, frames, or any likeness. Permanent constraint, not a phase
  boundary.
