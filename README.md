# pickwhonext

> Who should you take next? A second screen for a fantasy football snake
> draft. Mark picks as they happen; it names the player to take, for your
> roster, in your scoring format.

A tool, played completely straight (sibling in shape to ../jokejudge and
the rest of the family: static, no build, vanilla JS, Firebase Hosting).
For **pickwhonext.com**. No backend. The draft lives in localStorage.

## Run it

```sh
python3 -m http.server 8014
# then visit http://localhost:8014
```

Serve it; do not open the file from disk, because the page fetches
`data/players.json`. Locally the methodology page is `how.html`; on
Firebase, clean URLs make it `/how` and redirect the `.html` form.

## Refresh the data

```sh
python3 tools/build_data.py
```

Pulls three free feeds (Fantasy Football Calculator ADP in three formats,
Sleeper projections and ADP, the Sleeper player dump for injuries) and
writes `data/players.json`. Run it before every deploy, and daily during
draft week. `--offline` rebuilds from the last raw pull in
`/tmp/pickwhonext_raw`. The board is about 300 players; everyone on it
has a projection in all three formats.

## How it works

- **index.html / style.css**: the board. Settings, the snake clock, the
  recommendation card, the player list, roster, position runs, recent
  picks, and the finished-team summary.
- **app.js**: the engine. Scoring-format switch (ADP and projections are
  both per format), points-above-replacement value, the wait gap (what
  you lose at a position by waiting one turn, using the clock), the
  roster-need multiplier, tiers by projection gaps, search by name, team
  code, city, or nickname, localStorage persistence, undo, and three
  analytics events if `GA_ID` is set.
- **how.html**: the methodology, in full, in words. Reads the build
  metadata from the data file so the counts and dates are never stale.
- **data/players.json**: the only thing the page loads.
- **tools/build_data.py**: builds it.
- **ideas/**: the backlog. Never deployed.

## Deploy

Firebase Hosting, project `pickwhonext`. See DEPLOY.md.
