// Shared state, formatting and small components.
export const state = { data: null, hands: {} };

export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const num = v => v == null ? "–" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 1 });
export const signed = v => v == null ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "") + num(Math.abs(v));
export const cls = v => v > 0 ? "pos" : v < 0 ? "neg" : "";
export const pct = v => v == null ? "–" : `${num(v)}%`;
export const plural = (n, word, many = word + "s") => `${num(n)} ${n === 1 ? word : many}`;
export const dur = m => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;

export const name = key => state.data.names[key] || key;
export const player = key => state.data.players.find(p => p.key === key);
export const game = id => state.data.games.find(g => g.game_id === id);

export function dateLabel(d, { year = true, weekday = true } = {}) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", {
    ...(weekday ? { weekday: "short" } : {}), day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}),
  });
}
export const timeLabel = iso => iso.slice(11, 16);
// a session still being played (live_update.py): "Live" pill and the time of the last update
export const liveBadge = g => g.live ? `<span class="live-badge"><span class="dot"></span>Live</span>` : "";
export const updatedLabel = g => `updated ${clock(Date.parse(g.updated_at))} IST`;
export const clock = ms => new Date(ms).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });

// ---------- people ----------
const AVATAR_TONES = ["#f2a93b", "#3987e5", "#1baf7a", "#e87ba4", "#9085e9", "#eb6834", "#4fb3bf", "#c9a227"];
function tone(key) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}
export function initials(n) {
  const parts = n.trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : n.slice(0, 2)).toUpperCase();
}
// Two-letter marks that stay unique across members (Ankit and Ankush must not both be "AN").
let MARKS = null;
function mark(key) {
  if (!MARKS) {
    MARKS = {};
    const used = new Set();
    for (const p of state.data.players) {
      const n = p.name.replace(/[^A-Za-z ]/g, "").trim() || p.key;
      const letters = n.replace(/ /g, "");
      const options = [initials(n), ...[...letters.slice(1)].map(c => (letters[0] + c).toUpperCase())];
      const m = options.find(o => !used.has(o)) || initials(n);
      used.add(m);
      MARKS[p.key] = m;
    }
  }
  return MARKS[key] || initials(name(key));
}
export function avatar(key, size = 36) {
  return `<span class="avatar" style="--av:${tone(key)};--size:${size}px" title="${esc(name(key))}" aria-hidden="true">${esc(mark(key))}</span>`;
}
export function personLink(key, size = 28) {
  return `<a class="person" href="#/member/${encodeURIComponent(key)}">${avatar(key, size)}<span class="nm">${esc(name(key))}</span></a>`;
}

export function movement(p) {
  if (p.new) return `<span class="move new" title="First appearance in the latest session">NEW</span>`;
  if (p.movement == null) return "";
  if (p.movement > 0) return `<span class="move up" title="Up ${p.movement} since the previous session">▲ ${p.movement}</span>`;
  if (p.movement < 0) return `<span class="move down" title="Down ${-p.movement} since the previous session">▼ ${-p.movement}</span>`;
  return `<span class="move same" title="No change since the previous session">–</span>`;
}
export const form = f => `<span class="form" title="Last ${f.length} sessions, oldest first">${f.map(r => `<i class="${r}">${r}</i>`).join("")}</span>`;

// ---------- cards ----------
const SUITS = { s: "♠", h: "♥", d: "♦", c: "♣" };
const SUIT_NAMES = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" };
export function card(c) {
  if (!c) return `<span class="pc unknown" title="Not shown">?</span>`;
  const rank = c[0] === "T" ? "10" : c[0];
  return `<span class="pc ${c[1] === "h" || c[1] === "d" ? "red" : ""}" title="${rank} of ${SUIT_NAMES[c[1]]}"><b>${rank}</b><span>${SUITS[c[1]]}</span></span>`;
}
export function cards(cs, size = "") {
  if (!cs || !cs.length) return `<span class="cards ${size}"><span class="pc unknown" title="Not shown">?</span><span class="pc unknown" title="Not shown">?</span></span>`;
  return `<span class="cards ${size}">${cs.map(card).join("")}</span>`;
}
export const backs = (n = 2, size = "") => `<span class="cards ${size}">${'<span class="pc back"></span>'.repeat(n)}</span>`;
export function board(cs, size = "") {
  return cs && cs.length ? `<span class="cards ${size}">${cs.map(card).join("")}</span>` : `<span class="dim">No flop</span>`;
}

