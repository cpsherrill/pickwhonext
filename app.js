/* Pick Who Next: the engine.
   Data comes from data/players.json (built by tools/build_data.py). The draft
   lives in localStorage. The recommendation is explained on /how; the code
   here is the same story in a different language. No em dashes were harmed. */
(function () {
  "use strict";

  var POS = ["QB", "RB", "WR", "TE", "K", "DEF"];
  var FLEX_POS = ["RB", "WR", "TE"];
  var FLEX_SHARE = { RB: 0.5, WR: 0.4, TE: 0.1 };
  var FMT_LABEL = { ppr: "PPR", half: "Half PPR", std: "Standard" };
  var OUT = { Out: 1, IR: 1, PUP: 1, Sus: 1, DNR: 1, NA: 1, Doubtful: 1 };
  var STORE = "pickwhonext.v1";
  var WAIT_MARGIN = 2;      // a player is "likely there next turn" if ADP > next pick + this
  var VALUE_NUDGE = 0.15;   // score = wait gap + nudge * value
  var DEFAULTS = {
    teams: 12, slot: 0, fmt: "ppr",
    roster: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1, BN: 6 },
    hideKD: true
  };

  var DATA = null, PLAYERS = [], BYID = {}, TEAMS = {};
  var S = load() || { settings: clone(DEFAULTS), picks: [], done: false };
  var ui = { pos: "ALL", sort: "score", q: "" };
  var picked = {};       // id -> true
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- persistence ---------- */
  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (!raw) return null;
      var s = JSON.parse(raw);
      s.settings = Object.assign(clone(DEFAULTS), s.settings || {});
      s.settings.roster = Object.assign(clone(DEFAULTS.roster), s.settings.roster || {});
      s.picks = s.picks || [];
      return s;
    } catch (e) { return null; }
  }
  function save() {
    try { S.updated = Date.now(); localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* private mode */ }
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function track(name, params) { if (window.gtag) { try { gtag("event", name, params || {}); } catch (e) { /* no-op */ } } }

  /* ---------- data ---------- */
  function fmt() { return S.settings.fmt; }
  function adp(p) { var a = p.adp || {}; var v = a[fmt()]; if (v == null) v = a.ppr != null ? a.ppr : (a.half != null ? a.half : a.std); return v == null ? 999 : v; }
  function proj(p) { return p._proj[fmt()]; }
  function isOut(p) { return !!(p.inj && OUT[p.inj.status]); }
  function isQ(p) { return !!(p.inj && !OUT[p.inj.status]); }

  // Fill missing projections from same-position ADP neighbours, per format.
  function fillProjections() {
    PLAYERS.forEach(function (p) { p._proj = {}; p._est = {}; });
    ["ppr", "half", "std"].forEach(function (f) {
      POS.forEach(function (pos) {
        var have = PLAYERS.filter(function (p) { return p.pos === pos && p.proj && p.proj[f] != null; })
          .map(function (p) { return { a: p.adp[f] != null ? p.adp[f] : 999, v: p.proj[f] }; })
          .sort(function (x, y) { return x.a - y.a; });
        PLAYERS.filter(function (p) { return p.pos === pos; }).forEach(function (p) {
          if (p.proj && p.proj[f] != null) { p._proj[f] = p.proj[f]; return; }
          var a = p.adp[f] != null ? p.adp[f] : 999, v = 0;
          if (!have.length) { v = 0; }
          else if (a <= have[0].a) { v = have[0].v; }
          else if (a >= have[have.length - 1].a) { v = have[have.length - 1].v * 0.9; }
          else {
            for (var i = 1; i < have.length; i++) {
              if (have[i].a >= a) {
                var lo = have[i - 1], hi = have[i], t = (a - lo.a) / Math.max(1e-6, hi.a - lo.a);
                v = lo.v + (hi.v - lo.v) * t; break;
              }
            }
          }
          p._proj[f] = Math.round(v * 10) / 10; p._est[f] = true;
        });
      });
    });
  }

  /* ---------- league math ---------- */
  function teams() { return S.settings.teams; }
  function rosterSize() { var r = S.settings.roster; return POS.reduce(function (n, p) { return n + (r[p] || 0); }, 0) + (r.FLEX || 0) + (r.BN || 0); }
  function startersAt(pos) {
    var r = S.settings.roster, n = teams() * (r[pos] || 0);
    if (FLEX_POS.indexOf(pos) >= 0) n += teams() * (r.FLEX || 0) * FLEX_SHARE[pos];
    return Math.max(1, Math.round(n));
  }
  // Static replacement level: the projected points of the last starter at each
  // position, league-wide, computed from the whole pool at the start.
  function replacementStatic() {
    var repl = {};
    POS.forEach(function (pos) {
      var arr = PLAYERS.filter(function (p) { return p.pos === pos; }).map(proj).sort(function (a, b) { return b - a; });
      var n = startersAt(pos);
      repl[pos] = arr.length ? arr[Math.min(n, arr.length) - 1] : 0;
    });
    return repl;
  }
  function value(p, repl) { return proj(p) - repl[p.pos]; }

  // Snake clock. Overall pick numbers are 1-based.
  function pickLabel(o) { var T = teams(), rd = Math.ceil(o / T), i = ((o - 1) % T) + 1; return rd + "." + (i < 10 ? "0" : "") + i; }
  function myPicks() {
    var T = teams(), s = S.settings.slot, out = [];
    if (!(s >= 1 && s <= T)) return out;
    var rounds = rosterSize();
    for (var r = 1; r <= rounds; r++) out.push((r % 2 === 1) ? (r - 1) * T + s : (r - 1) * T + (T - s + 1));
    return out;
  }
  function currentPick() { return S.picks.length + 1; }
  function nextMine(after) { var m = myPicks(); for (var i = 0; i < m.length; i++) if (m[i] > after) return m[i]; return null; }

  /* ---------- roster ---------- */
  function slotList() {
    var r = S.settings.roster, slots = [];
    ["QB", "RB", "WR", "TE", "FLEX", "K", "DEF"].forEach(function (s) { for (var i = 0; i < (r[s] || 0); i++) slots.push({ slot: s, p: null }); });
    return slots;
  }
  function buildRoster() {
    var slots = slotList(), bench = [], overflow = [], BN = S.settings.roster.BN || 0;
    var mine = S.picks.filter(function (d) { return d.mine; }).map(function (d) { return BYID[d.id]; }).filter(Boolean);
    mine.forEach(function (p) {
      var placed = false, i;
      for (i = 0; i < slots.length; i++) if (!slots[i].p && slots[i].slot === p.pos) { slots[i].p = p; placed = true; break; }
      if (!placed && FLEX_POS.indexOf(p.pos) >= 0) for (i = 0; i < slots.length; i++) if (!slots[i].p && slots[i].slot === "FLEX") { slots[i].p = p; placed = true; break; }
      if (!placed) (bench.length < BN ? bench : overflow).push(p);
    });
    return { slots: slots, bench: bench, overflow: overflow, mine: mine };
  }
  function openSlots(R) {
    var open = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, K: 0, DEF: 0 };
    R.slots.forEach(function (s) { if (!s.p) open[s.slot]++; });
    open.BN = Math.max(0, (S.settings.roster.BN || 0) - R.bench.length);
    return open;
  }
  // The roster-need multiplier. Explained on /how.
  function needMult(pos, open) {
    var otherStartersOpen = ["QB", "RB", "WR", "TE", "FLEX"].some(function (s) { return open[s] > 0; });
    if (pos === "K" || pos === "DEF") {
      if (open[pos] > 0) return otherStartersOpen ? 0.25 : 1.0;
      return 0.05;
    }
    if (open[pos] > 0) return 1.0;
    if (FLEX_POS.indexOf(pos) >= 0 && open.FLEX > 0) return 0.85;
    if (open.BN > 0) return (pos === "RB" || pos === "WR") ? 0.5 : 0.35;
    return 0.05;
  }
  function needWord(pos, open) {
    if (open[pos] > 0) return "an open " + pos + " slot";
    if (FLEX_POS.indexOf(pos) >= 0 && open.FLEX > 0) return "an open FLEX slot";
    if (open.BN > 0) return "bench depth at " + pos;
    return "no room at " + pos;
  }

  /* ---------- the recommendation ---------- */
  function available() { return PLAYERS.filter(function (p) { return !picked[p.id]; }); }

  function scoreBoard(avail, R) {
    var repl = replacementStatic(), open = openSlots(R);
    var cur = currentPick(), nxt = nextMine(cur);
    var waitRepl = {}, waitWho = {};
    POS.forEach(function (pos) {
      var pool = avail.filter(function (p) { return p.pos === pos && !isOut(p); });
      var survivors = nxt ? pool.filter(function (p) { return adp(p) > nxt + WAIT_MARGIN; }) : [];
      var best = null;
      (survivors.length ? survivors : []).forEach(function (p) { if (!best || proj(p) > proj(best)) best = p; });
      if (best) { waitRepl[pos] = proj(best); waitWho[pos] = best; }
      else { waitRepl[pos] = repl[pos]; waitWho[pos] = null; }
    });
    avail.forEach(function (p) {
      p._value = value(p, repl);
      p._gap = proj(p) - waitRepl[p.pos];
      p._need = needMult(p.pos, open);
      var base = Math.max(0, p._gap) + VALUE_NUDGE * Math.max(0, p._value);
      if (isQ(p)) base *= 0.95;
      p._score = isOut(p) ? -1 : base * p._need;
    });
    return { repl: repl, waitRepl: waitRepl, waitWho: waitWho, open: open, nxt: nxt, cur: cur };
  }

  /* ---------- tiers and runs ---------- */
  function tierize() {
    POS.forEach(function (pos) {
      var arr = PLAYERS.filter(function (p) { return p.pos === pos; }).sort(function (a, b) { return proj(b) - proj(a) || adp(a) - adp(b); });
      var t = 1;
      arr.forEach(function (p, i) {
        if (i > 0) { var drop = proj(arr[i - 1]) - proj(p); if (drop > Math.max(8, proj(arr[i - 1]) * 0.06)) t++; }
        p._tier = t; p._posRank = i + 1;
      });
    });
  }

  /* ---------- search ---------- */
  function matches(p, q) {
    if (!q) return true;
    var hay = [p.name, p.team];
    var t = TEAMS[p.team]; if (t) { hay.push(t.city || ""); hay.push(t.nick || ""); }
    var words = hay.join(" ").toLowerCase().replace(/[.'’]/g, "").split(/\s+/);
    return q.toLowerCase().replace(/[.'’]/g, "").split(/\s+/).filter(Boolean).every(function (tok) {
      return words.some(function (w) { return w.indexOf(tok) === 0; });
    });
  }

  /* ---------- render ---------- */
  function color(pos) { return "var(--" + pos.toLowerCase() + ")"; }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function n1(x) { return (Math.round(x * 10) / 10).toFixed(1); }

  function render() {
    picked = {}; S.picks.forEach(function (d) { picked[d.id] = true; });
    var avail = available(), R = buildRoster();
    var ctx = scoreBoard(avail, R);
    renderSettings();
    renderClock(ctx);
    renderRec(avail, ctx, R);
    renderList(avail, ctx);
    renderRoster(R, ctx);
    renderCliffs(avail, ctx);
    renderLog();
    renderNeeds(ctx.open);
    if (R.mine.length >= rosterSize() && !S.done) finish(true);
  }

  function renderSettings() {
    var s = S.settings;
    document.querySelectorAll("#fmtSeg button").forEach(function (b) { b.classList.toggle("on", b.dataset.fmt === s.fmt); });
    $("teams").value = s.teams; $("slot").value = s.slot || "";
    document.querySelectorAll("#rosterCfg input").forEach(function (i) { i.value = s.roster[i.dataset.slot]; });
    $("cfgNote").textContent = rosterSize() + " roster spots, " + rosterSize() + " rounds. Value is measured against the last starter at each position in a " + s.teams + "-team league.";
  }

  function renderClock(ctx) {
    var cur = ctx.cur, T = teams();
    $("onClock").textContent = pickLabel(cur);
    $("overall").textContent = "pick " + cur + " of " + (T * rosterSize());
    var box = $("clockMine"), s = S.settings.slot;
    box.classList.remove("soon", "now");
    if (!(s >= 1 && s <= T)) { $("yourTurn").textContent = "set your slot"; $("yourAway").textContent = "so the clock knows when you pick"; return; }
    var m = myPicks(), mineNow = m.indexOf(cur) >= 0, nxt = mineNow ? cur : nextMine(cur);
    if (!nxt) { $("yourTurn").textContent = "done"; $("yourAway").textContent = "no picks left"; return; }
    if (mineNow) { $("yourTurn").textContent = "now"; $("yourAway").textContent = pickLabel(cur) + " is yours"; box.classList.add("now"); }
    else { var away = nxt - cur; $("yourTurn").textContent = pickLabel(nxt); $("yourAway").textContent = away + (away === 1 ? " pick away" : " picks away"); if (away <= 2) box.classList.add("soon"); }
  }

  function renderRec(avail, ctx, R) {
    var pool = avail.filter(function (p) { return p._score >= 0; }).sort(function (a, b) { return b._score - a._score; });
    var best = pool[0];
    window._rec = best;
    if (!best) { $("recBody").innerHTML = '<div class="muted">The board is empty.</div>'; return; }
    var mineNow = myPicks().indexOf(ctx.cur) >= 0;
    var who = ctx.waitWho[best.pos];
    var why = "";
    if (S.settings.slot) {
      if (who) why += "Projected " + esc(n1(proj(best))) + " points, " + esc(n1(best._gap)) + " more than " + esc(who.name) + " (ADP " + esc(n1(adp(who))) + "), the best " + best.pos + " likely to still be there at your next pick. ";
      else why += "Projected " + esc(n1(proj(best))) + " points. No " + best.pos + " this good is likely to be there at your next pick. ";
    } else {
      why += "Projected " + esc(n1(proj(best))) + " points, " + esc(n1(best._value)) + " above the last starter at " + best.pos + ". Set your slot and the clock will also weigh who survives to your next turn. ";
    }
    why += '<span class="muted">You have ' + esc(needWord(best.pos, ctx.open)) + ".";
    if (isQ(best)) why += " Listed " + esc(best.inj.status.toLowerCase()) + (best.inj.part ? " (" + esc(best.inj.part.toLowerCase()) + ")" : "") + ".";
    if (best.bye) why += " Bye week " + best.bye + ".";
    why += "</span>";
    var alts = pool.slice(1, 4).map(function (p) { return "<b>" + esc(p.name) + "</b> " + p.pos + p._posRank; }).join(" &middot; ");
    var byAdp = avail.filter(function (p) { return !isOut(p); }).sort(function (a, b) { return adp(a) - adp(b); })[0];
    $("recBody").innerHTML =
      '<div class="recname" style="color:' + color(best.pos) + '">' + esc(best.name) + "<small>" + best.pos + best._posRank + " &middot; " + esc(best.team) + " &middot; tier " + best._tier + "</small></div>" +
      '<div class="recwhy">' + why + "</div>" +
      '<div class="recalts"><span>Next best: ' + alts + "</span>" + (byAdp && byAdp !== best ? "<span>Top by ADP: <b>" + esc(byAdp.name) + "</b></span>" : "") + "</div>" +
      '<div class="recbtns"><button class="mini mine' + (mineNow ? " now" : "") + '" data-act="mine" data-id="' + best.id + '">I took ' + esc(best.name.split(" ").slice(-1)[0]) + '</button><button class="mini" data-act="taken" data-id="' + best.id + '">Someone else did</button></div>';
  }

  function rowHTML(p, mineNow) {
    var tags = "";
    if (p.rookie) tags += '<span class="tag r" title="Rookie">R</span>';
    if (isOut(p)) tags += '<span class="tag o" title="' + esc(p.inj.status) + (p.inj.part ? ", " + esc(p.inj.part) : "") + '">' + esc(p.inj.status.toUpperCase()) + "</span>";
    else if (isQ(p)) tags += '<span class="tag q" title="' + esc(p.inj.status) + (p.inj.part ? ", " + esc(p.inj.part) : "") + '">Q</span>';
    tags += '<span class="tag t" title="Tier ' + p._tier + " at " + p.pos + '">T' + p._tier + "</span>";
    var est = p._est[fmt()] ? '<span class="tag e" title="Projection estimated from ADP">~</span>' : "";
    return '<div class="prow' + (p === window._rec ? " rec" : "") + (isOut(p) ? " out" : "") + '" style="border-left-color:' + color(p.pos) + '" data-id="' + p.id + '">' +
      '<span class="pos" style="color:' + color(p.pos) + '">' + p.pos + "<small>" + p._posRank + "</small></span>" +
      '<span class="name">' + esc(p.name) + '<span class="sub"><span class="tm">' + esc(p.team) + "</span>" + tags + "</span></span>" +
      '<span class="bye">' + (p.bye || "") + "</span>" +
      '<span class="adp">' + n1(adp(p)) + "</span>" +
      '<span class="proj">' + est + Math.round(proj(p)) + "</span>" +
      '<span class="val' + (p._value < 0 ? " neg" : "") + '">' + Math.round(p._value) + "</span>" +
      '<span class="acts"><button class="mini" data-act="taken" data-id="' + p.id + '">Taken</button><button class="mini mine' + (mineNow ? " now" : "") + '" data-act="mine" data-id="' + p.id + '">Mine</button></span></div>';
  }

  function renderList(avail, ctx) {
    var list = avail.slice(), s = S.settings;
    if (ui.pos !== "ALL") list = list.filter(function (p) { return p.pos === ui.pos; });
    else if (s.hideKD && !ui.q) list = list.filter(function (p) { return p.pos !== "K" && p.pos !== "DEF"; });
    if (ui.q) list = list.filter(function (p) { return matches(p, ui.q); });
    var sorters = {
      score: function (a, b) { return b._score - a._score || adp(a) - adp(b); },
      value: function (a, b) { return b._value - a._value; },
      adp: function (a, b) { return adp(a) - adp(b); },
      proj: function (a, b) { return proj(b) - proj(a); }
    };
    list.sort(sorters[ui.sort]);
    var mineNow = myPicks().indexOf(ctx.cur) >= 0;
    var note = list.length + " available" + (ui.pos !== "ALL" ? " at " + ui.pos : (s.hideKD && !ui.q ? ", kickers and defenses hidden" : "")) + ", " + FMT_LABEL[s.fmt] + " scoring";
    $("count").innerHTML = esc(note) + (ui.pos === "ALL" && !ui.q ? ' &middot; <a href="#" id="togKD">' + (s.hideKD ? "show K and DEF" : "hide K and DEF") + "</a>" : "");
    $("list").innerHTML = list.length ? list.map(function (p) { return rowHTML(p, mineNow); }).join("") : '<div class="empty">No one matches. Try a last name, a team code, a city, or a nickname.</div>';
  }

  function renderRoster(R, ctx) {
    var html = "";
    var missing = POS.filter(function (pos) { return (S.settings.roster[pos] || 0) > 0 && !R.mine.some(function (p) { return p.pos === pos; }); });
    html += missing.length ? '<div class="need">Still need a starter at ' + missing.map(function (p) { return '<b style="color:' + color(p) + '">' + p + "</b>"; }).join(", ") + "</div>" : '<div class="ok">Every position has a starter.</div>';
    html += R.slots.map(function (s) {
      var p = s.p;
      return '<div class="slot"><span class="sp" style="color:' + (p ? color(p.pos) : "var(--muted)") + '">' + s.slot + '</span><span class="who' + (p ? "" : " empty") + '">' + (p ? esc(p.name) + "<small>" + esc(p.team) + " &middot; bye " + (p.bye || "?") + "</small>" : "open") + "</span></div>";
    }).join("");
    var BN = S.settings.roster.BN || 0;
    if (BN) {
      html += '<div class="benchl">Bench ' + R.bench.length + " of " + BN + "</div>";
      for (var i = 0; i < BN; i++) { var p = R.bench[i]; html += '<div class="slot"><span class="sp" style="color:' + (p ? color(p.pos) : "var(--muted)") + '">BN</span><span class="who' + (p ? "" : " empty") + '">' + (p ? esc(p.name) + "<small>" + p.pos + " &middot; " + esc(p.team) + " &middot; bye " + (p.bye || "?") + "</small>" : "open") + "</span></div>"; }
    }
    if (R.overflow.length) html += '<div class="warn">' + R.overflow.length + " over the roster limit: " + R.overflow.map(function (p) { return esc(p.name); }).join(", ") + "</div>";
    var byes = {};
    R.slots.forEach(function (s) { if (s.p && s.p.bye) byes[s.p.bye] = (byes[s.p.bye] || 0) + 1; });
    var stacks = Object.keys(byes).filter(function (w) { return byes[w] >= 3; });
    if (stacks.length) html += '<div class="warn">Bye stack among starters: ' + stacks.map(function (w) { return "week " + w + " (" + byes[w] + ")"; }).join(", ") + ".</div>";
    $("roster").innerHTML = html;
    $("rosterCount").textContent = R.mine.length + " of " + rosterSize();
  }

  function renderCliffs(avail, ctx) {
    $("cliffs").innerHTML = ["RB", "WR", "TE", "QB"].map(function (pos) {
      var arr = avail.filter(function (p) { return p.pos === pos && !isOut(p); }).sort(function (a, b) { return proj(b) - proj(a); });
      var n = startersAt(pos), left = arr.filter(function (p) { return p._value >= 0; }).length;
      var pct = Math.max(0, Math.min(100, 100 * left / n));
      var note, warn = false;
      if (!arr.length) note = "All gone.";
      else {
        var top = arr[0]._tier, inTier = arr.filter(function (p) { return p._tier === top; }).length;
        var nextT = arr.find(function (p) { return p._tier !== top; });
        if (nextT) { var drop = Math.round(proj(arr[inTier - 1]) - proj(nextT)); note = inTier + " left in tier " + top + ", then a " + drop + "-point drop."; warn = inTier <= 2; }
        else note = arr.length + " left, all in one tier.";
      }
      return '<div class="cliff"><div class="t"><span style="color:' + color(pos) + ';font-weight:700">' + pos + '</span><span class="muted">' + left + " of " + n + " starter-level left</span></div>" +
        '<div class="bar"><span style="width:' + pct + "%;background:" + color(pos) + '"></span></div><div class="n' + (warn ? " warn" : "") + '">' + esc(note) + "</div></div>";
    }).join("");
  }

  function renderLog() {
    if (!S.picks.length) { $("log").innerHTML = '<div class="muted" style="font-size:13px">No picks yet. Tap <b>Taken</b> as players come off the board and <b>Mine</b> for your own.</div>'; return; }
    var recent = S.picks.slice(-10).reverse();
    $("log").innerHTML = recent.map(function (d, i) {
      var p = BYID[d.id], no = S.picks.length - i;
      return '<div class="logitem"><span class="pk">' + pickLabel(no) + '</span><span style="color:' + color(p.pos) + '">' + esc(p.name) + "</span>" + (d.mine ? '<span class="mt">mine</span>' : "") + "</div>";
    }).join("");
  }

  function renderNeeds(open) {
    var started = S.picks.some(function (d) { return d.mine; });
    document.querySelectorAll(".chip[data-pos]").forEach(function (c) {
      var pos = c.dataset.pos, need = false;
      if (pos === "ALL") return;
      need = open[pos] > 0 || (FLEX_POS.indexOf(pos) >= 0 && open.FLEX > 0);
      c.classList.toggle("needed", need && started);
    });
  }

  /* ---------- actions ---------- */
  function pick(id, mine) {
    if (picked[id]) return;
    var first = !S.picks.length;
    S.picks.push({ id: id, mine: !!mine });
    save(); render();
    if (first) track("draft_started", { format: fmt(), teams: teams(), slot: S.settings.slot || 0 });
    if (mine) track("pick_recorded", { format: fmt(), pos: BYID[id].pos, round: Math.ceil((S.picks.length) / teams()) });
  }
  function undo() { if (S.picks.pop()) { S.done = false; save(); render(); } }
  function reset() {
    if (S.picks.length && !confirm("Start a new draft? This clears every pick.")) return;
    S = { settings: S.settings, picks: [], done: false }; save(); $("summary").hidden = true; render();
  }
  function finish(auto) {
    var R = buildRoster();
    if (!S.done) {
      S.done = true; save();
      track("draft_completed", { format: fmt(), teams: teams(), picks: S.picks.length, mine: R.mine.length, auto: !!auto });
      if (window.AW_ID && window.AW_LABEL) track("conversion", { send_to: window.AW_ID + "/" + window.AW_LABEL });
    }
    var lines = ["My team (" + FMT_LABEL[fmt()] + ", " + teams() + " teams, pickwhonext.com)", ""];
    R.slots.forEach(function (s) { lines.push((s.slot + "    ").slice(0, 5) + (s.p ? s.p.name + " (" + s.p.team + ")" : "open")); });
    R.bench.forEach(function (p) { lines.push("BN   " + p.name + " (" + p.pos + ", " + p.team + ")"); });
    var total = R.slots.reduce(function (n, s) { return n + (s.p ? proj(s.p) : 0); }, 0);
    lines.push(""); lines.push("Projected starter points: " + Math.round(total));
    $("summaryText").textContent = lines.join("\n");
    $("summary").hidden = false;
    if (!auto) $("summary").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- events ---------- */
  function onAct(e) {
    var b = e.target.closest("button[data-act]"); if (!b) return;
    pick(b.dataset.id, b.dataset.act === "mine");
  }
  $("list").addEventListener("click", onAct);
  $("rec").addEventListener("click", onAct);
  $("chips").addEventListener("click", function (e) {
    var c = e.target.closest(".chip"); if (!c) return;
    ui.pos = c.dataset.pos;
    document.querySelectorAll(".chip").forEach(function (x) { x.classList.toggle("active", x === c); });
    render();
  });
  $("sortSeg").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    ui.sort = b.dataset.sort;
    document.querySelectorAll("#sortSeg button").forEach(function (x) { x.classList.toggle("on", x === b); });
    render();
  });
  $("fmtSeg").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    S.settings.fmt = b.dataset.fmt; save(); tierize(); render();
  });
  $("count").addEventListener("click", function (e) {
    if (e.target.id === "togKD") { e.preventDefault(); S.settings.hideKD = !S.settings.hideKD; save(); render(); }
  });
  $("search").addEventListener("input", function (e) { ui.q = e.target.value.trim(); render(); });
  $("teams").addEventListener("change", function (e) { S.settings.teams = Math.max(4, Math.min(16, parseInt(e.target.value, 10) || 12)); save(); render(); });
  $("slot").addEventListener("change", function (e) { S.settings.slot = parseInt(e.target.value, 10) || 0; save(); render(); });
  $("rosterBtn").addEventListener("click", function () {
    var c = $("rosterCfg"), open = c.hidden; c.hidden = !open; $("rosterBtn").setAttribute("aria-expanded", String(open));
  });
  $("rosterCfg").addEventListener("change", function (e) {
    var i = e.target; if (!i.dataset.slot) return;
    S.settings.roster[i.dataset.slot] = Math.max(0, parseInt(i.value, 10) || 0); save(); render();
  });
  $("undoBtn").addEventListener("click", undo);
  $("resetBtn").addEventListener("click", reset);
  $("finishBtn").addEventListener("click", function () { finish(false); });
  $("closeSummary").addEventListener("click", function () { $("summary").hidden = true; window.scrollTo({ top: 0, behavior: "smooth" }); });
  $("copyBtn").addEventListener("click", function () {
    var t = $("summaryText").textContent;
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { $("copyBtn").textContent = "Copied"; setTimeout(function () { $("copyBtn").textContent = "Copy"; }, 1500); });
  });
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "z" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); undo(); }
    if (e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); $("search").focus(); }
  });

  /* ---------- boot ---------- */
  fetch("data/players.json").then(function (r) { return r.json(); }).then(function (d) {
    DATA = d; PLAYERS = d.players; TEAMS = d.teams || {};
    PLAYERS.forEach(function (p) { BYID[p.id] = p; });
    // Drop picks whose ids no longer exist after a data refresh.
    S.picks = S.picks.filter(function (x) { return BYID[x.id]; });
    fillProjections(); tierize(); render();
    var m = d.meta, a = m.sources.adp.formats;
    $("footData").textContent = "Data built " + m.built.slice(0, 10) + ". ADP from " + (a.ppr.drafts || 0).toLocaleString() + " PPR, " + (a.half.drafts || 0).toLocaleString() + " half PPR, and " + (a.std.drafts || 0).toLocaleString() + " standard drafts through " + a.ppr.end + ", blended with Sleeper. Projections by RotoWire. Injuries from Sleeper.";
    if (!S.settings.slot) $("slot").focus();
  }).catch(function (err) {
    $("recBody").innerHTML = '<div class="warn">The player data did not load. If you opened this file from disk, serve it over http instead.</div>';
    console.error(err);
  });
})();
