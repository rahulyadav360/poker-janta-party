import { state, esc, num, signed, cls, pct, plural, name, player, dateLabel, avatar, personLink, movement, form, sortableTable, STAT_HELP, cards, board, badge, badgeTitle, badBeatItem, showcase, signature, rivalsOf } from "../ui.js";
import { shareCard } from "../recap.js";
import { divergingBars, lines, sparkline } from "../charts.js";
import { styleScatter, styleTag } from "./leaderboard.js";
import { notFound } from "../main.js";

const RANKS = "AKQJT98765432";

function cumulative(key) {
  // one running total across all sessions, oldest first, plus where each session starts
  const values = [], markers = [], hands = [];
  let base = 0;
  for (const g of [...state.data.games].reverse()) {
    const ser = g.timeline.series[key];
    if (!ser) continue;
    markers.push({ i: values.length, label: dateLabel(g.date, { year: false, weekday: false }) });
    let last = 0;
    ser.forEach((v, i) => {
      if (v != null) { values.push(+(base + v).toFixed(2)); hands.push({ game: g, n: g.timeline.hands[i] }); last = v; }
    });
    base += last;
  }
  return { values, markers, hands };
}

export function members(app) {
  const P = state.data.players;
  app.dataset.title = "Members";
  app.innerHTML = `
    <header class="page-head">
      <span class="eyebrow">Party members</span>
      <h1>Members</h1>
      <p class="lede">${P.length} members, ranked by net chips. Every profile has a profit graph, playing-style stats against the table average, positions, rivals and signature hands.</p>
    </header>
    <div class="filters">
      <div class="field"><label for="m-search">Find a member</label><input class="input" id="m-search" type="search" placeholder="Name" autocomplete="off"></div>
      <div class="field"><label>Sort by</label><div class="seg" id="m-sort">
        <button class="on" data-s="rank">Rank</button><button data-s="hands">Hands</button><button data-s="bb">Win rate</button><button data-s="name">Name</button></div></div>
    </div>
    <div class="members" id="m-grid"></div>`;
  let sort = "rank", q = "";
  const draw = () => {
    const sorters = { rank: (a, b) => a.rank - b.rank, hands: (a, b) => b.stats.hands - a.stats.hands,
      bb: (a, b) => b.stats.bb_per_100 - a.stats.bb_per_100, name: (a, b) => a.name.localeCompare(b.name) };
    const rows = P.filter(p => p.name.toLowerCase().includes(q)).sort(sorters[sort]);
    const grid = document.getElementById("m-grid");
    grid.innerHTML = rows.length ? rows.map(p => `
      <a class="member-card" href="#/member/${encodeURIComponent(p.key)}">
        <div class="top">${avatar(p.key, 44)}<div style="min-width:0"><div class="nm">${esc(p.name)}</div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:4px"><span class="tag">#${p.rank}</span>${movement(p)}</div></div></div>
        <div class="spark" id="ms-${CSS.escape(p.key)}"></div>
        <div class="nums">
          <div><span class="k">Net</span><span class="v ${cls(p.net)}">${signed(p.net)}</span></div>
          <div><span class="k">bb/100</span><span class="v ${cls(p.stats.bb_per_100)}">${signed(p.stats.bb_per_100)}</span></div>
          <div><span class="k">Hands</span><span class="v">${num(p.stats.hands)}</span></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">${styleTag(p)}${form(p.form)}</div>
      </a>`).join("") : `<div class="empty">No member matches “${esc(q)}”.</div>`;
    rows.forEach(p => {
      const el = document.getElementById(`ms-${CSS.escape(p.key)}`);
      if (el) sparkline(el, cumulative(p.key).values);
    });
  };
  document.getElementById("m-search").addEventListener("input", e => { q = e.target.value.trim().toLowerCase(); draw(); });
  document.querySelectorAll("#m-sort button").forEach(b => b.addEventListener("click", () => {
    sort = b.dataset.s;
    document.querySelectorAll("#m-sort button").forEach(x => x.classList.toggle("on", x === b));
    draw();
  }));
  draw();
}

