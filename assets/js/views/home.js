import { state, esc, num, signed, cls, plural, dur, name, dateLabel, avatar, personLink, movement, form, board, cards, medal, liveBadge, updatedLabel, unlockItem, badBeatItem, vmark } from "../ui.js?v=873c31434b";
import { sparkline } from "../charts.js?v=873c31434b";
import { recordCard } from "./records.js?v=873c31434b";
import { podium, leaderTable } from "./leaderboard.js?v=873c31434b";

export default function home(app) {
  const D = state.data, G = D.games, P = D.players;
  const latest = G[0];
  const hands = G.reduce((s, g) => s + g.hands, 0);
  const pot = G.reduce((s, g) => s + g.buy_in_total, 0);
  const maxAbs = Math.max(...latest.players.map(p => Math.abs(p.ledger.net)));
  const top = latest.players.slice(0, 3), bottom = latest.players.slice(-2);
  const row = (p, i, rank) => `
    <div class="result-row">
      <span class="r">${rank}</span><span class="n">${esc(name(p.key))}</span>
      <span class="p ${p.ledger.net >= 0 ? "up" : "down"}">${signed(p.ledger.net)}</span>
      <span class="bar"><i style="width:${(100 * Math.abs(p.ledger.net) / maxAbs).toFixed(1)}%;background:${p.ledger.net >= 0 ? "#8ff0b5" : "#ffb0a8"}"></i></span>
    </div>`;
  const hot = [...latest.biggest_pots].sort((a, b) => b.pot - a.pot)[0];
  const hotWinner = hot.winners.length ? hot.winners.reduce((a, b) => (b.net > a.net ? b : a)) : null;

  app.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">Home game · No-limit hold'em · Blinds ${esc(latest.blinds.join(", "))}</span>
        <h1 class="wordmark">Poker <span class="accent">Janta</span> Party</h1>
        <p class="tagline">Of the players. By the players. For the pot. Every session, every hand and every bad beat from our table, counted.</p>
        <div class="hero-actions">
          <a class="btn primary" href="#/leaderboard">See the leaderboard</a>
          <a class="btn" href="#/hand/${latest.game_id}/${hot.hand}">Replay the biggest pot</a>
        </div>
      </div>
      <a class="result-card" href="#/session/${latest.game_id}" style="text-decoration:none">
        <span class="eyebrow"><span class="live-dot"></span>${latest.live ? `Counting in progress · ${updatedLabel(latest)}` : `Results declared · ${dateLabel(latest.date)}`}</span>
        <div class="winner-line">${avatar(latest.players[0].key, 52)}
          <div><div class="who">${esc(name(latest.players[0].key))}</div><div class="amt">${signed(latest.players[0].ledger.net)} chips</div></div>
        </div>
        <div class="result-rows">
          ${latest.players.length <= 6 ? latest.players.map((p, i) => row(p, i, i + 1)).join("") : `
          ${top.map((p, i) => row(p, i, i + 1)).join("")}
          <div class="result-row"><span class="r">⋯</span><span class="n" style="color:rgba(255,255,255,.5);font-weight:500">${latest.players.length - 5} more</span><span></span></div>
          ${bottom.map((p, i) => row(p, i, latest.players.length - 1 + i)).join("")}`}
        </div>
        <div class="foot"><span>${num(latest.hands)} hands · ${dur(latest.duration_min)} · ${latest.player_count} players</span><span>${latest.live ? "Live results →" : "Full results →"}</span></div>
      </a>
    </section>

    <div class="strip" aria-label="Totals across all sessions">
      <div><div class="k">Sessions</div><div class="v">${G.length}</div><div class="s">since ${dateLabel(G[G.length - 1].date, { weekday: false })}</div></div>
      <div><div class="k">Hands dealt</div><div class="v">${num(hands)}</div><div class="s">${num(Math.round(hands / G.length))} per session</div></div>
      <div><div class="k">Members</div><div class="v">${P.length}</div><div class="s">${P.filter(p => p.games_played === G.length).length} at every session</div></div>
      <div><div class="k">Chips bought in</div><div class="v">${num(pot)}</div><div class="s">${plural(G.reduce((s, g) => s + g.rebuys, 0), "rebuy")}</div></div>
      <div><div class="k">Biggest pot</div><div class="v">${num(Math.max(...G.map(g => g.biggest_pots[0].pot)))}</div><div class="s">all-time</div></div>
      <a href="#/honours" style="text-decoration:none;color:inherit"><div class="k">Bad beats</div><div class="v">${num(D.bad_beats.length)}</div><div class="s">${latest.bad_beat_count ? `${latest.bad_beat_count} ${latest.live ? "so far tonight" : "last session"}` : "and counting"}</div></a>
    </div>

    <section class="section">
      <div class="section-head"><div><span class="eyebrow">Seat tally</span><h2>Leaderboard</h2></div><a class="link-more" href="#/leaderboard">Full standings →</a></div>
      ${podium(P.slice(0, 3))}
      <div class="panel" style="margin-top:14px"><div id="home-table"></div></div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="eyebrow">${dateLabel(latest.date)}</span><h2>Party awards</h2></div><a class="link-more" href="#/session/${latest.game_id}">Session report →</a></div>
      <div class="awards">${latest.awards.map(awardCard(latest)).join("")}</div>
    </section>

    ${latest.unlocks.length || latest.bad_beat ? `<section class="section split">
      <div>
        <div class="section-head"><div><span class="eyebrow">${latest.live ? "Tonight so far" : dateLabel(latest.date)}</span><h2>Badges unlocked</h2></div><a class="link-more" href="#/honours">All honours →</a></div>
        <div class="unlocks">${latest.unlocks.length ? latest.unlocks.slice(0, 6).map(u => unlockItem(u)).join("") : '<p class="note">None this session.</p>'}</div>
      </div>
      <div>
        <div class="section-head"><div><span class="eyebrow">Bad beat of the night</span><h2>${latest.bad_beat ? `${Math.round(latest.bad_beat.equity * 100)}% and still lost` : "No bad beats"}</h2></div></div>
        ${latest.bad_beat ? `<ul class="pots">${badBeatItem(latest.bad_beat, { date: false })}</ul>` : '<p class="note">Nobody lost a big pot as a big favourite this session.</p>'}
      </div>
    </section>` : ""}

    <section class="section split">
      <div>
        <div class="section-head"><div><span class="eyebrow">Hand of the session</span><h2>${num(hot.pot)} chip pot</h2></div></div>
        <a class="panel" href="#/hand/${latest.game_id}/${hot.hand}" style="display:grid;gap:14px;text-decoration:none">
          <div class="dim" style="font-size:13px">${dateLabel(latest.date)} · hand #${hot.hand} · ${hot.players} players · ${hot.showdown ? "went to showdown" : "won without a showdown"}</div>
          <div>${board(hot.board, "lg")}</div>
          ${hot.board2 ? `<div><span class="tag">Run it twice</span> ${board(hot.board2, "md")}</div>` : ""}
          ${hotWinner ? `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">${avatar(hotWinner.key, 32)}<strong>${esc(name(hotWinner.key))}</strong> ${cards(hotWinner.cards, "md")} <span class="pos" style="font-weight:650">${signed(hotWinner.net)}</span></div>
            ${hotWinner.desc ? `<div class="dim" style="font-size:14px">${esc(hotWinner.desc)}</div>` : ""}` : ""}
          <span class="btn primary" style="justify-self:start">▶ Replay this hand</span>
        </a>
      </div>
      <div>
        <div class="section-head"><div><span class="eyebrow">Hall of Fame</span><h2>Records</h2></div><a class="link-more" href="#/hall-of-fame">All ${D.records.length} records →</a></div>
        <div class="records two">${D.records.slice(0, 4).map(recordCard).join("")}</div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="eyebrow">The archive</span><h2>Sessions</h2></div><a class="link-more" href="#/sessions">All sessions →</a></div>
      <div class="members">${G.map(sessionCard).join("")}</div>
    </section>
  `;
  leaderTable(document.getElementById("home-table"), P.slice(3, 10), { compact: true });
  G.forEach(g => {
    const holder = document.getElementById(`spark-${g.game_id}`);
    const s = g.timeline.series[g.players[0].key];
    if (holder && s) sparkline(holder, s.filter(v => v != null));
  });
}

export const awardCard = g => a => `
  <a class="award" href="${a.hand ? `#/hand/${g.game_id}/${a.hand}` : `#/member/${encodeURIComponent(a.key)}`}">
    ${medal(AWARD_MARKS[a.id] || "★")}
    <div><div class="t">${esc(a.title)}</div><div class="b">${esc(a.blurb)}</div></div>
    <div class="who">${avatar(a.key, 26)}<span class="nm">${esc(name(a.key))}${vmark(a.key)}</span></div>
    <span class="v">${esc(a.value)}</span>
  </a>`;
const AWARD_MARKS = { cm: "CM", landslide: "LS", votes: "VB", comeback: "CK", fire: "FB", populist: "PP", hawk: "FH",
  donation: "DD", station: "CS", lucky: "LU", martyr: "MR", badbeat: "BB" };

export function sessionCard(g) {
  const w = g.players[0], l = g.players[g.players.length - 1];
  return `<a class="member-card" href="#/session/${g.game_id}">
    <div><span class="eyebrow">${liveBadge(g)}${num(g.hands)} hands · ${dur(g.duration_min)}</span>
    <div style="font:600 var(--step-1)/1.25 var(--font-display);margin-top:6px">${dateLabel(g.date)}</div></div>
    <div class="spark" id="spark-${g.game_id}" title="${esc(name(w.key))}'s running net"></div>
    <div class="nums">
      <div><span class="k">${g.live ? "Leading" : "Winner"}</span><span class="v">${esc(name(w.key))}</span></div>
      <div><span class="k">${g.live ? "Up" : "Won"}</span><span class="v pos">${signed(w.ledger.net)}</span></div>
      <div><span class="k">Players</span><span class="v">${g.player_count}</span></div>
    </div>
    <div class="dim" style="font-size:13px">Bottom: ${esc(name(l.key))} <span class="neg">${signed(l.ledger.net)}</span> · biggest pot ${num(g.biggest_pots[0].pot)}</div>
  </a>`;
}
