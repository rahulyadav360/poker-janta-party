// Banker's book: a passphrase-locked page for tracking who owes the bank and who the bank owes.
//
// The book lives in the public repo as bank/book.json, encrypted with AES-256-GCM under a key
// derived from the banker's passphrase (PBKDF2-SHA256, 600k iterations). Decryption happens only
// in the browser. The decrypted book carries a fine-grained GitHub token (this repo, contents
// only) so the page can save changes from any device after unlocking.
//
// Balances: every member starts from their session results (1 chip = ₹1). Positive means the
// bank owes them; negative means they owe the bank. Entries move balances:
//   received  player paid the bank        balance += amount, bank cash += amount
//   paid      bank paid the player        balance -= amount, bank cash -= amount
//   transfer  player A paid player B      A += amount, B -= amount (settles on the bank's behalf)
//   adjust    correction / write-off      balance += signed amount
import { state, esc, name, dateLabel, avatar, sortableTable } from "../ui.js";

const REPO = "rahulyadav360/poker-janta-party";
const PATH = "bank/book.json";
const API = `https://api.github.com/repos/${REPO}/contents/${PATH}`;
const ITERATIONS = 600000;
const MIN_PASS = 12;
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const rupees = v => "₹" + Math.abs(Math.round(v)).toLocaleString("en-IN");
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const TYPES = { received: "Received from player", paid: "Paid to player", transfer: "Player paid player", adjust: "Adjustment" };

// ---------- crypto ----------
async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}
async function seal(book, key, salt) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(book)));
  return { v: 1, kdf: "PBKDF2-SHA256", iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}
async function open(envelope, key) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(envelope.iv) }, key, unb64(envelope.ct));
  return JSON.parse(dec.decode(pt));
}

// ---------- GitHub storage ----------
async function fetchEnvelope(token) {
  const r = await fetch(API + `?t=${Date.now()}`, { headers: { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Couldn't load the book from GitHub (HTTP ${r.status}).`);
  const j = await r.json();
  return { envelope: JSON.parse(dec.decode(unb64(j.content.replace(/\n/g, "")))), sha: j.sha };
}
async function putEnvelope(envelope, sha, token) {
  const r = await fetch(API, {
    method: "PUT",
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Update banker's book", content: b64(enc.encode(JSON.stringify(envelope))), ...(sha ? { sha } : {}) }),
  });
  if (r.status === 409 || r.status === 422) return { conflict: true };
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403
    ? "GitHub refused the save. The token may have expired: create a new one and update it under Settings."
    : `Saving to GitHub failed (HTTP ${r.status}).`);
  return { sha: (await r.json()).content.sha };
}

// ---------- session state ----------
const S = { key: null, salt: null, sha: null, book: null };
const SESSION_KEY = "pjp-bank-session";
async function rememberSession() {
  try {
    const raw = await crypto.subtle.exportKey("raw", S.key);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ k: b64(raw), s: b64(S.salt) }));
  } catch (e) { /* storage unavailable: stay unlocked only until reload */ }
}
async function restoreSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    if (!saved) return false;
    S.key = await crypto.subtle.importKey("raw", unb64(saved.k), "AES-GCM", true, ["encrypt", "decrypt"]);
    S.salt = unb64(saved.s);
    return true;
  } catch (e) { return false; }
}
function lock() {
  Object.assign(S, { key: null, salt: null, sha: null, book: null });
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
}

// Apply a change and save; on a conflict (saved elsewhere meanwhile) reload and re-apply.
async function commit(change) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const draft = structuredClone(S.book);
    change(draft);
    draft.updated_at = new Date().toISOString();
    const res = await putEnvelope(await seal(draft, S.key, S.salt), S.sha, draft.token);
    if (!res.conflict) { S.book = draft; S.sha = res.sha; return; }
    const fresh = await fetchEnvelope(S.book.token);
    S.book = await open(fresh.envelope, S.readKey || S.key);
    S.sha = fresh.sha;
  }
  throw new Error("Couldn't save because the book kept changing. Reload and try again.");
}