function vsRows(s, avg, rows) {
  return `<div class="vs">${rows.map(([k, label, max, sample]) => {
    const v = s[k], a = avg[k];
    if (v == null) return "";
    const scale = x => Math.min(100, (100 * x) / max);
    return `<div class="vs-row">
      <span class="lbl" ${STAT_HELP[k] ? `title="${esc(STAT_HELP[k])}"` : ""}>${label}${sample != null ? `<small>${plural(sample, "spot")}</small>` : ""}</span>
      <span class="vs-track"><span class="vs-fill" style="width:${scale(v)}%"></span>${a != null ? `<span class="vs-avg" style="left:${scale(a)}%" title="Table average ${k === "af" ? a : a + "%"}"></span>` : ""}</span>
      <span class="val">${k === "af" ? num(v) : pct(v)}</span>
    </div>`;
  }).join("")}</div>`;
}

function handGrid(counts) {
  const max = Math.max(1, ...Object.values(counts));
  let html = "";
  for (let i = 0; i < 13; i++) {
    for (let j = 0; j < 13; j++) {
      const a = RANKS[i], b = RANKS[j];
      const label = i === j ? a + b : i < j ? a + b + "s" : b + a + "o";
      const n = counts[label] || 0;
      const lvl = n === 0 ? "" : n / max > 0.66 ? "h3" : n / max > 0.33 ? "h2" : "h1";
      html += `<div class="${lvl}" title="${label}: ${n ? plural(n, "time") : "never"}">${label.replace("T", "T")}</div>`;
    }
  }
  return `<div class="hgrid" role="img" aria-label="Starting hands grid">${html}</div>
    <div class="heat-legend">Fewer <i style="background:var(--heat-1)"></i><i style="background:var(--heat-2)"></i><i style="background:var(--heat-3)"></i> More · pairs on the diagonal, suited above, offsuit below</div>`;
}

const ratingRank = p => [...state.data.players].filter(x => x.rating).sort((a, b) => b.rating - a.rating).findIndex(x => x.key === p.key) + 1;

function playerCard(p) {
  const sig = signature(p), { nemesis, victim } = rivalsOf(p), show = showcase(p);
  return `<div class="player-card">
    <div class="pc-top">${avatar(p.key, 64)}
      <div style="min-width:0"><div class="pc-name">${esc(p.name)}</div><div class="pc-arch">${esc(p.style.label)}</div></div>
      <div class="pc-rank"><span>#${p.rank}</span><small>rating ${num(p.rating)}</small></div>
    </div>
    <p class="pc-blurb">${esc(p.style.blurb)}</p>
    <div class="pc-nums">
      <div><span class="k">Net</span><span class="v ${cls(p.net)}">${signed(p.net)}</span></div>
      <div><span class="k">Sessions</span><span class="v">${p.games_played}</span></div>
      <div><span class="k">bb/100</span><span class="v ${cls(p.stats.bb_per_100)}">${signed(p.stats.bb_per_100)}</span></div>
      <div><span class="k">Hands</span><span class="v">${num(p.stats.hands)}</span></div>
    </div>
    <dl class="pc-facts">
      ${sig.fav ? `<div><dt>Signature hand</dt><dd><strong>${esc(sig.fav.hand)}</strong> <span class="dim">shown ${plural(sig.fav.times, "time")}</span></dd></div>` : ""}
      ${sig.best ? `<div><dt>Best hand shown</dt><dd>${esc(sig.best.desc)}</dd></div>` : ""}
      ${nemesis ? `<div><dt>Nemesis</dt><dd>${personLink(nemesis.key, 20)} <span class="neg">${signed(Math.round(nemesis.net))}</span></dd></div>` : ""}
      ${victim ? `<div><dt>Best customer</dt><dd>${personLink(victim.key, 20)} <span class="pos">${signed(Math.round(victim.net))}</span></dd></div>` : ""}
    </dl>
    ${show.length ? `<div class="pc-badges">${show.map(u => `<span title="${esc(badgeTitle(u))}">${badge(u.badge, u.tier, { size: 40 })}</span>`).join("")}<span class="dim">${plural(p.badges.length, "badge")}</span></div>` : ""}
    <button class="btn primary" id="share-card" type="button">Share player card</button>
  </div>`;
}

