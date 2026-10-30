import { state, esc, num, signed, name, dateLabel, clock, avatar, board, cards, loadHands, plural } from "../ui.js?v=9f32524049";

const PAGE = 40;

export default async function hands(app, gid) {
  const D = state.data;
  const g = D.games.find(x => x.game_id === gid) || D.games[0];
  app.dataset.title = "Hands";
  app.innerHTML = `
    <header class="page-head">
      <span class="eyebrow">Hand history</span>
      <h1>Hands</h1>
      <p class="lede">Every hand from every session. Filter by member, pot size or showdown, then open any hand in the replayer. Hole cards appear only when they were shown at the table.</p>
    </header>
    <div class="filters" role="search">
      <div class="field"><label for="h-game">Session</label><select class="select" id="h-game">${D.games.map(x => `<option value="${x.game_id}" ${x === g ? "selected" : ""}>${dateLabel(x.date)} · ${num(x.hands)} hands</option>`).join("")}</select></div>
      <div class="field"><label for="h-player">Member</label><select class="select" id="h-player"><option value="">Anyone</option>${[...D.players].sort((a, b) => a.name.localeCompare(b.name)).map(p => `<option value="${esc(p.key)}">${esc(p.name)}</option>`).join("")}</select></div>
      <div class="field"><label for="h-min">Pot at least</label><select class="select" id="h-min"><option value="0">Any size</option><option value="200">200</option><option value="500">500</option><option value="1000">1,000</option><option value="2000">2,000</option></select></div>
      <div class="field"><label for="h-sort">Order</label><select class="select" id="h-sort"><option value="new">Latest first</option><option value="old">Earliest first</option><option value="pot">Biggest pot first</option></select></div>
      <label class="toggle"><input type="checkbox" id="h-sd"> Showdowns only</label>
      <div class="field"><label for="h-num">Go to hand</label><input class="input" id="h-num" type="number" min="1" inputmode="numeric" placeholder="#" style="width:90px"></div>
    </div>
    <section class="panel"><div id="h-list"><div class="skeleton"></div></div></section>`;

  const els = id => document.getElementById(id);
  let rows = await loadHands(g.game_id), page = 0, cur = g.game_id;
  const draw = () => {
    const who = els("h-player").value, min = +els("h-min").value, sd = els("h-sd").checked, order = els("h-sort").value;
    let list = rows.filter(h => h.pot >= min && (!sd || h.sd) &&
      (!who || h.seats.some(s => s.k === who && s.net !== 0)));
    if (order === "new") list = [...list].reverse();
    if (order === "pot") list = [...list].sort((a, b) => b.pot - a.pot);
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    page = Math.min(page, pages - 1);
    const slice = list.slice(page * PAGE, page * PAGE + PAGE);
    els("h-list").innerHTML = list.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th class="left">Hand</th><th class="left">Board</th><th class="left">Winner</th><th>Pot</th>${who ? `<th>${esc(name(who))}</th>` : ""}<th class="left">Showdown</th><th></th></tr></thead>
        <tbody>${slice.map(h => {
          const winners = h.seats.filter(s => s.net > 0);
          const me = who && h.seats.find(s => s.k === who);
          return `<tr class="clickable" data-n="${h.n}">
            <td class="left"><strong>#${h.n}</strong> <span class="dim">${clock(h.t)}</span></td>
            <td class="left">${board(h.board)}</td>
            <td class="left"><span style="display:inline-flex;gap:8px;align-items:center">${winners.map(w => `${avatar(w.k, 22)}<span>${esc(name(w.k))}</span>${w.cards ? cards(w.cards) : ""}`).join(" ")}</span></td>
            <td><strong>${num(h.pot)}</strong></td>
            ${who ? `<td class="${me.net > 0 ? "pos" : "neg"}">${signed(me.net)}</td>` : ""}
            <td class="left">${h.sd ? `<span class="tag">${esc((winners[0]?.desc || "Showdown").split(",")[0])}</span>` : `<span class="dim">–</span>`}</td>
            <td><a class="link-more" href="#/hand/${cur}/${h.n}">Replay →</a></td>
          </tr>`;
        }).join("")}</tbody></table></div>
      <div class="pager"><span>${plural(list.length, "hand")} · page ${page + 1} of ${pages}</span>
        <span style="display:flex;gap:8px"><button class="btn" id="h-prev" ${page === 0 ? "disabled" : ""}>← Previous</button><button class="btn" id="h-next" ${page >= pages - 1 ? "disabled" : ""}>Next →</button></span></div>`
      : `<div class="empty"><h2>No hands match</h2><p>Try a smaller pot size or another member.</p></div>`;
    els("h-list").querySelectorAll("tr.clickable").forEach(tr => tr.addEventListener("click", e => {
      if (!e.target.closest("a")) location.hash = `#/hand/${cur}/${tr.dataset.n}`;
    }));
    els("h-prev")?.addEventListener("click", () => { page--; draw(); els("h-list").scrollIntoView({ block: "start" }); });
    els("h-next")?.addEventListener("click", () => { page++; draw(); els("h-list").scrollIntoView({ block: "start" }); });
  };
  ["h-player", "h-min", "h-sort", "h-sd"].forEach(id => els(id).addEventListener("change", () => { page = 0; draw(); }));
  els("h-game").addEventListener("change", async e => {
    cur = e.target.value;
    els("h-list").innerHTML = `<div class="skeleton"></div>`;
    rows = await loadHands(cur);
    page = 0;
    history.replaceState(null, "", `#/hands/${cur}`);
    draw();
  });
  els("h-num").addEventListener("keydown", e => {
    if (e.key === "Enter" && rows.some(h => h.n === +e.target.value)) location.hash = `#/hand/${cur}/${+e.target.value}`;
  });
  draw();
}
