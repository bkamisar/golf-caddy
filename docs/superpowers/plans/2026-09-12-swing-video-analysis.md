# Swing Video Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based harness and a Claude Code skill that turn a golf swing clip into measured, honestly-graded entries in `data/findings.json`, with no software installed.

**Architecture:** A stdlib-only Python server (already committed) serves the repo over HTTP with Range support so video seeking works. A checked-in harness page loads the clip, finds swings from motion energy, pins impact from the audio transient, and lets Claude click landmarks whose coordinates it reports exactly. The geometry and gating math lives in a marker-delimited block inside that page and is unit-tested in Node, matching the pattern of the three existing test harnesses.

**Tech Stack:** Vanilla HTML/JS (no build, no dependencies), Canvas 2D, Web Audio API, Python 3 stdlib, Node for tests.

**Spec:** `docs/superpowers/specs/2026-09-12-swing-video-analysis-design.md`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `.claude/range-server.py` | modify | Serve repo with Range support. Bind loopback only. |
| `.gitignore` | modify | Never commit clips or frames. |
| `tools/swing-harness.html` | create | Video loading, motion scan, audio impact, click-to-measure, annotation. Contains the `/*MEASURE-START*/…/*MEASURE-END*/` block. |
| `test-swing-measure.js` | create | Extracts and unit-tests that block in Node. |
| `.claude/skills/swing-video-analysis/SKILL.md` | create | The method, encoded reproducibly. |

**Critical convention:** everything inside the MEASURE block must be declared with `var` or `function`. `const` and `let` do **not** become visible to the calling scope when the block is loaded in Node, so the tests would not see them. The three existing harnesses rely on this same rule.

**One deliberate difference from the existing harnesses:** they extract their engine block with a bare `eval`. The new test file uses `vm.runInThisContext` instead — verified to expose `var` and `function` declarations identically, while being the construct actually intended for this, and it does not trip the repo's security hook.

---

## Task 1: Harden the server and block media from git

**Files:**
- Modify: `.claude/range-server.py`
- Modify: `.gitignore`

- [ ] **Step 1: Bind to loopback only**

In `.claude/range-server.py`, replace the server construction in `__main__`:

```python
    server = http.server.ThreadingHTTPServer(('127.0.0.1', port), RangeHTTPRequestHandler)
```

The previous `('', port)` answered on every network interface, which would expose a private swing clip to anything else on the network while the server runs.

- [ ] **Step 2: Ignore session media**

Append to `.gitignore`:

```
tools/clips/
tools/frames/
```

`clips/` holds the copied source video; `frames/` is ignored defensively so a later change cannot leak media by forgetting to.

- [ ] **Step 3: Verify the bind changed**

```bash
cd "C:/Users/bkami/Desktop/AI Tools/golf-caddy" && (python .claude/range-server.py 8942 &) ; sleep 1 && netstat -ano | findstr :8942
```

Expected: a LISTENING line showing `127.0.0.1:8942`. It must NOT show `0.0.0.0:8942`.

- [ ] **Step 4: Verify Range still works**

```bash
curl -s -o /dev/null -D - --max-time 8 -H "Range: bytes=0-99" http://localhost:8942/README.md
```

Expected: `HTTP/1.0 206 Partial Content` with `Content-Range: bytes 0-99/...` and `Content-Length: 100`.

- [ ] **Step 5: Stop the test server**

```bash
taskkill //F //IM python.exe
```

- [ ] **Step 6: Commit**

```bash
git add .claude/range-server.py .gitignore
git commit -m "Bind the range server to loopback and ignore session media"
```

---

## Task 2: Measurement block — coordinate mapping and deltas

**Files:**
- Create: `tools/swing-harness.html`
- Create: `test-swing-measure.js`

- [ ] **Step 1: Write the failing test**

Create `test-swing-measure.js`:

```js
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(__dirname + '/tools/swing-harness.html', 'utf8');
vm.runInThisContext(html.split('/*MEASURE-START*/')[1].split('/*MEASURE-END*/')[0]);
let fails = 0;
const chk = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; };
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-9 : tol);

// M1. screenToVideo inverts the harness's zoom/crop transform. Without it every
// coordinate would be wrong by the zoom factor, silently.
chk('M1 identity at zoom 1 with no crop',
  (() => { const p = screenToVideo({ x: 10, y: 20 }, { cropX: 0, cropY: 0, zoom: 1 });
    return p.x === 10 && p.y === 20; })());
chk('M1 zoom 2 halves the screen offset',
  (() => { const p = screenToVideo({ x: 100, y: 50 }, { cropX: 0, cropY: 0, zoom: 2 });
    return p.x === 50 && p.y === 25; })());
chk('M1 crop origin is added back',
  (() => { const p = screenToVideo({ x: 100, y: 50 }, { cropX: 300, cropY: 200, zoom: 2 });
    return p.x === 350 && p.y === 225; })());
chk('M1 missing view returns null', screenToVideo({ x: 1, y: 1 }, null) === null);
chk('M1 zero zoom returns null rather than dividing by zero',
  screenToVideo({ x: 1, y: 1 }, { cropX: 0, cropY: 0, zoom: 0 }) === null);

// M2. pointDelta
chk('M2 delta is b minus a',
  (() => { const d = pointDelta({ x: 10, y: 10 }, { x: 13, y: 4 });
    return d.dx === 3 && d.dy === -6; })());
chk('M2 missing point returns null', pointDelta(null, { x: 1, y: 1 }) === null);

console.log('\n' + (fails ? fails + ' FAILURES' : 'ALL PASS'));
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd "C:/Users/bkami/Desktop/AI Tools/golf-caddy" && node test-swing-measure.js
```

Expected: FAIL — `ENOENT: no such file or directory ... tools/swing-harness.html`

- [ ] **Step 3: Create the harness with the first two functions**

