# Grint scorecard icon legend

Confirmed 2026-09-11 with the user, after two extraction sessions got it wrong.
Read this before extracting hole-level data from a Grint scorecard screenshot.

## The row that carries the icon depends on hole type — this is the mistake to avoid

- **Par 4s and 5s:** the tee shot's accuracy icon lives in the **DRIVING** row.
  The **GIR** row is separate and describes the *approach* shot's result.
- **Par 3s:** there is no drive to track, so the **DRIVING** row is always
  blank. The tee shot's accuracy icon appears in the **GIR** row instead,
  since on a par 3 the tee shot *is* the shot that determines GIR.

Getting this wrong looks like: reading an icon in a par-3's GIR row and
misattributing it to "the driving row," then flagging the hole as an anomaly
because other par-3s have a blank driving row. They all have a blank driving
row — always. The icon was in GIR the whole time.

## Icon meanings (apply in whichever row is live for that hole type)

| Icon | Meaning |
|---|---|
| Bullseye (concentric circles) | Hit — fairway (par 4/5) or green (par 3) |
| X | Missed, no specific direction/severity recorded |
| ↓ | Missed **short** |
| ↑ | Missed **long** — hit it too far, e.g. through a dogleg's fairway |
| » (double chevron) | **Severe** miss |
| → / ← | Missed right / left (direction only, not distance) |

`girMiss` and `driveMiss` share this same vocabulary (`short`, `long`, `severe`,
a directional value, or `null` for a plain unspecified X). There is no reason
to use different words for the same concept on different shots.

## Applying it

- A par-3 hole's `fir` is always `null` (no fairway exists to hit or miss) and
  `driveMiss` is always `null`. The tee shot's outcome shows up entirely in
  `gir`/`girMiss`.
- A par-4/5 hole's drive accuracy goes in `fir`/`driveMiss`; its `gir`/`girMiss`
  describes the approach shot separately, independent of how the drive went.
- Do not guess an icon you haven't confirmed against this table. If a genuinely
  new glyph shows up, ask rather than record a best guess — an unresolved
  field is recoverable; a silently wrong one poisons every rollup built on it.
