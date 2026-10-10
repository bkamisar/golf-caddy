---
name: coach-debrief
description: Use when the user asks for a coach debrief, asks what to practise next, or when a scorecard capture reports that the open practice priority's window is complete. Combines round, hole-level, launch-monitor and video evidence, ranks problems by course cost, and saves the confirmed priority to data/recommendations.json.
---

# Combined coach debrief

One debrief across every data source, run in a Claude Code session in this repo
so it can save its own priority. Design: `docs/superpowers/specs/2026-10-09-combined-debrief-design.md`.

## Rules

- **Every number comes from `node tools/debrief-facts.js`.** Never compute a
  figure in your head. If a figure you want isn't in the report, say so.
- **Rank problems by what they cost on the course** wherever course data can
  measure them. A range-originated priority is allowed only where course data
  structurally cannot see the problem (such as wedge distance gaps: there is no
  approach data). Label it range-originated and name a course outcome to watch.
- **Report disagreement; don't settle it.** Course data is self-recorded and
  coarse; range data is mat-based and instrument-specific. Say which evidence
  agrees with which.
- **Every figure carries its sample size and coverage.** Unrecorded is unknown,
  never a miss. Never average across instruments.
- **"Not enough data" is a valid answer** for any section.
- **Video findings are context, never a cause.** Usually one swing.
- **Write like a golf coach, not a statistician.** No p-values, no "bootstrap",
  no measurement plumbing. State confidence in plain words.
- **Never infer an outcome.** The user confirms met, not met, or not enough data.

## When to run a full debrief

Only when: the open priority's window is complete, no priority is open, or
the user asks. After an ordinary round, the scorecard skill's progress line is
enough.

## Procedure

1. Run `node tools/debrief-facts.js` and read the whole report.
   - `open` is the open priority and its evaluation (`evaluation` is null for a
     free-text priority logged on a page, which you judge by hand).
   - `course` is tier A evidence; `range.bySource` and `range.driverSides` are
     tier B, one instrument each; `findings` is tier C.
   - The script reads only committed files. If the user mentions a priority
     they logged on a page but never saved to the data file, it is not here:
     ask them for its text.
2. Write the debrief in this order:
   1. **Continuity.** The open priority, its test, and the evaluation. If the
      window is complete, propose the outcome the numbers support and ask the
      user to confirm it.
   2. **Where strokes go.** Putts above expectation, putts per round, 3-putt
      holes, missed-driver cost, blow-ups, par-3 greens — each per 18 with its
      sample. These overlap; never add them up.
   3. **What range and video add, and where the evidence agrees or
      disagrees.** Required, even if the answer is "they agree".
   4. **The biggest lever.**
   5. **One priority.** The drill, the course test, the window, and in plain
      words how likely it is to pass by luck versus with real improvement.
   6. **What this can't tell you.** The data gaps, and which recording habit
      would close each (for example: first-putt distance on every hole).
3. Pick the test with `node tools/debrief-facts.js --propose <metric> <improvementPer18> [windowHoles]`.
   Metrics: `putts`, `putts-vs-expected`, `three-putts`, `blow-ups`. Choose an
   improvement that is ambitious but realistic for the drill. Use the printed
   sentence for the luck-versus-improvement odds. If it reports not enough
   rounds, say so and use a free-text criterion instead.
4. Ask the user to confirm the priority and, if one is open, its outcome. Do
   not write anything until they have.
5. Save it:
   - Course-tested: `node tools/write-priority.js --priority "<drill>" --metric <metric> --improvement <n> [--window <holes>] [--close <met|not-met|insufficient-data> --close-note "<why>"]`
   - Range-originated: `node tools/write-priority.js --priority "<drill>" --criterion "<test, including the course outcome to watch>" [--close …]`

   Run it with `--dry-run` first if anything is unusual. Never edit
   `data/recommendations.json` by hand.
6. Run `node test-debrief-facts.js` and confirm `ALL PASS`, then commit
   `data/recommendations.json` with a message naming the priority, for example
   `Set practice priority: lag putting ladder (putts <= 39.5 per 18 over 54 holes)`.
   Local commit only; remind the user to push in GitHub Desktop.

The pages' Copy-prompt buttons still work as a fallback when no Claude Code
session is available.