Create `tools/swing-harness.html`:

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Swing harness</title>
<style>
  body { margin: 0; background: #111; color: #eee; font: 12px monospace; }
  #c { display: block; cursor: crosshair; }
  #log { padding: 6px; white-space: pre-wrap; }
</style>
</head>
<body>
<video id="v" playsinline muted style="display:none"></video>
<canvas id="c" width="900" height="700"></canvas>
<div id="log"></div>
<script>
/*MEASURE-START*/
// Pure geometry and gating for swing measurement. No DOM access in this block —
// it is extracted and run in Node by test-swing-measure.js. Declare with
// `var`/`function` only: `const`/`let` do not become visible to the calling
// scope there, so the tests could not see them.

// Even with perfect static references, a hand-placed landmark is only good to a
// pixel or two. No measurement is ever treated as more precise than this.
var CLICK_PRECISION_PX = 2;

// Maps a point clicked on the displayed canvas back into the source video's own
// pixel coordinates. The harness renders a zoomed crop so landmarks can be
// placed precisely; this is the inverse of that transform.
function screenToVideo(pt, view) {
  if (!pt || !view || !view.zoom) return null;
  return { x: view.cropX + pt.x / view.zoom, y: view.cropY + pt.y / view.zoom };
}

function pointDelta(a, b) {
  if (!a || !b) return null;
  return { dx: b.x - a.x, dy: b.y - a.y };
}
/*MEASURE-END*/
</script>
</body>
</html>
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd "C:/Users/bkami/Desktop/AI Tools/golf-caddy" && node test-swing-measure.js
```

Expected: 7 PASS lines and `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add tools/swing-harness.html test-swing-measure.js
git commit -m "Add the swing harness measurement block with coordinate mapping"
```

---

## Task 3: Measurement block — camera drift and the no-signal gate

This is the core of the design. On handheld video, ten pixels of phone drift is indistinguishable from ten pixels of head rise unless drift is measured and subtracted.

**Files:**
- Modify: `tools/swing-harness.html` (inside the MEASURE block)
- Modify: `test-swing-measure.js`

- [ ] **Step 1: Write the failing tests**

Insert into `test-swing-measure.js` immediately before the final `console.log` line:

```js
// M3. cameraDrift — static background points paired by index. `spread` is how
// much they disagree about the shift, which is the noise floor for this pair
// of frames.
chk('M3 two references shifted identically give that shift and zero spread',
  (() => { const d = cameraDrift(
      [{ x: 10, y: 10 }, { x: 90, y: 40 }],
      [{ x: 13, y: 14 }, { x: 93, y: 44 }]);
    return d.dx === 3 && d.dy === 4 && near(d.spread, 0); })());
chk('M3 disagreeing references give the mean shift',
  (() => { const d = cameraDrift(
      [{ x: 0, y: 0 }, { x: 0, y: 0 }],
      [{ x: 2, y: 0 }, { x: 6, y: 0 }]);
    return d.dx === 4 && d.dy === 0; })());
chk('M3 spread is the largest deviation from the mean shift',
  (() => { const d = cameraDrift(
      [{ x: 0, y: 0 }, { x: 0, y: 0 }],
      [{ x: 2, y: 0 }, { x: 6, y: 0 }]);
    return near(d.spread, 2); })());
chk('M3 mismatched reference counts return null',
  cameraDrift([{ x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 1, y: 1 }]) === null);
chk('M3 empty references return null', cameraDrift([], []) === null);

// M4. correctedDelta — the gate. A landmark that merely moved with the camera
// must report no signal.
chk('M4 landmark that moved exactly with the camera reports no signal',
  (() => { const r = correctedDelta(
      { x: 100, y: 100 }, { x: 110, y: 100 },
      [{ x: 0, y: 0 }, { x: 50, y: 50 }],
      [{ x: 10, y: 0 }, { x: 60, y: 50 }]);
    return near(r.dx, 0) && near(r.magnitude, 0) && r.signal === false; })());
chk('M4 movement beyond drift is reported net of it',
  (() => { const r = correctedDelta(
      { x: 100, y: 100 }, { x: 130, y: 100 },
      [{ x: 0, y: 0 }, { x: 50, y: 50 }],
      [{ x: 10, y: 0 }, { x: 60, y: 50 }]);
    return near(r.dx, 20) && r.signal === true; })());
chk('M4 riseUp is positive when the landmark rose on screen',
  (() => { const r = correctedDelta(
      { x: 100, y: 200 }, { x: 100, y: 170 },
      [{ x: 0, y: 0 }, { x: 50, y: 50 }],
      [{ x: 0, y: 0 }, { x: 50, y: 50 }]);
    return near(r.riseUp, 30) && near(r.dy, -30); })());
chk('M4 a single reference never yields signal, however large the movement',
  (() => { const r = correctedDelta(
      { x: 0, y: 0 }, { x: 500, y: 0 },
      [{ x: 0, y: 0 }], [{ x: 0, y: 0 }]);
    return r.refCount === 1 && r.signal === false; })());
chk('M4 drift-dominated frames report no signal',
  (() => { const r = correctedDelta(
      { x: 0, y: 0 }, { x: 12, y: 0 },
      [{ x: 0, y: 0 }, { x: 50, y: 0 }],
      [{ x: 0, y: 0 }, { x: 90, y: 0 }]);
    return r.signal === false; })());
chk('M4 noise floor never drops below click precision',
  (() => { const r = correctedDelta(
      { x: 0, y: 0 }, { x: 1, y: 0 },
      [{ x: 0, y: 0 }, { x: 50, y: 50 }],
      [{ x: 0, y: 0 }, { x: 50, y: 50 }]);
    return r.noiseFloor === CLICK_PRECISION_PX && r.signal === false; })());
```

- [ ] **Step 2: Run to verify failure**

```bash
cd "C:/Users/bkami/Desktop/AI Tools/golf-caddy" && node test-swing-measure.js
```

Expected: `ReferenceError: cameraDrift is not defined`

- [ ] **Step 3: Add the functions**

In `tools/swing-harness.html`, insert inside the MEASURE block after `pointDelta`:

```js
// Camera drift between two frames, estimated from static background points
// paired by index: refsA[i] and refsB[i] are the same real-world point. Their
// disagreement is the noise floor for anything measured between these frames.
function cameraDrift(refsA, refsB) {
  if (!refsA || !refsB || !refsA.length || refsA.length !== refsB.length) return null;
  var shifts = [];
  for (var i = 0; i < refsA.length; i++) {
    var d = pointDelta(refsA[i], refsB[i]);
    if (!d) return null;
    shifts.push(d);
  }
  var mdx = 0, mdy = 0;
  shifts.forEach(function (s) { mdx += s.dx; mdy += s.dy; });
  mdx /= shifts.length; mdy /= shifts.length;
  var spread = 0;
  shifts.forEach(function (s) {
    var dev = Math.sqrt((s.dx - mdx) * (s.dx - mdx) + (s.dy - mdy) * (s.dy - mdy));
    if (dev > spread) spread = dev;
  });
  return { dx: mdx, dy: mdy, spread: spread };
}

// Landmark movement with camera drift removed, plus the gate deciding whether it
// means anything. `signal` is false when the corrected movement is not clearly
// larger than the frames' own noise floor, or when fewer than two static
// references were available to estimate drift at all — reported as no signal,
// never as a small finding.
function correctedDelta(landmarkA, landmarkB, refsA, refsB) {
  var raw = pointDelta(landmarkA, landmarkB);
  var drift = cameraDrift(refsA, refsB);
  if (!raw || !drift) return null;
  var dx = raw.dx - drift.dx;
  var dy = raw.dy - drift.dy;
  var magnitude = Math.sqrt(dx * dx + dy * dy);
  var noiseFloor = Math.max(drift.spread, CLICK_PRECISION_PX);
  return {
    dx: dx,
    dy: dy,
    // Screen y grows downward, so a landmark that rose has negative dy. This
    // field exists to stop that sign flip from becoming a wrong finding.
    riseUp: -dy,
    magnitude: magnitude,
    noiseFloor: noiseFloor,
    refCount: refsA.length,
    signal: refsA.length >= 2 && magnitude > noiseFloor
  };
}
```

- [ ] **Step 4: Run to verify passing**

```bash
cd "C:/Users/bkami/Desktop/AI Tools/golf-caddy" && node test-swing-measure.js
```

Expected: 18 PASS lines and `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add tools/swing-harness.html test-swing-measure.js
git commit -m "Measure camera drift and gate findings on it"
```

---

## Task 4: Measurement block — tempo, improvement, scale

**Files:**
- Modify: `tools/swing-harness.html` (inside the MEASURE block)
- Modify: `test-swing-measure.js`

- [ ] **Step 1: Write the failing tests**

Insert into `test-swing-measure.js` immediately before the final `console.log` line:

```js
// M5. tempoRatio — backswing over downswing, straight from the frame times.
chk('M5 0.9s back over 0.3s down is 3.0', near(tempoRatio(1.0, 1.9, 2.2), 3));
chk('M5 zero-length downswing returns null', tempoRatio(1.0, 1.9, 1.9) === null);
chk('M5 out-of-order times return null', tempoRatio(2.0, 1.0, 3.0) === null);
chk('M5 missing time returns null', tempoRatio(null, 1.9, 2.2) === null);

// M6. isImprovement — shrinking inside the noise is not progress.
chk('M6 shrank by more than the noise floor', isImprovement(30, 10, 5) === true);
chk('M6 shrank by less than the noise floor', isImprovement(30, 27, 5) === false);
chk('M6 grew', isImprovement(10, 30, 5) === false);
chk('M6 missing previous measurement is not improvement', isImprovement(null, 10, 5) === false);

// M7. toInches — never guess a scale.
chk('M7 converts with a credible reference',
  near(toInches(50, { pixels: 100, inches: 12 }), 6));
chk('M7 no reference returns null', toInches(50, null) === null);
chk('M7 zero-pixel reference returns null', toInches(50, { pixels: 0, inches: 12 }) === null);
```

- [ ] **Step 2: Run to verify failure**

```bash
cd "C:/Users/bkami/Desktop/AI Tools/golf-caddy" && node test-swing-measure.js
```

Expected: `ReferenceError: tempoRatio is not defined`

- [ ] **Step 3: Add the functions**

In `tools/swing-harness.html`, insert inside the MEASURE block after `correctedDelta`:

```js
// Backswing duration over downswing duration. Reports the measured ratio and
// nothing about whether it is good — this project carries no population
// baseline by design.
function tempoRatio(addressTime, topTime, impactTime) {
  if (addressTime == null || topTime == null || impactTime == null) return null;
  var back = topTime - addressTime;
  var down = impactTime - topTime;
  if (!(back > 0) || !(down > 0)) return null;
  return back / down;
}

// A finding is only improving when it shrank by more than the noise floor of the
// current measurement. A smaller number inside the noise is not progress.
function isImprovement(prevMagnitude, currMagnitude, noiseFloor) {
  if (prevMagnitude == null || currMagnitude == null || noiseFloor == null) return false;
  return currMagnitude < prevMagnitude - noiseFloor;
}

// Pixels to inches, only when a credible in-frame reference was actually
// measured. Returns null rather than inventing a scale.
function toInches(pixels, scaleRef) {
  if (pixels == null || !scaleRef || !scaleRef.pixels || scaleRef.inches == null) return null;
  return pixels * (scaleRef.inches / scaleRef.pixels);
}
```

- [ ] **Step 4: Run to verify passing**

```bash
cd "C:/Users/bkami/Desktop/AI Tools/golf-caddy" && node test-swing-measure.js
```

Expected: 29 PASS lines and `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add tools/swing-harness.html test-swing-measure.js
git commit -m "Add tempo ratio, improvement gating, and optional scale conversion"
```

---

## Task 5: Harness — load, seek, and render a zoomable crop

The remaining tasks add DOM machinery, which is not unit-testable; each is verified by driving the real page in the browser.

**Files:**
- Modify: `tools/swing-harness.html` (below the MEASURE block, inside the same `<script>`)

- [ ] **Step 1: Add the page API**

Append below `/*MEASURE-END*/`, before `</script>`:

```js
var v = document.getElementById('v');
var c = document.getElementById('c');
var ctx = c.getContext('2d', { willReadFrequently: true });
var logEl = document.getElementById('log');
var view = { cropX: 0, cropY: 0, zoom: 1 };
var marks = [];
var pendingLabel = null;
var clipUrl = null;

function log(msg) { logEl.textContent = String(msg); }

function seek(t) {
  return new Promise(function (res) {
    if (Math.abs(v.currentTime - t) < 1e-4) return res(v.currentTime);
    v.onseeked = function () { v.onseeked = null; res(v.currentTime); };
    v.currentTime = t;
  });
}

function render() {
  var sw = c.width / view.zoom, sh = c.height / view.zoom;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(v, view.cropX, view.cropY, sw, sh, 0, 0, c.width, c.height);
  marks.forEach(function (m) {
    var x = (m.x - view.cropX) * view.zoom, y = (m.y - view.cropY) * view.zoom;
    ctx.strokeStyle = '#0f0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y);
    ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 12); ctx.stroke();
    ctx.fillStyle = '#0f0'; ctx.font = '13px monospace';
    ctx.fillText(m.label || '', x + 14, y - 4);
  });
}

