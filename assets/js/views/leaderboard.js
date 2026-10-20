import { state, esc, num, signed, cls, pct, name, avatar, personLink, movement, form, sortableTable, STAT_HELP, dateLabel } from "../ui.js";
import { styleMap, divergingBars } from "../charts.js";

export function podium(top) {
  const order = ["first", "second", "third"];
  return `<div class="podium">${top.map((p, i) => `
    <a class="podium-card ${order[i]}" href="#/member/${encodeURIComponent(p.key)}">
      <span class="place" aria-hidden="true">${i + 1}</span>
      <div class="who">${avatar(p.key, 48)}<div><div class="nm">${esc(p.name)}</div><div style="margin-top:4px">${movement(p)}</div></div></div>
      <div class="net ${cls(p.net)}">${signed(p.net)}</div>
      <div class="meta"><span>${p.games_played} sessions · ${num(p.stats.hands)} hands</span>${form(p.form)}</div>
    </a>`).join("")}</div>`;
}

export function leaderTable(holder, rows, { compact = false } = {}) {
  const cols = [
    { key: "rank", label: "#", fmt: r => `<span class="rank-cell">${r.rank}</span>`, sort: r => r.rank },
    { key: "mv", label: "", fmt: r => movement(r) },
    { key: "name", label: "Member", left: true, fmt: r => personLink(r.key), sort: r => r.name.toLowerCase() },
    { key: "net", label: "Net", fmt: r => `<strong>${signed(r.net)}</strong>`, cls: r => cls(r.net), sort: r => r.net },
    { key: "games", label: "Sessions", fmt: r => r.games_played, sort: r => r.games_played },
    { key: "hands", label: "Hands", fmt: r => num(r.stats.hands), sort: r => r.stats.hands },
    { key: "bb100", label: "bb/100", title: STAT_HELP.bb100, fmt: r => signed(r.stats.bb_per_100), cls: r => cls(r.stats.bb_per_100), sort: r => r.stats.bb_per_100 },
    ...(compact ? [] : [
      { key: "vpip", label: "VPIP", title: STAT_HELP.vpip, fmt: r => pct(r.stats.vpip), sort: r => r.stats.vpip },
      { key: "pfr", label: "PFR", title: STAT_HELP.pfr, fmt: r => pct(r.stats.pfr), sort: r => r.stats.pfr },
      { key: "af", label: "AF", title: STAT_HELP.af, fmt: r => num(r.stats.af), sort: r => r.stats.af },
      { key: "wsd", label: "W$SD", title: STAT_HELP.wsd, fmt: r => pct(r.stats.wsd), sort: r => r.stats.wsd },
      { key: "style", label: "Style", left: true, fmt: r => styleTag(r), sort: r => r.style.label },
    ]),
    { key: "form", label: "Form", fmt: r => form(r.form) },
  ];
  sortableTable(holder, cols, rows, { sort: { key: "rank", dir: 1 }, onRow: r => { location.hash = `#/member/${encodeURIComponent(r.key)}`; } });
}

export default function leaderboard(app) {
  const D = state.data;
  app.dataset.title = "Leaderboard";
  app.innerHTML = `
    <header class="page-head">
      <span class="eyebrow">Seat tally · after ${D.games.length} sessions</span>
      <h1>Leaderboard</h1>
      <p class="lede">Ranked by net chips across every session, from the PokerNow ledgers. Arrows show movement since the previous session.</p>
    </header>
    ${podium(D.players.slice(0, 3))}
    <section class="panel" style="margin-top:16px">
      <div class="panel-head"><h2>Standings</h2><p class="note">Click a heading to sort. Hover a stat name for what it means.</p></div>
      <div id="lb-table"></div>
    </section>
    <section class="section grid-2">
      <div class="panel">
        <div class="panel-head"><h2>Playing styles</h2></div>
        <p class="note" style="margin-bottom:12px">By standard poker benchmarks this whole table plays loose and passive, so styles here compare members with each other. Across: how many hands they play. Up: how aggressively they bet and raise, before and after the flop. The centre is the table average. Dot size is hands played.</p>
        <div id="lb-scatter"></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Win rate</h2></div>
        <p class="note" style="margin-bottom:12px">Big blinds won per 100 hands, members with 100+ hands. This evens out how long each person played.</p>
        <div id="lb-rate"></div>
      </div>
    </section>
  `;
  leaderTable(document.getElementById("lb-table"), D.players);
  styleScatter(document.getElementById("lb-scatter"), D.players);
  {
    const rows = D.players.filter(p => p.stats.hands >= 100).sort((a, b) => b.stats.bb_per_100 - a.stats.bb_per_100);
    divergingBars(document.getElementById("lb-rate"), rows.map(p => ({
      label: p.name, value: p.stats.bb_per_100, href: `#/member/${encodeURIComponent(p.key)}`,
      tip: `<div class="tt-title">${esc(p.name)}</div><div class="tt-row"><span class="k">bb/100</span><span>${signed(p.stats.bb_per_100)}</span></div><div class="tt-row"><span class="k">Hands</span><span>${num(p.stats.hands)}</span></div>`,
    })), { format: v => (Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1)).toString() });
  }
}

export const styleTag = p => `<span class="tag ${p.style.archetype ? "accent" : ""}" title="${esc(p.style.blurb)}">${esc(p.style.label)}${p.style.provisional && p.style.archetype ? " · early read" : ""}</span>`;

export function styleScatter(holder, players, { highlight } = {}) {
  const pts = players.filter(p => p.style.archetype);
  const maxH = Math.max(...pts.map(p => p.stats.hands));
  styleMap(holder, pts.map(p => ({
    x: p.style.looseness, y: p.style.aggression, label: p.name, r: 4 + 7 * Math.sqrt(p.stats.hands / maxH),
    color: highlight && p.key !== highlight ? "var(--other-line)" : "var(--series-1)",
    href: `#/member/${encodeURIComponent(p.key)}`,
    tip: `<div class="tt-title">${esc(p.name)} · ${esc(p.style.label)}</div>
      <div class="tt-row"><span class="k">Plays hands (VPIP)</span><span>${pct(p.stats.vpip)}</span></div>
      <div class="tt-row"><span class="k">Raises preflop (PFR)</span><span>${pct(p.stats.pfr)}</span></div>
      <div class="tt-row"><span class="k">Postflop aggression</span><span>${pct(p.stats.afq)}</span></div>
      <div class="tt-row"><span class="k">Hands</span><span>${num(p.stats.hands)}${p.style.provisional ? " (early read)" : ""}</span></div>`,
  })));
}
