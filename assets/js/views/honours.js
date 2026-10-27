import { state, esc, num, signed, cls, plural, name, dateLabel, avatar, personLink, sortableTable, badge, unlockItem, badBeatItem } from "../ui.js";

// Honours: titles that change hands, the bad beat counter, seasons, ratings and every badge.
export default function honours(app) {
  const D = state.data;
  app.dataset.title = "Honours";
  const beats = D.bad_beats;
  const P = D.players;
  const holders = id => P.filter(p => p.badges.some(u => u.badge === id));
  const season = D.seasons[0];
  const goldCount = P.filter(p => p.badges.some(u => u.tier === 2)).length;
  const order = { once: 0, tiered: 1, shame: 2 };
  const ids = Object.keys(D.badges).sort((a, b) => order[D.badges[a].kind] - order[D.badges[b].kind]);

  app.innerHTML = `
    <header class="page-head">
      <span class="eyebrow">Honours</span>
      <h1>Badges, titles and bad beats</h1>
      <p class="lede">Earned at the table and worked out from every hand. Titles change hands after each session; badges are kept for good. Only cards shown at the table are ever used.</p>
    </header>

    <div class="strip">
      <div><div class="k">Badges earned</div><div class="v">${num(D.unlocks.length)}</div><div class="s">${goldCount} members hold a gold</div></div>
      <div><div class="k">Bad beats</div><div class="v">${num(beats.length)}</div><div class="s">${num(beats.reduce((s, b) => s + b.lost, 0))} chips lost to them</div></div>
      <div><div class="k">${esc(season.label)}</div><div class="v">${esc(name(season.standings[0].key))}</div><div class="s">${season.over ? "season champion" : "leads the season"} · ${signed(season.standings[0].net)}</div></div>
      <div><div class="k">Top rating</div><div class="v">${num([...P].filter(p => p.rating).sort((a, b) => b.rating - a.rating)[0].rating)}</div><div class="s">${esc([...P].filter(p => p.rating).sort((a, b) => b.rating - a.rating)[0].name)}</div></div>
    </div>

    <section class="section">
      <div class="section-head"><div><span class="eyebrow">Titles in play</span><h2>The cabinet</h2></div></div>
      <div class="titles">${Object.entries(D.titles).map(([id, t]) => titleCard(t)).join("")}</div>
    </section>

    <section class="section grid-2">
      <div class="panel">
        <div class="panel-head"><h2>Bad beat counter</h2><span class="note">${plural(beats.length, "beat")}</span></div>
        <p class="note" style="margin-bottom:12px">A bad beat: losing a showdown after being at least ${Math.round(D.badge_rules.bad_beat_equity * 100)}% to win when the last chips went in, or on the turn, in a pot of ${D.badge_rules.bad_beat_pot_bb} big blinds or more. Only hands where every showdown player's cards were shown count.</p>
        <ul class="pots">${[...beats].sort((a, b) => b.pot - a.pot).slice(0, 6).map(b => badBeatItem(b)).join("")}</ul>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Luck table</h2></div>
        <p class="note" style="margin-bottom:12px">Luck is chips won minus the share the odds gave, in heads-up showdowns where the money went in before the river. Adjusted net takes it away from the result.</p>
        <div id="h-luck"></div>
      </div>
    </section>

    <section class="section grid-2">
      <div class="panel">
        <div class="panel-head"><h2>${esc(season.label)} season</h2><span class="note">${plural(season.sessions, "session")}${season.over ? "" : " so far"}</span></div>
        <div id="h-season"></div>
        ${D.seasons.length > 1 ? `<p class="note" style="margin-top:12px">Past champions: ${D.seasons.filter(s => s.champion).map(s => `${esc(s.label)} ${esc(name(s.champion))}`).join(" · ")}</p>` : `<p class="note" style="margin-top:12px">Seasons run by calendar month. The champion is crowned when the month ends.</p>`}
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Party rating</h2></div>
        <p class="note" style="margin-bottom:12px">Every session, each member is compared with everyone else at the table: finishing above a higher-rated member earns more than beating a lower-rated one. Everyone starts at 1500, so one huge night can't run away with it.</p>
        <div id="h-rating"></div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="eyebrow">On a roll</span><h2>Streaks</h2></div></div>
      <div class="records">${streakCards(P)}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><span class="eyebrow">Every badge</span><h2>Badge book</h2></div></div>
      <div class="badge-book">${ids.map(id => bookEntry(id, D.badges[id], holders(id))).join("")}</div>
    </section>

    <section class="panel section">
      <div class="panel-head"><h2>Latest unlocks</h2></div>
      <div class="unlocks">${D.unlocks.slice(0, 24).map(u => unlockItem(u)).join("")}</div>
    </section>`;

  sortableTable(document.getElementById("h-luck"), [
    { key: "name", label: "Member", left: true, fmt: p => personLink(p.key, 22), sort: p => p.name.toLowerCase() },
    { key: "suf", label: "Beaten", title: "Bad beats suffered", fmt: p => p.luck.beats_suffered, sort: p => p.luck.beats_suffered },
    { key: "dealt", label: "Dealt", title: "Bad beats dealt out", fmt: p => p.luck.beats_dealt, sort: p => p.luck.beats_dealt },
    { key: "luck", label: "Luck", fmt: p => signed(Math.round(p.luck.chips)), cls: p => cls(p.luck.chips), sort: p => p.luck.chips },
    { key: "adj", label: "Adjusted net", fmt: p => signed(Math.round(p.luck.adjusted_net)), cls: p => cls(p.luck.adjusted_net), sort: p => p.luck.adjusted_net },
  ], P.filter(p => p.luck.hands >= 5), { sort: { key: "luck", dir: -1 } });

  sortableTable(document.getElementById("h-season"), [
    { key: "r", label: "#", fmt: (r, i) => `<span class="rank-cell">${i + 1}</span>` },
    { key: "name", label: "Member", left: true, fmt: r => personLink(r.key, 22) },
    { key: "s", label: "Sessions", fmt: r => r.sessions },
    { key: "net", label: "Net", fmt: r => `<strong>${signed(r.net)}</strong>`, cls: r => cls(r.net) },
  ], season.standings.slice(0, 10));

  sortableTable(document.getElementById("h-rating"), [
    { key: "name", label: "Member", left: true, fmt: p => personLink(p.key, 22), sort: p => p.name.toLowerCase() },
    { key: "rating", label: "Rating", fmt: p => `<strong>${num(p.rating)}</strong>`, sort: p => p.rating },
    { key: "chg", label: "Last", title: "Change at their latest session", fmt: p => signed(p.rating_change), cls: p => cls(p.rating_change), sort: p => p.rating_change },
    { key: "s", label: "Sessions", fmt: p => p.games_played, sort: p => p.games_played },
  ], P.filter(p => p.rating), { sort: { key: "rating", dir: -1 } });
}

