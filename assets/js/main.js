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

const app = document.getElementById("app");
const ROUTES = {
  "": home, leaderboard, sessions, session, members, member, hands, hand, "hall-of-fame": records, rivalries,
  // links from the first version of the site
  games: sessions, game: session, players: members, player: member,
};
const NAV_OF = { session: "sessions", game: "sessions", member: "members", player: "members", hand: "hands" };

let cleanup = null;
async function route() {
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
  window.scrollTo(0, 0);
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
fetch("data/stats.json").then(r => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}).then(d => {
  state.data = d;
  document.getElementById("private-pill").hidden = !d.private;
  // the banker's book is local only: it exists in the private view (serve_private.py), not on the public site
  if (d.private) ROUTES.bank = (...a) => import("./views/bank.js").then(m => m.default(...a));
  const updated = new Date(d.generated_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  document.getElementById("footer-meta").textContent = `${d.games.length} sessions · updated ${updated} IST`;
  window.addEventListener("hashchange", route);
  route();
}).catch(err => {
  app.innerHTML = `<div class="empty"><h2>Couldn't load the results</h2><p>Run <code>python3 scripts/build_stats.py</code>, then serve the <code>site</code> folder (<code>python3 -m http.server -d site</code>). (${esc(err.message)})</p></div>`;
});
