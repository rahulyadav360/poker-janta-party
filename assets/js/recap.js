// Pictures for the group chat, drawn on a canvas: the session recap and a member's player card.
// Phones share them (with a link); elsewhere they download. The build also renders each session
// recap to recaps/<game_id>.png (scripts/recaps.py), which link previews show.
import { state, name, dateLabel, dur, signed, num, signature, rivalsOf, showcase } from "./ui.js";

const W = 1080, H = 1350;
const C = { bg: "#0b100e", felt: "#0f3a2b", line: "#2a3a32", ink: "#eef2ec", ink2: "#b0bcb3", muted: "#7b887f",
  gold: "#f2a93b", goldInk: "#1b1305", pos: "#3fbf72", neg: "#ef6b6b" };

async function fonts() {
  try {
    await Promise.all(["800 64px Unbounded", "600 32px Unbounded", "500 30px 'Instrument Sans'", "700 30px 'Instrument Sans'"]
      .map(f => document.fonts.load(f)));
  } catch (e) { /* fall back to system fonts */ }
}

function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  while (text.length > 1 && ctx.measureText(text + "…").width > max) text = text.slice(0, -1);
  return text + "…";
}

export async function draw(g) {
  await fonts();
  const { cv, x } = canvas();
  const pad = 72;
  header(x, pad, `${g.live ? "Live count" : "Results declared"} · ${dateLabel(g.date)}`);

  const w = g.players[0];
  x.fillStyle = C.ink; x.font = "800 76px Unbounded, sans-serif";
  x.fillText(fit(x, name(w.key), W - pad * 2), pad, 270);
  x.fillStyle = C.pos; x.font = "800 64px Unbounded, sans-serif";
  x.fillText(`${signed(w.ledger.net)}`, pad, 352);
  x.fillStyle = C.ink2; x.font = "500 30px 'Instrument Sans', sans-serif";
  x.fillText(`${g.live ? "leads so far" : "Chief Minister of the night"} · ${num(g.hands)} hands · ${dur(g.duration_min)} · ${g.player_count} players`, pad, 410);

  // results
  // up to 10 rows; with more players, the top 7, a gap, and the bottom 2
  const n = g.players.length;
  const rows = n <= 10 ? g.players.map((p, i) => [p, i + 1])
    : [...g.players.slice(0, 7).map((p, i) => [p, i + 1]), null, ...g.players.slice(-2).map((p, i) => [p, n - 1 + i])];
  const top = 480, rowH = 50;
  const max = Math.max(...g.players.map(p => Math.abs(p.ledger.net))) || 1;
  rows.forEach((row, i) => {
    const y = top + i * rowH;
    if (!row) {
      x.fillStyle = C.muted; x.font = "500 26px 'Instrument Sans', sans-serif";
      x.fillText(`⋯ ${n - 9} more`, pad + 52, y + 34);
      return;
    }
    const [p, rank] = row;
    x.fillStyle = C.muted; x.font = "700 26px 'Instrument Sans', sans-serif";
    x.fillText(String(rank), pad, y + 34);
    x.fillStyle = C.ink; x.font = "700 30px 'Instrument Sans', sans-serif";
    x.fillText(fit(x, name(p.key), 330), pad + 52, y + 34);
    const net = p.ledger.net;
    x.fillStyle = net >= 0 ? C.pos : C.neg;
    const bw = 300 * Math.abs(net) / max;
    x.globalAlpha = 0.35; x.fillRect(pad + 420, y + 14, Math.max(4, bw), 24); x.globalAlpha = 1;
    x.font = "700 30px 'Instrument Sans', sans-serif"; x.textAlign = "right";
    x.fillText(signed(net), W - pad, y + 34); x.textAlign = "left";
  });

  // footer facts: bad beat and badges
  let y = 1080;
  x.strokeStyle = C.line; x.lineWidth = 2; x.beginPath(); x.moveTo(pad, y - 40); x.lineTo(W - pad, y - 40); x.stroke();
  const fact = (label, text) => {
    x.fillStyle = C.gold; x.font = "600 22px Unbounded, sans-serif"; x.fillText(label, pad, y);
    x.fillStyle = C.ink; x.font = "500 30px 'Instrument Sans', sans-serif"; x.fillText(fit(x, text, W - pad * 2), pad, y + 42);
    y += 100;
  };
  const b = g.bad_beat;
  if (b) fact("BAD BEAT OF THE NIGHT", `${name(b.victim)} was ${Math.round(b.equity * 100)}% on the ${b.street} and lost a ${num(b.pot)} pot to ${name(b.winner)}`);
  if (g.unlocks.length) {
    // the rarest first: gold ladders and one-off feats before repeats and the lighter badges
    const B = state.data.badges;
    const rank = u => (u.tier === 2 ? 0 : B[u.badge].kind === "once" && u.times === 1 ? 1 : u.tier === 1 ? 2 : B[u.badge].kind === "shame" ? 4 : 3);
    const seen = new Set();
    const t = [...g.unlocks].sort((a, b) => rank(a) - rank(b)).filter(u => !seen.has(u.badge) && seen.add(u.badge))
      .slice(0, 3).map(u => `${name(u.key)}: ${B[u.badge].title}`).join(" · ");
    fact(`${g.unlocks.length} BADGES UNLOCKED`, t);
  }
  x.fillStyle = C.muted; x.font = "500 26px 'Instrument Sans', sans-serif";
  x.fillText("pokerjantaparty.com", pad, H - 50);
  return cv;
}

