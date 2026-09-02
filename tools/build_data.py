#!/usr/bin/env python3
"""Build data/players.json for pickwhonext.com from three free feeds.

Sources (no keys, no accounts):
  1. Fantasy Football Calculator ADP, three scoring formats, 12-team.
     https://fantasyfootballcalculator.com/api/v1/adp/{ppr,half-ppr,standard}
  2. Sleeper season projections (RotoWire), three formats, plus Sleeper's
     own ADP in three formats. Undocumented endpoint used by their app.
  3. Sleeper players dump: injury status, rookie flag, depth chart, team
     names for search. Documented; Sleeper asks for one pull per day.

The page loads only the file this writes. Run it before every deploy, and
daily during draft week. If a feed is down, the previous file stays put.

Usage:
  python3 tools/build_data.py            # rebuild data/players.json
  python3 tools/build_data.py --offline  # rebuild from cached raw JSON in /tmp
"""
import json, os, re, sys, unicodedata, urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'players.json')
CACHE = '/tmp/pickwhonext_raw'
SEASON = 2026
FORMATS = {'ppr': 'ppr', 'half': 'half-ppr', 'std': 'standard'}
POS = ('QB', 'RB', 'WR', 'TE', 'K', 'DEF')
BOARD_DEPTH = 220          # Sleeper-only players must be drafted inside this
UA = 'pickwhonext.com data build (colin.sherrill@gmail.com)'

FFC_URL = 'https://fantasyfootballcalculator.com/api/v1/adp/{fmt}?teams=12&year=' + str(SEASON)
SLEEPER_PROJ = ('https://api.sleeper.app/projections/nfl/%d?season_type=regular'
                '&position[]=QB&position[]=RB&position[]=WR&position[]=TE'
                '&position[]=K&position[]=DEF&order_by=pts_ppr' % SEASON)
SLEEPER_PLAYERS = 'https://api.sleeper.app/v1/players/nfl'

# Team abbreviation differences between feeds, normalized to Sleeper's.
TEAM_FIX = {'JAC': 'JAX', 'WSH': 'WAS', 'LA': 'LAR', 'ARZ': 'ARI', 'BLT': 'BAL',
            'CLV': 'CLE', 'HST': 'HOU', 'SD': 'LAC', 'OAK': 'LV', 'STL': 'LAR'}


def fetch(url, name, offline):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name + '.json')
    if offline:
        with open(path) as f:
            return json.load(f)
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=90) as r:
        raw = r.read()
    with open(path, 'wb') as f:
        f.write(raw)
    return json.loads(raw)


def norm(name):
    name = unicodedata.normalize('NFKD', name or '').encode('ascii', 'ignore').decode()
    n = name.lower().replace('.', '').replace("'", '').replace('’', '')
    n = re.sub(r'\s+(jr|sr|ii|iii|iv|v)$', '', n).strip()
    n = re.sub(r'\s+', ' ', n)
    return n


def team(t):
    t = (t or '').upper()
    return TEAM_FIX.get(t, t)


