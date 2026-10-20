import { state, esc, name, game, dateLabel, avatar, cards, board, plural } from "../ui.js";

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