// ---------- accounting ----------
function sessionNets() {
  // {gameId: {date, nets: {person: net}}}
  const out = {};
  for (const g of state.data.games) out[g.game_id] = { date: g.date, nets: Object.fromEntries(g.players.map(p => [p.key, p.ledger.net])) };
  return out;
}
function accounts(book) {
  const sessions = sessionNets();
  const people = {};
  const P = k => (people[k] ||= { key: k, results: 0, received: 0, paid: 0, transfers: 0, adjust: 0, balance: 0 });
  for (const s of Object.values(sessions)) for (const [k, v] of Object.entries(s.nets)) { P(k).results += v; P(k).balance += v; }
  let cash = 0, adjustments = 0;
  for (const e of book.entries) {
    if (e.type === "received") { P(e.player).received += e.amount; P(e.player).balance += e.amount; cash += e.amount; }
    else if (e.type === "paid") { P(e.player).paid += e.amount; P(e.player).balance -= e.amount; cash -= e.amount; }
    else if (e.type === "transfer") { P(e.from).transfers += e.amount; P(e.from).balance += e.amount; P(e.to).transfers -= e.amount; P(e.to).balance -= e.amount; }
    else if (e.type === "adjust") { P(e.player).adjust += e.amount; P(e.player).balance += e.amount; adjustments += e.amount; }
  }
  const list = Object.values(people).map(p => ({ ...p, balance: Math.round(p.balance * 100) / 100 }));
  return {
    list, cash, adjustments, sessions,
    toCollect: list.filter(p => p.balance < 0).reduce((s, p) => s - p.balance, 0),
    toPay: list.filter(p => p.balance > 0).reduce((s, p) => s + p.balance, 0),
  };
}
function sessionStatus(book, gid, nets) {
  // settled when, for everyone in the session, entries tagged to it match their result
  const tagged = {};
  for (const e of book.entries.filter(e => e.session === gid)) {
    if (e.type === "received") tagged[e.player] = (tagged[e.player] || 0) - e.amount;
    if (e.type === "paid") tagged[e.player] = (tagged[e.player] || 0) + e.amount;
    if (e.type === "transfer") { tagged[e.from] = (tagged[e.from] || 0) - e.amount; tagged[e.to] = (tagged[e.to] || 0) + e.amount; }
    if (e.type === "adjust") tagged[e.player] = (tagged[e.player] || 0) - e.amount;
  }
  const open = Object.entries(nets).filter(([k, v]) => Math.abs(v - (tagged[k] || 0)) > 0.5);
  return { settled: open.length === 0, open: open.length };
}

// ---------- views ----------
const balancePill = b => b < -0.5 ? `<span class="pill owe">Owes you ${rupees(b)}</span>`
  : b > 0.5 ? `<span class="pill owed">You owe ${rupees(b)}</span>` : `<span class="pill even">Settled</span>`;
const memberOptions = (sel = "") => [...state.data.players].sort((a, b) => a.name.localeCompare(b.name))
  .map(p => `<option value="${esc(p.key)}" ${p.key === sel ? "selected" : ""}>${esc(p.name)}</option>`).join("");

export default async function bank(app) {
  app.dataset.title = "Banker's book";
  app.innerHTML = `<div class="skeleton"></div>`;
  if (S.book) return renderBook(app);
  let found;
  try { found = await fetchEnvelope(); } catch (e) { return error(app, e.message); }
  if (!found) return renderSetup(app);
  if (await restoreSession()) {
    try { S.book = await open(found.envelope, S.key); S.sha = found.sha; return renderBook(app); } catch (e) { lock(); }
  }
  renderLock(app, found);
}

function error(app, msg) {
  app.innerHTML = `<div class="empty"><h2>Banker's book</h2><p>${esc(msg)}</p><a class="btn" href="#/bank">Try again</a></div>`;
}

function renderLock(app, found) {
  app.innerHTML = `
    <section class="lock-card panel">
      <svg class="lock-chip" aria-hidden="true"><use href="#pjp-chip"/></svg>
      <span class="eyebrow">Banker only</span>
      <h1>Banker's book</h1>
      <p class="lede">Enter your passphrase to unlock. The book is encrypted, so it can only be read with the passphrase.</p>
      <form id="unlock" class="stack" autocomplete="off">
        <div class="field"><label for="pass">Passphrase</label><input class="input" id="pass" type="password" autocomplete="current-password" required></div>
        <button class="btn primary" type="submit">Unlock</button>
        <p class="note" id="lock-msg" role="status"></p>
      </form>
    </section>`;
  const form = document.getElementById("unlock"), msg = document.getElementById("lock-msg");
  document.getElementById("pass").focus();
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    msg.textContent = "Unlocking…";
    try {
      const salt = unb64(found.envelope.salt);
      const key = await deriveKey(document.getElementById("pass").value, salt);
      S.book = await open(found.envelope, key);
      Object.assign(S, { key, salt, sha: found.sha });
      await rememberSession();
      renderBook(app);
    } catch (e) {
      msg.textContent = "That passphrase didn't unlock the book. Check it and try again.";
    }
  });
}