def main():
    offline = '--offline' in sys.argv
    ffc = {k: fetch(FFC_URL.format(fmt=v), 'ffc_' + k, offline) for k, v in FORMATS.items()}
    proj = fetch(SLEEPER_PROJ, 'sleeper_proj', offline)
    players = fetch(SLEEPER_PLAYERS, 'sleeper_players', offline)

    # --- Sleeper player index -------------------------------------------
    by_key = {}
    teams = {}
    for pid, p in players.items():
        pos = p.get('position')
        if pos not in POS:
            continue
        if pos == 'DEF':
            teams[pid] = {'city': p.get('first_name'), 'nick': p.get('last_name')}
            by_key.setdefault((norm(f"{p.get('first_name')} {p.get('last_name')}"), 'DEF'), []).append(pid)
            by_key.setdefault((norm(p.get('last_name') or ''), 'DEF'), []).append(pid)
            continue
        if not p.get('active') or not p.get('team'):
            continue
        by_key.setdefault((norm(p.get('full_name') or ''), pos), []).append(pid)

    def find(name, pos, tm):
        if pos == 'DEF':
            return tm if players.get(tm, {}).get('position') == 'DEF' else None
        cands = by_key.get((norm(name), pos), [])
        if len(cands) > 1 and pos != 'DEF':
            narrowed = [c for c in cands if team(players[c].get('team')) == tm]
            cands = narrowed or cands
        return cands[0] if len(cands) == 1 else None

    # --- FFC ADP, keyed by Sleeper id -----------------------------------
    adp = {}       # pid -> {fmt: adp}
    adp_n = {}     # pid -> {fmt: times_drafted}
    bye_by_team = {}
    unmatched = []
    for fmt, d in ffc.items():
        for row in d['players']:
            pos = {'PK': 'K'}.get(row['position'], row['position'])
            tm = team(row['team'])
            if row.get('bye'):
                bye_by_team[tm] = row['bye']
            pid = find(row['name'], pos, tm)
            if not pid:
                unmatched.append((fmt, row['name'], pos, tm))
                continue
            adp.setdefault(pid, {})[fmt] = row['adp']
            adp_n.setdefault(pid, {})[fmt] = row.get('times_drafted')

    # --- Sleeper projections + ADP --------------------------------------
    sproj = {}
    sadp = {}
    for r in proj:
        s = r.get('stats') or {}
        pid = r.get('player_id')
        if not pid:
            continue
        pts = {'ppr': s.get('pts_ppr'), 'half': s.get('pts_half_ppr'), 'std': s.get('pts_std')}
        if any(v is not None for v in pts.values()):
            sproj[pid] = pts
        a = {'ppr': s.get('adp_ppr'), 'half': s.get('adp_half_ppr'), 'std': s.get('adp_std')}
        if any(v is not None for v in a.values()):
            sadp[pid] = a

    # --- Assemble the board ----------------------------------------------
    out = []
    for pid in set(adp) | set(sadp):
        p = players.get(pid)
        if not p:
            continue
        pos = p.get('position')
        if pos not in POS:
            continue
        tm = pid if pos == 'DEF' else team(p.get('team'))
        blended = {}
        for fmt in FORMATS:
            vals = [x for x in (adp.get(pid, {}).get(fmt), sadp.get(pid, {}).get(fmt)) if x]
            blended[fmt] = round(sum(vals) / len(vals), 1) if vals else None
        # Keep anyone the ADP feed has drafted, or anyone Sleeper drafts
        # inside the board depth who also carries a projection.
        in_ffc = pid in adp
        in_sleeper = pid in sadp and any(v and v <= BOARD_DEPTH for v in sadp[pid].values())
        if not (in_ffc or (in_sleeper and pid in sproj)):
            continue
        if pos == 'DEF':
            name = f"{p.get('first_name')} {p.get('last_name')}"
        else:
            name = p.get('full_name')
        inj = None
        if p.get('injury_status'):
            inj = {'status': p['injury_status'], 'part': p.get('injury_body_part'),
                   'note': p.get('injury_notes')}
        out.append({
            'id': pid, 'name': name, 'pos': pos, 'team': tm,
            'bye': bye_by_team.get(tm),
            'adp': blended,
            'ffc': adp.get(pid), 'sleeperAdp': sadp.get(pid),
            'drafts': adp_n.get(pid),
            'proj': sproj.get(pid),
            'inj': inj,
            'rookie': (p.get('years_exp') == 0) if pos != 'DEF' else False,
            'depth': p.get('depth_chart_order') if pos != 'DEF' else None,
            'age': p.get('age') if pos != 'DEF' else None,
        })
    out.sort(key=lambda x: (x['adp']['ppr'] or 999))

    meta = {
        'built': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'season': SEASON,
        'sources': {
            'adp': {'name': 'Fantasy Football Calculator', 'url': 'https://fantasyfootballcalculator.com/adp',
                    'formats': {k: {'drafts': ffc[k]['meta'].get('total_drafts'),
                                    'start': ffc[k]['meta'].get('start_date'),
                                    'end': ffc[k]['meta'].get('end_date')} for k in FORMATS}},
            'sleeperAdp': {'name': 'Sleeper', 'url': 'https://sleeper.com', 'players': len(sadp)},
            'projections': {'name': 'RotoWire, via Sleeper', 'players': len(sproj)},
            'injuries': {'name': 'Sleeper', 'flagged': sum(1 for x in out if x['inj'])},
        },
        'counts': {pos: sum(1 for x in out if x['pos'] == pos) for pos in POS},
        'unmatched': [f'{n} ({p}, {t}) in {f}' for f, n, p, t in unmatched],
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump({'meta': meta, 'teams': teams, 'players': out}, f, separators=(',', ':'), ensure_ascii=False)
    print(f"wrote {OUT}: {len(out)} players, {os.path.getsize(OUT)//1024} KB")
    print('counts:', meta['counts'])
    print('with projection:', sum(1 for x in out if x['proj']), ' with injury:', meta['sources']['injuries']['flagged'])
    if unmatched:
        print('unmatched FFC rows:', len(unmatched))
        for u in unmatched[:20]:
            print('  ', u)


if __name__ == '__main__':
    main()