function header(x, pad, line) {
  x.fillStyle = C.gold; x.font = "600 30px Unbounded, sans-serif";
  x.fillText("POKER JANTA PARTY", pad, 104);
  x.fillStyle = C.ink2; x.font = "500 30px 'Instrument Sans', sans-serif";
  x.fillText(line, pad, 152);
}

function canvas() {
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const x = cv.getContext("2d");
  x.fillStyle = C.bg; x.fillRect(0, 0, W, H);
  const grad = x.createLinearGradient(0, 0, 0, 470);
  grad.addColorStop(0, C.felt); grad.addColorStop(1, C.bg);
  x.fillStyle = grad; x.fillRect(0, 0, W, 470);
  return { cv, x };
}

// A member's player card: archetype, numbers, signature hand, rivals and best badges.
export async function drawCard(p, { signature, rivals, showcase }) {
  await fonts();
  const { cv, x } = canvas();
  const pad = 72;
  header(x, pad, `Player card · #${p.rank} of ${state.data.players.length} · rating ${num(p.rating)}`);
  x.fillStyle = C.ink; x.font = "800 84px Unbounded, sans-serif";
  x.fillText(fit(x, p.name, W - pad * 2), pad, 280);
  x.fillStyle = C.gold; x.font = "600 40px Unbounded, sans-serif";
  x.fillText(fit(x, p.style.label, W - pad * 2), pad, 350);
  x.fillStyle = C.ink2; x.font = "500 28px 'Instrument Sans', sans-serif";
  wrap(x, p.style.blurb, pad, 404, W - pad * 2, 38, 2);

  const stats = [["NET", signed(p.net), p.net >= 0 ? C.pos : C.neg], ["SESSIONS", String(p.games_played), C.ink],
    ["BB/100", signed(p.stats.bb_per_100), p.stats.bb_per_100 >= 0 ? C.pos : C.neg], ["HANDS", num(p.stats.hands), C.ink]];
  const cw = (W - pad * 2) / 4;
  stats.forEach(([k, v, col], i) => {
    x.fillStyle = C.muted; x.font = "600 22px Unbounded, sans-serif"; x.fillText(k, pad + i * cw, 530);
    x.fillStyle = col; x.font = "800 36px Unbounded, sans-serif"; x.fillText(fit(x, v, cw - 12), pad + i * cw, 584);
  });
  x.strokeStyle = C.line; x.lineWidth = 2; x.beginPath(); x.moveTo(pad, 640); x.lineTo(W - pad, 640); x.stroke();

  let y = 710;
  const fact = (k, v) => {
    x.fillStyle = C.muted; x.font = "600 22px Unbounded, sans-serif"; x.fillText(k, pad, y);
    x.fillStyle = C.ink; x.font = "700 34px 'Instrument Sans', sans-serif"; x.fillText(fit(x, v, W - pad * 2), pad, y + 46);
    y += 112;
  };
  if (signature.fav) fact("SIGNATURE HAND", `${signature.fav.hand} · shown ${signature.fav.times} times`);
  if (signature.best) fact("BEST HAND SHOWN", signature.best.desc);
  if (rivals.nemesis) fact("NEMESIS", `${name(rivals.nemesis.key)} · ${signed(Math.round(rivals.nemesis.net))}`);
  if (rivals.victim) fact("BEST CUSTOMER", `${name(rivals.victim.key)} · ${signed(Math.round(rivals.victim.net))}`);
  if (showcase.length) {
    const tiers = state.data.tier_names;
    fact(`${p.badges.length} BADGES`, showcase.map(u => state.data.badges[u.badge].title + (u.tier != null ? ` (${tiers[u.tier]})` : "")).join(" · "));
  }
  x.fillStyle = C.muted; x.font = "500 26px 'Instrument Sans', sans-serif";
  x.fillText(`pokerjantaparty.com/#/member/${p.key}`, pad, H - 50);
  return cv;
}

function wrap(x, text, left, top, max, lh, lines) {
  const words = text.split(" ");
  let line = "", n = 0;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (x.measureText(test).width > max && line) {
      x.fillText(n === lines - 1 ? fit(x, line + "…", max) : line, left, top + n * lh);
      if (++n === lines) return;
      line = w;
    } else line = test;
  }
  if (line) x.fillText(line, left, top + n * lh);
}

async function share(cv, filename, text, url, button) {
  const label = button.textContent;
  button.disabled = true; button.textContent = "Making the picture…";
  try {
    const blob = await new Promise(r => cv.toBlob(r, "image/png"));
    const file = new File([blob], filename, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Poker Janta Party", text: `${text} ${url}` });
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
  } catch (e) {
    if (e.name !== "AbortError") console.error(e);
  } finally {
    button.disabled = false; button.textContent = label;
  }
}

// the share link opens a small page whose preview is the recap image, then the session report
export const shareUrl = g => `${location.origin}/s/${g.game_id}.html`;

export async function shareRecap(g, button) {
  await share(await draw(g), `poker-janta-party-${g.date}.png`, `Results for ${dateLabel(g.date)}:`, shareUrl(g), button);
}

export async function shareCard(p, button) {
  const cv = await drawCard(p, { signature: signature(p), rivals: rivalsOf(p), showcase: showcase(p) });
  await share(cv, `poker-janta-party-${p.key}.png`, `${p.name}'s player card:`, `${location.origin}/#/member/${encodeURIComponent(p.key)}`, button);
}
