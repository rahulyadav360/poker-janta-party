import { state, esc, num, signed, cls, name, game, dateLabel, clock, avatar, personLink, card, cards, backs, loadHands } from "../ui.js";
import { notFound } from "../main.js";

const STREET = ["Preflop", "Flop", "Turn", "River"];
const VERB = { sb: "small blind", bb: "big blind", post: "posts", dead: "dead blind", call: "calls", bet: "bets",
  raise: "raises to", check: "checks", fold: "folds", show: "shows", win: "wins", return: "gets back" };

// seat positions around the table, seat 1 at the bottom centre going clockwise
function seatXY(slot, total = 10, rx = 44, ry = 39) {
  const a = Math.PI / 2 + (slot / total) * Math.PI * 2;
  return { x: 50 + rx * Math.cos(a), y: 50 + ry * Math.sin(a) };
}

export default async function hand(app, gid, n) {
  const g = game(gid);
  if (!g) return notFound();
  app.innerHTML = `<div class="skeleton"></div>`;
  const rows = await loadHands(gid);
  const idx = rows.findIndex(h => h.n === +n);
  if (idx < 0) return notFound();
  const h = rows[idx];
  app.dataset.title = `Hand #${h.n}`;
  const prev = rows[idx - 1], next = rows[idx + 1];
  const seatOf = Object.fromEntries(h.seats.map(s => [s.seat, s]));
  // rotate so the private viewer (or the first winner) sits at the bottom
  const anchor = (state.data.private && h.seats.find(s => s.k === "rahul")) || h.seats[0];
  const slots = 10;
  const slotOf = s => ((s.seat - anchor.seat) % slots + slots) % slots;
  const winners = h.seats.filter(s => s.net > 0);

  app.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/sessions">Sessions</a><span>/</span><a href="#/session/${gid}">${dateLabel(g.date)}</a><span>/</span><a href="#/hands/${gid}">Hands</a><span>/</span><span>#${h.n}</span></nav>
    <header class="page-head split-head">
      <div style="display:grid;gap:8px">
        <span class="eyebrow">Hand replayer · ${clock(h.t)} IST · blinds ${h.sb}/${h.bb}</span>
        <h1>Hand #${h.n}: ${num(h.pot)} pot</h1>
        <p class="lede">${h.seats.length} players. ${winners.map(w => `${esc(name(w.k))} won ${num(w.net)} chips`).join(", ")}${h.sd ? " at showdown" : " without a showdown"}.</p>
      </div>
      <label class="toggle"><input type="checkbox" id="reveal" checked> Show known cards from the start</label>
    </header>
    <div class="replayer">
      <div class="panel" style="padding:14px">
        <div class="table-stage" id="stage"></div>
        <div class="controls">
          <button class="btn" id="c-first" aria-label="First action">⏮</button>
          <button class="btn" id="c-prev" aria-label="Previous action">◀</button>
          <button class="btn primary" id="c-play" aria-label="Play">▶ Play</button>
          <button class="btn" id="c-next" aria-label="Next action">▶</button>
          <button class="btn" id="c-last" aria-label="Last action">⏭</button>
          <div class="progress" aria-hidden="true"><i id="c-bar"></i></div>
        </div>
        <p class="note" style="text-align:center;margin-top:8px">Keyboard: ← and → step, space plays or pauses.</p>
      </div>
      <aside class="panel">
        <div class="panel-head"><h2>Action</h2><span class="note" id="c-count"></span></div>
        <div class="action-log" id="log"></div>
      </aside>
    </div>
    <section class="panel section">
      <div class="panel-head"><h2>Result</h2></div>
      <div class="table-wrap"><table>
        <thead><tr><th class="left">Player</th><th class="left">Position</th><th class="left">Cards</th><th class="left">Hand</th><th>Start</th><th>Result</th></tr></thead>
        <tbody>${[...h.seats].sort((a, b) => b.net - a.net).map(s => `<tr>
          <td class="left">${personLink(s.k, 24)}</td><td class="left">${s.pos || ""}</td><td class="left">${cards(s.cards)}</td>
          <td class="left">${s.desc ? esc(s.desc) : '<span class="dim">–</span>'}</td><td>${num(s.stack)}</td>
          <td class="${cls(s.net)}"><strong>${s.net ? signed(s.net) : "0"}</strong></td></tr>`).join("")}</tbody>
      </table></div>
    </section>
    <nav class="hand-nav" aria-label="Other hands">
      ${prev ? `<a class="btn" href="#/hand/${gid}/${prev.n}">← Hand #${prev.n}</a>` : "<span></span>"}
      <a class="btn" href="#/session/${gid}">Session report</a>
      ${next ? `<a class="btn" href="#/hand/${gid}/${next.n}">Hand #${next.n} →</a>` : "<span></span>"}
    </nav>`;

  const steps = h.steps;
  let k = steps.length;  // open on the finished hand; Play starts from the top
  let timer = null;

  // build the log once
  let logHtml = "", street = -1;
  steps.forEach((st, i) => {
    if (st.a === "board") {
      logHtml += `<div class="street"><span>${STREET[st.s]}${st.run === 2 ? " · run 2" : ""}</span><span class="cards">${st.c.map(card).join("")}</span></div>`;
      street = st.s;
      return;
    }
    if (street < 0) { logHtml += `<div class="street"><span>Preflop</span></div>`; street = 0; }
    const s = seatOf[st.p];
    const amt = st.a === "win" ? num(st.v) : st.v != null && !["check", "fold"].includes(st.a) ? num(st.v) : "";
    logHtml += `<button data-k="${i + 1}"><span class="who"><strong>${esc(name(s.k))}</strong> ${VERB[st.a] || st.a}${st.ai ? " · all-in" : ""}${st.c && st.a !== "win" ? " " + st.c.map(card).join("") : ""}${st.d && st.a === "win" ? ` <span class="dim">${esc(st.d)}</span>` : ""}</span><span class="amt ${st.a === "win" ? "pos" : ""}">${amt}</span></button>`;
  });
  document.getElementById("log").innerHTML = logHtml;
  document.getElementById("log").addEventListener("click", e => {
    const b = e.target.closest("button[data-k]");
    if (b) { stop(); k = +b.dataset.k; render(); }
  });

  function stateAt(k) {
    const S = Object.fromEntries(h.seats.map(s => [s.seat, { stack: s.stack, bet: 0, folded: false, act: null, shown: null, won: 0 }]));
    const boards = [[], []];
    let pot = 0, acting = null;
    for (let i = 0; i < k; i++) {
      const st = steps[i];
      if (st.a === "board") {
        boards[(st.run || 1) - 1].push(...st.c);
        if ((st.run || 1) === 1) for (const x of Object.values(S)) { x.bet = 0; if (!x.folded) x.act = null; }
        pot = st.pot;
        acting = null;
        continue;
      }
      const x = S[st.p];
      if (st.st != null) x.stack = st.st;
      if (st.v != null && ["sb", "bb", "post", "call", "bet", "raise"].includes(st.a)) x.bet = st.v;
      if (st.a === "fold") x.folded = true;
      if (st.c) x.shown = st.c;
      if (st.a === "win") { x.won += st.v; for (const y of Object.values(S)) y.bet = 0; }
      if (st.a === "return") x.bet = Math.max(0, x.bet - st.v);
      x.act = st.a === "win" ? `wins ${num(x.won)}` : st.a === "return" ? x.act : `${VERB[st.a] || st.a}${["call", "bet", "raise", "sb", "bb", "post"].includes(st.a) ? " " + num(st.v) : ""}`;
      if (st.a === "sb" || st.a === "bb") x.act = st.a.toUpperCase() + " " + num(st.v);
      pot = st.pot;
      acting = st.p;
    }
    // board cards dealt before a run-it-twice second run are shared
    if (boards[1].length) boards[1] = boards[0].slice(0, 5 - boards[1].length).concat(boards[1]);
    return { S, boards, pot, acting };
  }

  function render() {
    const { S, boards, pot, acting } = stateAt(k);
    const reveal = document.getElementById("reveal").checked;
    const stage = document.getElementById("stage");
    const slotsHtml = h.seats.map(s => {
      const x = S[s.seat], pos = seatXY(slotOf(s));
      const bet = seatXY(slotOf(s), slots, 27, 22);
      const known = reveal ? (x.shown || s.cards) : x.shown;
      const handCards = x.folded ? "" : known ? cards(known) : backs(2);
      const isWin = x.won > 0;
      return `
        <div class="seat ${x.folded ? "folded" : ""} ${acting === s.seat ? "acting" : ""} ${isWin ? "winner" : ""}" style="left:${pos.x}%;top:${pos.y}%">
          ${handCards}
          <div class="plate"><span class="pname">${esc(name(s.k))}</span><span class="pstack">${num(x.stack)}</span>${s.pos ? `<span class="ppos">${s.pos}</span>` : ""}</div>
          ${x.act ? `<span class="act ${x.folded ? "fold" : ""} ${isWin ? "win" : ""}">${esc(x.act)}</span>` : ""}
        </div>
        ${x.bet > 0 ? `<span class="bet-chip" style="left:${bet.x}%;top:${bet.y}%">${num(x.bet)}</span>` : ""}
        ${s.seat === h.btn ? `<span class="dealer-btn" style="left:${seatXY(slotOf(s), slots, 33, 28).x + 4}%;top:${seatXY(slotOf(s), slots, 33, 28).y}%">D</span>` : ""}`;
    }).join("");
    const slotsRow = (cs) => Array.from({ length: 5 }, (_, i) => cs[i] ? `<span class="cards lg">${card(cs[i])}</span>` : `<span class="slot"></span>`).join("");
    stage.innerHTML = `
      <div class="felt"><span class="felt-logo">POKER JANTA PARTY</span>
        <div class="felt-center">
          <span class="pot-pill">${k >= steps.length && pot === 0 ? `Pot ${num(h.pot)} · paid` : `Pot ${num(pot)}`}</span>
          <div class="board-row">${slotsRow(boards[0])}</div>
          ${boards[1].length ? `<div class="board-row run2">${slotsRow(boards[1])}</div>` : ""}
        </div>
      </div>${slotsHtml}`;
    document.getElementById("c-bar").style.width = `${(100 * k) / steps.length}%`;
    document.getElementById("c-count").textContent = `${k} of ${steps.length}`;
    document.querySelectorAll("#log button").forEach(b => {
      const bk = +b.dataset.k;
      b.classList.toggle("cur", bk === k);
      b.classList.toggle("future", bk > k);
    });
    const cur = document.querySelector("#log button.cur");
    if (cur && timer) cur.scrollIntoView({ block: "nearest" });
  }

  const stop = () => { clearInterval(timer); timer = null; document.getElementById("c-play").textContent = "▶ Play"; };
  const play = () => {
    if (timer) return stop();
    if (k >= steps.length) k = 0;
    document.getElementById("c-play").textContent = "❚❚ Pause";
    render();
    timer = setInterval(() => { if (k >= steps.length) return stop(); k++; render(); }, 850);
  };
  const go = v => { stop(); k = Math.max(0, Math.min(steps.length, v)); render(); };
  document.getElementById("c-first").onclick = () => go(0);
  document.getElementById("c-prev").onclick = () => go(k - 1);
  document.getElementById("c-next").onclick = () => go(k + 1);
  document.getElementById("c-last").onclick = () => go(steps.length);
  document.getElementById("c-play").onclick = play;
  document.getElementById("reveal").onchange = render;
  const onKey = e => {
    if (e.target.closest("input, select, textarea")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); go(k + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(k - 1); }
    else if (e.key === " ") { e.preventDefault(); play(); }
  };
  document.addEventListener("keydown", onKey);
  render();
  return () => { stop(); document.removeEventListener("keydown", onKey); };
}
