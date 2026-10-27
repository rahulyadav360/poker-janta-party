import { state, esc, num, signed, cls, pct, plural, dur, name, game, dateLabel, timeLabel, avatar, personLink, sortableTable, STAT_HELP, board, cards, liveBadge, updatedLabel, unlockItem, badBeatItem } from "../ui.js";
import { shareRecap } from "../recap.js";
import { divergingBars, lines, sparkline } from "../charts.js";
import { awardCard, sessionCard } from "./home.js";
import { notFound } from "../main.js";

export function sessions(app) {
  const G = state.data.games;
  app.dataset.title = "Sessions";
  app.innerHTML = `
    <header class="page-head">
      <span class="eyebrow">The archive</span>
      <h1>Sessions</h1>
      <p class="lede">${plural(G.length, "session")}, newest first. Open one for the full report: results, awards, the running chip count and the biggest pots.</p>
    </header>
    <div class="members">${G.map(sessionCard).join("")}</div>
    <section class="panel section">
      <div class="panel-head"><h2>Compare sessions</h2></div>
      <div id="sessions-table"></div>
    </section>`;
  G.forEach(g => {
    const holder = document.getElementById(`spark-${g.game_id}`);
    const s = g.timeline.series[g.players[0].key];
    if (holder && s) sparkline(holder, s.filter(v => v != null));
  });
  sortableTable(document.getElementById("sessions-table"), [
    { key: "date", label: "Date", left: true, fmt: g => `<a href="#/session/${g.game_id}">${dateLabel(g.date)}</a>`, sort: g => g.date },
    { key: "winner", label: "Winner", left: true, fmt: g => personLink(g.players[0].key, 24) },
    { key: "hands", label: "Hands", fmt: g => num(g.hands), sort: g => g.hands },
    { key: "players", label: "Players", fmt: g => g.player_count, sort: g => g.player_count },
    { key: "dur", label: "Length", fmt: g => dur(g.duration_min), sort: g => g.duration_min },
    { key: "buyin", label: "Buy-ins", fmt: g => num(g.buy_in_total), sort: g => g.buy_in_total },
    { key: "rebuys", label: "Rebuys", fmt: g => g.rebuys, sort: g => g.rebuys },
    { key: "pot", label: "Avg pot", fmt: g => num(g.avg_pot), sort: g => g.avg_pot },
    { key: "big", label: "Biggest pot", fmt: g => num(g.biggest_pots[0]?.pot), sort: g => g.biggest_pots[0]?.pot },
    { key: "flop", label: "Saw flop", fmt: g => pct(g.flop_pct), sort: g => g.flop_pct },
    { key: "sd", label: "Showdown", fmt: g => pct(g.showdown_pct), sort: g => g.showdown_pct },
  ], G, { sort: { key: "date", dir: -1 }, onRow: g => { location.hash = `#/session/${g.game_id}`; } });
}

