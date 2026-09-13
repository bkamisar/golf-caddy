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
chk('M1 missing point returns null', screenToVideo(null, { cropX: 0, cropY: 0, zoom: 1 }) === null);
chk('M1 zero zoom returns null rather than dividing by zero',
  screenToVideo({ x: 1, y: 1 }, { cropX: 0, cropY: 0, zoom: 0 }) === null);
chk('M1 missing cropX/cropY returns null rather than NaN',
  screenToVideo({ x: 1, y: 1 }, { zoom: 1 }) === null);
chk('M1 a zero crop origin is not treated as missing',
  screenToVideo({ x: 5, y: 5 }, { cropX: 0, cropY: 0, zoom: 1 }) !== null);

// M2. pointDelta
chk('M2 delta is b minus a',
  (() => { const d = pointDelta({ x: 10, y: 10 }, { x: 13, y: 4 });
    return d.dx === 3 && d.dy === -6; })());
chk('M2 missing first point returns null', pointDelta(null, { x: 1, y: 1 }) === null);
chk('M2 missing second point returns null', pointDelta({ x: 1, y: 1 }, null) === null);

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
chk('M4 magnitude exactly at the noise floor is still no signal (not >=)',
  (() => { const r = correctedDelta(
      { x: 0, y: 0 }, { x: CLICK_PRECISION_PX, y: 0 },
      [{ x: 0, y: 0 }, { x: 50, y: 50 }],
      [{ x: 0, y: 0 }, { x: 50, y: 50 }]);
    return r.magnitude === r.noiseFloor && r.signal === false; })());

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

console.log('\n' + (fails ? fails + ' FAILURES' : 'ALL PASS'));
