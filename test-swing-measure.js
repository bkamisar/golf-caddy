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