export function session(app, id) {
  const g = game(id);
  if (!g) return notFound();
  app.dataset.title = dateLabel(g.date);
  const idx = state.data.games.indexOf(g);
  const newer = state.data.games[idx - 1], older = state.data.games[idx + 1];
  const w = g.players[0];
  app.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/sessions">Sessions</a><span>/</span><span>${dateLabel(g.date)}</span></nav>
    <header class="page-head split-head">
      <div style="display:grid;gap:8px">
        <span class="eyebrow">${g.live ? `${liveBadge(g)}Started ${timeLabel(g.start)} IST · ${updatedLabel(g)} · refreshes by itself` : `Session report · ${timeLabel(g.start)} to ${timeLabel(g.end)} IST`}</span>
        <h1>${dateLabel(g.date)}</h1>
        <p class="lede">${num(g.hands)} hands of no-limit hold'em at ${esc(g.blinds.join(", "))} over ${dur(g.duration_min)}. ${esc(name(w.key))} ${g.live ? "leads so far with" : "took the night with"} ${signed(w.ledger.net)}.</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn primary" id="share-recap" type="button">Share recap</button>
        <a class="btn" href="#/hands/${g.game_id}">Browse all hands</a>
        <a class="btn" href="${g.url}" target="_blank" rel="noopener">PokerNow table ↗</a>
      </div>
    </header>

    <div class="strip">
      <div><div class="k">Hands</div><div class="v">${num(g.hands)}</div><div class="s">${Math.round(g.hands / (g.duration_min / 60))} an hour</div></div>
      <div><div class="k">Players</div><div class="v">${g.player_count}</div><div class="s">${g.avg_players} seated per hand</div></div>
      <div><div class="k">Buy-ins</div><div class="v">${num(g.buy_in_total)}</div><div class="s">${plural(g.rebuys, "rebuy")}</div></div>
      <div><div class="k">Average pot</div><div class="v">${num(g.avg_pot)}</div><div class="s">biggest ${num(g.biggest_pots[0].pot)}</div></div>
      <div><div class="k">Saw a flop</div><div class="v">${pct(g.flop_pct)}</div><div class="s">showdown in ${pct(g.showdown_pct)}</div></div>
    </div>

    <section class="section">
      <div class="section-head"><div><span class="eyebrow">Party awards</span><h2>Who stood out</h2></div></div>
      <div class="awards">${g.awards.map(awardCard(g)).join("")}</div>
    </section>

    <section class="section grid-2">
      <div class="panel">
        <div class="panel-head"><h2>Badges unlocked</h2><a class="link-more" href="#/honours">Badge book →</a></div>
        <div class="unlocks">${g.unlocks.length ? g.unlocks.map(u => unlockItem(u)).join("") : '<p class="note">No new badges this session.</p>'}</div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Bad beats</h2><span class="note">${plural(g.bad_beat_count, "beat")}</span></div>
        ${g.bad_beat_count ? `<ul class="pots">${state.data.bad_beats.filter(b => b.game_id === g.game_id).sort((a, b) => b.pot - a.pot).map(b => badBeatItem(b, { date: false })).join("")}</ul>` : '<p class="note">Nobody lost a big pot as a big favourite this session.</p>'}
      </div>
    </section>

    <section class="panel section">
      <div class="panel-head"><h2>Running chip count</h2><p class="note">Pick up to 3 members to follow. Click anywhere on the chart to replay that hand.</p></div>
      <div class="legend" id="tl-legend"></div>
      <div id="timeline"></div>
    </section>

    <section class="section grid-2">
      <div class="panel"><div class="panel-head"><h2>Ledger</h2><p class="note">Buy-ins with rebuys combined</p></div><div id="ledger"></div></div>
      <div class="panel"><div class="panel-head"><h2>Result by member</h2></div><div id="game-bars"></div></div>
    </section>

    <section class="panel section">
      <div class="panel-head"><h2>Member stats this session</h2><p class="note">Hover a heading for what it means</p></div>
      <div id="game-stats"></div>
    </section>

    <section class="panel section">
      <div class="panel-head"><h2>Biggest pots</h2><a class="link-more" href="#/hands/${g.game_id}">All ${num(g.hands)} hands →</a></div>
      <ul class="pots">${g.biggest_pots.map(potItem(g)).join("")}</ul>
    </section>

    <nav class="hand-nav section" aria-label="Other sessions">
      ${older ? `<a class="btn" href="#/session/${older.game_id}">← ${dateLabel(older.date)}</a>` : "<span></span>"}
      ${newer ? `<a class="btn" href="#/session/${newer.game_id}">${dateLabel(newer.date)} →</a>` : ""}
    </nav>
  `;

  document.getElementById("share-recap").addEventListener("click", e => shareRecap(g, e.currentTarget));

  const keys = Object.keys(g.timeline.series);
  const finalOf = k => { const v = g.timeline.series[k]; for (let i = v.length - 1; i >= 0; i--) if (v[i] != null) return v[i]; return 0; };
  keys.sort((a, b) => finalOf(b) - finalOf(a));
  let selected = [keys[0], keys[keys.length - 1]];
  const colors = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];
  const drawTimeline = () => {
    const colorOf = k => colors[selected.indexOf(k)];
    document.getElementById("tl-legend").innerHTML = keys.map(k =>
      `<button class="chip ${selected.includes(k) ? "on" : ""}" data-k="${esc(k)}" aria-pressed="${selected.includes(k)}"><span class="key" style="${selected.includes(k) ? `background:${colorOf(k)}` : ""}"></span>${esc(name(k))}</button>`).join("");
    document.querySelectorAll("#tl-legend .chip").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.k;
      selected = selected.includes(k) ? selected.filter(x => x !== k) : [...selected, k].slice(-3);
      drawTimeline();
    }));
    const holder = document.getElementById("timeline");
    holder.innerHTML = "";
    const inner = document.createElement("div");
    holder.appendChild(inner);
    lines(inner, {
      xs: g.timeline.hands, height: 320,
      series: keys.map(k => ({ key: k, label: name(k), values: g.timeline.series[k], color: colorOf(k) })),
      onPick: i => { location.hash = `#/hand/${g.game_id}/${g.timeline.hands[i]}`; },
    });
  };
  drawTimeline();

  sortableTable(document.getElementById("ledger"), [
    { key: "name", label: "Member", left: true, fmt: p => personLink(p.key, 24), sort: p => name(p.key).toLowerCase() },
    { key: "buyin", label: "Buy-in", fmt: p => num(p.ledger.buy_in) + (p.ledger.sessions > 1 ? ` <span class="dim">×${p.ledger.sessions}</span>` : ""), sort: p => p.ledger.buy_in },
    { key: "out", label: "Cash-out", fmt: p => num(p.ledger.buy_out + p.ledger.stack), sort: p => p.ledger.buy_out + p.ledger.stack },
    { key: "net", label: "Net", fmt: p => `<strong>${signed(p.ledger.net)}</strong>`, cls: p => cls(p.ledger.net), sort: p => p.ledger.net },
  ], g.players, { sort: { key: "net", dir: -1 } });

  divergingBars(document.getElementById("game-bars"), g.players.map(p => ({
    label: name(p.key), value: p.ledger.net, href: `#/member/${encodeURIComponent(p.key)}`,
    tip: `<div class="tt-title">${esc(name(p.key))}</div><div class="tt-row"><span class="k">Net</span><span>${signed(p.ledger.net)}</span></div><div class="tt-row"><span class="k">Buy-in</span><span>${num(p.ledger.buy_in)}</span></div><div class="tt-row"><span class="k">Hands</span><span>${p.stats ? num(p.stats.hands) : 0}</span></div>`,
  })));

  sortableTable(document.getElementById("game-stats"), statCols(),
    g.players.filter(p => p.stats).map(p => ({ key: p.key, name: name(p.key), net: p.ledger.net, stats: p.stats })),
    { sort: { key: "net", dir: -1 } });
}

