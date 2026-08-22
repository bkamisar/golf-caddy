# Trackman Range Analyzer — Design

**Date:** 2026-08-22
**Status:** Approved, ready for implementation planning
**Deliverable:** `range.html` — a second tool in the Golf Caddy suite

## Purpose

The existing `index.html` analyzes round scores from The Grint. This tool
analyzes shot-level launch monitor data from range sessions. The two share a
philosophy and a code style but no data: range sessions carry no round data, and
rounds carry no launch monitor data. There is no correlation feature.

The tool answers four questions, in priority order:

1. **Is my ball striking improving session over session?** (headline)
2. **What does each club actually carry?** (the number you club with on course)
3. **Which way do I miss, and how tight is the pattern?**
4. **Is my strike quality improving?** (smash factor, attack angle)

## Architecture

New standalone page `range.html`, following every convention already
established in `index.html`:

- Single self-contained static file, no build step, no dependencies
- Pure DOM-free engine functions between `/*ENGINE-START*/` and `/*ENGINE-END*/`
  markers, extractable for node testing
- `localStorage` persistence under its own key `golfCaddyRange`
- A `SOURCES` registry mapping a dropdown selection to a parser function
- Cross-links: `index.html` gains a link to `range.html` and vice versa

Rationale for a separate page rather than a tab in `index.html`: the two data
models share nothing (round rows vs. shot rows), `index.html` is already 475
lines, and merging would roughly double it for no shared code. Keeping each file
small enough to hold in context is a stated goal of this project.

## Input format

The primary input is a copy-paste of a Trackman Range per-club shot table. A
real sample (2026-08-22, 7-iron, 12 shots):

```
2026-08-22
7i
7IronHide
Change Datachange data icon	Club Speed	Attack Ang.	Ball Speed	Spin Rate	Carry	Side
m, m/schange unit icon
m/s	Deg	m/s	Rpm	m	m
1.	Eye icon
Ball icon
31.9	3.0	42.3	5390	116.0	8.4L
2.	Eye icon
Ball icon
32.6	2.0	36.3	1616	69.8	21.6R
...
Average	Balls icon	32.8	2.5	41.6	4861	107.8	5.4R
Consistency	0.4	0.8	2.3	1839	13.9	11.9
```

One paste covers **one club on one date**. A range visit produces several pastes.

## Source registry

Following the `index.html` pattern of a named adapter plus a generic fallback:

```js
const SOURCES = {
  trackman: { label: 'Trackman (range table)', parse: parseTrackman },
  generic:  { label: 'Other launch monitor (CSV/table)', parse: parseGenericLM },
};
```

**`trackman` (default)** is deliberately Trackman-specific. It may assume the
`Eye icon` / `Ball icon` noise lines, the `N.` shot indices, the two-line club
header, and the `Average` / `Consistency` footer. That specificity is what makes
it reliable. It is *not* generalized speculatively — no other brand's export has
been seen, and guessing at an unseen format produces a parser that is worse at
the one format that matters.

**`generic`** maps columns by keyword from any export with a header row. This is
a stronger bet for launch monitors than it was for scoring apps, because launch
monitor metric vocabulary is standardized by physics — competitors export
recognizable `Club Speed` / `Ball Speed` / `Carry` / `Total` / `Spin` /
`Launch` / `Side` columns. If a real second-brand export fails against it, that
export gets promoted to its own named adapter — a few lines in the registry.

A third entry for screenshot/OCR import (Trackman's Map My Club, which does not
produce a copyable table) is **out of scope for v1** but the registry shape
means it slots in later without restructuring.

## Parser design

The parse does **not** trust line positions, because the paste interleaves icon
text with data and carries trailing tabs.

1. **Header detection.** Find the line containing known metric keywords
   (`Club Speed`, `Attack`, `Ball Speed`, `Spin`, `Carry`, `Side`, plus
   `Total`, `Launch`, `Smash`, `Height`, `Curve`). Build the column order from
   it, ignoring surrounding junk such as `Change Datachange data icon`.
   Keyword mapping is required *within* Trackman, not as future-proofing:
   driver views show columns that iron views do not.