function renderSetup(app) {
  app.innerHTML = `
    <section class="lock-card panel" style="max-width:640px">
      <svg class="lock-chip" aria-hidden="true"><use href="#pjp-chip"/></svg>
      <span class="eyebrow">One-time setup</span>
      <h1>Set up the banker's book</h1>
      <p class="lede">Choose a passphrase and connect a GitHub token so this page can save entries from any device.</p>
      <form id="setup" class="stack" autocomplete="off">
        <div class="field"><label for="p1">Passphrase (at least ${MIN_PASS} characters; four random words is ideal)</label><input class="input" id="p1" type="password" autocomplete="new-password" required minlength="${MIN_PASS}"></div>
        <div class="field"><label for="p2">Passphrase again</label><input class="input" id="p2" type="password" autocomplete="new-password" required></div>
        <div class="field"><label for="tok">GitHub token</label><input class="input" id="tok" type="password" required placeholder="github_pat_…"></div>
        <details class="note"><summary>How to create the token</summary>
          <ol style="margin:8px 0 0;padding-left:18px;display:grid;gap:4px">
            <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com → Settings → Fine-grained tokens → Generate new token</a>.</li>
            <li>Name it "Banker's book" and pick the longest expiration offered.</li>
            <li>Repository access: <strong>Only select repositories</strong> → <strong>poker-janta-party</strong>.</li>
            <li>Permissions → Repository → <strong>Contents: Read and write</strong>. Nothing else.</li>
            <li>Generate, copy it and paste it here. It's stored only inside the encrypted book.</li>
          </ol></details>
        <div class="field"><label for="upi">Your UPI ID (optional, used in payment reminders)</label><input class="input" id="upi" type="text" placeholder="name@bank"></div>
        <button class="btn primary" type="submit">Create the book</button>
        <p class="note" id="setup-msg" role="status"></p>
      </form>
    </section>`;
  document.getElementById("setup").addEventListener("submit", async ev => {
    ev.preventDefault();
    const msg = document.getElementById("setup-msg");
    const p1 = document.getElementById("p1").value, p2 = document.getElementById("p2").value;
    const token = document.getElementById("tok").value.trim();
    if (p1.length < MIN_PASS) return (msg.textContent = `The passphrase needs at least ${MIN_PASS} characters.`);
    if (p1 !== p2) return (msg.textContent = "The two passphrases don't match.");
    msg.textContent = "Checking the token…";
    const r = await fetch(`https://api.github.com/repos/${REPO}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok || !(await r.json()).permissions?.push) return (msg.textContent = "That token can't write to poker-janta-party. Check its repository access and Contents permission.");
    msg.textContent = "Encrypting and saving…";
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await deriveKey(p1, salt);
      const book = { version: 1, token, settings: { upi: document.getElementById("upi").value.trim() }, entries: [], created_at: new Date().toISOString() };
      const res = await putEnvelope(await seal(book, key, salt), null, token);
      if (res.conflict) throw new Error("A book already exists. Reload the page to unlock it.");
      Object.assign(S, { key, salt, sha: res.sha, book });
      await rememberSession();
      renderBook(app);
    } catch (e) { msg.textContent = e.message; }
  });
}

function renderBook(app) {
  const book = S.book, A = accounts(book);
  const sessions = state.data.games;
  app.innerHTML = `
    <header class="page-head split-head">
      <div style="display:grid;gap:8px"><span class="eyebrow">Banker only · 1 chip = ₹1</span><h1>Banker's book</h1>
        <p class="lede">Session results set what each member owes you or you owe them. Record every payment, payout and player-to-player settlement here.</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="b-settings">Settings</button><button class="btn" id="b-lock">Lock</button></div>
    </header>
    <div class="strip">
      <div><div class="k">To collect</div><div class="v neg">${rupees(A.toCollect)}</div><div class="s">${A.list.filter(p => p.balance < -0.5).length} members owe you</div></div>
      <div><div class="k">To pay out</div><div class="v pos">${rupees(A.toPay)}</div><div class="s">you owe ${A.list.filter(p => p.balance > 0.5).length} members</div></div>
      <div><div class="k">Cash with the bank</div><div class="v">${A.cash < 0 ? "−" : ""}${rupees(A.cash)}</div><div class="s">received minus paid out</div></div>
      <div><div class="k">Entries</div><div class="v">${book.entries.length}</div><div class="s">${book.updated_at ? "saved " + new Date(book.updated_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "none yet"}</div></div>
    </div>

    <section class="section split">
      <div class="panel">
        <div class="panel-head"><h2>Balances</h2><p class="note">Click a member to record a payment</p></div>
        <div id="bal-table"></div>
      </div>
      <div class="panel" id="entry-panel">
        <div class="panel-head"><h2>Record an entry</h2></div>
        <form id="entry" class="stack" autocomplete="off">
          <div class="seg" id="e-type" role="radiogroup" aria-label="Entry type">${Object.entries(TYPES).map(([k, v], i) => `<button type="button" data-t="${k}" class="${i === 0 ? "on" : ""}" role="radio" aria-checked="${i === 0}">${v.split(" ")[0]}${k === "transfer" ? " P2P" : ""}</button>`).join("")}</div>
          <p class="note" id="e-help"></p>
          <div class="field" data-for="player"><label for="e-player">Member</label><select class="select" id="e-player">${memberOptions()}</select></div>
          <div class="grid-2" data-for="transfer" hidden style="gap:10px">
            <div class="field"><label for="e-from">Who paid</label><select class="select" id="e-from">${memberOptions()}</select></div>
            <div class="field"><label for="e-to">Who received</label><select class="select" id="e-to">${memberOptions()}</select></div>
          </div>
          <div class="grid-2" style="gap:10px">
            <div class="field"><label for="e-amount">Amount (₹)</label><input class="input" id="e-amount" type="number" inputmode="decimal" step="1" required></div>
            <div class="field"><label for="e-date">Date</label><input class="input" id="e-date" type="date" value="${today()}" required></div>
          </div>
          <div class="grid-2" style="gap:10px">
            <div class="field"><label for="e-method">Method</label><select class="select" id="e-method"><option>UPI</option><option>Cash</option><option>Bank transfer</option><option>Other</option></select></div>
            <div class="field"><label for="e-session">For session (optional)</label><select class="select" id="e-session"><option value="">Not tied to a session</option>${sessions.map(g => `<option value="${g.game_id}">${dateLabel(g.date)}</option>`).join("")}</select></div>
          </div>
          <div class="field"><label for="e-note">Note</label><input class="input" id="e-note" type="text" placeholder="e.g. UPI ref 4321"></div>
          <button class="btn primary" type="submit">Save entry</button>
          <p class="note" id="e-msg" role="status"></p>
        </form>
      </div>
    </section>

    <section class="panel section">
      <div class="panel-head"><h2>Sessions</h2><p class="note">"Settle session" records a payment from every loser and a payout to every winner for that night. You can review before saving.</p></div>
      <div id="sess-table"></div>
    </section>

    <section class="panel section">
      <div class="panel-head"><h2>All entries</h2><p class="note">Newest first</p></div>
      <div id="entries"></div>
    </section>
    <div id="dialog-host"></div>`;

  // balances
  sortableTable(document.getElementById("bal-table"), [
    { key: "name", label: "Member", left: true, fmt: p => `<span class="person">${avatar(p.key, 26)}<span class="nm">${esc(name(p.key))}</span></span>`, sort: p => name(p.key).toLowerCase() },
    { key: "results", label: "Results", fmt: p => (p.results < 0 ? "−" : "+") + rupees(p.results), cls: p => p.results > 0 ? "pos" : p.results < 0 ? "neg" : "", sort: p => p.results },
    { key: "settled", label: "Paid / received", fmt: p => {
      const parts = [];
      if (p.received) parts.push(`in ${rupees(p.received)}`);
      if (p.paid) parts.push(`out ${rupees(p.paid)}`);
      if (p.transfers) parts.push(`P2P ${p.transfers > 0 ? "paid" : "got"} ${rupees(p.transfers)}`);
      if (p.adjust) parts.push(`adj ${p.adjust > 0 ? "+" : "−"}${rupees(p.adjust)}`);
      return parts.join(" · ") || '<span class="dim">–</span>';
    } },
    { key: "balance", label: "Balance", fmt: p => balancePill(p.balance), sort: p => p.balance },
    { key: "act", label: "", fmt: p => Math.abs(p.balance) > 0.5 ? `<button class="link-more" data-remind="${esc(p.key)}" type="button">${p.balance < 0 ? "Copy reminder" : "Copy note"}</button>` : "" },
  ], A.list.filter(p => Math.abs(p.balance) > 0.5 || p.received || p.paid || p.transfers || p.adjust || p.results), {
    sort: { key: "balance", dir: 1 },
    onRow: p => prefill(p.balance < 0 ? "received" : "paid", p.key, Math.abs(p.balance)),
  });
  document.querySelectorAll("[data-remind]").forEach(b => b.addEventListener("click", ev => {
    ev.stopPropagation();
    const p = A.list.find(x => x.key === b.dataset.remind);
    const upi = book.settings?.upi;
    const text = p.balance < 0
      ? `Hi ${name(p.key)}, your poker balance is ₹${Math.round(-p.balance).toLocaleString("en-IN")} to pay.${upi ? ` UPI: ${upi}` : ""} Thanks! (Poker Janta Party)`
      : `Hi ${name(p.key)}, I owe you ₹${Math.round(p.balance).toLocaleString("en-IN")} from poker. Sending it soon. (Poker Janta Party)`;
    copy(text, b);
  }));

  // entry form
  let type = "received";
  const help = {
    received: "A member paid you (their losses, or part of them).",
    paid: "You paid a member (their winnings, or part of them).",
    transfer: "One member paid another directly. This reduces what the payer owes you and what you owe the receiver.",
    adjust: "A correction. A positive amount means you owe them more (or they owe you less); negative means the opposite.",
  };
  const setType = t => {
    type = t;
    document.querySelectorAll("#e-type button").forEach(b => { b.classList.toggle("on", b.dataset.t === t); b.setAttribute("aria-checked", b.dataset.t === t); });
    document.querySelector('[data-for="player"]').hidden = t === "transfer";
    document.querySelector('[data-for="transfer"]').hidden = t !== "transfer";
    document.getElementById("e-help").textContent = help[t];
    document.getElementById("e-amount").min = t === "adjust" ? "" : "1";
  };
  document.querySelectorAll("#e-type button").forEach(b => b.addEventListener("click", () => setType(b.dataset.t)));
  setType("received");
  const prefill = (t, key, amount) => {
    setType(t);
    document.getElementById("e-player").value = key;
    document.getElementById("e-amount").value = Math.round(amount);
    document.getElementById("entry-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("e-amount").focus();
  };
  document.getElementById("entry").addEventListener("submit", async ev => {
    ev.preventDefault();
    const msg = document.getElementById("e-msg");
    const amount = Number(document.getElementById("e-amount").value);
    if (!amount || (type !== "adjust" && amount <= 0)) return (msg.textContent = "Enter an amount above zero.");
    const e = { id: uid(), type, amount, date: document.getElementById("e-date").value, method: document.getElementById("e-method").value,
      session: document.getElementById("e-session").value || null, note: document.getElementById("e-note").value.trim(), created_at: new Date().toISOString() };
    if (type === "transfer") {
      e.from = document.getElementById("e-from").value; e.to = document.getElementById("e-to").value;
      if (e.from === e.to) return (msg.textContent = "The payer and receiver must be different members.");
    } else e.player = document.getElementById("e-player").value;
    msg.textContent = "Saving…";
    try { await commit(b => b.entries.push(e)); renderBook(app); toast("Saved"); }
    catch (err) { msg.textContent = err.message; }
  });

  // sessions
  sortableTable(document.getElementById("sess-table"), [
    { key: "date", label: "Session", left: true, fmt: g => `<a href="#/session/${g.game_id}">${dateLabel(g.date)}</a>`, sort: g => g.date },
    { key: "collect", label: "To collect", fmt: g => rupees(g.players.filter(p => p.ledger.net < 0).reduce((s, p) => s - p.ledger.net, 0)) },
    { key: "pay", label: "To pay", fmt: g => rupees(g.players.filter(p => p.ledger.net > 0).reduce((s, p) => s + p.ledger.net, 0)) },
    { key: "status", label: "Status", fmt: g => {
      const st = sessionStatus(book, g.game_id, A.sessions[g.game_id].nets);
      return st.settled ? '<span class="pill even">Settled</span>' : `<span class="pill owe">${st.open} open</span>`;
    } },
    { key: "act", label: "", fmt: g => sessionStatus(book, g.game_id, A.sessions[g.game_id].nets).settled ? "" : `<button class="btn" type="button" data-settle="${g.game_id}">Settle session</button>` },
  ], sessions, { sort: { key: "date", dir: -1 } });
  document.querySelectorAll("[data-settle]").forEach(b => b.addEventListener("click", () => settleDialog(app, b.dataset.settle)));

  // entries
  const rows = [...book.entries].sort((a, b) => (b.date + b.created_at).localeCompare(a.date + a.created_at));
  const host = document.getElementById("entries");
  if (!rows.length) host.innerHTML = `<div class="empty"><p>No entries yet. Record a payment above, or use "Settle session".</p></div>`;
  else sortableTable(host, [
    { key: "date", label: "Date", left: true, fmt: e => dateLabel(e.date, { weekday: false }), sort: e => e.date + e.created_at },
    { key: "type", label: "Type", left: true, fmt: e => `<span class="tag">${TYPES[e.type]}</span>` },
    { key: "who", label: "Member", left: true, fmt: e => e.type === "transfer" ? `${esc(name(e.from))} → ${esc(name(e.to))}` : esc(name(e.player)) },
    { key: "amount", label: "Amount", fmt: e => `<strong>${e.amount < 0 ? "−" : ""}${rupees(e.amount)}</strong>`, sort: e => e.amount },
    { key: "method", label: "Method", left: true, fmt: e => esc(e.type === "adjust" ? "–" : e.method || "") },
    { key: "session", label: "Session", left: true, fmt: e => e.session ? dateLabel(state.data.games.find(g => g.game_id === e.session)?.date || "", { weekday: false }) : '<span class="dim">–</span>' },
    { key: "note", label: "Note", left: true, fmt: e => esc(e.note || "") },
    { key: "del", label: "", fmt: e => `<button class="link-more" type="button" data-del="${e.id}">Delete</button>` },
  ], rows, { sort: { key: "date", dir: -1 } });
  host.addEventListener("click", async ev => {
    const b = ev.target.closest("[data-del]");
    if (!b) return;
    if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Confirm delete"; b.classList.add("neg"); return; }
    b.textContent = "Deleting…";
    try { await commit(bk => { bk.entries = bk.entries.filter(x => x.id !== b.dataset.del); }); renderBook(app); toast("Deleted"); }
    catch (err) { b.textContent = err.message; }
  });

  document.getElementById("b-lock").addEventListener("click", () => { lock(); location.hash = "#/"; });
  document.getElementById("b-settings").addEventListener("click", () => settingsDialog(app));
}

function dialog(html) {
  const host = document.getElementById("dialog-host");
  host.innerHTML = `<div class="modal-back" role="dialog" aria-modal="true"><div class="modal panel">${html}</div></div>`;
  const close = () => { host.innerHTML = ""; };
  host.querySelector(".modal-back").addEventListener("click", e => { if (e.target.classList.contains("modal-back")) close(); });
  host.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", close));
  return { host, close };
}

function settleDialog(app, gid) {
  const g = state.data.games.find(x => x.game_id === gid);
  const already = new Set(S.book.entries.filter(e => e.session === gid).flatMap(e => [e.player, e.from, e.to]));
  const lines = g.players.filter(p => Math.abs(p.ledger.net) > 0.5 && !already.has(p.key));
  const { host, close } = dialog(`
    <div class="panel-head"><h2>Settle ${dateLabel(g.date)}</h2><button class="btn" data-close type="button">Close</button></div>
    <p class="note" style="margin-bottom:12px">Untick anyone who hasn't paid or been paid yet. Members who already have entries for this session are left out.</p>
    <div class="field" style="margin-bottom:12px"><label for="s-method">Method</label><select class="select" id="s-method"><option>UPI</option><option>Cash</option><option>Bank transfer</option><option>Other</option></select></div>
    <div class="settle-list">${lines.map(p => `<label class="settle-row"><input type="checkbox" checked data-k="${esc(p.key)}">
      <span>${esc(name(p.key))}</span><span class="${p.ledger.net < 0 ? "neg" : "pos"}">${p.ledger.net < 0 ? "paid you" : "you paid"} ${rupees(p.ledger.net)}</span></label>`).join("") || '<p class="dim">Nothing left to settle for this session.</p>'}</div>
    <div style="display:flex;gap:8px;margin-top:16px"><button class="btn primary" id="s-save" type="button" ${lines.length ? "" : "disabled"}>Save ${lines.length} entries</button></div>
    <p class="note" id="s-msg" role="status"></p>`);
  host.querySelectorAll("input[type=checkbox]").forEach(c => c.addEventListener("change", () => {
    host.querySelector("#s-save").textContent = `Save ${host.querySelectorAll("input[type=checkbox]:checked").length} entries`;
  }));
  host.querySelector("#s-save")?.addEventListener("click", async () => {
    const method = host.querySelector("#s-method").value;
    const keys = [...host.querySelectorAll("input[type=checkbox]:checked")].map(c => c.dataset.k);
    const now = new Date().toISOString();
    const entries = lines.filter(p => keys.includes(p.key)).map(p => ({
      id: uid(), type: p.ledger.net < 0 ? "received" : "paid", player: p.key, amount: Math.abs(p.ledger.net),
      date: today(), method, session: gid, note: "Session settlement", created_at: now,
    }));
    host.querySelector("#s-msg").textContent = "Saving…";
    try { await commit(b => b.entries.push(...entries)); close(); renderBook(app); toast(`Saved ${entries.length} entries`); }
    catch (err) { host.querySelector("#s-msg").textContent = err.message; }
  });
}

function settingsDialog(app) {
  const { host, close } = dialog(`
    <div class="panel-head"><h2>Settings</h2><button class="btn" data-close type="button">Close</button></div>
    <form id="set-form" class="stack" autocomplete="off">
      <div class="field"><label for="set-upi">Your UPI ID (shown in reminders)</label><input class="input" id="set-upi" value="${esc(S.book.settings?.upi || "")}"></div>
      <div class="field"><label for="set-tok">Replace GitHub token (leave empty to keep the current one)</label><input class="input" id="set-tok" type="password" placeholder="github_pat_…"></div>
      <div class="field"><label for="set-p1">New passphrase (leave empty to keep it)</label><input class="input" id="set-p1" type="password" autocomplete="new-password"></div>
      <div class="field"><label for="set-p2">New passphrase again</label><input class="input" id="set-p2" type="password" autocomplete="new-password"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" type="submit">Save settings</button><button class="btn" type="button" id="set-export">Download backup</button></div>
      <p class="note" id="set-msg" role="status">The backup is the decrypted book (including the token). Keep it somewhere private.</p>
    </form>`);
  host.querySelector("#set-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(S.book, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bankers-book-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  host.querySelector("#set-form").addEventListener("submit", async ev => {
    ev.preventDefault();
    const msg = host.querySelector("#set-msg");
    const p1 = host.querySelector("#set-p1").value, p2 = host.querySelector("#set-p2").value, tok = host.querySelector("#set-tok").value.trim();
    if (p1 && p1.length < MIN_PASS) return (msg.textContent = `The passphrase needs at least ${MIN_PASS} characters.`);
    if (p1 !== p2) return (msg.textContent = "The two passphrases don't match.");
    msg.textContent = "Saving…";
    try {
      if (p1) {
        S.readKey = S.key;  // the copy on GitHub is still under the old passphrase until this save lands
        S.salt = crypto.getRandomValues(new Uint8Array(16));
        S.key = await deriveKey(p1, S.salt);
      }
      await commit(b => { b.settings = { ...(b.settings || {}), upi: host.querySelector("#set-upi").value.trim() }; if (tok) b.token = tok; });
      delete S.readKey;
      await rememberSession();
      close(); renderBook(app); toast(p1 ? "Passphrase changed" : "Settings saved");
    } catch (err) { msg.textContent = err.message; }
  });
}

function copy(text, btn) {
  const done = () => { const t = btn.textContent; btn.textContent = "Copied"; setTimeout(() => { btn.textContent = t; }, 1500); };
  navigator.clipboard?.writeText(text).then(done).catch(() => window.prompt("Copy this message:", text));
}

function toast(text) {
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// exposed for scripts/test_bank.mjs
export const _internals = { deriveKey, seal, open, accounts, sessionStatus };