export function statCols() {
  return [
    { key: "name", label: "Member", left: true, fmt: r => personLink(r.key, 24), sort: r => r.name.toLowerCase() },
    { key: "hands", label: "Hands", fmt: r => num(r.stats.hands), sort: r => r.stats.hands },
    { key: "net", label: "Net", fmt: r => signed(r.net), cls: r => cls(r.net), sort: r => r.net },
    { key: "bb100", label: "bb/100", title: STAT_HELP.bb100, fmt: r => signed(r.stats.bb_per_100), cls: r => cls(r.stats.bb_per_100), sort: r => r.stats.bb_per_100 },
    { key: "vpip", label: "VPIP", title: STAT_HELP.vpip, fmt: r => pct(r.stats.vpip), sort: r => r.stats.vpip },
    { key: "pfr", label: "PFR", title: STAT_HELP.pfr, fmt: r => pct(r.stats.pfr), sort: r => r.stats.pfr },
    { key: "3b", label: "3-bet", title: STAT_HELP.three_bet, fmt: r => pct(r.stats.three_bet), sort: r => r.stats.three_bet },
    { key: "af", label: "AF", title: STAT_HELP.af, fmt: r => num(r.stats.af), sort: r => r.stats.af },
    { key: "wtsd", label: "WTSD", title: STAT_HELP.wtsd, fmt: r => pct(r.stats.wtsd), sort: r => r.stats.wtsd },
    { key: "wsd", label: "W$SD", title: STAT_HELP.wsd, fmt: r => pct(r.stats.wsd), sort: r => r.stats.wsd },
    { key: "won", label: "Pots won", fmt: r => num(r.stats.pots_won), sort: r => r.stats.pots_won },
  ];
}

export const potItem = g => p => {
  const win = p.winners.map(w => `${personLink(w.key, 22)} ${cards(w.cards)} <span class="pos" style="font-weight:650">${signed(w.net)}</span>${w.desc ? ` <span class="dim">${esc(w.desc)}</span>` : ""}`).join(" ");
  const lose = p.losers.filter(l => l.cards || l.net <= -p.pot / 4)
    .map(l => `${personLink(l.key, 22)} ${cards(l.cards)} <span class="neg" style="font-weight:650">${signed(l.net)}</span>`).join(" ");
  return `<li class="pot">
    <div class="size">${num(p.pot)}<small>#${p.hand} · ${timeLabel(p.at)}</small></div>
    <div class="body">
      <div class="line">${board(p.board, "md")}${p.board2 ? `<span class="tag">Run 2</span>${board(p.board2, "md")}` : ""}</div>
      <div class="line">${win}</div>
      ${lose ? `<div class="line">${lose}</div>` : ""}
    </div>
    <a class="btn" href="#/hand/${g.game_id}/${p.hand}" aria-label="Replay hand ${p.hand}">▶ Replay</a>
  </li>`;
};