2. **Unit detection.** Read the unit row (`m/s`, `Deg`, `Rpm`, `m` — or `yds`,
   `mph`). Normalize all stored values to metric internally; display in
   yards/mph, since that is how the user thinks on course.
3. **Shot rows.** Any line whose numeric-token count matches the column count is
   a data row. Lines such as `1.`, `Eye icon`, `Ball icon` are discarded as
   noise rather than parsed. Empty tokens from trailing tabs are stripped.
4. **Side values.** `8.4L` → `-8.4`, `5.4R` → `+5.4`. Negative is left.
5. **Footer rows.** `Average` and `Consistency` are captured as a **parse
   self-check, not as data**. Every displayed statistic is recomputed from the
   shot rows. If the computed mean diverges from Trackman's stated `Average`
   beyond a tolerance, the UI reports a probable mis-parse. This turns
   Trackman's own footer into a free correctness test.
6. **Date.** Taken from the leading date line when present. If absent, default
   to today and flag the session as date-assumed.

### Club identity

Auto-detect the canonical club from the short-code line (`7i`, `Dr`, `PW`);
the nickname line (`7IronHide`) is ignored. A dropdown lets the user override
or confirm when detection is uncertain.

Canonical clubs carry an ordering index so the gapping table sorts
driver → woods → hybrids → irons → wedges. Unrecognized codes become
`unknown` and sort last rather than failing the parse.

### Merge rule

Same date + same club merges shots into one club-session, so hitting 7-iron
twice in a visit yields one gapping number. Identical shot rows are deduped, so
re-pasting the same table is idempotent — the same guarantee `index.html`
provides via its date+course+score key.

## Data model

```js
{
  sessions: [{
    date: '2026-08-22',
    tags: { ball: 'range'|'premium'|null,
            venue: 'indoor'|'outdoor'|null,
            tempF: number|null,
            facility: string|null },
    clubs: [{
      club: '7i',
      shots: [{ clubSpeed, attackAngle, ballSpeed, spin, carry,
                total, side, launch, height, smash, ... }],  // metric, nulls allowed
      reported: { average: {...}, consistency: {...} }        // parse self-check only
    }]
  }]
}
```

Absent metrics are `null` throughout and every consumer guards for them — the
same null-safety discipline `index.html` applies to putts-less exports.

## Mishit quarantine

Gapping numbers must reflect what the user actually hits, but Trackman's
on-screen `Average` includes duffs, which is why range averages under-report
usable yardage. This tool reports the **median of clean shots** and quarantines
mishits explicitly — shown separately with a mishit-rate percentage, never
silently deleted. This mirrors the putts/hole quarantine in `index.html`.

A shot is quarantined when **either**:

- **Bad strike:** smash factor (`ballSpeed / clubSpeed`) is below a club-class
  floor (irons 1.15, driver ~1.35 — constants at the top of the engine, tunable
  like `EXP_PUTT_GIR`). The iron floor is calibrated against the real 7i sample
  below, not a textbook number: a plausible-sounding 1.25 would incorrectly flag
  two ordinary shots (smash 1.189 and 1.201) that aren't mishits — the real data
  clusters 1.19–1.34 except the actual mishit at 1.11. Driver/wood/hybrid floors
  are unverified estimates pending a real sample from those clubs.
- **Thin flier:** spin is below `SPIN_FLIER_RATIO` × the reference median spin
  **and** carry is below the reference median carry. `SPIN_FLIER_RATIO`
  defaults to 0.5 and is a tunable engine constant.

The reference medians are computed over that club-session. When a club-session
holds fewer than 6 shots the medians are unstable, so the reference falls back
to that club's median across all stored sessions; if the club has no prior
history either, the thin-flier rule is skipped entirely and only the smash-factor
rule applies.

The `and` in the second rule is load-bearing. In the real 7-iron sample, shots 3
and 9 are low-spin (2990 and 3160 rpm against a 5470 median) but carry 119.3 and
122.6 m — the longest in the set. A spin-only rule would discard the two best
swings. Requiring low carry as well correctly quarantines only shot 2
(smash 1.11) and shot 10 (1970 rpm, 94.6 m).

Effect on the sample session: clean median carry **126.7 yds** versus Trackman's
own stated average of **117.9 yds** — an 8.8-yard difference produced entirely
by two thin shots.

