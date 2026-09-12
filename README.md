# ⛳ Golf Caddy — Grint Analyzer

Paste your (free-tier) Grint scores table → honest trends, one evidence-backed
practice focus, and a structured analyst debrief prompt for Claude. Single
static page, everything stays in your browser (localStorage). No account, no
API key.

## Use it

1. On The Grint: **Stats → Scores** → select the whole table → copy.
2. Open the page → paste → **Parse & save**. Re-pasting later is safe
   (duplicates merge by date+course+score).
3. Read the verdicts; **Copy prompt** and paste it into Claude for a
   structured debrief grounded in your real computed numbers, not vibes.
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

## Multiple scoring apps (source adapters)

The **source dropdown** picks how a paste is parsed; everything downstream (metrics,
verdicts, coach prompt) is shared:

- **The Grint** — paste the Scores table (the messy multi-line format).
- **Other app — CSV / table** — any export with a header row. Columns are mapped by
  keyword (date, score, putts, gir, fir, rating/CR, slope, differential/index), so
  it handles comma or tab data and `MM/DD/YYYY` or `YYYY-MM-DD` dates. It only needs
  **Date + Score**; add **Rating + Slope** (or a Differential column) and it computes
  the handicap differential itself. Missing columns degrade gracefully — a putts-less
  export still gets blow-up/consistency analysis, just not the putting leak.

This is best-effort by design: hardcoding a parser for an app I've never seen a
sample of would be guessing. Bring a friend's real export and adding a *named*
adapter (like Grint's) is a few lines in the `SOURCES` registry.

## Handicap index & good-round recipe

- **Est. index** (shown by the Verdicts header) uses the GHIN/Grint method — best-of
  the last 20 differentials × 0.96, with the USGA small-set count/adjustment table.
- The **Ceiling signal** verdict now states your *recipe*: the average putts (and GIR)
  in your career-best-decile rounds vs a normal day, so "what a good round looks like"
  is a concrete number, not a platitude.

## Range analyzer (Trackman)

A second tool, `range.html`, alongside the round analyzer above — same local-only,
no-account philosophy, different data: shot-level launch monitor sessions instead
of round scores. The two never mix; round data carries no Trackman fields and
vice versa.

1. At the range, on the Trackman screen: select one club → select the whole
   per-club table (header row through the Consistency row) → copy.
2. Open `range.html` → optionally set ball/venue/temp tags for the visit →
   paste → **Parse & save**. One paste = one club on one date; do this once per
   club you hit. Re-pasting is safe — duplicate shots merge.
3. Read the verdicts and gapping table; **Copy prompt** for the same
   structured debrief, grounded in your clean-shot yardages.

**Why clean-shot median, not Trackman's on-screen average:** the average
includes duffs. A shot is quarantined as a mishit if its smash factor is below
a club-class floor (bad strike) or its spin is far below AND its carry is also
below the session's own reference (a thin flier) — spin alone isn't enough,
since your longest shots are often your lowest-spin ones too. Quarantined
shots are shown, never silently dropped.

**Why trend compares 2 sessions vs the previous 3, not 5 vs 10 like the round
analyzer:** range visits are far sparser than rounds. Carry, ball speed, and
spin get a caveat when session ball/venue/temp tags differ or are missing,
since range balls and weather move carry independent of your swing; club
speed, attack angle, side bias, and mishit rate compare freely, since those
aren't ball- or weather-dependent.

The `trackman` adapter is deliberately specific to Trackman's paste shape
(icon-noise lines, the two-line club header, the Average/Consistency footer
used only as a same-paste self-check). A generic keyword-mapped CSV/table
adapter is the fallback for any other launch monitor — bring a real export from
one and a named adapter is a few lines in the `SOURCES` registry, same pattern
as the round analyzer's Grint/generic split.

## Course view (phone)

`course.html` is a third page: a read-only, mobile-first reference for when you're
actually on the course. It shows your top few reminders and the whole bag as a
yardage ladder — carry, typical miss direction, and mishit rate per club — and
nothing else. No paste form, no editing.

It reads the same browser storage as `range.html`, so on the same device it just
works. To get data from the computer you paste on to the phone you carry: hit
**Export JSON** in `range.html`, move that file to your phone however you like
(AirDrop, email, a cloud-drive folder), then tap **Refresh data (import)** on
`course.html`. Importing merges rather than replaces, so re-importing after a new
range session is safe.

## Where the data lives

Canonical data is committed JSON in this repo: `data/range.json` and
`data/rounds.json`. The pages fetch those as a baseline and merge in anything
entered locally but not yet committed.

The loop: paste on your computer → **Save to data file** → commit and push in
GitHub Desktop → your phone sees it.

Pushing is the *sync* step, not the save step. Forget to push and nothing is
lost — your computer still has everything in browser storage. Only the phone
view goes stale.

## Units and sources

Every launch monitor export declares its own units, normalized on import to the
engine's internal metric. Trackman's table paste is metric; its CSV export and
Toptracer's CSV are both yards, with offline in feet. Picking the wrong source
in the dropdown will silently scale every distance, so pick the one that matches
what you pasted.

The two instruments do not agree — measured across one session each, Toptracer
reads 12–20% hotter on ball speed than Trackman, and correspondingly longer on
carry. The tool therefore keeps them as separate sessions and refuses to trend
across them; a trend window spanning both gets flagged as measuring the
instrument rather than your swing.

Every session needs a date. No CSV export supplies one, so the form has a date
field and will refuse a paste without it — undated sessions all collapse into a
single bucket and make trends impossible.

Both `course.html`'s yardage ladder and `range.html`'s gapping table always
show exactly one source at a time (defaulting to whichever has the most recent
data), since a number blending two instruments' carries would match neither —
not something to club off of on the tee, and not something to trend against
either. There is no "all sources" view; a source picker lets you switch
between them, one at a time.

## The practice loop

Each coach debrief opens with a continuity check, because the app remembers
what it told you last time.

1. Copy the debrief prompt into Claude and read what comes back.
2. It ends with one priority and a numeric success criterion. Log both under
   **Log a practice priority**.
3. Practice. Paste the new session.
4. The next debrief opens by asking whether you met that criterion. Record the
   answer when you log the next priority — one form does both.

A priority stays open until you close it, and only one can be open per source
at a time. That is deliberate: the continuity check has to be answerable, and
three simultaneous open priorities make it a guess.

### Swing findings

`data/findings.json` holds standing observations about your swing — early
extension, weight transfer, and so on — from video analysis. They persist until
resolved, so a video session never needs to line up with a range session.

These are written by Claude during a video-analysis session, not typed into the
app. Send the clips, and the findings are written into the repo and committed.
Each carries a confidence level, and a finding recorded from a camera angle
that cannot support it is automatically downgraded to speculative — a front-on
clip cannot establish swing plane, and the app will not pretend otherwise.

Video establishes positions and mechanism. Ball flight comes only from the
launch monitor. The prompt states this rule explicitly so the two are never
conflated.

## Opening the files directly

Double-clicking the HTML (a `file://` URL) still works, but browsers block
`fetch` there, so you'll only see browser-storage data. Serve the folder over
HTTP, or use the Pages URL, to see committed data.
