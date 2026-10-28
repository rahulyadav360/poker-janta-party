import { state, esc } from "./ui.js";
import { hideTip } from "./charts.js";
import home from "./views/home.js";
import leaderboard from "./views/leaderboard.js";
import { sessions, session } from "./views/sessions.js";
import { members, member } from "./views/members.js";
import hands from "./views/hands.js";
import hand from "./views/hand.js";
import records from "./views/records.js";
import rivalries from "./views/rivalries.js";
import honours from "./views/honours.js";
import join from "./views/join.js";

const app = document.getElementById("app");
const ROUTES = {
  "": home, leaderboard, sessions, session, members, member, hands, hand, "hall-of-fame": records, rivalries, honours, badges: honours,
  "how-to-play": join, rules: join, join,
  // links from the first version of the site
  games: sessions, game: session, players: members, player: member,
};
const NAV_OF = { rules: "how-to-play", join: "how-to-play", session: "sessions", game: "sessions", member: "members", player: "members", hand: "hands" };

let cleanup = null;
async function route(refresh = false) {
  hideTip();
  if (cleanup) { cleanup(); cleanup = null; }
  const [view = "", ...args] = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  const nav = NAV_OF[view] || view || "home";
  document.querySelectorAll("[data-nav]").forEach(a => {
    const on = a.dataset.nav === nav;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  const render = ROUTES[view];
  if (!render) { notFound(); return; }
  try {
    cleanup = (await render(app, ...args)) || null;
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="empty"><h2>Something went wrong</h2><p>${esc(err.message)}</p><a class="btn" href="#/">Back to Party HQ</a></div>`;
  }
  document.title = (app.dataset.title ? app.dataset.title + " · " : "") + "Poker Janta Party";
  delete app.dataset.title;
  if (!refresh) window.scrollTo(0, 0);
}

// While a session is live, pick up new data every 2 minutes and redraw in place. Not on a hand
// replay or the banker's book, where a redraw would lose your place or an unsaved entry.
const LIVE_POLL = 120000;
let livePoll = null;
function followLive() {
  if (livePoll || !state.data.games.some(g => g.live)) return;
  livePoll = setInterval(async () => {
    try {
      const r = await fetch(`data/stats.json?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      if (d.generated_at === state.data.generated_at) return;
      state.data = d;
      state.hands = {};
      showUpdated(d);
      const view = location.hash.replace(/^#\/?/, "").split("/")[0];
      if (!["hand", "bank"].includes(view)) route(true);
      if (!d.games.some(g => g.live)) { clearInterval(livePoll); livePoll = null; }
    } catch (e) { /* offline for a moment: try again next time */ }
  }, LIVE_POLL);
}

function showUpdated(d) {
  const updated = new Date(d.generated_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  document.getElementById("footer-meta").textContent = `${d.games.length} sessions · updated ${updated} IST`;
}

export function notFound() {
  app.innerHTML = `<div class="empty"><h2>That page isn't on the ballot</h2><p>The link may be from an older version of the site.</p><a class="btn primary" href="#/">Back to Party HQ</a></div>`;
}

function initTheme() {
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : !matchMedia("(prefers-color-scheme: light)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("pjp-theme", root.dataset.theme); } catch (e) { /* storage unavailable */ }
    route();  // charts read colours at draw time
  });
}

initTheme();
fetch(`data/stats.json?t=${Date.now()}`).then(r => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}).then(d => {
  state.data = d;
  document.getElementById("private-pill").hidden = !d.private;
  // the banker's book is local only: it exists in the private view (serve_private.py), not on the public site
  if (d.private) ROUTES.bank = (...a) => import("./views/bank.js").then(m => m.default(...a));
  showUpdated(d);
  window.addEventListener("hashchange", () => route());
  route();
  followLive();
}).catch(err => {
  app.innerHTML = `<div class="empty"><h2>Couldn't load the results</h2><p>Run <code>python3 scripts/build_stats.py</code>, then serve the <code>site</code> folder (<code>python3 -m http.server -d site</code>). (${esc(err.message)})</p></div>`;
});