// ---------- tables ----------
// cols: [{key, label, left?, title?, fmt(row, i) -> html, sort?(row) -> value, cls?(row)}]
export function sortableTable(holder, cols, rows, { sort, onRow } = {}) {
  const st = { key: sort?.key, dir: sort?.dir ?? -1 };
  const draw = () => {
    const col = cols.find(c => c.key === st.key);
    const sorted = col?.sort ? [...rows].sort((a, b) => {
      const va = col.sort(a), vb = col.sort(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va > vb ? 1 : va < vb ? -1 : 0) * st.dir;
    }) : rows;
    holder.innerHTML = `<div class="table-wrap"><table><thead><tr>${cols.map(c =>
      `<th class="${c.left ? "left" : ""} ${c.sort ? "sortable" : ""}" data-k="${c.key}" ${c.title ? `title="${esc(c.title)}"` : ""} ${c.sort ? 'tabindex="0" role="button"' : ""}>${c.label}${st.key === c.key ? `<span class="arrow">${st.dir > 0 ? "▲" : "▼"}</span>` : ""}</th>`).join("")
    }</tr></thead><tbody>${sorted.map((r, i) => `<tr ${onRow ? `class="clickable" data-i="${rows.indexOf(r)}"` : ""}>${cols.map(c =>
      `<td class="${c.left ? "left" : ""} ${c.cls ? c.cls(r) : ""}">${c.fmt(r, i)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    holder.querySelectorAll("th.sortable").forEach(th => {
      const go = () => { const k = th.dataset.k; st.dir = st.key === k ? -st.dir : -1; st.key = k; draw(); };
      th.addEventListener("click", go);
      th.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
    if (onRow) holder.querySelectorAll("tr.clickable").forEach(tr => tr.addEventListener("click", e => {
      if (e.target.closest("a")) return;
      onRow(rows[+tr.dataset.i]);
    }));
  };
  draw();
}

export const STAT_HELP = {
  vpip: "VPIP: how often a player puts money in before the flop by choice (calls or raises, not blinds).",
  pfr: "PFR: how often a player raises before the flop.",
  three_bet: "3-bet: how often a player re-raises when facing one raise before the flop.",
  af: "Aggression factor: after the flop, bets and raises divided by calls. Above 2 is aggressive, below 1 is passive.",
  wtsd: "Went to showdown: of the hands where the player saw the flop, how often they reached showdown.",
  wsd: "Won at showdown: how often the player won when they reached showdown.",
  bb100: "bb/100: big blinds won per 100 hands, the standard win-rate measure.",
};

export async function loadHands(gid) {
  if (!state.hands[gid]) {
    // the version stops a cached copy from hiding new hands while a session is live
    const r = await fetch(`data/hands/${gid}.json?v=${encodeURIComponent(state.data.generated_at)}`);
    if (!r.ok) throw new Error(`Couldn't load hands for this session (HTTP ${r.status}).`);
    state.hands[gid] = await r.json();
  }
  return state.hands[gid];
}

export function medal(kind) {
  // a rosette in the party colour; the ribbon tails mark it as an award
  return `<svg class="medal" viewBox="0 0 40 40" aria-hidden="true"><path d="M13 24 9 37l6-3 4 5 3-13M27 24l4 13-6-3-4 5-3-13" fill="var(--line-strong)"/><circle cx="20" cy="17" r="13" fill="var(--marigold)"/><circle cx="20" cy="17" r="9" fill="none" stroke="var(--marigold-ink)" stroke-width="1.5" stroke-dasharray="2 2.4"/><text x="20" y="21.5" text-anchor="middle" font-family="Unbounded, sans-serif" font-weight="800" font-size="11" fill="var(--marigold-ink)">${kind}</text></svg>`;
}

// ---------- honours: badges, unlocks, bad beats ----------
// One shape per kind so a badge reads without colour: a rosette for feats, a hexagon for
// ladders (bronze, silver, gold), a tilted square for the lighter "shame" badges.
export function badge(id, tier = null, { size = 44, locked = false, title = true } = {}) {
  const b = state.data.badges[id];
  if (!b) return "";
  const tierName = tier != null ? state.data.tier_names[tier] : "";
  const fill = locked ? "none" : b.kind === "tiered" ? `var(--tier-${tier ?? 0})` : b.kind === "shame" ? "var(--shame)" : "var(--marigold)";
  const ink = locked ? "var(--muted)" : b.kind === "shame" ? "var(--shame-ink)" : "var(--marigold-ink)";
  const stroke = locked ? `stroke="var(--line-strong)" stroke-width="1.5" stroke-dasharray="3 3"` : "";
  const shape = b.kind === "tiered"
    ? `<path d="M20 2 36 11v18L20 38 4 29V11z" fill="${fill}" ${stroke}/><path d="M20 7 31.5 13.5v13L20 33 8.5 26.5v-13z" fill="none" stroke="${ink}" stroke-opacity=".35" stroke-width="1.2"/>`
    : b.kind === "shame"
      ? `<rect x="7" y="7" width="26" height="26" rx="5" transform="rotate(45 20 20)" fill="${fill}" ${stroke}/>`
      : `<path d="M13 26 10 38l5-3 4 4 2-10M27 26l3 12-5-3-4 4-2-10" fill="${locked ? "none" : "var(--line-strong)"}"/><circle cx="20" cy="18" r="14" fill="${fill}" ${stroke}/><circle cx="20" cy="18" r="10" fill="none" stroke="${ink}" stroke-opacity=".45" stroke-width="1.2" stroke-dasharray="2 2.4"/>`;
  const label = `${b.title}${tierName ? " · " + tierName : ""}: ${b.blurb}`;
  return `<svg class="badge-svg" viewBox="0 0 40 40" width="${size}" height="${size}" role="img" aria-label="${esc(label)}">${title ? `<title>${esc(label)}</title>` : ""}${shape}<text x="20" y="${b.kind === "once" ? 22 : 24}" text-anchor="middle" font-family="Unbounded, sans-serif" font-weight="800" font-size="10" fill="${ink}">${esc(b.mark)}</text></svg>`;
}
export const badgeTitle = u => {
  const b = state.data.badges[u.badge];
  return b.title + (u.tier != null ? ` · ${state.data.tier_names[u.tier]}` : "");
};
// one line per unlock: badge, who, what, where
export function unlockItem(u, { who = true } = {}) {
  const b = state.data.badges[u.badge];
  const href = u.hand ? `#/hand/${u.game_id}/${u.hand}` : `#/session/${u.game_id}`;
  return `<a class="unlock" href="${href}">
    ${badge(u.badge, u.tier, { size: 40, title: false })}
    <span class="txt"><span class="t">${esc(badgeTitle(u))}</span><span class="b">${who ? `${esc(name(u.key))} · ` : ""}${esc(b.blurb)}</span></span>
    <span class="when">${dateLabel(u.date, { year: false, weekday: false })}${u.hand ? ` · #${u.hand}` : ""}${u.times > 1 ? ` · ×${u.times}` : ""}</span>
  </a>`;
}
export const eqPct = v => v == null ? "–" : `${Math.round(v * 100)}%`;
export function badBeatItem(b, { date = true } = {}) {
  return `<li class="pot beat">
    <div class="size">${num(b.pot)}<small>${date ? dateLabel(b.date, { year: false, weekday: false }) + " · " : ""}#${b.hand}</small></div>
    <div class="body">
      <div class="line">${personLink(b.victim, 22)} ${cards(b.victim_cards)} <span class="tag accent">${eqPct(b.equity)} on the ${esc(b.street)}</span></div>
      <div class="line"><span class="dim">lost to</span> ${personLink(b.winner, 22)} ${cards(b.winner_cards)} ${b.winner_desc ? `<span class="dim">${esc(b.winner_desc)}</span>` : ""}</div>
      <div class="line">${board(b.board)}</div>
    </div>
    <a class="btn" href="#/hand/${b.game_id}/${b.hand}" aria-label="Replay hand ${b.hand}">▶ Replay</a>
  </li>`;
}

// ---------- player card pieces (member page and its share picture) ----------
// the badges worth showing off: gold first, then the rarest feats; never the lighter ones
export function showcase(p, n = 4) {
  const D = state.data;
  const holders = id => D.players.filter(x => x.badges.some(u => u.badge === id)).length;
  return p.badges.filter(u => D.badges[u.badge].kind !== "shame")
    .sort((a, b) => (b.tier ?? -1) - (a.tier ?? -1) || holders(a.badge) - holders(b.badge)).slice(0, n);
}

// favourite starting hand among the ones shown, and the best made hand
export function signature(p) {
  const fav = Object.entries(p.stats.starting_hands).sort((a, b) => b[1] - a[1])[0];
  return { fav: fav ? { hand: fav[0], times: fav[1] } : null, best: p.stats.best_hand };
}

export function rivalsOf(p) {
  return {
    nemesis: p.rivals.filter(r => r.net < 0).sort((a, b) => a.net - b.net)[0],
    victim: p.rivals.filter(r => r.net > 0).sort((a, b) => b.net - a.net)[0],
  };
}

