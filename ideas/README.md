# pickwhonext: the backlog

The tool is played straight. Nothing here is a bit. A tool gets out of
the way; the backlog is things that would make it get further out of it.

## Shipped 2026-09-02 (the Friday minimum, early)

- Three scoring formats, each with its own ADP and projections.
- Points above replacement, the wait gap off the snake clock, the
  roster-need multiplier.
- Configurable roster slots and league size.
- localStorage persistence, undo, new draft.
- Search by name, team code, city, or nickname (the Houston Texans
  problem from the 2026 draft of record).
- Injury designations from Sleeper; out players never recommended.
- The methodology page, verbose on purpose.
- Finished-team summary with projected starter points, copyable.

## Shipped 2026-09-04, from the original author's notes

- Draft order: snake, linear, or third-round reversal.
- Superflex slot (QB, RB, WR, TE) with its own share of replacement
  level. Two-quarterback leagues now price quarterbacks correctly.
- The roster shape is printed next to the Roster button, because the
  original author did not find the button. That was the feature request.

## Next

- **Live draft sync.** Sleeper has a public read-only API for draft
  picks (`/v1/draft/<id>/picks`), CORS-enabled. Paste a Sleeper draft
  URL and the board marks picks itself. ESPN and Yahoo have no public
  equivalent. This is the single biggest friction remover.
- **Roster-need learning from the other teams.** Optional per-team
  tracking so the tool can guess that the team picking before you needs
  a quarterback. Costs a click per pick; maybe a toggle.
- **Keeper mode.** Pre-mark kept players from a pasted list.
- **Scoring detail.** Six-point passing touchdowns, tight end premium.
  Requires stat-level projections; Sleeper's feed carries them.
- **Consensus projections.** A second projection source averaged in,
  so the Value column is not one analyst's opinion.
- **Shareable summary card.** OG image of the finished roster.
- **The usability pass with a non-fan.** Per the original note.

## Data notes

- FFC's API returns JSON with a text/html content type and no CORS
  header. Build-time only.
- Sleeper's projections endpoint is undocumented (the one their web app
  uses). If it vanishes, the last `data/players.json` keeps working.
- Sleeper asks for one players-dump pull per day. The build script does
  exactly one.