var SH = {
  load: function (url) {
    clipUrl = url;
    return new Promise(function (res, rej) {
      v.onloadedmetadata = function () {
        view = { cropX: 0, cropY: 0,
                 zoom: Math.min(c.width / v.videoWidth, c.height / v.videoHeight) };
        res({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
      };
      v.onerror = function () { rej(new Error('decode failed: ' + (v.error && v.error.message))); };
      v.src = url;
    });
  },
  seek: function (t) { return seek(t).then(function (at) { render(); return at; }); },
  setView: function (cropX, cropY, zoom) {
    view = { cropX: cropX, cropY: cropY, zoom: zoom }; render(); return view;
  },
  getView: function () { return view; },
  time: function () { return v.currentTime; }
};
```

- [ ] **Step 2: Copy a real clip in and confirm it is ignored by git**

```bash
cd "C:/Users/bkami/Desktop/AI Tools/golf-caddy" && mkdir -p tools/clips && cp "C:/Users/bkami/Desktop/Swing clips/C74BE667-6D37-4CC0-A925-DAFE43B945AD.MOV" tools/clips/short.MOV && git status --short
```

Expected: only modified tracked files. `tools/clips/` must NOT appear, proving Task 1's ignore works.

- [ ] **Step 3: Load the clip in the browser**

Start the server with `preview_start` (config `golf-caddy-http`), navigate to `http://localhost:8940/tools/swing-harness.html`, then run via `javascript_tool`:

```js
await SH.load('/tools/clips/short.MOV');
```

Expected: `{duration: 2.97…, width: 872, height: 654}`

- [ ] **Step 4: Verify seek and zoom render a real frame**

```js
await SH.seek(1.2); SH.setView(200, 150, 1.5); 'ok';
```

Then take a screenshot. Expected: a sharp, zoomed swing frame filling the canvas.

- [ ] **Step 5: Commit**

```bash
git add tools/swing-harness.html
git commit -m "Add clip loading, seeking, and a zoomable crop view to the harness"
```

---

## Task 6: Harness — motion energy scan

**Files:**
- Modify: `tools/swing-harness.html`

- [ ] **Step 1: Add the scan**

Add to the `SH` object before its closing `};`, putting a comma after the previous entry:

```js
  // Frame-to-frame pixel difference at low resolution. Returns numbers, never
  // images, which is what makes scanning a long multi-swing clip affordable.
  scanMotion: async function (t0, t1, step) {
    var small = document.createElement('canvas');
    small.width = 96;
    small.height = Math.max(1, Math.round(96 * v.videoHeight / v.videoWidth));
    var sctx = small.getContext('2d', { willReadFrequently: true });
    var out = [], prev = null;
    for (var t = t0; t <= t1; t += step) {
      await seek(t);
      sctx.drawImage(v, 0, 0, small.width, small.height);
      var cur = sctx.getImageData(0, 0, small.width, small.height).data;
      if (prev) {
        var sum = 0;
        for (var i = 0; i < cur.length; i += 4) sum += Math.abs(cur[i] - prev[i]);
        out.push({ time: Math.round(t * 1000) / 1000,
                   energy: Math.round(sum / (cur.length / 4)) });
      }
      prev = cur.slice();
    }
    return out;
  }
```

- [ ] **Step 2: Verify it finds the swing in the short clip**

```js
const m = await SH.scanMotion(0, 2.9, 0.1);
const peak = m.reduce((a, b) => b.energy > a.energy ? b : a);
const sorted = m.map(x => x.energy).sort((a, b) => a - b);
JSON.stringify({ peak, median: sorted[Math.floor(sorted.length / 2)], n: m.length });
```

Expected: `n` around 29, `peak.time` in the second half of the clip where the downswing occurs, and peak energy several times the median. If the peak is not clearly above the median, the scan is not usable on this clip and the skill's fallback (ask the user for timestamps) applies — record that outcome.

- [ ] **Step 3: Commit**

```bash
git add tools/swing-harness.html
git commit -m "Find swings by motion energy without extracting frames"
```

---

## Task 7: Harness — audio impact detection with motion fallback

**Files:**
- Modify: `tools/swing-harness.html`

- [ ] **Step 1: Add audio transient detection**

Add to the `SH` object, comma-separated:

```js
  // Impact from the audio transient: the strike is a sharp jump in short-window
  // RMS, which pins impact far more precisely than the motion peak, whose true
  // frame is smeared by blur and sampling. Returns null when the clip has no
  // decodable audio or no audibly sharp strike, so the caller falls back.
  findImpactAudio: async function (t0, t1) {
    var audio;
    try {
      var buf = await (await fetch(clipUrl)).arrayBuffer();
      var actx = new (window.AudioContext || window.webkitAudioContext)();
      audio = await actx.decodeAudioData(buf);
    } catch (e) { return null; }
    var data = audio.getChannelData(0), rate = audio.sampleRate;
    var a = Math.max(0, Math.floor(t0 * rate));
    var b = Math.min(data.length, Math.ceil(t1 * rate));
    var win = Math.max(1, Math.round(rate * 0.005));
    var best = { time: null, jump: 0 }, prevE = null, sumJump = 0, nJump = 0;
    for (var i = a; i + win < b; i += win) {
      var e = 0;
      for (var j = i; j < i + win; j++) e += data[j] * data[j];
      e = Math.sqrt(e / win);
      if (prevE != null) {
        var jump = e - prevE;
        if (jump > 0) { sumJump += jump; nJump++; }
        if (jump > best.jump) best = { time: i / rate, jump: jump };
      }
      prevE = e;
    }
    // A transient only counts if it clearly stands out from ordinary variation;
    // otherwise the track is silent or merely noisy and motion should be used.
    var meanJump = nJump ? sumJump / nJump : 0;
    if (!best.time || !meanJump || best.jump < meanJump * 8) return null;
    return { time: best.time, jump: best.jump, prominence: best.jump / meanJump };
  }
```

- [ ] **Step 2: Verify against the short clip**

```js
JSON.stringify(await SH.findImpactAudio(0, 2.9));
```

Expected: either an object whose `time` sits within roughly 0.15s of the motion peak found in Task 6, or `null`. **Both are valid outcomes** — `null` means this clip's audio has no sharp strike and the method must fall back to motion. Record which occurred; do not tune the threshold to force a non-null result.

- [ ] **Step 3: Commit**

```bash
git add tools/swing-harness.html
git commit -m "Pin impact from the audio transient, falling back to motion"
```

---

## Task 8: Harness — click to mark, and annotate

**Files:**
- Modify: `tools/swing-harness.html`

- [ ] **Step 1: Add marking and annotation**

Add to the `SH` object, comma-separated:

```js
  // Arms the next canvas click to record a landmark under this label. The click
  // handler converts to video-pixel space and draws a crosshair, so a misplaced
  // click is caught by looking at the next screenshot rather than becoming a
  // silent error in the measurement.
  mark: function (label) { pendingLabel = label; return 'armed: ' + label; },
  points: function () { return marks.slice(); },
  clearPoints: function () { marks = []; render(); return 'cleared'; },

  // Draws the measurement between two named marks so the delta is visible in the
  // screenshot rather than asserted in prose.
  annotate: function (labelA, labelB, caption) {
    var A = marks.filter(function (m) { return m.label === labelA; })[0];
    var B = marks.filter(function (m) { return m.label === labelB; })[0];
    if (!A || !B) return 'missing mark';
    var ax = (A.x - view.cropX) * view.zoom, ay = (A.y - view.cropY) * view.zoom;
    var bx = (B.x - view.cropX) * view.zoom, by = (B.y - view.cropY) * view.zoom;
    ctx.strokeStyle = '#ff0'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ff0'; ctx.font = 'bold 15px monospace';
    ctx.fillText(caption || '', Math.min(ax, bx) + 8, Math.min(ay, by) - 8);
    return 'annotated';
  }
```

- [ ] **Step 2: Add the click handler**

Append after the `SH` object definition, before `</script>`:

```js
c.addEventListener('click', function (e) {
  var r = c.getBoundingClientRect();
  var scr = { x: (e.clientX - r.left) * (c.width / r.width),
              y: (e.clientY - r.top) * (c.height / r.height) };
  var p = screenToVideo(scr, view);
  if (!p) return;
  marks.push({ x: p.x, y: p.y, label: pendingLabel, time: v.currentTime });
  log('marked ' + pendingLabel + ' at ' + p.x.toFixed(1) + ',' + p.y.toFixed(1));
  pendingLabel = null;
  render();
});
```

- [ ] **Step 3: Verify the full click loop on a real frame**

Run `SH.mark('head')` via `javascript_tool`, click the player's head with the `computer` tool, then:

```js
JSON.stringify(SH.points());
```

Expected: one point with plausible video-pixel coordinates and the frame's `time`. Take a screenshot and confirm the green crosshair sits on the head. **If it does not, the coordinate mapping is wrong — fix it before proceeding**, because every later measurement depends on this.

- [ ] **Step 4: Commit**

```bash
git add tools/swing-harness.html
git commit -m "Add click-to-mark landmarks and measurement annotation"
```

---

## Task 9: Write the skill

**Files:**
- Create: `.claude/skills/swing-video-analysis/SKILL.md`

- [ ] **Step 1: Write it**

Create the file with YAML frontmatter — `name: swing-video-analysis` and a description naming golf swing video, findings, and `data/findings.json` — then these sections:

1. **Hard rules, stated first.** Never commit a clip, a frame, or any likeness of the user. Verify `git status` shows no media before committing. The server binds to loopback and is stopped at session end.
2. **Setup.** Copy the clip to `tools/clips/`; `preview_start` the `golf-caddy-http` config; open `http://localhost:8940/tools/swing-harness.html`; `SH.load('/tools/clips/<name>')`. On decode failure, stop and report that HEVC is the one genuine ffmpeg case.
3. **Ask which club was hit.** State the camera angle you observe and have the user confirm it. Never infer it silently — it gates the taxonomy.
4. **Locate swings.** `SH.scanMotion(0, duration, 0.25)`; peaks are swings. If no peak clearly exceeds the median, ask the user for rough timestamps rather than guess.
5. **Locate positions.** `SH.findImpactAudio` first; motion peak as fallback; state which was used. Address is the last quiet frame before the rise, top is the local dip, finish is where motion settles. Confirm each visually before use. Pull extra positions only when a candidate finding needs one. If the impact frame is too motion-blurred to place a landmark on, use the nearest sharp frame and say so, or decline that measurement — never place a landmark on a blur and treat it as precise.
6. **Measure.** `SH.mark(label)` → click → screenshot to confirm the crosshair landed → repeat on the second frame → mark two or more static background references in both frames → `correctedDelta`. When `signal` is false, report **no signal**, never a small finding.
7. **Confidence.** `measured` when `signal` is true; `visual` when no clean landmark pair exists or no static reference was available; `speculative` when the angle cannot support the finding or the measurement landed inside the noise.
8. **Spot-check consistency.** Repeat only the single relevant measurement on the other swings. Record "observed in N of M swings" in the finding's free-text `measurement` field.
9. **Write findings.** The taxonomy is fixed — see `FINDING_TAXONOMY` in `range.html`; never invent a key. New findings get `firstNoted`, `lastConfirmed`, `status: open`. Recurring ones update `lastConfirmed` and move to `improving` only when `isImprovement` returns true. Absence in one video never resolves a finding. Optionally log one `video`-source priority, closing any open one first.
10. **Deliver.** Use `SH.setView` to zoom to a crop around the player so detail is legible, `SH.annotate` to draw the measurement, and screenshot that into the conversation. Never commit these images. Conclusions reach the phone as findings text through `range.html`; pictures stay in chat.
11. **Filming guidance for future clips — advisory, never a gate.** Tell the user: face-on or down-the-line, phone at hip height, 10–12 feet away, good light, and propped on something rather than handheld, since camera drift is the largest source of measurement noise. Older clips cannot be re-shot, so never refuse one — a degraded clip yields fewer `measured` findings and more no-signal results, which is the correct behavior.
12. **What never to produce.** No 0–100 score. No population or tour comparison. No invented drills. No claims about an idealized "correct" swing.
13. **Teardown.** `preview_stop`; empty `tools/clips/`; confirm `git status` is clean of media.

- [ ] **Step 2: Verify the frontmatter parses**

```bash
cd "C:/Users/bkami/Desktop/AI Tools/golf-caddy" && head -5 .claude/skills/swing-video-analysis/SKILL.md
```

Expected: opening `---`, a `name:` line, a `description:` line, closing `---`.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/swing-video-analysis/SKILL.md
git commit -m "Add the swing video analysis skill"
```

---

## Task 10: End-to-end dry run

The point of this task is to find out cheaply whether the output is substantive or hand-wavy, before trusting the method.

**Files:**
- Possibly modify: `data/findings.json`

- [ ] **Step 1: Run a real session**

Follow the skill start to finish on `C:/Users/bkami/Desktop/Swing clips/C74BE667-6D37-4CC0-A925-DAFE43B945AD.MOV`, asking the user which club it was.

- [ ] **Step 2: Judge the output honestly**

Report to the user: how many findings reached `measured`, how many returned no signal, and whether the conclusions were substantive or generic. **A run producing zero measured findings on a handheld clip is a valid outcome, not a failure** — say so plainly rather than lowering the bar to produce something.

- [ ] **Step 3: Commit findings only if any survived**

```bash
git status --short
```

Verify no clip or frame is staged. Then, only if findings were recorded:

```bash
git add data/findings.json
git commit -m "Record swing findings from the first video session"
```

- [ ] **Step 4: Tear down**

```bash
cd "C:/Users/bkami/Desktop/AI Tools/golf-caddy" && rm -rf tools/clips/* && taskkill //F //IM python.exe && git status --short
```

Expected: a clean tree apart from any intended `data/findings.json` change.
