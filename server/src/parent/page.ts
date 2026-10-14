// The parent's phone page. Served by the MCP server itself: no app to install.
export const PARENT_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>While You're Out · Parent</title>
<meta name="theme-color" content="#1f2933" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="While You're Out" />
<link rel="apple-touch-icon" href="/static/icon-192.png" />
<link rel="icon" href="/static/icon-192.png" />
<script>
  // The manifest carries the key so a home-screen copy opens signed in (iOS needs that for notifications).
  (function () {
    var k = new URLSearchParams(location.search).get('k') || '';
    var l = document.createElement('link');
    l.rel = 'manifest';
    l.href = '/parent/manifest.webmanifest?k=' + encodeURIComponent(k);
    document.head.appendChild(l);
  })();
</script>
<style>
  :root { --bg:#f6f2ec; --card:#fff; --ink:#1d2433; --muted:#667085; --green:#16815a; --red:#c81e28; --amber:#9a6200; --blue:#1f5fae; --line:#ebe5db; --shadow:0 1px 2px rgba(29,36,51,.05), 0 8px 24px rgba(29,36,51,.06); }
  * { box-sizing: border-box; }
  main, .card { overflow-wrap: anywhere; }
  body { margin: 0; font: 16px/1.45 "Amazon Ember", Inter, system-ui, -apple-system, "Segoe UI", sans-serif; background: var(--bg); color: var(--ink); padding-bottom: 88px; -webkit-font-smoothing: antialiased; }
  .hero { background: radial-gradient(520px 260px at 0% 0%, rgba(99,179,255,.28), transparent 70%), linear-gradient(160deg, #16233a, #0b1322); color: #fff; padding: 16px 16px 20px; border-radius: 0 0 26px 26px; }
  .hero .top { display: flex; align-items: center; justify-content: space-between; gap: 10px; max-width: 560px; margin: 0 auto; }
  .brand { display: flex; gap: 10px; align-items: center; min-width: 0; }
  .brand img { width: 38px; height: 38px; border-radius: 11px; flex: none; }
  .brand b { display: block; font-size: 17px; }
  .brand small { display: block; color: #b8c3d6; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .me { font-size: 13px; color: #b8c3d6; white-space: nowrap; }
  .me select { font: inherit; color: #fff; background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.22); border-radius: 999px; padding: 5px 10px; margin-left: 4px; }
  .me select option { color: #1d2433; }
  .live { max-width: 560px; margin: 16px auto 0; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12); border-radius: 20px; padding: 14px 16px; }
  .live #status { font-size: 14px; color: #cfd8e6; }
  .live .now { font-size: 25px; font-weight: 800; letter-spacing: -.01em; margin-top: 2px; line-height: 1.2; }
  .live .now small { display: block; font-size: 15px; font-weight: 600; color: #f7b955; margin-top: 2px; }
  .live .pills { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .lp { white-space: nowrap; font-size: 12.5px; font-weight: 600; padding: 4px 10px; border-radius: 999px; background: rgba(255,255,255,.12); color: #e6ecf5; }
  .lp.ok { background: rgba(61,220,151,.18); color: #7eecc0; }
  .lp.warn { background: rgba(247,185,85,.2); color: #ffd27a; }
  .lp.bad { background: rgba(255,90,95,.22); color: #ffb3b5; }
  main { padding: 4px 16px 24px; max-width: 560px; margin: 0 auto; }
  .tabpane { display: none; }
  body[data-tab=tonight] .tabpane[data-tab=tonight], body[data-tab=house] .tabpane[data-tab=house], body[data-tab=family] .tabpane[data-tab=family] { display: block; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 20px; padding: 16px; margin: 14px 0; box-shadow: var(--shadow); }
  .card > strong:first-child { display: block; font-size: 17px; margin: 0 0 2px; }
  h2.sec { font-size: 12.5px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 24px 6px 0; }
  .q { font-size: 19px; font-weight: 650; margin: 0 0 12px; line-height: 1.3; }
  .asker { font-size: 13px; color: var(--muted); margin: 0 0 4px; }
  .btns { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  button { font: inherit; font-weight: 600; padding: 12px 10px; border-radius: 14px; border: 1px solid var(--line); background: #fff; color: var(--ink); cursor: pointer; }
  button:active { transform: scale(.98); }
  button:disabled { opacity: .6; }
  button.ok { background: var(--green); color: #fff; border-color: var(--green); }
  button.no { color: var(--red); border-color: #f1b7ba; background: #fff7f7; }
  .scope { display: flex; gap: 14px; margin: 10px 0 0; color: var(--muted); font-size: 14px; }
  .alert { background: linear-gradient(160deg, #e0323b, #a5121a); color: #fff; border: 0; }
  .alert p { margin: 6px 0 0; }
  .alert a.call { display: block; text-align: center; margin-top: 12px; background: #fff; color: #a5121a; font-weight: 800; padding: 12px; border-radius: 14px; text-decoration: none; }
  .muted { color: var(--muted); font-size: 14px; }
  ul { padding-left: 18px; margin: 6px 0; }
  .urgent { display: inline-block; font-size: 12px; font-weight: 700; background: #fdecea; color: var(--red); padding: 3px 9px; border-radius: 999px; margin-bottom: 8px; }
  .always-note { display: none; margin: 8px 0 0; font-size: 14px; color: var(--amber); background: #fff4d6; padding: 6px 8px; border-radius: 8px; }
  .card:has(input[value=always]:checked) .always-note { display: block; }
  textarea { width: 100%; margin-top: 10px; font: inherit; padding: 10px; border-radius: 12px; border: 1px solid var(--line); background: #fcfbf8; }
  .upload { display: flex; gap: 8px; justify-content: center; align-items: center; padding: 16px; border: 2px dashed #d9d0c2; border-radius: 16px; margin-top: 12px; cursor: pointer; font-weight: 650; background: #fcfbf8; }
  .upload input { display: none; }
  .wide { width: 100%; margin-top: 10px; }
  .from { font-size: 12.5px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); margin: 18px 0 4px; }
  .pcard textarea.ptext { margin-top: 6px; }
  .chip { display: inline-block; font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 999px; background: #eef2f7; color: #334e68; margin-right: 6px; }
  .chip.safety { background: #fdecea; color: var(--red); }
  .warn { font-size: 13px; color: var(--amber); background: #fff4d6; padding: 6px 10px; border-radius: 10px; margin-top: 8px; }
  .conflict { background: #fff7e6; border: 1px solid #f0c36d; border-radius: 12px; padding: 10px; margin-top: 8px; font-size: 14px; }
  .pbtns { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; margin-top: 10px; }
  .perr { color: var(--red); font-size: 14px; margin-top: 6px; }
  .en { font-size: 14px; color: var(--muted); margin: -6px 0 10px; }
  .notify { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
  .notify p { margin: 4px 0 0; }
  .tl { list-style: none; padding: 0; margin: 8px 0 0; }
  .tl li { display: grid; grid-template-columns: 74px 1fr; gap: 8px; padding: 8px 0; border-top: 1px solid var(--line); font-size: 15px; }
  .tl li:first-child { border-top: 0; }
  .tl .t { color: var(--muted); font-variant-numeric: tabular-nums; }
  .field { display: block; margin: 12px 0 0; font-size: 14px; color: var(--muted); }
  .field input, .field select, .row input, .row select { display: block; width: 100%; font: inherit; color: var(--ink); padding: 10px; border-radius: 12px; border: 1px solid var(--line); background: #fcfbf8; margin-top: 4px; }
  .row { border: 1px solid var(--line); border-radius: 16px; padding: 12px; margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #fff; }
  .row .full { grid-column: 1 / -1; }
  .row label { font-size: 13px; color: var(--muted); }
  .row .tools { grid-column: 1 / -1; display: flex; gap: 6px; justify-content: flex-end; align-items: center; }
  .row .tools button { padding: 7px 11px; font-size: 14px; }
  .row .tools .grow { flex: 1; font-size: 13px; color: var(--muted); }
  .row .tools label { display: flex; gap: 6px; align-items: center; }
  .row .tools label input { display: inline; width: auto; margin: 0; }
  .order { display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: #eef2f7; color: #334e68; font-size: 13px; font-weight: 800; }
  .ferr { color: var(--red); font-size: 14px; min-height: 1em; margin: 10px 0 0; }
  .banner { background: #fff8e6; border-color: #f0d08a; }
  .danger button { border-color: #f1b7ba; color: var(--red); background: #fff; }
  .danger button.armed { background: var(--red); color: #fff; }
  .inc { padding: 18px; }
  .inc-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .inc-head .elapsed { font-variant-numeric: tabular-nums; opacity: .85; font-size: 14px; }
  .inc-desc { font-size: 15px; opacity: .92; }
  .inc-now { background: #fff; color: #7a0b10; border-radius: 14px; padding: 12px 14px; margin-top: 12px; font-size: 18px; font-weight: 700; line-height: 1.3; }
  .inc-now small { display: block; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #b3141b; margin-bottom: 4px; }
  .inc-timer { display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,.22); border-radius: 14px; padding: 10px 14px; margin-top: 10px; font-weight: 700; }
  .inc-timer b { font-size: 24px; font-variant-numeric: tabular-nums; }
  .inc-timer.up { background: #fff3c4; color: #7a4a00; animation: pulse 1s infinite; }
  .inc-steps { margin: 12px 0 0; padding-left: 20px; font-size: 14px; }
  .inc-steps li { margin: 4px 0; opacity: .7; }
  .inc-steps li.done { text-decoration: line-through; opacity: .55; }
  .inc-steps li.now { opacity: 1; font-weight: 700; }
  .inc-otw { background: rgba(255,255,255,.16); border-radius: 12px; padding: 8px 12px; font-weight: 600; }
  .inc-label { margin: 14px 0 6px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; opacity: .85; font-weight: 700; }
  .inc .btns button { background: rgba(255,255,255,.95); color: #8a0d14; border: 0; }
  .inc-log { list-style: none; padding: 0; margin: 12px 0 0; font-size: 13px; opacity: .9; }
  .inc-log li { padding: 4px 0; border-top: 1px solid rgba(255,255,255,.18); }
  .inc-log span { font-variant-numeric: tabular-nums; margin-right: 6px; opacity: .8; }
  .inc.over { border-color: #b7e4cf; background: #f1fbf6; }
  .inc.over .inc-log li { border-color: var(--line); }
  .inc-addr { font-size: 13px; opacity: .85; margin: 10px 0 0; }
  @keyframes pulse { 50% { opacity: .65; } }
  .gn-item { border-top: 1px solid var(--line); padding: 10px 0; }
  .gn-item:first-child { border-top: 0; }
  .gn-item .gn-meta { display: flex; justify-content: space-between; gap: 8px; align-items: center; font-size: 14px; }
  .gn-item audio, .gn-item video, #gnDraftMedia audio, #gnDraftMedia video { width: 100%; margin-top: 6px; border-radius: 12px; }
  .gn-item video, #gnDraftMedia video, #gnPreview { max-height: 260px; background: #000; }
  .gn-rec { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
  #gnPreview { width: 100%; border-radius: 14px; margin-top: 10px; }
  .gn-timer { display: flex; align-items: center; gap: 8px; margin: 8px 0 0; }
  .gn-timer .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--red); animation: pulse 1s infinite; }
  .gn-timer button { margin-left: auto; padding: 8px 14px; }
  .gn-upload { display: block; margin-top: 10px; }
  .gn-upload input { font-size: 13px; }
  .doorcam { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 14px; margin: 0 0 12px; background: #111; }
  .vlist { list-style: none; padding: 0; margin: 10px 0 0; }
  .vlist li { display: flex; gap: 10px; align-items: center; padding: 10px 0; border-top: 1px solid var(--line); }
  .vlist li:first-child { border-top: 0; }
  .vlist .vi { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: #eef4fc; flex: none; }
  .vlist .vt { flex: 1; min-width: 0; }
  .vlist .vt b { display: block; }
  .vlist .vt small { color: var(--muted); }
  .vlist button { padding: 6px 10px; font-size: 13px; }
  .vadd { display: grid; grid-template-columns: 1fr 1fr auto auto; gap: 6px; margin-top: 10px; }
  .vadd input, .vadd select { min-width: 0; font: inherit; padding: 9px; border-radius: 12px; border: 1px solid var(--line); background: #fcfbf8; }
  @media (max-width: 420px) { .vadd { grid-template-columns: 1fr 1fr; } }
  .switch { display: flex; align-items: center; gap: 10px; margin: 10px 0; font-size: 15px; }
  .switch input { width: 20px; height: 20px; accent-color: var(--green); }
  nav.tabs { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; display: flex; justify-content: center; gap: 4px; background: rgba(255,255,255,.95); backdrop-filter: blur(10px); border-top: 1px solid var(--line); padding: 6px 8px calc(8px + env(safe-area-inset-bottom)); }
  nav.tabs button { flex: 0 1 150px; border: 0; background: none; display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 12px; color: var(--muted); padding: 6px; position: relative; border-radius: 12px; }
  nav.tabs svg { width: 24px; height: 24px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  nav.tabs button[aria-selected=true] { color: var(--blue); background: #eef4fc; }
  nav.tabs .badge { position: absolute; top: 2px; left: calc(50% + 6px); background: var(--red); color: #fff; font-size: 11px; font-weight: 700; min-width: 18px; height: 18px; border-radius: 999px; display: grid; place-items: center; padding: 0 5px; }
  nav.tabs .badge:empty { display: none; }
</style>
</head>
<body data-tab="tonight">
<header class="hero">
  <div class="top">
    <div class="brand"><img src="/static/icon-192.png" alt=""><div><b>While You're Out</b><small id="household">Your home</small></div></div>
    <label class="me">Answering as <select id="me"></select></label>
  </div>
  <section class="live" aria-live="polite">
    <div id="status">Connecting…</div>
    <div class="now" id="liveNow"></div>
    <div class="pills" id="livePills"></div>
  </section>
</header>
<main>
  <div class="tabpane" data-tab="tonight">
    <div id="emergency"></div>
    <div id="setupBanner"></div>
    <div id="questions"></div>
    <section class="card notify" id="notify" hidden></section>
    <div id="debrief"></div>
    <section class="card" id="visitors">
      <strong>Expected tonight</strong>
      <p class="muted">Who might come to the door. When the doorbell rings, Alexa checks this list; anyone else and the sitter is told not to open, and you get the doorbell photo.</p>
      <ul class="vlist" id="vlist"></ul>
      <div class="vadd">
        <input id="vName" maxlength="60" placeholder="Who? e.g. Nani, pizza">
        <input id="vWhen" maxlength="40" placeholder="When? e.g. around 7">
        <select id="vKind"><option value="person">Person</option><option value="delivery">Delivery</option></select>
        <button id="vAdd">Add</button>
      </div>
      <p class="perr" id="vErr"></p>
    </section>
    <section class="card" id="goodnight">
      <strong>Goodnight message 💛</strong>
      <p class="muted">Record a few words before you go. The Echo Show plays it at lights out, or when the sitter says your child is missing you.</p>
      <div id="gnList"></div>
      <div class="gn-rec">
        <button id="gnVoice">🎙 Record voice</button><button id="gnVideo">🎥 Record video</button>
      </div>
      <div id="gnLive" hidden><video id="gnPreview" muted playsinline></video><p class="gn-timer"><span class="dot"></span><b id="gnTime">0:00</b> recording… <button id="gnStop" class="no">Stop</button></p></div>
      <div id="gnDraft" hidden>
        <div id="gnDraftMedia"></div>
        <label class="field">For<select id="gnFor"></select></label>
        <label class="field">Play it<select id="gnWhen"><option value="bedtime">At lights out</option><option value="missing">If they're missing us</option><option value="any">Either</option></select></label>
        <label class="field">Words to show on screen (optional)<input id="gnCaption" maxlength="160" placeholder="Goodnight Maya, sweet dreams"></label>
        <div class="pbtns"><button class="ok" id="gnSave">Save message</button><button id="gnDiscard">Discard</button></div>
      </div>
      <label class="muted gn-upload">or upload a recording <input type="file" id="gnFile" accept="audio/*,video/*"></label>
      <p class="perr" id="gnErr"></p>
    </section>
    <div class="card" id="busy"></div>
    <div class="card"><strong>Tonight so far</strong><div id="log" class="muted">Nothing logged yet.</div></div>
  </div>
  <div class="tabpane" data-tab="house">
    <section class="card" id="teach">
      <strong>Teach the house</strong>
      <p class="muted">Snap the fridge note, upload the doctor's plan, or paste a WhatsApp message. Nothing is used until you confirm it, and codes or passwords are never stored.</p>
      <label class="upload">📷 Photo or PDF<input type="file" id="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf"></label>
      <textarea id="paste" rows="3" placeholder="Or paste a message or note here…"></textarea>
      <button id="readText" class="ok wide">Read it</button>
      <p id="teachStatus" class="muted" aria-live="polite"></p>
    </section>
    <div id="proposals"></div>
    <section class="card">
      <strong>Suggestions from your past answers</strong>
      <p class="muted">When a sitter asks something small you've answered before, Alexa can tell them how you usually answer. It never decides for you, and never for food, medicine or safety.</p>
      <div id="shadow"></div>
    </section>
  </div>
  <div class="tabpane" data-tab="family">
    <section class="card" id="family">
      <strong>Your family</strong>
      <p class="muted">Who Alexa looks after, who to call and in what order, and the address read out in an emergency. Allergies are saved in your words and checked before every food answer.</p>
      <label class="field">Household name<input id="fName" maxlength="80" placeholder="The Sharma family"></label>
      <label class="field">Home address (read out to 911)<input id="fAddress" maxlength="200" placeholder="42 Maple Street, Apt 3B, Seattle, WA"></label>
      <label class="field">Time zone<select id="fTz"></select></label>
      <p class="from">Children and pets</p>
      <div id="fMembers"></div>
      <div class="pbtns"><button data-add="child">+ Child</button><button data-add="pet">+ Pet</button></div>
      <p class="from">Who to call, in order</p>
      <p class="muted">Questions go to the first person, then the next if nobody answers. Doctors are shown to paramedics but never asked questions.</p>
      <div id="fContacts"></div>
      <div class="pbtns"><button data-add="contact">+ Contact</button></div>
      <p class="ferr" id="fErr" aria-live="polite"></p>
      <button class="ok wide" id="fSave">Save family</button>
      <p class="from">Start over</p>
      <div class="pbtns danger">
        <button data-reset="demo">Reset to the demo family</button>
        <button data-reset="fresh">Start fresh with my family</button>
      </div>
      <p class="muted" id="resetNote">Clears tonight, past evenings, messages and saved rules. Tap again to confirm.</p>
    </section>
  </div>
</main>
<nav class="tabs" role="tablist">
  <button role="tab" data-tabbtn="tonight" aria-selected="true"><svg viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>Tonight<span class="badge" id="badgeTonight"></span></button>
  <button role="tab" data-tabbtn="house" aria-selected="false"><svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/></svg>House<span class="badge" id="badgeHouse"></span></button>
  <button role="tab" data-tabbtn="family" aria-selected="false"><svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>Family</button>
</nav>
<script>
  var params = new URLSearchParams(location.search);
  var key = params.get('k') || '';
  var me = params.get('as') || '';
  try { me = me || localStorage.getItem('wyo.me') || ''; } catch (e) {}
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
  var houseTz = undefined; // set from the server: times are shown in the household's time zone
  function time(iso){
    var d = new Date(iso);
    if (isNaN(d)) return '';
    try { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: houseTz }); }
    catch (e) { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  }
  var sel = document.getElementById('me');
  sel.addEventListener('change', function () { me = sel.value; try { localStorage.setItem('wyo.me', me); } catch (e) {} });
  var parentsShown = null;
  async function load() {
    var r;
    try { r = await fetch('/parent/api/state?k=' + encodeURIComponent(key)); } catch (e) { document.getElementById('status').textContent = 'Offline, retrying…'; return; }
    if (!r.ok) { document.getElementById('status').textContent = 'Not authorised'; return; }
    var s = await r.json();
    houseTz = s.timezone || undefined;
    if (s.parents.join('|') !== parentsShown) {
      parentsShown = s.parents.join('|');
      if (s.parents.indexOf(me) < 0) me = s.parents[0] || 'Parent';
      sel.innerHTML = (s.parents.length ? s.parents : ['Parent']).map(function (p) { return '<option' + (p === me ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('');
    }
    var tb = s.teachback;
    document.getElementById('status').textContent = s.handoff ? (s.handoff.carer_name + ' is looking after things' + (s.handoff.started_at ? ' · since ' + time(s.handoff.started_at) : '')) : 'No one is babysitting right now';
    renderLive(s, tb);
    var mKey = JSON.stringify(s.messages);
    if (mKey !== lastMessages) { lastMessages = mKey; renderMessages(s.messages || []); }
    var vKey = JSON.stringify(s.visitors);
    if (vKey !== lastVisitors) { lastVisitors = vKey; renderVisitors(s.visitors || []); }
    document.getElementById('badgeTonight').textContent = s.questions.length ? String(s.questions.length) : '';
    // Redraw only when something changed (not every second the clock moves), so buttons stay tappable.
    var incKey = s.incident ? JSON.stringify(Object.assign({}, s.incident, { elapsed_seconds: 0, timers: s.incident.timers.map(function (t) { return Object.assign({}, t, { remaining_seconds: 0 }); }) })) : '';
    if (incKey !== lastIncident) { lastIncident = incKey; incReceived = Date.now(); document.getElementById('emergency').innerHTML = s.incident ? incidentCard(s.incident) : ''; tickIncident(); }
    if (!s.incident) document.getElementById('emergency').innerHTML = s.emergency ? '<div class="card alert"><strong>Emergency reported · ' + esc(time(s.emergency.at)) + '</strong><p>' + esc(s.emergency.description) + '</p><p>Every contact has been alerted. Call ' + esc(s.handoff ? s.handoff.carer_name : 'the carer') + ' now.</p></div>' : '';
    var dKey = JSON.stringify([s.debrief && s.debrief.handoff_id, s.debrief && s.debrief.rule_suggestions.length, s.shopping, s.payment && s.payment.status]);
    if (dKey !== lastDebrief) { lastDebrief = dKey; renderDebrief(s); }
    var busyKey = String(s.busy_until);
    if (busyKey !== lastBusy) {
      lastBusy = busyKey;
      document.getElementById('busy').innerHTML = s.busy_until
        ? '<strong>Urgent questions only</strong> until ' + esc(s.busy_until) + '<div class="pbtns"><button data-busy="0">I\\'m free now</button></div>'
        : '<strong>Busy?</strong> <span class="muted">Only urgent questions will reach you.</span><div class="pbtns"><button data-busy="60">1 hour</button><button data-busy="120">2 hours</button><button data-busy="180">3 hours</button></div>';
      lastQKey = null;
    }
    var shadowKey = JSON.stringify(s.shadow);
    if (shadowKey !== lastShadow) {
      lastShadow = shadowKey;
      var names = { screen: 'TV and screens', play: 'Play', bedtime: 'Staying up and bedtime extras' };
      document.getElementById('shadow').innerHTML = Object.keys(s.shadow).map(function (t) {
        return '<label style="display:block;margin:6px 0"><input type="checkbox" data-shadow="' + t + '"' + (s.shadow[t] ? ' checked' : '') + '> ' + esc(names[t] || t) + '</label>';
      }).join('');
    }
    // Only redraw questions when the set changes, so typing and choices aren't wiped by polling.
    var qKey = s.questions.map(function (q) { return q.id; }).join(',');
    if (qKey !== lastQKey) { lastQKey = qKey; renderQuestions(s); }
    document.getElementById('setupBanner').innerHTML = s.parents.length ? '' :
      '<div class="card banner"><strong>Set up your family to start</strong><p class="muted">Add who Alexa looks after and who to call. It takes a minute.</p><button class="ok" id="openFamily">Set up now</button></div>';
    document.getElementById('log').innerHTML = s.log.length ? '<ul>' + s.log.map(function (e) { return '<li>' + esc(time(e.at)) + ' ' + esc(e.text) + '</li>'; }).join('') + '</ul>' : 'Nothing logged yet.';
  }
  var lastQKey = null, lastBusy = null, lastShadow = null, lastDebrief = null;
  function renderDebrief(s) {
    var d = s.debrief;
    if (!d) { document.getElementById('debrief').innerHTML = ''; return; }
    var h = '<div class="card"><strong>Last night with ' + esc(d.carer) + '</strong>';
    if (d.insights.length) h += '<ul>' + d.insights.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>';
    if (d.timeline.length) h += '<p class="from">Timeline</p><ul>' + d.timeline.map(function (e) { return '<li>' + esc(time(e.at)) + ' ' + esc(e.text) + '</li>'; }).join('') + '</ul>';
    if (d.rule_suggestions.length) {
      h += '<p class="from">Make these house rules?</p>' + d.rule_suggestions.map(function (r) {
        return '<div class="conflict">“' + esc(r.text) + '” <br>' + esc(r.by) + ': ' + esc(r.answer) + '<div class="pbtns"><button class="ok" data-save-rule="' + r.question_id + '">Save as a house rule</button></div></div>';
      }).join('');
    }
    if (d.supplies.length) {
      h += '<p class="from">Running low</p>' + d.supplies.map(function (item) {
        var added = (s.shopping || []).indexOf(item) >= 0;
        return '<div class="pbtns" style="grid-template-columns:1fr auto;align-items:center"><span>' + esc(item) + '</span>' +
          (added ? '<span class="muted">On your shopping list ✓</span>' : '<button data-shop="' + esc(item) + '">Add to shopping list</button>') + '</div>';
      }).join('');
    }
    var pay = s.payment;
    h += pay && pay.status === 'paid' && pay.carer === d.carer
      ? '<p class="from">Paid</p><p>' + esc(d.carer) + ' was paid $' + (pay.total_cents / 100).toFixed(pay.total_cents % 100 ? 2 : 0) + ' ✓ <span class="muted">(demo payment)</span></p>'
      : '<div class="pbtns"><button class="ok" data-pay="1">Pay ' + esc(d.carer) + '</button></div>';
    document.getElementById('debrief').innerHTML = h + '</div>';
  }
  document.addEventListener('click', async function (e) {
    var save = e.target.closest('button[data-save-rule]');
    var shop = e.target.closest('button[data-shop]');
    if (!save && !shop) return;
    (save || shop).disabled = true;
    if (save) await fetch('/parent/api/save-rule', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: key, question_id: Number(save.dataset.saveRule) }) });
    if (shop) await fetch('/parent/api/shopping', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: key, item: shop.dataset.shop }) });
    lastDebrief = null;
    load();
  });
  document.addEventListener('click', async function (e) {
    var b = e.target.closest('button[data-busy]');
    if (!b) return;
    await fetch('/parent/api/busy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: key, minutes: Number(b.dataset.busy) }) });
    lastBusy = null;
    load();
  });
  document.addEventListener('change', async function (e) {
    var c = e.target.closest('input[data-shadow]');
    if (!c) return;
    await fetch('/parent/api/shadow', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: key, topic: c.dataset.shadow, on: c.checked }) });
  });
  function renderQuestions(s) {
    // In busy mode, small questions are grouped under one quiet heading.
    var urgent = s.questions.filter(function (q) { return q.urgency === 'urgent' || !s.busy_until; });
    var waiting = s.busy_until ? s.questions.filter(function (q) { return q.urgency !== 'urgent'; }) : [];
    document.getElementById('questions').innerHTML = urgent.map(questionCard).join('') +
      (waiting.length ? '<p class="from">Waiting until you\\'re free (' + waiting.length + ')</p>' + waiting.map(questionCard).join('') : '');
    function questionCard(q) {
      return '<div class="card" data-id="' + q.id + '">' + (q.urgency === 'urgent' ? '<span class="urgent">Urgent</span>' : '') +
        '<p class="asker">' + esc(s.handoff ? s.handoff.carer_name : 'The sitter') + ' asks · ' + esc(time(q.asked_at)) + '</p><p class="q">“' + esc(q.text) + '”</p>' +
        (q.text_english ? '<p class="en">In English: “' + esc(q.text_english) + '”</p>' : '') +
        (q.shopping_item
          ? '<div class="btns"><button class="ok" data-a="Yes, add it to the list.">Add to list</button><button class="no" data-a="Not now.">Not now</button></div>'
          : q.door_snapshot
          ? '<img class="doorcam" src="' + esc(q.door_snapshot) + '" alt="Doorbell camera photo">' +
            '<div class="btns"><button class="ok" data-a="It\\'s fine, you can let them in.">Let them in</button><button class="no" data-a="Don\\'t open the door. I\\'ll call you.">Don\\'t open</button><button data-a="Please call me.">Call me</button></div>'
          : '<div class="btns"><button class="ok" data-a="Yes, that\\'s fine.">Approve</button><button class="no" data-a="No, please don\\'t.">Deny</button><button data-a="Please call me.">Call me</button></div>') +
        '<textarea placeholder="Or type an answer…"></textarea>' +
        (q.urgency === 'urgent'
          ? '<input type="radio" name="s' + q.id + '" value="tonight" checked hidden><p class="muted">Food, medicine and safety answers apply to tonight only.</p></div>'
          : '<div class="scope"><label><input type="radio" name="s' + q.id + '" value="tonight" checked> Just tonight</label><label><input type="radio" name="s' + q.id + '" value="always"> Always</label></div>' +
            '<p class="always-note">Your answer will be saved as a house rule for every future handoff.</p></div>');
    }
  }
  document.addEventListener('click', async function (e) {
    var b = e.target.closest('button[data-a]');
    if (!b) return;
    var card = b.closest('.card');
    var typed = card.querySelector('textarea').value.trim();
    var scope = card.querySelector('input[type=radio]:checked').value;
    b.disabled = true;
    try {
      await fetch('/parent/api/answer', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ k: key, id: Number(card.dataset.id), answer: typed || b.dataset.a, scope: scope, by: me }) });
    } catch (err) { b.disabled = false; }
    lastQKey = null; // redraw: the question was answered here or already closed elsewhere
    load();
  });
  // ---------- Teach the house (House Brain) ----------
  var lastPKey = null;
  var teachStatus = document.getElementById('teachStatus');
  var KIND = { fact: 'Rule', location: 'Where things are', plan_step: 'Emergency plan step', contact: 'Contact' };
  async function loadProposals() {
    var r;
    try { r = await fetch('/parent/api/proposals?k=' + encodeURIComponent(key)); } catch (e) { return; }
    if (!r.ok) return;
    var s = await r.json();
    if (!s.ai_available) teachStatus.textContent = 'Reading notes needs a Gemini key on the server.';
    var pKey = s.proposals.map(function (p) { return p.id; }).join(',');
    if (pKey === lastPKey) return;
    lastPKey = pKey;
    renderProposals(s);
  }
  function renderProposals(s) {
    var byImport = {};
    s.proposals.forEach(function (p) { (byImport[p.import_id] = byImport[p.import_id] || []).push(p); });
    var html = '';
    s.imports.forEach(function (imp) {
      if (!imp || !byImport[imp.id]) return;
      html += '<p class="from">From: ' + esc(imp.label) + ' · ' + esc(imp.author) + '</p>';
      if (imp.dropped_secrets) html += '<p class="warn">Left out ' + imp.dropped_secrets + ' code or password' + (imp.dropped_secrets > 1 ? 's' : '') + '. Those are never stored.</p>';
      byImport[imp.id].forEach(function (p) { html += proposalCard(p); });
    });
    document.getElementById('proposals').innerHTML = html;
    document.getElementById('badgeHouse').textContent = s.proposals.length ? String(s.proposals.length) : '';
  }
  function proposalCard(p) {
    var label = p.kind === 'fact' ? (p.category || 'rule') : KIND[p.kind];
    var head = (p.kind === 'location' ? esc(p.item) + ': ' : p.kind === 'contact' ? esc(p.item) + ' · ' + esc(p.extra) + ' · ' : '');
    var h = '<div class="card pcard" data-pid="' + p.id + '" data-orig="' + esc(p.text) + '">' +
      '<span class="chip' + (p.risk === 'safety' ? ' safety' : '') + '">' + esc(label) + '</span>' +
      (head ? '<div><strong>' + head + '</strong></div>' : '') +
      '<textarea class="ptext" rows="2">' + esc(p.text) + '</textarea>' +
      (p.english ? '<div class="en">In English: ' + esc(p.english) + '</div>' : '') +
      (p.confidence < 0.75 ? '<div class="warn">The handwriting was hard to read. Please check this one.</div>' : '');
    var isConflict = p.conflict_fact_id || p.conflict_reason;
    if (isConflict) {
      h += '<div class="conflict">' + (p.conflict_text ? 'Saved now: “' + esc(p.conflict_text) + '”<br>' : '') + esc(p.conflict_reason || '') + '</div>' +
        '<div class="pbtns"><button class="ok" data-p="accept" data-res="replace">Use the new one</button>' +
        (p.kind === 'fact' ? '<button data-p="accept" data-res="keep_both">Keep both</button>' : '') +
        '<button class="no" data-p="accept" data-res="keep_old">Keep the old one</button></div>';
    } else {
      h += '<div class="pbtns"><button class="ok" data-p="accept">Add</button><button class="no" data-p="discard">Discard</button></div>';
    }
    return h + '<div class="perr"></div></div>';
  }
  document.addEventListener('click', async function (e) {
    var b = e.target.closest('button[data-p]');
    if (!b) return;
    var card = b.closest('.pcard');
    var text = card.querySelector('.ptext').value.trim();
    var body = { k: key, action: b.dataset.p, by: me };
    if (b.dataset.res) body.resolution = b.dataset.res;
    if (text !== card.dataset.orig) body.text = text;
    b.disabled = true;
    var r = await fetch('/parent/api/proposals/' + card.dataset.pid, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(function () { return null; });
    if (!r || !r.ok) {
      var err = r ? (await r.json().catch(function () { return {}; })).error : 'Offline. Try again.';
      card.querySelector('.perr').textContent = err || 'Something went wrong.';
      b.disabled = false;
      return;
    }
    lastPKey = null;
    loadProposals();
  });
  function reportImport(out) {
    var n = out.proposals ? out.proposals.filter(function (p) { return p.import_id === out.import_id; }).length : 0;
    teachStatus.textContent = (n ? 'Found ' + n + ' thing' + (n > 1 ? 's' : '') + '. Check them below.' : "I couldn't find any rules in that.") +
      (out.dropped_secrets ? ' Left out codes or passwords.' : '');
    lastPKey = null;
    loadProposals();
  }
  async function sendImport(url, init) {
    teachStatus.textContent = 'Reading the note…';
    var r = await fetch(url, init).catch(function () { return null; });
    if (!r) { teachStatus.textContent = 'Offline. Try again.'; return; }
    var out = await r.json().catch(function () { return {}; });
    if (!r.ok) { teachStatus.textContent = out.error || 'Could not read that.'; return; }
    reportImport(out);
  }
  document.getElementById('file').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var label = f.type === 'application/pdf' ? 'PDF: ' + f.name : 'Photo of a note';
    sendImport('/parent/api/import/file?k=' + encodeURIComponent(key) + '&by=' + encodeURIComponent(me) + '&label=' + encodeURIComponent(label),
      { method: 'POST', headers: { 'content-type': f.type || 'application/octet-stream' }, body: f });
    e.target.value = '';
  });
  document.getElementById('readText').addEventListener('click', function () {
    var text = document.getElementById('paste').value.trim();
    if (!text) { teachStatus.textContent = 'Paste a message first.'; return; }
    sendImport('/parent/api/import/text', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ k: key, text: text, label: 'Pasted message', by: me }) }).then(function () { document.getElementById('paste').value = ''; });
  });

  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ k: key }, body)) });
  }

  // ---------- Phone notifications (Web Push) ----------
  var notifyBox = document.getElementById('notify');
  var isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var swReady = null;
  function keyBytes(b64) {
    var s = atob((b64 + '==='.slice((b64.length + 3) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
    var a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }
  async function currentSub() {
    if (!swReady) return null;
    var reg = await swReady;
    return reg ? reg.pushManager.getSubscription() : null;
  }
  async function renderNotify(msg) {
    notifyBox.hidden = false;
    var h;
    if (!('serviceWorker' in navigator) || !window.isSecureContext) {
      h = '<div><strong>Notifications</strong><p class="muted">Open this page over https to get notifications on this phone.</p></div>';
    } else if (!('PushManager' in window) || !('Notification' in window)) {
      h = isIos && !standalone
        ? '<div><strong>Get notified on this iPhone</strong><p class="muted">Tap Share, then “Add to Home Screen”. Open While You\\'re Out from your home screen and turn notifications on there.</p></div>'
        : '<div><strong>Notifications</strong><p class="muted">This browser can\\'t show notifications. Keep this page open instead.</p></div>';
    } else if (Notification.permission === 'denied') {
      h = '<div><strong>Notifications are blocked</strong><p class="muted">Allow notifications for this site in your browser settings, then reload.</p></div>';
    } else {
      var sub = await currentSub().catch(function () { return null; });
      h = sub
        ? '<div><strong>🔔 Notifications on</strong><p class="muted">Questions and emergencies reach this phone even when the page is closed.</p></div><div class="pbtns" style="margin:0"><button data-push="test">Send a test</button><button data-push="off">Turn off</button></div>'
        : '<div><strong>Get notified on this phone</strong><p class="muted">So questions and emergencies reach you even when this page is closed.</p></div><button class="ok" data-push="on">Turn on</button>';
    }
    notifyBox.innerHTML = h + (msg ? '<p class="muted" style="flex-basis:100%">' + esc(msg) + '</p>' : '');
  }
  async function turnOn() {
    var perm = await Notification.requestPermission();
    if (perm !== 'granted') return renderNotify(perm === 'denied' ? '' : 'Notifications were not turned on.');
    var r = await fetch('/parent/api/push/key?k=' + encodeURIComponent(key));
    if (!r.ok) return renderNotify('Could not reach the server.');
    var reg = await swReady;
    var sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes((await r.json()).publicKey) }));
    var saved = await post('/parent/api/push/subscribe', { subscription: sub.toJSON(), member: me });
    renderNotify(saved.ok ? '' : 'Could not save this phone. Try again.');
  }
  notifyBox.addEventListener('click', async function (e) {
    var b = e.target.closest('button[data-push]');
    if (!b) return;
    b.disabled = true;
    try {
      if (b.dataset.push === 'on') return await turnOn();
      var sub = await currentSub();
      if (b.dataset.push === 'off') {
        if (sub) { await post('/parent/api/push/unsubscribe', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
        return renderNotify();
      }
      var out = await (await post('/parent/api/push/test', { endpoint: sub ? sub.endpoint : undefined })).json();
      renderNotify(out.sent ? 'Test sent. It should appear in a few seconds.' : 'The test could not be delivered. Turn notifications off and on again.');
    } catch (err) {
      renderNotify('Something went wrong: ' + ((err && err.message) || err));
    }
  });
  if ('serviceWorker' in navigator && window.isSecureContext) {
    swReady = navigator.serviceWorker.register('/parent/sw.js', { scope: '/parent' })
      .then(function () { return navigator.serviceWorker.ready; })
      .catch(function () { return null; });
    swReady.then(function () { renderNotify(); });
  } else {
    renderNotify();
  }
  // Questions go to the person this phone answers as, so the subscription follows the selector.
  sel.addEventListener('change', async function () {
    var sub = await currentSub().catch(function () { return null; });
    if (sub) post('/parent/api/push/subscribe', { subscription: sub.toJSON(), member: me });
  });

  // ---------- Family setup ----------
  var fam = null;
  var famBox = document.getElementById('family');
  var fErr = document.getElementById('fErr');
  var ZONES = ['America/Los_Angeles', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/New_York', 'America/Anchorage', 'Pacific/Honolulu',
    'America/Toronto', 'America/Vancouver', 'America/Mexico_City', 'America/Sao_Paulo', 'Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin',
    'Europe/Madrid', 'Africa/Lagos', 'Africa/Nairobi', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland'];
  // Some browsers still report old zone names.
  var OLD_ZONES = { 'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'Asia/Katmandu': 'Asia/Kathmandu', 'Europe/Kiev': 'Europe/Kyiv', 'America/Buenos_Aires': 'America/Argentina/Buenos_Aires' };
  function deviceTz() {
    try { var z = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; return OLD_ZONES[z] || z; } catch (e) { return ''; }
  }
  async function loadFamily() {
    var r = await fetch('/parent/api/family?k=' + encodeURIComponent(key)).catch(function () { return null; });
    if (!r || !r.ok) return;
    fam = await r.json();
    renderFamily();
  }
  function opt(value, label, selected) { return '<option value="' + esc(value) + '"' + (selected ? ' selected' : '') + '>' + esc(label) + '</option>'; }
  function renderFamily() {
    document.getElementById('fName').value = fam.household.name;
    document.getElementById('fAddress').value = fam.household.address;
    var zones = ZONES.slice();
    [deviceTz(), fam.household.timezone].forEach(function (z) { if (z && zones.indexOf(z) < 0) zones.unshift(z); });
    document.getElementById('fTz').innerHTML = zones.map(function (z) { return opt(z, z.replace(/_/g, ' '), z === fam.household.timezone); }).join('');
    document.getElementById('fMembers').innerHTML = fam.members.length ? fam.members.map(function (m, i) {
      return '<div class="row" data-member="' + i + '">' +
        '<label>Name<input data-f="name" maxlength="40" value="' + esc(m.name) + '"></label>' +
        '<label>' + (m.kind === 'pet' ? 'What kind of pet' : 'Age') + '<input data-f="age" maxlength="20" value="' + esc(m.age || '') + '" placeholder="' + (m.kind === 'pet' ? 'dog' : '5') + '"></label>' +
        (m.kind === 'child' ? '<label class="full">Allergies (leave empty if none)<input data-f="allergies" maxlength="300" value="' + esc(m.allergies || '') + '" placeholder="peanuts and tree nuts"></label>' : '') +
        '<div class="tools"><span class="grow">' + (m.kind === 'pet' ? '🐾 Pet' : '🧒 Child') + '</span><button data-remove="member" aria-label="Remove ' + esc(m.name || 'this one') + '">Remove</button></div></div>';
    }).join('') : '<p class="muted">No children or pets yet.</p>';
    var order = 0;
    document.getElementById('fContacts').innerHTML = fam.contacts.length ? fam.contacts.map(function (c, i) {
      var badge = c.doctor ? '<span class="order" title="Doctor">Dr</span>' : '<span class="order">' + (++order) + '</span>';
      return '<div class="row" data-contact="' + i + '">' +
        '<label>Name<input data-f="name" maxlength="40" value="' + esc(c.name) + '"></label>' +
        '<label>Who they are<input data-f="relation" maxlength="40" value="' + esc(c.relation) + '" placeholder="Mom, Grandpa, Neighbour"></label>' +
        '<label class="full">Phone<input data-f="phone" type="tel" maxlength="25" value="' + esc(c.phone) + '" placeholder="+1 206 555 0142"></label>' +
        '<div class="tools">' + badge + '<label class="grow"><input type="checkbox" data-f="doctor"' + (c.doctor ? ' checked' : '') + '> Doctor</label>' +
        '<button data-move="-1" aria-label="Move up">↑</button><button data-move="1" aria-label="Move down">↓</button><button data-remove="contact">Remove</button></div></div>';
    }).join('') : '<p class="muted">No contacts yet. Add at least one person to call.</p>';
  }
  // Reads what's typed into the form back into fam (before adding, moving or saving).
  function collect() {
    fam.household = { name: document.getElementById('fName').value, address: document.getElementById('fAddress').value, timezone: document.getElementById('fTz').value };
    famBox.querySelectorAll('[data-member]').forEach(function (row) {
      var m = fam.members[Number(row.dataset.member)];
      row.querySelectorAll('[data-f]').forEach(function (inp) { m[inp.dataset.f] = inp.value; });
    });
    famBox.querySelectorAll('[data-contact]').forEach(function (row) {
      var c = fam.contacts[Number(row.dataset.contact)];
      row.querySelectorAll('[data-f]').forEach(function (inp) { c[inp.dataset.f] = inp.type === 'checkbox' ? inp.checked : inp.value; });
    });
  }
  famBox.addEventListener('change', function (e) {
    if (e.target.matches('input[data-f=doctor]')) { collect(); renderFamily(); }
  });
  famBox.addEventListener('click', async function (e) {
    var b = e.target.closest('button');
    if (!b || !fam) return;
    if (b.dataset.add) {
      collect();
      if (b.dataset.add === 'contact') fam.contacts.push({ name: '', relation: '', phone: '', doctor: false });
      else fam.members.push({ name: '', kind: b.dataset.add, age: '', allergies: '' });
      renderFamily();
      var rows = famBox.querySelectorAll(b.dataset.add === 'contact' ? '[data-contact]' : '[data-member]');
      if (rows.length) rows[rows.length - 1].querySelector('input').focus();
    } else if (b.dataset.remove) {
      collect();
      var row = b.closest('.row');
      if (b.dataset.remove === 'member') fam.members.splice(Number(row.dataset.member), 1);
      else fam.contacts.splice(Number(row.dataset.contact), 1);
      renderFamily();
    } else if (b.dataset.move) {
      collect();
      var i = Number(b.closest('.row').dataset.contact), j = i + Number(b.dataset.move);
      if (j < 0 || j >= fam.contacts.length) return;
      var tmp = fam.contacts[i]; fam.contacts[i] = fam.contacts[j]; fam.contacts[j] = tmp;
      renderFamily();
    } else if (b.id === 'fSave') {
      collect();
      fErr.style.color = '';
      fErr.textContent = 'Saving…';
      b.disabled = true;
      var r = await post('/parent/api/family', { family: fam, by: me }).catch(function () { return null; });
      b.disabled = false;
      var out = r ? await r.json().catch(function () { return {}; }) : { error: 'Offline. Try again.' };
      if (!r || !r.ok) { fErr.textContent = out.error || 'Could not save.'; return; }
      fam = out;
      renderFamily();
      fErr.style.color = 'var(--green)';
      fErr.textContent = 'Saved ✓';
      parentsShown = null;
      load();
    } else if (b.dataset.reset) {
      // Two taps, so a stray tap can't wipe the house.
      if (!b.classList.contains('armed')) {
        famBox.querySelectorAll('button.armed').forEach(function (x) { x.classList.remove('armed'); x.textContent = x.dataset.label; });
        b.dataset.label = b.textContent;
        b.classList.add('armed');
        b.textContent = 'Tap again to confirm';
        setTimeout(function () { if (b.classList.contains('armed')) { b.classList.remove('armed'); b.textContent = b.dataset.label; } }, 5000);
        return;
      }
      b.disabled = true;
      var rr = await post('/parent/api/reset', { mode: b.dataset.reset, timezone: deviceTz() || (fam && fam.household.timezone) }).catch(function () { return null; });
      b.disabled = false;
      b.classList.remove('armed');
      b.textContent = b.dataset.label;
      if (!rr || !rr.ok) { fErr.textContent = 'Could not reset. Try again.'; return; }
      fam = await rr.json();
      renderFamily();
      fErr.style.color = 'var(--green)';
      fErr.textContent = b.dataset.reset === 'demo' ? 'Back to the demo family ✓' : 'Clean house ✓ Add your family above, then save.';
      if (b.dataset.reset === 'fresh') setTab('family');
      lastQKey = lastBusy = lastShadow = lastDebrief = lastPKey = null;
      parentsShown = null;
      load();
      loadProposals();
    }
  });
  document.addEventListener('click', function (e) {
    if (e.target.id !== 'openFamily') return;
    setTab('family');
  });
  loadFamily();

  // ---------- emergency: live view, as it happens at home ----------
  var lastIncident = null, incReceived = Date.now();
  function mmss(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
  function incidentCard(i) {
    if (i.status === 'resolved') {
      return '<div class="card inc over"><strong>Emergency over</strong><p class="muted">Started ' + esc(i.started) + '. ' + esc((i.updates[i.updates.length - 1] || {}).by || 'The sitter') + ' said it\\'s over.</p>' +
        '<ul class="inc-log">' + i.updates.slice(-6).map(function (u) { return '<li><span>' + esc(u.time) + '</span>' + esc(u.by) + ': ' + esc(u.text) + '</li>'; }).join('') + '</ul></div>';
    }
    var now = i.steps[i.current];
    return '<div class="card alert inc"><div class="inc-head"><strong>🚨 Emergency · ' + esc(i.started) + '</strong><span class="elapsed" data-elapsed="' + i.elapsed_seconds + '"></span></div>' +
      '<p class="inc-desc">' + esc(i.carer || 'The sitter') + ' said: “' + esc(i.description) + '”</p>' +
      (now ? '<div class="inc-now"><small>Step ' + (i.current + 1) + ' of ' + i.total + ' right now</small>' + esc(now.text) + '</div>' : '<div class="inc-now"><small>All steps done</small>Waiting for help to arrive</div>') +
      i.timers.map(function (t) { return '<div class="inc-timer" data-left="' + t.remaining_seconds + '"><span>⏱ ' + esc(t.label) + '</span><b></b></div>'; }).join('') +
      '<ol class="inc-steps">' + i.steps.map(function (st) { return '<li class="' + st.state + '">' + esc(st.text) + '</li>'; }).join('') + '</ol>' +
      (i.on_the_way.length ? '<p class="inc-otw">' + i.on_the_way.map(function (o) { return '🚗 ' + esc(o.name) + ' · home by ' + esc(o.eta); }).join('<br>') + '</p>' : '') +
      '<p class="inc-label">I’m on my way</p><div class="btns"><button data-otw="10">10 min</button><button data-otw="20">20 min</button><button data-otw="30">30 min</button></div>' +
      '<ul class="inc-log">' + i.updates.slice(-4).reverse().map(function (u) { return '<li><span>' + esc(u.time) + '</span>' + esc(u.by) + ': ' + esc(u.text) + '</li>'; }).join('') + '</ul>' +
      (i.address ? '<p class="inc-addr">Home: ' + esc(i.address) + '</p>' : '') + '</div>';
  }
  function tickIncident() {
    // Seconds as the server counted them (it may run on a demo clock), plus time since then.
    var passed = (Date.now() - incReceived) / 1000;
    document.querySelectorAll('.elapsed[data-elapsed]').forEach(function (el) { el.textContent = mmss(Number(el.dataset.elapsed) + passed) + ' ago'; });
    document.querySelectorAll('.inc-timer[data-left]').forEach(function (el) {
      var left = Number(el.dataset.left) - passed;
      el.querySelector('b').textContent = left > 0 ? mmss(left) : 'Time’s up';
      el.classList.toggle('up', left <= 0);
    });
  }
  setInterval(tickIncident, 1000);
  document.addEventListener('click', async function (e) {
    var b = e.target.closest('button[data-otw]');
    if (!b) return;
    b.disabled = true;
    await post('/parent/api/incident', { action: 'on_the_way', minutes: Number(b.dataset.otw), by: me }).catch(function () {});
    lastIncident = null;
    load();
  });

  // ---------- paying the sitter from the debrief ----------
  document.addEventListener('click', async function (e) {
    var b = e.target.closest && e.target.closest('button[data-pay]');
    if (!b) return;
    b.disabled = true;
    var r = await post('/parent/api/pay', {}).catch(function () { return null; });
    var out = r ? await r.json().catch(function () { return {}; }) : {};
    if (r && r.ok && out.url) location.href = out.url;
    else { b.disabled = false; b.textContent = out.error || 'Could not start the payment'; }
  });

  // ---------- goodnight message ----------
  var lastMessages = null, recorder = null, recChunks = [], recStream = null, recTimer = null, draftBlob = null;
  var WHEN = { bedtime: 'At lights out', missing: 'If they\\'re missing you', any: 'Lights out, or if they miss you' };
  function renderMessages(list) {
    document.getElementById('gnList').innerHTML = list.map(function (m) {
      var media = m.kind === 'video' ? '<video controls preload="metadata" src="' + esc(m.url) + '"></video>' : '<audio controls preload="none" src="' + esc(m.url) + '"></audio>';
      return '<div class="gn-item"><div class="gn-meta"><span><b>' + esc(m.from_name) + '</b> → ' + esc(m.for_name || 'the kids') + ' · ' + esc(WHEN[m.when_to_play] || '') +
        (m.played_at ? ' · <span class="muted">played ' + esc(time(m.played_at)) + '</span>' : '') + '</span><button data-gnremove="' + m.id + '">Remove</button></div>' +
        (m.caption ? '<p class="muted" style="margin:4px 0 0">“' + esc(m.caption) + '”</p>' : '') + media + '</div>';
    }).join('');
  }
  function gnErr(t) { document.getElementById('gnErr').textContent = t || ''; }
  function fillFor() {
    var kids = (fam && fam.members || []).filter(function (m) { return m.kind === 'child'; });
    document.getElementById('gnFor').innerHTML = (kids.length ? kids : [{ name: 'The kids' }]).map(function (k) { return '<option>' + esc(k.name) + '</option>'; }).join('');
  }
  function showDraft(blob) {
    draftBlob = blob;
    fillFor();
    var url = URL.createObjectURL(blob);
    document.getElementById('gnDraftMedia').innerHTML = /^video/.test(blob.type) ? '<video controls src="' + url + '"></video>' : '<audio controls src="' + url + '"></audio>';
    document.getElementById('gnDraft').hidden = false;
  }
  async function startRecording(video) {
    gnErr('');
    if (!navigator.mediaDevices || !window.MediaRecorder) return gnErr('This browser can\\'t record. Upload a recording instead.');
    try { recStream = await navigator.mediaDevices.getUserMedia(video ? { audio: true, video: { facingMode: 'user' } } : { audio: true }); }
    catch (e) { return gnErr('Allow the microphone' + (video ? ' and camera' : '') + ' to record, or upload a recording.'); }
    recChunks = [];
    recorder = new MediaRecorder(recStream);
    recorder.ondataavailable = function (e) { if (e.data && e.data.size) recChunks.push(e.data); };
    recorder.onstop = function () {
      recStream.getTracks().forEach(function (t) { t.stop(); });
      clearInterval(recTimer);
      document.getElementById('gnLive').hidden = true;
      showDraft(new Blob(recChunks, { type: recorder.mimeType || (video ? 'video/webm' : 'audio/webm') }));
    };
    var preview = document.getElementById('gnPreview');
    preview.hidden = !video;
    if (video) { preview.srcObject = recStream; preview.play().catch(function () {}); }
    document.getElementById('gnLive').hidden = false;
    var started = Date.now();
    recTimer = setInterval(function () {
      var s = Math.floor((Date.now() - started) / 1000);
      document.getElementById('gnTime').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      if (s >= 60) recorder.stop(); // a minute is plenty
    }, 250);
    recorder.start();
  }
  document.addEventListener('click', async function (e) {
    var t = e.target;
    if (t.id === 'gnVoice' || t.id === 'gnVideo') return startRecording(t.id === 'gnVideo');
    if (t.id === 'gnStop' && recorder && recorder.state === 'recording') return recorder.stop();
    if (t.id === 'gnDiscard') { draftBlob = null; document.getElementById('gnDraft').hidden = true; return; }
    var rm = t.closest && t.closest('button[data-gnremove]');
    if (rm) {
      var rr = await post('/parent/api/messages/remove', { id: Number(rm.dataset.gnremove) }).catch(function () { return null; });
      if (rr && rr.ok) { var out = await rr.json(); lastMessages = JSON.stringify(out.messages); renderMessages(out.messages); }
      return;
    }
    if (t.id === 'gnSave' && draftBlob) {
      t.disabled = true;
      gnErr('Saving…');
      var q = '?k=' + encodeURIComponent(key) + '&by=' + encodeURIComponent(me) + '&for=' + encodeURIComponent(document.getElementById('gnFor').value) +
        '&when=' + encodeURIComponent(document.getElementById('gnWhen').value) + '&caption=' + encodeURIComponent(document.getElementById('gnCaption').value);
      var r = await fetch('/parent/api/messages' + q, { method: 'POST', headers: { 'content-type': draftBlob.type.split(';')[0] || 'audio/webm' }, body: draftBlob }).catch(function () { return null; });
      t.disabled = false;
      var body = r ? await r.json().catch(function () { return {}; }) : {};
      if (!r || !r.ok) return gnErr(body.error || 'Could not save. Try again.');
      gnErr('');
      draftBlob = null;
      document.getElementById('gnDraft').hidden = true;
      document.getElementById('gnCaption').value = '';
      lastMessages = JSON.stringify(body.messages);
      renderMessages(body.messages);
    }
  });
  document.getElementById('gnFile').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (f) showDraft(f);
    e.target.value = '';
  });

  // ---------- expected visitors ----------
  var lastVisitors = null;
  function renderVisitors(list) {
    document.getElementById('vlist').innerHTML = list.length ? list.map(function (v) {
      return '<li><span class="vi">' + (v.kind === 'delivery' ? '📦' : '🙋') + '</span><span class="vt"><b>' + esc(v.name) + '</b><small>' +
        esc([v.window, v.note].filter(Boolean).join(' · ') || (v.kind === 'delivery' ? 'Delivery' : 'Any time tonight')) + '</small></span>' +
        '<button data-vremove="' + v.id + '" aria-label="Remove ' + esc(v.name) + '">Remove</button></li>';
    }).join('') : '<li class="muted">Nobody yet. The sitter will be told not to open the door to anyone.</li>';
  }
  document.addEventListener('click', async function (e) {
    var rm = e.target.closest('button[data-vremove]');
    var add = e.target.closest('#vAdd');
    if (!rm && !add) return;
    var vErr = document.getElementById('vErr');
    vErr.textContent = '';
    var body = rm ? { action: 'remove', id: Number(rm.dataset.vremove) }
      : { action: 'add', name: document.getElementById('vName').value, window: document.getElementById('vWhen').value, kind: document.getElementById('vKind').value, by: me };
    var r = await post('/parent/api/visitors', body).catch(function () { return null; });
    var out = r ? await r.json().catch(function () { return {}; }) : {};
    if (!r || !r.ok) { vErr.textContent = out.error || 'Could not save.'; return; }
    if (add) {
      var added = (out.visitors || []).filter(function (v) { return v.name === body.name.trim().slice(0, 60); }).pop();
      if (added && added.from_minutes === null && body.window.trim()) {
        vErr.textContent = 'I couldn\u2019t read \u201c' + body.window.trim() + '\u201d as a time, so ' + added.name + ' is expected any time tonight.';
      }
      document.getElementById('vName').value = ''; document.getElementById('vWhen').value = '';
    }
    lastVisitors = JSON.stringify(out.visitors);
    renderVisitors(out.visitors);
  });

  // ---------- tabs and the live header ----------
  function setTab(t) {
    document.body.dataset.tab = t;
    document.querySelectorAll('[data-tabbtn]').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tabbtn === t)); });
    try { sessionStorage.setItem('wyo.tab', t); } catch (e) {}
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('[data-tabbtn]').forEach(function (b) { b.addEventListener('click', function () { setTab(b.dataset.tabbtn); }); });
  try { var savedTab = sessionStorage.getItem('wyo.tab'); if (savedTab) setTab(savedTab); } catch (e) {}

  function renderLive(s, tb) {
    var h = s.home || {};
    document.getElementById('household').textContent = (s.household && s.household.name) || 'Your home';
    var now = '', pills = [];
    if (s.emergency) {
      now = 'Emergency reported<small>' + esc(time(s.emergency.at)) + ' · see below</small>';
      pills.push('<span class="lp bad">Every contact alerted</span>');
    } else if (!s.handoff) {
      now = s.debrief ? 'Last night with ' + esc(s.debrief.carer) + '<small>Your debrief is below</small>' : 'All quiet at home';
    } else if (h.night) {
      var kid = ((h.members || []).filter(function (m) { return m.kind === 'child'; })[0] || {}).name;
      now = h.asleep_since
        ? (kid ? esc(kid) + ' is asleep' : 'All asleep') + '<small>Since ' + esc(h.asleep_since) + '</small>'
        : 'Past bedtime<small>Nobody has said ' + (kid ? esc(kid) + ' is' : 'they are') + ' asleep yet</small>';
    } else if (h.next) {
      var m = h.next.minutes_until;
      now = 'Next: ' + esc(h.next.title) + '<small>' + esc(h.next.time) + (m > 1 ? ' · in ' + m + ' min' : m >= -5 ? ' · now' : ' · ' + -m + ' min late') + '</small>';
    } else {
      now = esc(s.handoff.carer_name) + ' is looking after things';
    }
    if (tb) pills.push(tb.done ? '<span class="lp ' + (tb.right === tb.total ? 'ok' : 'warn') + '">Handover ' + tb.right + '/' + tb.total + (tb.right === tb.total ? ' ✓' : '') + '</span>' : '<span class="lp">Handover check ' + tb.answered + '/' + tb.total + '</span>');
    if (s.questions.length) pills.push('<span class="lp warn">' + s.questions.length + ' question' + (s.questions.length > 1 ? 's' : '') + ' for you</span>');
    if (h.last_log) pills.push('<span class="lp">' + esc(h.last_log.time) + ' · ' + esc(h.last_log.text.length > 34 ? h.last_log.text.slice(0, 32) + '…' : h.last_log.text) + '</span>');
    if (s.busy_until) pills.push('<span class="lp">Urgent only till ' + esc(s.busy_until) + '</span>');
    document.getElementById('liveNow').innerHTML = now;
    document.getElementById('livePills').innerHTML = pills.join('');
  }

  load(); setInterval(load, 2000);
  loadProposals(); setInterval(loadProposals, 4000);
</script>
</body>
</html>`;

// Shows the parents' notifications when the page is closed, and opens the page when one is tapped.
export const SERVICE_WORKER_JS = /* js */ `
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('push', function (e) {
  var m = {};
  try { m = e.data ? e.data.json() : {}; } catch (err) { m = { title: "While You're Out", body: e.data ? e.data.text() : '' }; }
  var options = {
    body: m.body || '',
    tag: m.tag || undefined,
    renotify: Boolean(m.tag),
    requireInteraction: Boolean(m.urgent),
    vibrate: m.urgent ? [400, 150, 400, 150, 400] : [150],
    icon: '/static/icon-192.png',
    badge: '/static/icon-192.png',
    data: { url: m.url || '/parent', question_id: m.question_id, actions: m.actions || [], by: m.by },
  };
  if (m.image) options.image = m.image;
  if (m.actions && m.actions.length) options.actions = m.actions.slice(0, 2).map(function (a) { return { action: a.action, title: a.title }; });
  e.waitUntil(self.registration.showNotification(m.title || "While You're Out", options));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var data = e.notification.data || {};
  var url = data.url || '/parent';
  // A button on the notification answers the question without opening the page.
  var chosen = e.action && (data.actions || []).filter(function (a) { return a.action === e.action; })[0];
  if (chosen && data.question_id) {
    var k = new URL(url, self.location.origin).searchParams.get('k');
    e.waitUntil(fetch('/parent/api/answer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ k: k, id: data.question_id, answer: chosen.answer, by: data.by || 'Parent', scope: 'tonight' })
    }).then(function (r) {
      return self.registration.showNotification(r.ok ? 'Sent' : 'Could not send', {
        body: r.ok ? '“' + chosen.answer + '”' : 'Open the app to answer.', tag: 'answer-' + data.question_id, icon: '/static/icon-192.png', data: { url: url }
      });
    }).catch(function () { return self.clients.openWindow(url); }));
    return;
  }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (new URL(list[i].url).pathname === '/parent' && 'focus' in list[i]) return list[i].focus();
    }
    return self.clients.openWindow(url);
  }));
});
`;
