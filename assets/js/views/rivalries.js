import { state, esc, num, signed, name, avatar, initials, vmark } from "../ui.js?v=944541d22c";
import { showTip, hideTip } from "../charts.js?v=944541d22c";

export default function rivalries(app) {
  const D = state.data;
  app.dataset.title = "Rivalries";
  const P = D.players.filter(p => p.stats.hands >= 50);
  const net = {};
  for (const p of P) for (const r of p.rivals) net[p.key + "|" + r.key] = r.net;
  const maxAbs = Math.max(1, ...Object.values(net).map(Math.abs));
  // diverging cell fill: blue-ish win / red-ish loss, neutral at zero (text stays ink)
  const fill = v => {
    if (!v) return "transparent";
    const a = Math.min(1, Math.abs(v) / maxAbs) * 0.75 + 0.08;
    return v > 0 ? `color-mix(in srgb, var(--pos-bar) ${a * 100}%, transparent)` : `color-mix(in srgb, var(--neg-bar) ${a * 100}%, transparent)`;
  };
  const pairs = [];
  P.forEach((a, i) => P.slice(i + 1).forEach(b => {
    const v = net[a.key + "|" + b.key];
    if (v) pairs.push({ a: a.key, b: b.key, v });
  }));
  pairs.sort((x, y) => Math.abs(y.v) - Math.abs(x.v));

  app.innerHTML = `
    <header class="page-head">
      <span class="eyebrow">Head to head</span>
      <h1>Rivalries</h1>
      <p class="lede">Who takes chips from whom. Read across a row: green means that member has won chips from the member in the column, red means they've lost them. In a pot with several winners, each loser's chips are split by how much each winner won.</p>
    </header>
    <section class="grid-3" style="margin-bottom:16px">${pairs.slice(0, 3).map(r => {
      const [w, l] = r.v > 0 ? [r.a, r.b] : [r.b, r.a];
      return `<div class="record"><span class="t">Biggest one-way street</span>
        <span class="holder">${avatar(w, 30)}${esc(name(w))} <span class="dim" style="font-weight:500">over</span> ${avatar(l, 30)}${esc(name(l))}</span>
        <span class="v pos">${signed(Math.round(Math.abs(r.v)))}</span><span class="s">net chips, all sessions</span></div>`;
    }).join("")}</section>
    <section class="panel">
      <div class="panel-head"><h2>Head-to-head grid</h2><p class="note">Members with 50+ hands. Hover a cell for details.</p></div>
      <div class="table-wrap"><table class="matrix" id="matrix">
        <thead><tr><th class="rowh"></th>${P.map(p => `<th title="${esc(p.name)}">${avatar(p.key, 26)}</th>`).join("")}</tr></thead>
        <tbody>${P.map(a => `<tr><th class="rowh"><a class="person" href="#/member/${encodeURIComponent(a.key)}">${avatar(a.key, 24)}<span class="nm">${esc(a.name)}${vmark(a.key)}</span></a></th>${P.map(b => {
          if (a.key === b.key) return `<td class="cell self"></td>`;
          const v = net[a.key + "|" + b.key] || 0;
          return `<td class="cell" style="background:${fill(v)}" data-a="${esc(a.key)}" data-b="${esc(b.key)}" data-v="${v}">${v ? (v > 0 ? "+" : "−") + num(Math.abs(Math.round(v))) : "·"}</td>`;
        }).join("")}</tr>`).join("")}</tbody>
      </table></div>
    </section>`;
  document.querySelectorAll("#matrix td.cell[data-a]").forEach(td => {
    td.addEventListener("mousemove", ev => {
      const v = +td.dataset.v, a = td.dataset.a, b = td.dataset.b;
      const r = D.players.find(p => p.key === a).rivals.find(x => x.key === b);
      showTip(`<div class="tt-title">${esc(name(a))} vs ${esc(name(b))}</div>` + (r ? `
        <div class="tt-row"><span class="k">Won from ${esc(name(b))}</span><span>${num(r.won)}</span></div>
        <div class="tt-row"><span class="k">Lost to ${esc(name(b))}</span><span>${num(r.lost)}</span></div>
        <div class="tt-row"><span class="k">Net</span><span class="${v > 0 ? "pos" : "neg"}">${signed(v)}</span></div>` : `<div class="tt-row"><span class="k">No pots between them yet</span></div>`), ev);
    });
    td.addEventListener("mouseleave", hideTip);
  });
}