// trophy cabinet: badges held, the next rung on each ladder, luck and rating
function cabinet(p) {
  const D = state.data;
  const held = p.badges;
  const ladders = Object.entries(D.badges).filter(([, b]) => b.kind === "tiered").map(([id, b]) => {
    const v = p.progress[id] ?? 0;
    const next = b.tiers.find(t => v < t);
    const tier = b.tiers.filter(t => v >= t).length - 1;
    return { id, b, v, next, tier };
  }).filter(x => x.next != null).sort((a, b) => b.v / b.next - a.v / a.next).slice(0, 5);
  const L = p.luck, st = p.streaks;
  const mine = D.bad_beats.filter(b => b.victim === p.key).sort((a, b) => b.pot - a.pot)[0];
  return `<section class="section grid-2">
    <div class="panel">
      <div class="panel-head"><h2>Trophy cabinet</h2><span class="note">${plural(held.length, "badge")} of ${Object.keys(D.badges).length}</span></div>
      ${held.length ? `<div class="cabinet">${held.map(u => `<a class="trophy" href="${u.hand ? `#/hand/${u.game_id}/${u.hand}` : `#/session/${u.game_id}`}" title="${esc(D.badges[u.badge].blurb)}">
        ${badge(u.badge, u.tier, { size: 48, title: false })}<span class="t">${esc(badgeTitle(u))}</span><span class="d">${dateLabel(u.date, { year: false, weekday: false })}${u.times > 1 ? ` · ×${u.times}` : ""}</span></a>`).join("")}</div>`
        : '<p class="note">No badges yet. The first winning session earns Maiden Victory.</p>'}
      ${ladders.length ? `<h3 class="sub-h">Next up</h3><div class="vs">${ladders.map(x => `<div class="vs-row">
        <span class="lbl">${esc(x.b.title)}<small>${x.tier >= 0 ? D.tier_names[x.tier] + " → " : ""}${D.tier_names[x.tier + 1]} at ${num(x.next)}</small></span>
        <span class="vs-track"><span class="vs-fill" style="width:${Math.min(100, (100 * x.v) / x.next)}%"></span></span>
        <span class="val">${num(x.v)}</span></div>`).join("")}</div>` : ""}
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Luck and form</h2><a class="link-more" href="#/honours">Honours →</a></div>
      <div class="mini-stats">
        <div><span class="k">Rating</span><span class="v">${num(p.rating)}</span><span class="s ${cls(p.rating_change)}">${p.rating_change != null ? signed(p.rating_change) + " last session" : ""}</span></div>
        <div><span class="k">Luck</span><span class="v ${cls(L.chips)}">${signed(Math.round(L.chips))}</span><span class="s">over ${plural(L.hands, "showdown")}</span></div>
        <div><span class="k">Luck-adjusted net</span><span class="v ${cls(L.adjusted_net)}">${signed(Math.round(L.adjusted_net))}</span><span class="s">actual ${signed(p.net)}</span></div>
        <div><span class="k">Bad beats</span><span class="v">${L.beats_suffered} <small class="dim">/ ${L.beats_dealt}</small></span><span class="s">suffered / dealt out${L.lost_to_beats ? ` · ${num(L.lost_to_beats)} lost` : ""}</span></div>
        ${st ? `<div><span class="k">Streak now</span><span class="v">${st.current.win ? `${st.current.win} up` : st.current.lose ? `${st.current.lose} down` : "–"}</span><span class="s">best run ${plural(st.best.win, "session")} up</span></div>
        <div><span class="k">Attendance</span><span class="v">${st.current.attend}</span><span class="s">in a row · best ${st.best.attend}</span></div>` : ""}
      </div>
      ${mine ? `<h3 class="sub-h">Worst beat</h3><ul class="pots">${badBeatItem(mine)}</ul>` : ""}
    </div>
  </section>`;
}

function handLine(h, label) {
  if (!h) return "";
  return `<a class="pot hand-line" href="#/hand/${h.game_id}/${h.hand}">
    <div class="size ${cls(h.net)}">${signed(h.net)}<small>${label}</small></div>
    <div class="body"><div class="line">${cards(h.cards, "md")} ${board(h.board, "md")}</div>
      <div class="dim" style="font-size:13px">${h.desc ? esc(h.desc) + " · " : ""}${dateLabel(h.date)} · hand #${h.hand} · pot ${num(h.pot)}</div></div>
    <span class="btn">▶ Replay</span></a>`;
}

export function member(app, key) {
  const p = player(key);
  if (!p) return notFound();
  const D = state.data, s = p.stats, avg = D.averages;
  app.dataset.title = p.name;
  const otherNames = [...new Set(D.games.flatMap(g => g.players.filter(x => x.key === key).flatMap(x => x.names)))].filter(n => n !== p.name);
  const posOrder = ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB"];
  const positions = Object.entries(s.positions).sort((a, b) => posOrder.indexOf(a[0]) - posOrder.indexOf(b[0]));
  const shown = Object.values(s.starting_hands).reduce((a, b) => a + b, 0);
  const nemesis = p.rivals.filter(r => r.net < 0).sort((a, b) => a.net - b.net)[0];
  const victim = p.rivals.filter(r => r.net > 0).sort((a, b) => b.net - a.net)[0];

  app.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/members">Members</a><span>/</span><span>${esc(p.name)}</span></nav>
    <header class="profile-head">
      ${avatar(key, 76)}
      <div style="min-width:0">
        <h1>${esc(p.name)}</h1>
        <div class="sub">${styleTag(p)}${movement(p)}${form(p.form)}
          ${otherNames.length ? `<span class="dim">Also played as ${otherNames.map(esc).join(", ")}</span>` : ""}</div>
      </div>
      <div class="rank-badge"><span class="r">#${p.rank}</span><span class="l">of ${D.players.length}</span></div>
    </header>

    <div class="strip">
      <div><div class="k">Net result</div><div class="v ${cls(p.net)}">${signed(p.net)}</div><div class="s">${p.wins} of ${plural(p.games_played, "session")} up</div></div>
      <div><div class="k">Win rate</div><div class="v ${cls(s.bb_per_100)}">${signed(s.bb_per_100)}</div><div class="s">bb per 100 hands</div></div>
      <div><div class="k">Hands</div><div class="v">${num(s.hands)}</div><div class="s">${num(s.pots_won)} pots won</div></div>
      <div><div class="k">Buy-ins</div><div class="v">${num(p.buy_in)}</div><div class="s">${plural(p.rebuys, "rebuy")}</div></div>
      <div><div class="k">Best session</div><div class="v ${cls(p.best_game.net)}">${signed(p.best_game.net)}</div><div class="s">${dateLabel(p.best_game.date, { year: false })}</div></div>
    </div>

    <section class="section grid-2">
      ${playerCard(p)}
      <div class="panel">
        <div class="panel-head"><h2>Party rating</h2><a class="link-more" href="#/honours">How it works →</a></div>
        <div class="mini-stats" style="margin-bottom:14px">
          <div><span class="k">Now</span><span class="v">${num(p.rating)}</span><span class="s ${cls(p.rating_change)}">${p.rating_change != null ? signed(p.rating_change) + " last session" : ""}</span></div>
          <div><span class="k">Peak</span><span class="v">${num(p.rating_peak?.rating)}</span><span class="s">${p.rating_peak ? dateLabel(p.rating_peak.date, { year: false }) : ""}</span></div>
          <div><span class="k">Rank by rating</span><span class="v">#${ratingRank(p)}</span><span class="s">of ${state.data.players.filter(x => x.rating).length}</span></div>
        </div>
        <div id="p-rating"></div>
      </div>
    </section>

    ${cabinet(p)}

    <section class="section grid-2">
      <div class="panel style-card">
        <span class="eyebrow">Playing style</span>
        <div class="style-name">${esc(p.style.label)}</div>
        <p class="style-blurb">${esc(p.style.blurb)}</p>
        ${p.style.tags.length ? `<ul class="traits">${p.style.tags.map(t => `<li><span class="tag">${esc(t.label)}</span><span>${esc(t.evidence[0].toUpperCase() + t.evidence.slice(1))}</span></li>`).join("")}</ul>` : ""}
        <p class="note">${p.style.provisional ? `Early read: based on ${num(s.hands)} hands. Styles settle after about 200. ` : ""}Compared with this table's regulars. By standard poker benchmarks this whole table plays ${esc(p.style.benchmark.toLowerCase())}${p.style.benchmark === "Loose-passive" ? ", " + esc(p.name) + " included" : ""}.</p>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Style map</h2><a class="link-more" href="#/leaderboard">Everyone →</a></div>
        <div id="p-style"></div>
      </div>
    </section>

    <section class="panel section">
      <div class="panel-head"><h2>Profit graph</h2><p class="note">Running chip total, hand by hand, across every session. Click to replay a hand.</p></div>
      <div id="p-line"></div>
    </section>

    <section class="section grid-2">
      <div class="panel">
        <div class="panel-head"><h2>Before the flop</h2></div>
        ${vsRows(s, avg, [["vpip", "VPIP", 100], ["pfr", "PFR", 100], ["limp", "Limp", 100], ["three_bet", "3-bet", 40, s.samples.three_bet_opp], ["fold_to_3bet", "Fold to 3-bet", 100, s.samples.faced_3bet], ["saw_flop", "Saw flop", 100]])}
        <div class="vs-legend"><span><i style="width:16px;height:8px;border-radius:4px;background:var(--series-1)"></i>${esc(p.name)}</span><span><i style="width:2px;height:12px;background:var(--ink)"></i>Table average</span></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>After the flop</h2></div>
        ${vsRows(s, avg, [["af", "Aggression factor", 3], ["afq", "Aggression freq.", 100], ["cbet", "C-bet", 100, s.samples.cbet_opp], ["fold_to_cbet", "Fold to c-bet", 100, s.samples.faced_cbet], ["wtsd", "Went to showdown", 100], ["wsd", "Won at showdown", 100, s.samples.showdown], ["wwsf", "Won when saw flop", 100]])}
      </div>
    </section>

    <section class="section grid-2">
      <div class="panel">
        <div class="panel-head"><h2>Signature hands</h2></div>
        <div class="pots">${handLine(s.best_hand, "Best hand") + handLine(s.biggest_win, "Biggest win") + handLine(s.biggest_loss, "Biggest loss")}</div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Rivals</h2><a class="link-more" href="#/rivalries">All rivalries →</a></div>
        <p class="note" style="margin-bottom:12px">Chips won from and lost to each member. In a pot with several winners, each loser's chips are split by how much each winner won.</p>
        <div style="display:grid;gap:10px;margin-bottom:14px">
          ${victim ? `<div class="tag" style="justify-content:space-between;padding:10px 12px;font-size:13px"><span>Best customer</span>${personLink(victim.key, 22)}<span class="pos">${signed(victim.net)}</span></div>` : ""}
          ${nemesis ? `<div class="tag" style="justify-content:space-between;padding:10px 12px;font-size:13px"><span>Nemesis</span>${personLink(nemesis.key, 22)}<span class="neg">${signed(Math.round(nemesis.net))}</span></div>` : ""}
        </div>
        <div id="p-rivals"></div>
      </div>
    </section>

    <section class="section grid-2">
      <div class="panel">
        <div class="panel-head"><h2>Hands shown</h2><p class="note">${shown ? plural(shown, "hand") : "None yet"}</p></div>
        <p class="note" style="margin-bottom:12px">${D.private && key === "rahul" ? "Private view: every hand you were dealt, including the ones you never showed." : "Only hands shown at the table count, so this leans toward hands that reached showdown."}</p>
        ${handGrid(s.starting_hands)}
      </div>
      <div class="panel">
        <div class="panel-head"><h2>By position</h2></div>
        <div id="p-pos"></div>
        <p class="note" style="margin-top:12px">Made hands that won a showdown: ${Object.entries(s.made_hands).sort((a, b) => D.hand_categories.indexOf(b[0]) - D.hand_categories.indexOf(a[0])).map(([k, v]) => `${esc(k)} ${v}`).join(" · ") || "none yet"}</p>
      </div>
    </section>

    <section class="panel section"><div class="panel-head"><h2>Result by session</h2></div><div id="p-games"></div></section>
  `;

  const cum = cumulative(key);
  lines(document.getElementById("p-line"), {
    xs: cum.values.map((_, i) => i + 1), series: [{ key, label: p.name, values: cum.values, color: "var(--series-1)" }],
    height: 280, markers: cum.markers, area: true,
    xTitle: (_, i) => `${dateLabel(cum.hands[i].game.date, { year: false })} · hand #${cum.hands[i].n}`,
    onPick: i => { location.hash = `#/hand/${cum.hands[i].game.game_id}/${cum.hands[i].n}`; },
  });
  sortableTable(document.getElementById("p-rivals"), [
    { key: "who", label: "Member", left: true, fmt: r => personLink(r.key, 22), sort: r => name(r.key).toLowerCase() },
    { key: "won", label: "Won", fmt: r => num(r.won), sort: r => r.won },
    { key: "lost", label: "Lost", fmt: r => num(r.lost), sort: r => r.lost },
    { key: "net", label: "Net", fmt: r => `<strong>${signed(r.net)}</strong>`, cls: r => cls(r.net), sort: r => r.net },
  ], p.rivals.slice(0, 8), { sort: { key: "net", dir: -1 } });
  sortableTable(document.getElementById("p-pos"), [
    { key: "pos", label: "Position", left: true, fmt: r => `<strong>${r[0]}</strong>` },
    { key: "hands", label: "Hands", fmt: r => num(r[1].hands), sort: r => r[1].hands },
    { key: "vpip", label: "VPIP", fmt: r => pct(r[1].vpip), sort: r => r[1].vpip },
    { key: "pfr", label: "PFR", fmt: r => pct(r[1].pfr), sort: r => r[1].pfr },
    { key: "bb", label: "bb/100", fmt: r => signed(r[1].bb_per_100), cls: r => cls(r[1].bb_per_100), sort: r => r[1].bb_per_100 },
  ], positions);
  divergingBars(document.getElementById("p-games"), p.games.map(g => ({
    label: dateLabel(g.date, { year: false }), value: g.net, href: `#/session/${g.game_id}`,
    tip: `<div class="tt-title">${dateLabel(g.date)}</div><div class="tt-row"><span class="k">Net</span><span>${signed(g.net)}</span></div><div class="tt-row"><span class="k">Buy-in</span><span>${num(g.buy_in)}</span></div><div class="tt-row"><span class="k">Hands</span><span>${num(g.hands)}</span></div>`,
  })));
  styleScatter(document.getElementById("p-style"), D.players, { highlight: key });
  document.getElementById("share-card").addEventListener("click", e => shareCard(p, e.currentTarget));
  if (p.rating_history.length) {
    const rh = [{ date: null, rating: 1500 }, ...p.rating_history];
    lines(document.getElementById("p-rating"), {
      xs: rh.map((_, i) => i), xLabel: "Session", zero: false, height: 220, format: v => num(Math.round(v)),
      series: [{ key, label: p.name, values: rh.map(h => h.rating), color: "var(--series-1)" }],
      xTitle: (_, i) => (rh[i].date ? dateLabel(rh[i].date, { year: false }) : "Start (1500)"),
      onPick: i => { if (rh[i].game_id) location.hash = `#/session/${rh[i].game_id}`; },
    });
  }
}
