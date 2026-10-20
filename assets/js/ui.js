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
    const r = await fetch(`data/hands/${gid}.json`);
    if (!r.ok) throw new Error(`Couldn't load hands for this session (HTTP ${r.status}).`);
    state.hands[gid] = await r.json();
  }
  return state.hands[gid];
}

export function medal(kind) {
  // a rosette in the party colour; the ribbon tails mark it as an award
  return `<svg class="medal" viewBox="0 0 40 40" aria-hidden="true"><path d="M13 24 9 37l6-3 4 5 3-13M27 24l4 13-6-3-4 5-3-13" fill="var(--line-strong)"/><circle cx="20" cy="17" r="13" fill="var(--marigold)"/><circle cx="20" cy="17" r="9" fill="none" stroke="var(--marigold-ink)" stroke-width="1.5" stroke-dasharray="2 2.4"/><text x="20" y="21.5" text-anchor="middle" font-family="Unbounded, sans-serif" font-weight="800" font-size="11" fill="var(--marigold-ink)">${kind}</text></svg>`;
}
