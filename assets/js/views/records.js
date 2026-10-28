import { state, esc, num, signed, name, game, dateLabel, avatar, cards, board, plural } from "../ui.js?v=873c31434b";

// Season archive: one card per month, champion (or leader) and what stood out.
export function seasonCard(s) {
  const D = state.data;
  const games = D.games.filter(g => g.date.startsWith(s.id));
  const nights = games.flatMap(g => g.players.map(p => ({ g, p })));
  const best = nights.reduce((a, b) => (!a || b.p.ledger.net > a.p.ledger.net ? b : a), null);
  const pot = games.flatMap(g => g.biggest_pots.slice(0, 1).map(p => ({ g, p }))).reduce((a, b) => (!a || b.p.pot > a.p.pot ? b : a), null);
  const beats = D.bad_beats.filter(b => b.date.startsWith(s.id)).length;
  const climb = D.players.map(p => {
    const h = p.rating_history.filter(x => x.date.startsWith(s.id));
    if (!h.length) return null;
    const before = p.rating_history[p.rating_history.indexOf(h[0]) - 1]?.rating ?? 1500;
    return { p, gain: h[h.length - 1].rating - before };
  }).filter(Boolean).sort((a, b) => b.gain - a.gain)[0];
  const top = s.standings[0];
  return `<a class="record season-card" href="#/leaderboard/${s.id}">
    <span class="t">${esc(s.label)} · ${plural(s.sessions, "session")}${s.over ? "" : " · in progress"}</span>
    <span class="holder">${avatar(top.key, 40)}<span><span class="v" style="display:block;font-size:var(--step-1)">${esc(name(top.key))}</span><span class="s">${s.over ? "Season champion" : "Leads the season"} · ${signed(top.net)}</span></span></span>
    <ul class="season-facts">
      ${best ? `<li><span>Best night</span><span>${esc(name(best.p.key))} ${signed(best.p.ledger.net)}, ${dateLabel(best.g.date, { year: false, weekday: false })}</span></li>` : ""}
      ${pot ? `<li><span>Biggest pot</span><span>${num(pot.p.pot)}, ${dateLabel(pot.g.date, { year: false, weekday: false })}</span></li>` : ""}
      <li><span>Bad beats</span><span>${beats}</span></li>
      ${climb && climb.gain > 0 ? `<li><span>Biggest climber</span><span>${esc(climb.p.name)} +${climb.gain} rating</span></li>` : ""}
    </ul>
  </a>`;
}

export function recordCard(r) {
  const g = r.game_id && game(r.game_id);
  const href = r.hand ? `#/hand/${r.hand.game_id}/${r.hand.hand}` : g ? `#/session/${g.game_id}` : r.key ? `#/member/${encodeURIComponent(r.key)}` : null;
  const tag = href ? "a" : "div";
  return `<${tag} class="record" ${href ? `href="${href}"` : ""}>
    <span class="t">${esc(r.title)}</span>
    <span class="v">${esc(r.value)}</span>
    ${r.key ? `<span class="holder">${avatar(r.key, 26)}${esc(name(r.key))}</span>` : ""}
    <span class="s">${[r.sub, g && dateLabel(g.date)].filter(Boolean).map(esc).join(" · ")}</span>
    ${r.hand && r.hand.cards ? `<span style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">${cards(r.hand.cards)}${r.hand.board ? board(r.hand.board) : ""}</span>` : ""}
  </${tag}>`;
}

export default function records(app) {
  const D = state.data;
  app.dataset.title = "Hall of Fame";
  const made = {};
  for (const p of D.players) for (const [k, v] of Object.entries(p.stats.made_hands)) made[k] = (made[k] || 0) + v;
  const cats = [...D.hand_categories].reverse().filter(c => made[c]);
  const maxMade = Math.max(...Object.values(made));
  app.innerHTML = `
    <header class="page-head">
      <span class="eyebrow">Hall of Fame</span>
      <h1>Records</h1>
      <p class="lede">The biggest pots, the best nights, the worst nights and the hands people still talk about. Records update after every session.</p>
    </header>
    <div class="records">${D.records.map(recordCard).join("")}</div>
    <section class="section">
      <div class="section-head"><div><span class="eyebrow">Monthly seasons</span><h2>Season champions</h2></div><a class="link-more" href="#/leaderboard/${D.seasons[0].id}">This season's table →</a></div>
      <div class="records">${D.seasons.map(seasonCard).join("")}</div>
    </section>
    <section class="section grid-2">
      <div class="panel">
        <div class="panel-head"><h2>Winning hands at showdown</h2><p class="note">${plural(Object.values(made).reduce((a, b) => a + b, 0), "pot")}</p></div>
        <div class="vs">${cats.map(c => `<div class="vs-row"><span class="lbl">${esc(c)}</span>
          <span class="vs-track"><span class="vs-fill" style="width:${(100 * made[c]) / maxMade}%"></span></span>
          <span class="val">${made[c]}</span></div>`).join("")}</div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Session winners</h2></div>
        <div class="pots">${D.games.map(g => `<a class="pot winner-line-row" href="#/session/${g.game_id}">
          <div class="body"><span style="font-weight:650">${dateLabel(g.date)}</span><span class="dim" style="font-size:13px">${g.hands} hands · ${g.player_count} players</span></div>
          <span class="holder" style="display:flex;gap:8px;align-items:center">${avatar(g.players[0].key, 28)}<strong>${esc(name(g.players[0].key))}</strong></span></a>`).join("")}</div>
      </div>
    </section>`;
}
