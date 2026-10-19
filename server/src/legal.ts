// The privacy notice and terms an Alexa+ listing links to. Plain pages, written for the parents
// and carers who use the add-on, and kept true to what the code does.
const page = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · While You're Out</title>
<style>
  :root { color-scheme: light dark; --bg: #f6f3ec; --ink: #1d2433; --muted: #5b6474; --line: #d9d3c7; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0f1420; --ink: #eef1f6; --muted: #a8b2c4; --line: #2a3346; } }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.6 system-ui, -apple-system, 'Segoe UI', sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 48px 20px 80px; }
  h1 { font-size: 34px; line-height: 1.15; margin: 0 0 6px; }
  h2 { font-size: 20px; margin: 34px 0 8px; }
  p, li { color: var(--ink); } .muted { color: var(--muted); }
  ul { padding-left: 1.2em; } li { margin: 6px 0; }
  .box { border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; margin: 20px 0; }
  a { color: inherit; }
</style></head><body><main>${body}</main></body></html>`;

export const PRIVACY = page(
  'Privacy',
  `<h1>Privacy</h1><p class="muted">While You're Out · an Alexa+ add-on for whoever looks after your kids</p>
<div class="box"><b>In short:</b> the add-on keeps what the parents tell it about their home so a carer can be told it in their words. It is for the adults in the home (parents and the people they trust with their children); it is not made for children and never collects anything from them.</div>
<h2>What it keeps</h2>
<ul>
<li><b>What the parents write or say about their home:</b> routines, food and allergy notes, where things are kept, who to call, house rules, and tonight's plan.</li>
<li><b>The evening:</b> the questions a carer asks, the parents' answers, what was logged (dinner, bath, asleep), and any emergency steps taken, so the parents get a summary.</li>
<li><b>Recordings a parent chooses to make</b> (a goodnight message) and doorbell photos used for a door question.</li>
<li><b>Phones the parents connect</b> for notifications (a push subscription, not a phone number).</li>
</ul>
<h2>What it never does</h2>
<ul>
<li>It never stores codes, passwords or where the spare key is: a note containing one is refused.</li>
<li>It never says private details aloud: the home address is shown on the screen in an emergency, not spoken, and the parents' return time is never told to anyone.</li>
<li>Voice can't prove who is speaking, so voice only ever gets the carer's view; notes the parents mark private stay on their own phone.</li>
<li>It does not sell or share data, and does not use it for advertising.</li>
</ul>
<h2>Who processes it</h2>
<p>Safety rules (food, medicine, emergencies, secrets) run in our own code, never in an AI. The add-on uses an AI model only to read the parents' free-text notes and to translate for a carer who speaks another language; those requests contain only the text being read or translated. On the public demo, the simulated Alexa (standing in for Alexa+ itself) also uses a model to understand what is said to it.</p>
<h2>How long it is kept</h2>
<p>On the public demo, each visitor gets a private sample family held in memory only: it is removed after 3 hours unused and whenever the server restarts, and at most two recordings are kept per demo home. In a real home, "just for tonight" answers end with the evening, and parents can remove a recording, or wipe the whole home and start fresh, from their phone at any time.</p>
<h2>Contact</h2>
<p>Questions or deletion requests: open an issue at <a href="https://github.com/murthyroshan/while-youre-out">github.com/murthyroshan/while-youre-out</a>.</p>`,
);

export const TERMS = page(
  'Terms',
  `<h1>Terms of use</h1><p class="muted">While You're Out · an Alexa+ add-on for whoever looks after your kids</p>
<div class="box"><b>This device can't call 911.</b> In an emergency, call 911 (or your local emergency number) from your phone. The emergency guide shows the family's own plan and general safety steps; it is not a substitute for professional medical advice, and it does not provide emergency or life-saving services.</div>
<h2>What it is</h2>
<p>A guide for adults looking after someone else's children: it repeats what the parents have told it, asks the parents when it doesn't know, and keeps them informed. Answers about food and medicine are the parents' own words with a reminder to check with a parent or a healthcare professional; it never decides whether a food or medicine is safe.</p>
<h2>Your responsibilities</h2>
<ul>
<li>Parents are responsible for what they tell it, including allergy and medical information and emergency contacts.</li>
<li>Carers stay responsible for the children in their care and use their own judgement.</li>
</ul>
<h2>The public demo</h2>
<p>The demo uses a sample family and simulated devices (doorbell, smart home, payments). Nothing is charged and no real person is contacted. It is provided as is, without warranty, under the MIT license of the source code.</p>`,
);
