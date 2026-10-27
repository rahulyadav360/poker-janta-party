// Session recap as a picture for the group chat: drawn on a canvas, then shared (phones) or saved.
import { state, name, dateLabel, dur, signed, num } from "./ui.js";

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
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const x = cv.getContext("2d");
  x.fillStyle = C.bg; x.fillRect(0, 0, W, H);
  // felt band
  const grad = x.createLinearGradient(0, 0, 0, 470);
  grad.addColorStop(0, C.felt); grad.addColorStop(1, C.bg);
  x.fillStyle = grad; x.fillRect(0, 0, W, 470);

  const pad = 72;
  x.fillStyle = C.gold; x.font = "600 30px Unbounded, sans-serif";
  x.fillText("POKER JANTA PARTY", pad, 104);
  x.fillStyle = C.ink2; x.font = "500 30px 'Instrument Sans', sans-serif";
  x.fillText(`${g.live ? "Live count" : "Results declared"} · ${dateLabel(g.date)}`, pad, 152);

  const w = g.players[0];
  x.fillStyle = C.ink; x.font = "800 76px Unbounded, sans-serif";
  x.fillText(fit(x, name(w.key), W - pad * 2), pad, 270);
  x.fillStyle = C.pos; x.font = "800 64px Unbounded, sans-serif";
  x.fillText(`${signed(w.ledger.net)}`, pad, 352);
  x.fillStyle = C.ink2; x.font = "500 30px 'Instrument Sans', sans-serif";
  x.fillText(`${g.live ? "leads so far" : "Chief Minister of the night"} · ${num(g.hands)} hands · ${dur(g.duration_min)} · ${g.player_count} players`, pad, 410);

  // results
  const rows = g.players.slice(0, 10);
  const top = 480, rowH = 50;
  const max = Math.max(...g.players.map(p => Math.abs(p.ledger.net))) || 1;
  rows.forEach((p, i) => {
    const y = top + i * rowH;
    x.fillStyle = C.muted; x.font = "700 26px 'Instrument Sans', sans-serif";
    x.fillText(String(i + 1), pad, y + 34);
    x.fillStyle = C.ink; x.font = "700 30px 'Instrument Sans', sans-serif";
    x.fillText(fit(x, name(p.key), 330), pad + 52, y + 34);
    const net = p.ledger.net;
    x.fillStyle = net >= 0 ? C.pos : C.neg;
    const bw = 300 * Math.abs(net) / max;
    x.globalAlpha = 0.35; x.fillRect(pad + 420, y + 14, Math.max(4, bw), 24); x.globalAlpha = 1;
    x.font = "700 30px 'Instrument Sans', sans-serif"; x.textAlign = "right";
    x.fillText(signed(net), W - pad, y + 34); x.textAlign = "left";
  });
  if (g.players.length > rows.length) {
    x.fillStyle = C.muted; x.font = "500 26px 'Instrument Sans', sans-serif";
    x.fillText(`+ ${g.players.length - rows.length} more`, pad + 52, top + rows.length * rowH + 30);
  }

  // footer facts: bad beat and badges
  let y = 1080;
  x.strokeStyle = C.line; x.lineWidth = 2; x.beginPath(); x.moveTo(pad, y - 40); x.lineTo(W - pad, y - 40); x.stroke();
  const fact = (label, text) => {
    x.fillStyle = C.gold; x.font = "600 22px Unbounded, sans-serif"; x.fillText(label, pad, y);
    x.fillStyle = C.ink; x.font = "500 30px 'Instrument Sans', sans-serif"; x.fillText(fit(x, text, W - pad * 2), pad, y + 42);
    y += 100;
  };
  const b = g.bad_beat;
  if (b) fact("BAD BEAT OF THE NIGHT", `${name(b.victim)} was ${Math.round(b.equity * 100)}% on the ${b.street} and lost ${num(b.pot)} to ${name(b.winner)}`);
  if (g.unlocks.length) {
    const t = g.unlocks.slice(0, 3).map(u => `${name(u.key)}: ${state.data.badges[u.badge].title}`).join(" · ");
    fact(`${g.unlocks.length} BADGES UNLOCKED`, t);
  }
  x.fillStyle = C.muted; x.font = "500 26px 'Instrument Sans', sans-serif";
  x.fillText("pokerjantaparty.com", pad, H - 50);
  return cv;
}

export async function shareRecap(g, button) {
  const label = button.textContent;
  button.disabled = true; button.textContent = "Making the picture…";
  try {
    const cv = await draw(g);
    const blob = await new Promise(r => cv.toBlob(r, "image/png"));
    const file = new File([blob], `poker-janta-party-${g.date}.png`, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Poker Janta Party", text: `Results for ${dateLabel(g.date)}: ${location.href}` });
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
  } catch (e) {
    if (e.name !== "AbortError") console.error(e);
  } finally {
    button.disabled = false; button.textContent = label;
  }
}