Where a club-session has too few clean shots to be meaningful, the gapping table
reports low confidence rather than a precise-looking number.

## Trend engine

Range visits are far sparser than rounds, so the 5-vs-10 window used in
`index.html` would never fire. Window here: **most recent 2 sessions vs. the
previous 3**, per club.

"Session" in this window means *a session in which that club was hit* — sessions
where the club does not appear are skipped rather than counted as a gap. So a
club hit on five separate visits yields a full window even if the user hit other
clubs on visits in between.

The window is gated on a minimum of 5 clean shots **aggregated across each side**
(not per session) and at least 1 session on the recent side and 2 on the
baseline side. Below the gate the tool reports "not enough data yet" for that
club rather than a fabricated verdict.

As in `index.html`, the engine sorts sessions internally by date and never
trusts input order.

### The confounder split

Carry distance at a range is confounded the same way putts were confounded by
GIR: range balls fly materially shorter than premium, ball type varies by
facility, and temperature moves carry several yards. Metrics are therefore
sorted into two classes:

**Ball- and weather-independent** — compared freely across sessions:
club speed, attack angle, side bias, side spread, mishit rate.

**Ball- and weather-dependent** — compared, but caveated when session tags
differ or are missing: carry, ball speed, spin, smash factor.

Session condition tags (ball type, indoor/outdoor, temperature, facility) are
optional fields at paste time and exist to drive this caveat. An untagged
session is treated as unknown conditions, which fires the caveat rather than
suppressing the comparison.

## Verdicts

Ranked plain-English cards with the supporting numbers inline, in the style of
`index.html`. Categories:

- **Trend** per club — carry, mishit rate, dispersion tightness, club speed
- **Side bias** — consistent left/right miss with the magnitude
- **Gap warnings** — adjacent clubs closer than ~8 yds or further than ~20 yds
- **Strike quality** — smash factor against a club-class benchmark
- **Data quality** — high quarantine rate, `Average` cross-check mismatch,
  assumed date, unknown club, single-session clubs

## Gapping table

Below the verdicts. One row per club, ordered driver → wedges:

club · clean median carry (yds) · gap to next club · mishit rate · side bias ·
trend arrow · clean shot count · last-seen date

Gaps outside the healthy band are flagged. Clubs with only one session or few
clean shots are marked low-confidence.

Per-club detail (full shot list including quarantined shots, with the reason
each was quarantined) sits below the gapping table.

## Coach debrief prompt

A `Copy prompt` button, matching the `index.html` feature, feeding the computed
range numbers to the same four coaches so the practice-plan argument runs on
real data rather than vibes.

## Export / import JSON

Same as `index.html` — `localStorage` is per-browser and this is cheap
insurance against losing session history.

## Out of scope for v1

- **Dispersion scatter plot.** The numeric side bias and spread ship in v1; the
  visual plot does not, because the Trackman app already provides it.
- **Screenshot / OCR import** for Map My Club. Registry slot reserved.
- **Any correlation with round data** from `index.html`.

## Testing

`test-range-engine.js`, mirroring the existing `test-engine.js` harness: extract
the engine block, run assertions in node. Cases:

1. The real 7-iron paste as the golden case — asserts 12 shots parsed, shots 2
   and 10 quarantined, clean median carry, side bias
2. A yards/mph unit paste — asserts unit normalization
3. A driver paste with a different column set (Total, Launch, Height, Curve)
4. Missing date line — asserts date-assumed flag
5. A session where every shot is a mishit — asserts graceful low-confidence
   output rather than a crash or an empty median
6. A single-shot club — asserts no divide-by-zero and a low-confidence marker
7. Re-paste idempotency — asserts the same paste twice adds zero shots
8. Deliberately corrupted paste — asserts the `Average` cross-check fires
9. Generic CSV fallback with keyword-mapped columns
10. Unrecognized club code — asserts `unknown` rather than a parse failure
11. Out-of-order session input — asserts the engine sorts internally and the
    trend verdict does not reverse

## Documentation

`README.md` gains a section for the range tool covering the paste workflow, the
mishit quarantine rationale, and the confounder split — matching the existing
"How the analytics think" design-notes style.