function titleCard(t) {
  const h = t.history, cur = h[h.length - 1];
  return `<a class="record title-card" href="#/member/${encodeURIComponent(cur.key)}">
    <span class="t">${esc(t.title)}</span>
    <span class="holder">${avatar(cur.key, 34)}<span class="v" style="font-size:var(--step-1)">${esc(name(cur.key))}</span></span>
    <span class="s">${esc(t.blurb)}</span>
    <span class="s dim">${cur.took_from ? `Took it from ${esc(name(cur.took_from))} on ${dateLabel(cur.since, { year: false })}` : `Held since ${dateLabel(cur.since, { year: false })}`}${h.length > 1 ? ` · changed hands ${plural(h.length - 1, "time")}` : ""}</span>
  </a>`;
}

function streakCards(P) {
  const best = (kind, cur) => [...P].filter(p => p.streaks).sort((a, b) => (cur ? b.streaks.current[kind] - a.streaks.current[kind] : b.streaks.best[kind] - a.streaks.best[kind]))[0];
  const card = (title, p, v, sub) => p && v ? `<a class="record" href="#/member/${encodeURIComponent(p.key)}"><span class="t">${title}</span><span class="v">${v}</span><span class="holder">${avatar(p.key, 26)}${esc(p.name)}</span><span class="s">${sub}</span></a>` : "";
  const hot = best("win", true), cold = best("lose", true), bw = best("win", false), att = best("attend", true);
  return [
    card("Hot streak now", hot, hot?.streaks.current.win, "sessions up in a row"),
    card("Cold streak now", cold, cold?.streaks.current.lose, "sessions down in a row"),
    card("Longest winning run", bw, bw?.streaks.best.win, "sessions up in a row, ever"),
    card("Ever-present", att, att?.streaks.current.attend, "sessions in a row without missing one"),
  ].join("");
}

function bookEntry(id, b, who) {
  const tiers = b.tiers ? `<span class="tiers">${b.tiers.map((t, i) => `<span>${badge(id, i, { size: 22 })}${num(t)}</span>`).join("")}</span>` : "";
  const top = b.kind === "tiered" ? Math.max(-1, ...who.map(p => p.badges.find(u => u.badge === id).tier)) : null;
  return `<div class="book-entry ${who.length ? "" : "locked"}">
    ${badge(id, b.kind === "tiered" ? Math.max(0, top) : null, { size: 52, locked: !who.length })}
    <div class="txt"><div class="t">${esc(b.title)}${b.kind === "shame" ? ' <span class="tag">Lighter side</span>' : ""}</div><div class="b">${esc(b.blurb)}</div>${tiers}
      <div class="who">${who.length ? who.slice(0, 8).map(p => `<a href="#/member/${encodeURIComponent(p.key)}" title="${esc(p.name)}">${avatar(p.key, 24)}</a>`).join("") + (who.length > 8 ? `<span class="dim">+${who.length - 8}</span>` : "") : '<span class="dim">Nobody yet</span>'}</div>
    </div>
  </div>`;
}
