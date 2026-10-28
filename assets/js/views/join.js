// How to play: joining the table, house rules and the table assistant's chat commands
// (the same text as the WhatsApp group description; scripts/host_bot.py does what it says).
import { esc } from "../ui.js";

const COMMANDS = [
  ["/help", "List of commands"],
  ["/rules", "House rules"],
  ["/site", "Tonight's live results"],
  ["/start", "Restart a stopped game"],
  ["/resume", "Resume a paused game"],
  ["/topup 500", "Add chips to your stack"],
  ["/vouch name", "Let in a new signed-in player"],
  ["/sitout name", "Put an idle player on away (2 members needed)"],
  ["/kick name", "Remove a player (2 members needed; their chips stay on record)"],
  ["/seat", "Table full? Frees the seat of someone away and offline 10+ min"],
];

export default function join(app) {
  app.dataset.title = "How to play";
  app.innerHTML = `
    <header class="page-head">
      <span class="eyebrow">New here? Start here</span>
      <h1>How to play</h1>
      <p class="lede">Our games run on PokerNow. A table assistant seats players, approves rebuys and answers chat commands, so the game keeps going even when the host is away. Its messages start with “Host bot:”.</p>
    </header>
    <div class="grid-2 howto">
      <section class="panel">
        <div class="panel-head"><h2>1. Sign in to PokerNow first</h2></div>
        <p>Create a free account at <a href="https://www.pokernow.com" target="_blank" rel="noopener">pokernow.com</a> and stay signed in on every device you play from.</p>
        <p>Signed-in members are seated automatically. Guests have to wait for the host.</p>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>2. Joining the table</h2></div>
        <p>Open the table link, pick a seat, ask for chips.</p>
        <ul>
          <li><b>Minimum buy-in: 500.</b> Ask for less and you get 500.</li>
          <li><b>Left and came back?</b> You return with exactly what you left with.</li>
          <li><b>New here?</b> Any member can type <code>/vouch yourname</code> in the table chat to let you in.</li>
        </ul>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>3. Busted?</h2></div>
        <p>Take the rebuy PokerNow offers (from 500). Answer quickly: it expires in about 10 seconds.</p>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>4. Table settings</h2></div>
        <ul>
          <li>15-second decisions</li>
          <li>UTG straddle allowed</li>
          <li>Run it twice on request</li>
          <li>Rabbit hunting on</li>
        </ul>
      </section>
    </div>
    <section class="panel howto" style="margin-top:16px">
      <div class="panel-head"><h2>5. Chat commands</h2><p class="note">For signed-in members. Type them in the table chat.</p></div>
      <div class="table-wrap"><table>
        <thead><tr><th class="left">Command</th><th class="left">What it does</th></tr></thead>
        <tbody>${COMMANDS.map(([c, d]) => `<tr><td class="left"><code>${esc(c)}</code></td><td class="left wrap">${esc(d)}</td></tr>`).join("")}</tbody>
      </table></div>
    </section>`;
}
