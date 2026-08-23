# Visual Refresh & Mobile Course View — Design

**Date:** 2026-08-23
**Status:** Approved, ready for implementation planning
**Deliverable:** Restyled `index.html` and `range.html`; new `course.html`

## Purpose

Two related requests: (1) the suite currently looks like a functional prototype, not a
polished product — restyle both existing tools with real visual craft. (2) data entry
happens on a computer, but on-course reference (club distances, top reminders) needs to
happen on a phone — build a dedicated mobile-first view for that.

Both mockup rounds (four desktop iterations, one mobile) were reviewed and approved
live in the browser before this spec was written; the design below documents what was
approved, plus the mechanical decisions needed to actually build it.

## Visual language (shared across all three pages)

This is the suite's new design system. It replaces the current dark-green
card/shadow/border-radius treatment on all three pages, not just the new one.

**Palette** — deep pine green background (not near-black), warm gold/champagne accent,
ivory/cream primary text, muted sage-green for "good," gold for "warn"/highlight, a
muted brick-red (not a bright alarm red) for "bad," muted gray-green for secondary/dim
text. Original composition inspired by classic golf-club color pairings in the general
sense (deep green + gold + cream) — no logos, wordmarks, taglines, or copied graphics
from any specific tournament or organization.

Concrete values, carried over from the approved mockups so implementation doesn't have
to re-derive or drift from what was actually shown and approved:

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0e2818` | Page background |
| `--surface` | `#0d1f14` (approx., slightly darker than bg) | Any raised/inset area, used sparingly |
| `--ink` | `#f2ecd8` | Primary text, large numbers |
| `--dim` | `#a8b8a0` | Secondary/detail text |
| `--label` | `#7d9276` | Uppercase section labels |
| `--gold` | `#c9a961` | Primary accent — bars, dividers (low opacity), warn tone |
| `--good` | `#6ea36f` | Sage green — good tone, positive deltas |
| `--bad` | `#b5654a` | Muted brick-red — bad tone (new; not present in the approved mockups, chosen to sit harmoniously in this palette rather than a cold/bright red) |
| `--divider` | `rgba(201,169,97,.12–.25)` | Hairline dividers, gold at low opacity |

`--bad` is the one token not literally shown in an approved mockup (none of the mockup
verdicts used the "bad" tone) — flagged here explicitly so the implementer treats it as
a real color choice to sanity-check against the rest of the palette, not an
already-approved value.

**Typography** — a serif display face (Georgia or similar system serif) for the
wordmark and card-section titles; the existing system sans for UI labels, body copy,
and buttons; monospace with tabular numerals for every numeric value (yardages,
percentages, deltas, scores) so digit columns actually align and numbers read as data,
not prose.

**Structure** — no boxed cards with shadows and heavy border-radius. Sections are
separated by hairline dividers (1px, low-opacity gold) and generous whitespace, not
containers. Two structural patterns replace the old card-grid:

- **Ladder rows** — for any ranked/ordered numeric list (club-by-club gapping), each
  row IS the visualization: a thin horizontal bar whose width is proportional to that
  row's value relative to the largest value in the list (`width% = value / maxValue *
  100`), with the row's label at left and its tabular-numeral value at right. No
  separate chart bolted onto a table.
- **Annotated notes** — verdicts/observations render as a compact list: a small colored
  dot (mapped to tone: sage=good, gold=warn, brick=bad, gray=flat) followed by a short
  bolded headline and a muted one-line detail, not a colored alert box with a border.

Where a page's data isn't naturally a ranked list (index.html's round-score trends are
a time series per metric, not a bag of clubs), the ladder pattern is not force-fit —
those sections keep a table/stat layout, restyled with the same hairlines, serif/sans
pairing, and tabular numerals, but without an inline bar.

## `range.html` restyle

Every existing card gets the new visual language: the paste/tag/club-override form,
verdicts (→ annotated notes), club gapping (→ ladder), saved sessions table, coach
debrief section, per-club shot-detail expandables. No functional/behavioral change —
this is styling only, applied to the DOM structure and CSS, not the engine or the data
flow. The approved desktop mockup used a two-column layout (ladder + notes side rail);
on a narrow window the notes column stacks below the ladder rather than the two-column
layout breaking.

## `index.html` restyle

Same palette/typography/hairline-divider treatment applied to its existing sections
(verdicts → annotated notes, trend stats, coach debrief, all-rounds detail table). No
ladder pattern here — round-score trends don't have the "ranked list of comparable
items" shape the ladder is for. Purely visual; no changes to the round-scoring engine
or data model.

## New `course.html` — mobile course view

A third, standalone, self-contained page (same "no build step" convention as the other
two — its own copy of the engine functions it needs, not a shared module). Mobile-first
layout, also viewable on a desktop browser without breaking.

**Content, top to bottom:**
1. Compact header (wordmark, last-updated date)
2. "Today's reminders" — up to 3 highest-priority verdicts from `computeVerdicts`,
   rendered as short annotated-list entries. Priority order: non-`flat`-tone verdicts
   first (bad/warn/good, in that order — a real problem or a real positive signal
   outranks a routine data-quality note), `flat`-tone verdicts fill remaining slots up
   to the cap of 3. If zero verdicts exist, the section is omitted entirely rather than
   showing an empty box.
3. "Your bag" — the yardage ladder, one row per club (same driver→wedges ordering as
   `range.html`'s gapping table), single column. Each row shows: club name, bar
   (width relative to the bag's longest clean-carry club), carry yardage (large,
   tabular), and a secondary line with side-bias direction/magnitude and mishit rate
   (small, muted). Clubs with no clean-shot data are skipped from the ladder — a course
   reference has no use for a "no data" row.
4. A small "Refresh data (import)" text link at the bottom — the only interactive
   element besides that.

**No paste form, no delete UI, no per-shot detail.** This page is read-only reference,
not a management surface — that stays on `range.html`.

### Data source and cross-device sync

`course.html` reads the same `golfcaddy_range` localStorage key `range.html` writes.
If both pages are ever opened in the same browser (e.g., testing on a desktop, or a
phone that was also used to paste data directly), `course.html` shows the data with
zero setup. For the primary real-world case — data entered on a computer, viewed on a
phone — the two devices don't share localStorage, so `course.html`'s "Refresh data"
link opens the same file-picker-based import flow already built and hardened in
`range.html`'s `doImport()` (full shape validation: array of objects, each with a
string `date`, a `club` object with string `name` and number `order`, and a `shots`
array whose elements are objects with only-numeric-or-null fields — the exact
validation that took three review rounds to get right in `range.html`, reused
verbatim, not reimplemented). Importing **merges** into `course.html`'s local copy via
the same `mergeClubSessions` used everywhere else, so re-importing an updated export
after a new range session is safe and idempotent, matching every other import path in
the suite.

No QR code, no server, no account — the user moves the exported JSON file to their
phone however they already do that (AirDrop, email to self, a cloud-drive folder),
which is explicitly out of scope for this tool to solve.

### Engine reuse

`course.html` needs: `CLUB_TABLE`/`canonicalClub`/`clubByName`, the numeric helpers
(`median`/`mean`/`quantile`/`r1`), `quarantineClub`, `groupByClub`, `computeGapping`,
`computeTrend`, `computeVerdicts`, `mergeClubSessions`/`shotKey`, and `esc`. It does
**not** need the parsers (`parseTrackman`/`parseGenericLM`/`SOURCES`) since it never
parses a fresh paste — it only imports already-parsed JSON. Per the established
suite convention (`index.html` and `range.html` each already carry their own copy of
shared pure-function logic rather than a build step), the simplest and most
consistent choice is to copy the **full** engine block from `range.html` into
`course.html` rather than inventing a new "partial engine" convention — the unused
parser functions cost nothing at runtime and keeping the whole block identical means
a future engine fix is a known, single, mechanical copy-paste across two files
instead of reasoning about which subset a third file needs.

### New logic specific to `course.html`

Two small pure functions, neither of which exists yet:

- **Reminder selection**: given `computeVerdicts`'s full output, pick the top 3 by the
  priority rule above (non-flat first, flat filling remaining slots, capped at 3).
- **Ladder bar width**: given a club's clean-carry yardage and the bag's maximum
  clean-carry yardage, compute `width% = carry / maxCarry * 100`. Clubs with no
  clean-carry data (`cleanCarryYd === null`) are excluded from both the max-carry
  calculation and the rendered ladder.

Both are pure, node-testable functions living in `course.html`'s own engine block,
following the same `test-<page>-engine.js` extraction-harness pattern already
established for `range.html`.

## Out of scope

- No changes to any parsing, merging, quarantine, or trend-computation logic on any
  page — this is presentation and one new read-only page, not new analytics.
- No QR-code or server-based sync — explicitly rejected in favor of the existing
  export/import file flow.
- No edit/delete capability on `course.html` — session management stays on
  `range.html`.
- No changes to the round-scoring engine's actual numbers or verdicts on `index.html`
  — visual only.

## Testing

`test-course-engine.js`, mirroring the existing harness pattern: extract
`course.html`'s engine block, node-test the two new pure functions (reminder
selection, ladder bar width) against constructed verdict/gapping fixtures, plus a
handful of reused assertions confirming the copied engine functions behave
identically to their `range.html` originals (parity check, not re-deriving every
existing test).

`range.html` and `index.html`'s existing test suites (`test-range-engine.js`,
`test-engine.js`) need no new assertions — this is a CSS/DOM-structure change with no
engine-logic change, so the existing pure-function tests remain the correctness
guarantee; verification of the restyle itself is a manual/live browser check, same as
every prior UI-wiring task in this project.
