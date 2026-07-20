# ⛳ Golf Caddy — Grint Analyzer

Paste your (free-tier) Grint scores table → honest trends, one evidence-backed
practice focus, and a "team of coaches" debrief prompt for Claude. Single static
page, everything stays in your browser (localStorage). No account, no API key.

## Use it

1. On The Grint: **Stats → Scores** → select the whole table → copy.
2. Open the page → paste → **Parse & save**. Re-pasting later is safe
   (duplicates merge by date+course+score).
3. Read the verdicts; **Copy prompt** to debrief with the four coaches
   (Faldo/Bryson/Faxon/Phil) in the Claude app — they argue from your real
   computed numbers, not vibes.
4. **Export JSON** occasionally — localStorage is per-browser.

## Deploy (GitHub Pages)

Publish this repo via GitHub Desktop → repo Settings → Pages → deploy from
`main` root. Then bookmark it on your phone for the course.

## How the analytics think (design notes)

- **Distributions, not averages.** Averages hide bimodal changes (the July 2026
  lesson: a "flat" putting average masked two career-best 38-putt rounds mixed
  with old 46+ rounds). So: medians, 20th/80th-percentile ceiling/floor, and a
  career-best-decile hit-rate detector for "the good state is showing up more
  often."
- **Putts are confounded by GIR.** Raw putt counts punish chip-on golf. Putts
  are compared against a bogey-golfer expectation given that round's GIR
  (2.15 putts on greens hit, 1.95 after a miss — constants at the top of the
  engine, tunable). The residual blends stroke quality with chip proximity;
  hole-level data would be needed to split them, which free Grint doesn't give.
- **Leaks are ranked in strokes/round** so categories are comparable:
  putts-vs-expected · blowup cost (80th pct − median differential) · long game
  vs your own best-quartile rounds. Fast wins are called out separately from
  slow projects (GIR), and non-problems (e.g. driving accuracy) are explicitly
  labeled so practice time isn't wasted.
- **18-hole rounds only** feed the headline differential trend (Grint 9-hole
  differentials aren't comparable). 9-hole rounds DO feed the per-hole component
  signals (putts, putts-vs-expected, long game), minus quarantined rows: putts/hole
  < 1.4 for a 90s shooter is a data-entry artifact and gets flagged ⚠, not averaged.
- **Trend = last 5 vs the previous 10** (not all-time — a 2023 round shouldn't
  vote on whether you're improving now). The engine sorts internally and never
  trusts paste order (stress-tested: a newest-first paste fed raw would otherwise
  reverse every trend verdict). A course-mix caveat fires when your recent slope
  mix diverges >6 from career.
- Parser handles the paste's messiness: multi-line course names, names
  containing `|`, missing GIR/FIR cells (a lone % ≤30 is GIR, ≥36 is FIR,
  31–35 is dropped as ambiguous), 9/10-hole rounds.

Engine functions (`parseGrint`, `computeMetrics`, `coachPrompt`) are pure and
DOM-free between the `/*ENGINE-START*/ … /*ENGINE-END*/` markers — testable in
node by extracting that block (see git history for the harness pattern).

Built 2026-07-19 with Claude (Fable 5).
