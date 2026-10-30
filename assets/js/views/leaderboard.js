import { state, esc, num, signed, cls, pct, plural, name, player, avatar, personLink, movement, form, sortableTable, STAT_HELP, dateLabel, vmark } from "../ui.js?v=9f32524049";
import { styleMap, divergingBars } from "../charts.js?v=9f32524049";

export function podium(top) {
  const order = ["first", "second", "third"];
  return `<div class="podium">${top.map((p, i) => `
    <a class="podium-card ${order[i]}" href="#/member/${encodeURIComponent(p.key)}">
      <span class="place" aria-hidden="true">${i + 1}</span>
      <div class="who">${avatar(p.key, 48)}<div><div class="nm">${esc(p.name)}${vmark(p.key)}</div><div style="margin-top:4px">${movement(p)}</div></div></div>
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
      { key: "rating", label: "Rating", title: "Party rating: everyone compared with everyone at each session, starting at 1500", fmt: r => num(r.rating), sort: r => r.rating },
      { key: "adj", label: "Luck-adj.", title: "Net with luck in heads-up showdowns taken out (see Honours)", fmt: r => signed(Math.round(r.luck.adjusted_net)), cls: r => cls(r.luck.adjusted_net), sort: r => r.luck.adjusted_net },
    ]),
    { key: "form", label: "Form", fmt: r => form(r.form) },
  ];
  sortableTable(holder, cols, rows, { sort: { key: "rank", dir: 1 }, onRow: r => { location.hash = `#/member/${encodeURIComponent(r.key)}`; } });
}

// One member's numbers inside a season: only sessions played that month count.
export function seasonRows(season) {
  return season.standings.map((s, i) => {
    const p = player(s.key);
    const games = p.games.filter(g => g.date.startsWith(season.id));
    const hands = games.reduce((a, g) => a + g.hands, 0);
    const bb = hands ? games.reduce((a, g) => a + (g.bb_per_100 || 0) * g.hands, 0) / hands : null;
    return { ...p, rank: i + 1, net: s.net, games_played: s.sessions, wins: s.wins, movement: null, new: false,
      form: games.slice(-5).map(g => (g.net > 0 ? "W" : g.net < 0 ? "L" : "E")),
      stats: { ...p.stats, hands, bb_per_100: bb == null ? null : Math.round(bb * 10) / 10 } };
  });
}

function seasonTabs(current) {
  const S = state.data.seasons;
  return `<div class="seg" role="tablist" aria-label="Standings for">
    <a class="${current ? "" : "on"}" href="#/leaderboard" role="tab" aria-selected="${!current}">All time</a>
    ${S.map(s => `<a class="${current === s.id ? "on" : ""}" href="#/leaderboard/${s.id}" role="tab" aria-selected="${current === s.id}">${esc(s.label)}${s.over ? "" : " · current"}</a>`).join("")}
  </div>`;
}

function seasonBoard(app, season) {
  const rows = seasonRows(season);
  app.dataset.title = `${season.label} season`;
  const leader = rows[0];
  app.innerHTML = `
    <header class="page-head">
      <span class="eyebrow">Season · ${dateLabel(season.start, { year: false })} to ${dateLabel(season.end, { year: false })}</span>
      <h1>${esc(season.label)}</h1>
      <p class="lede">The table resets every calendar month. ${season.over
        ? `${esc(leader.name)} finished on top and is the season champion.`
        : `${esc(leader.name)} leads after ${plural(season.sessions, "session")}. The champion is crowned when the month ends.`}</p>
    </header>
    <div class="filters">${seasonTabs(season.id)}</div>
    ${podium(rows.slice(0, 3))}
    <section class="panel" style="margin-top:16px">
      <div class="panel-head"><h2>Season standings</h2><p class="note">Only sessions played in ${esc(season.label)} count.</p></div>
      <div id="lb-table"></div>
    </section>`;
  sortableTable(document.getElementById("lb-table"), [
    { key: "rank", label: "#", fmt: r => `<span class="rank-cell">${r.rank}</span>`, sort: r => r.rank },
    { key: "name", label: "Member", left: true, fmt: r => personLink(r.key), sort: r => r.name.toLowerCase() },
    { key: "net", label: "Net", fmt: r => `<strong>${signed(r.net)}</strong>`, cls: r => cls(r.net), sort: r => r.net },
    { key: "games", label: "Sessions", fmt: r => r.games_played, sort: r => r.games_played },
    { key: "wins", label: "Nights won", title: "Sessions finished on top", fmt: r => r.wins, sort: r => r.wins },
    { key: "hands", label: "Hands", fmt: r => num(r.stats.hands), sort: r => r.stats.hands },
    { key: "bb100", label: "bb/100", title: STAT_HELP.bb100, fmt: r => signed(r.stats.bb_per_100), cls: r => cls(r.stats.bb_per_100), sort: r => r.stats.bb_per_100 },
    { key: "form", label: "Form", fmt: r => form(r.form) },
  ], rows, { sort: { key: "rank", dir: 1 }, onRow: r => { location.hash = `#/member/${encodeURIComponent(r.key)}`; } });
}

export default function leaderboard(app, seasonId) {
  const D = state.data;
  if (seasonId) {
    const season = D.seasons.find(s => s.id === seasonId);
    if (season) return seasonBoard(app, season);
  }
  app.dataset.title = "Leaderboard";
  app.innerHTML = `
    <header class="page-head">
      <span class="eyebrow">Seat tally · after ${D.games.length} sessions</span>
      <h1>Leaderboard</h1>
      <p class="lede">Ranked by net chips across every session, from the PokerNow ledgers. Arrows show movement since the previous session. Pick a month for that season's table.</p>
    </header>
    <div class="filters">${seasonTabs(null)}</div>
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
