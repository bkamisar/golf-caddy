---
name: grint-scorecard-capture
description: Use when the user sends golf scorecard screenshots (a printed Grint scorecard image, or Grint's in-app Scorecard/edit view) to capture hole-by-hole detail into data/hole-detail.json. Covers the icon legend, the JSON schema, and the verification checklist that catches transcription errors before they're committed.
---

# Capturing Grint hole-level scorecard data

There is no in-app import UI for this. The user sends scorecard screenshots
directly in a Claude Code session; this skill is how that gets turned into a
correct, verified entry in `data/hole-detail.json`.

## Two known screenshot sources

**A. Printed/shared scorecard image** — a single wide image with HOLE / PAR /
INDEX / SCORE / PUTTS / DISTANCE (ft) / DRIVING / CLUB / GIR% / PENALTIES rows,
icons drawn as small graphics.

**B. Grint's in-app Scorecard (edit) view** — usually 2-3 phone screenshots
(holes 1-7ish, 8-9/OUT, then TOTAL), same row set, cleaner icons, and its own
**Scorecard Legend** panel at the bottom that spells out codes directly (S =
Greenside Bunker, F = Fairway Bunker, O = Out of Bounds, W = Penalty Area, D =
Drop Shot). When source B is available, trust its printed legend over any
guess — it resolves the PENALTIES ambiguity for that hole outright.

Either source produces the same schema below. Ask which the user is sending
if it's unclear from the images.

## Icon legend (confirmed empirically across 7 rounds)

- Bullseye (concentric circles) = **hit** — fairway in the DRIVING row, green
  in the GIR% row.
- Plain **X** = generic/unspecified miss.
- `→` = missed right. `←` = missed left. `↑` = missed long. `↓` = missed short.
- `»` or `«` (chevron, either direction) = a **severe** miss. Both orientations
  have been treated as the same "severe" category, not two different things.
- **Par-3 holes have a blank DRIVING row** — there's no fairway to hit. Any
  directional/severity icon for a par-3 tee shot belongs in the GIR% row
  instead, since the tee shot directly determines GIR on a par 3. Do not
  attribute a par-3's icon to "driving" even if it visually lines up with
  that column on a printed card.
- DISTANCE (ft) is **first-putt distance**. A value like `50+` is a display
  floor, not the true number — record it as the floor (e.g. `50`) and flag it
  in `unresolved`, never treat it as precise.
- PENALTIES is a **genuinely unresolved mix** most of the time: it carries
  both lie codes (e.g. `S` = greenside bunker) and stroke/event codes (e.g.
  `D` = drop shot, `W` = penalty area, `O` = out of bounds, `2S`) in the same
  cells, and per-hole marks frequently do not sum cleanly to the round's own
  printed penalty total. Never guess a per-hole stroke count from this row.
  Only the round-level printed total goes in `penalties`; there is no
  per-hole penalty-stroke field in the schema (an optional `lie` string is
  allowed on a hole entry if a specific code is clearly legible there — see
  hole 11 in the 2026-09-05 entry for precedent — but it doesn't feed any
  rollup).

## JSON schema (`data/hole-detail.json`)

One flat array (not one file per round — GitHub Pages can't list a directory,
and a per-round-file manifest would drift). Append a new object; array order
doesn't matter, since everything joins by key.

```json
{
  "date": "YYYY-MM-DD",
  "course": "exact string, must match the round's data/rounds.json course field",
  "rating": 68.2,
  "slope": 129,
  "score": 99,
  "putts": 44,
  "girPct": 17,
  "firPct": 62,
  "penalties": 0.5,
  "verified": { "...": "narrative cross-checks, see below" },
  "unresolved": ["...honest notes on anything ambiguous or illegible..."],
  "holes": [
    {
      "hole": 1, "par": 4, "score": 5, "putts": 2,
      "firstPuttFt": null,
      "gir": false, "girMiss": "miss",
      "teeClub": "Dr",
      "fir": true, "driveMiss": null
    }
  ]
}
```

Field notes:
- `course` is joined against the round-level record by
  `` `${date}|${course.trim()}` `` (whitespace-collapsed, but otherwise an
  **exact** string match — same punctuation, same case). Copy the course
  string verbatim from the existing `data/rounds.json` entry for that date;
  don't retype it from the scorecard image.
- `girMiss` / `driveMiss` vocabulary: `null` (hit), `"miss"` (generic X),
  `"left"`, `"right"`, `"long"`, `"short"`, `"severe"`. Use `"miss"` as the
  fallback whenever the icon has no direction/severity — don't invent a
  direction that isn't shown.
- `fir` / `driveMiss` are `null` on every par-3 hole (see icon legend above).
- `teeClub`: record `null` if illegible rather than guessing.
- This top-level `holes` array is attached to a round at read-time as
  `r.holeDetail` (not `r.holes`, which already means hole *count* on the
  round-level record) — see `attachHoleDetail` / `holeDetailKey` in
  `index.html`.

## Verification checklist (do this before writing anything)

For every hole-level capture, reconcile arithmetically — a match is the bar
for confidence, not visual confidence in the transcription:

1. Sum `par`, `score`, `putts` across your transcribed holes and compare
   against the card's own printed OUT / IN / TOTAL subtotals.
2. Count `gir: true` and `fir: true` (over non-par-3 holes only) and compare
   the resulting percentages against the card's own printed GIR% / FIR%
   (or FAIRWAY%) subtotal.
3. Cross-check `score`, `putts`, `girPct`, `firPct` against the **existing
   round-level entry** for that date+course in `data/rounds.json`, if one
   exists (it usually does — the round is normally pasted into `index.html`
   separately). A mismatch there means re-check the transcription, not the
   other file.
4. If anything doesn't reconcile exactly, find the transcription error before
   proceeding — don't record a plausible-looking number that doesn't actually
   sum correctly.
5. Never guess an ambiguous icon. Record the conservative value (`null` or
   generic `"miss"`) and add a specific, concrete note to `unresolved`
   explaining what was ambiguous and why.

Write the `verified` object as short narrative strings recording what was
checked and that it matched (see existing entries in
`data/hole-detail.json` for the expected tone/format).

## After writing the entry

1. Run `node test-engine.js` from the repo root and confirm `ALL PASS`.
2. Commit with a descriptive message naming the round (date + course), e.g.
   `Add hole-level detail for the 2026-09-12 Paint Branch round`. Local
   commit only — this repo's standing rule is no `git push`/`fetch`/`pull`
   from the CLI; the user pushes via GitHub Desktop.

## If a new icon or code shows up

Confirm its meaning with the user directly rather than guessing from visual
similarity to a known icon (this has happened before — a left-pointing
chevron was confirmed as the same "severe" category as the right-pointing
one, not a new category, only after asking). Once confirmed, update the
"Icon legend" section of this file so the next capture doesn't have to
re-ask.
