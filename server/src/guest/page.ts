// The sitter's own page: what the Guest Pass opens on her phone after she scans the QR code on the
// kitchen Echo Show. Tonight in the parents' words, who to call (one tap), ask the parents, and the
// emergency number. The pass token arrives in the address's fragment (never sent to the server in
// the URL, never in logs); the page keeps it for this tab only and takes it out of the address bar.
// It also works with no internet: the page itself is kept by a service worker, and tonight's
// details and every emergency guide are kept on the phone until the pass ends (calls don't need
// the internet). During an emergency it shows the same guide as the kitchen Echo Show.
export const GUEST_HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>Tonight · While You're Out</title>
<style>
  :root { color-scheme: light dark; --bg: #F6F4F0; --card: #FFFFFF; --inner: #F1EEE8; --line: #E4DFD6; --text: #14181E; --text-2: #3E4652; --text-3: #5B6371;
    --accent: #9A5800; --sos: #B42318; --danger: #B42318; --danger-soft: #FDECEA; --ok: #067647; --btn: #2D415E; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0B0E13; --card: #14181E; --inner: #1B2028; --line: #2A313C; --text: #FFFFFF; --text-2: #C3CBD6; --text-3: #9AA5B4;
    --accent: #F2B544; --sos: #C8261B; --danger: #FF7A6E; --danger-soft: #3A1714; --ok: #4ADE9B; --btn: #2D415E; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
  main { max-width: 560px; margin: 0 auto; padding: max(16px, env(safe-area-inset-top)) 16px 40px; }
  header { display: flex; align-items: center; gap: 8px; color: var(--text-3); font-weight: 700; font-size: 14px; margin: 4px 0 14px; }
  header svg { width: 20px; height: 20px; }
  h1 { font-size: 28px; line-height: 1.15; margin: 0 0 4px; }
  .muted { color: var(--text-3); margin: 0; }
  .pass { display: inline-flex; align-items: center; gap: 6px; margin: 10px 0 16px; padding: 6px 12px; border-radius: 999px; background: var(--inner); font-weight: 700; font-size: 14px; color: var(--text-2); }
  .pass i { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); }
  .pass.ending i { background: var(--accent); }
  section { background: var(--card); border-radius: 16px; padding: 16px; margin: 0 0 12px; }
  section h2 { font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); margin: 0 0 8px; }
  .sos.call-parent { background: #1f6feb; margin-top: 6px; }
  .parent-call p { margin: 0 0 8px; }
  .sos { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 56px; border-radius: 14px; background: var(--sos); color: #fff; font-weight: 800; font-size: 18px; text-decoration: none; }
  .addr { margin: 10px 0 0; font-weight: 700; }
  .must { border-left: 4px solid var(--danger); background: var(--danger-soft); padding: 10px 12px; border-radius: 10px; margin: 0 0 8px; font-weight: 600; }
  .row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line); }
  .row:first-of-type { border-top: 0; }
  .row b { display: block; } .row span { color: var(--text-3); font-size: 14px; }
  .row .t { margin-left: auto; font-weight: 700; color: var(--text-2); white-space: nowrap; }
  .call { margin-left: auto; min-height: 44px; min-width: 88px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; background: var(--btn); color: #fff; font-weight: 700; text-decoration: none; padding: 0 16px; }
  textarea { width: 100%; min-height: 72px; resize: vertical; border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; font: inherit; background: var(--inner); color: var(--text); }
  button { min-height: 48px; border: 0; border-radius: 999px; padding: 0 20px; font: inherit; font-weight: 700; background: var(--btn); color: #fff; margin-top: 10px; width: 100%; }
  button:disabled { opacity: 0.6; }
  .q { padding: 10px 0; border-top: 1px solid var(--line); }
  .q:first-of-type { border-top: 0; }
  .q .a { margin-top: 4px; font-weight: 700; }
  .q .w { margin-top: 4px; color: var(--text-3); font-size: 14px; }
  .note { font-size: 13px; color: var(--text-3); margin: 14px 4px 0; }
  .ended { text-align: center; padding: 40px 16px; }
  .offline { background: #FEF4DF; color: #6B4300; border-radius: 14px; padding: 12px 14px; margin: 0 0 12px; font-weight: 600; }
  @media (prefers-color-scheme: dark) { .offline { background: #3A2A0B; color: #F7D58C; } }
  .live { border: 3px solid var(--sos); }
  .live h2 { color: var(--danger); }
  .step { font-size: 22px; line-height: 1.3; font-weight: 700; margin: 6px 0 4px; }
  .steps { margin: 10px 0 0; padding: 0 0 0 22px; color: var(--text-3); }
  .steps li { margin: 4px 0; } .steps li.now { color: var(--text); font-weight: 700; } .steps li.done { text-decoration: line-through; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .two button { margin-top: 10px; }
  button.alt { background: var(--inner); color: var(--text); }
  .guides { display: grid; gap: 8px; }
  .guides button { margin: 0; background: var(--inner); color: var(--text); text-align: left; border-radius: 12px; padding: 0 14px; }
  :focus-visible { outline: 3px solid #1F6FD6; outline-offset: 2px; }
</style></head>
<body><main id="app"><p class="muted">Opening tonight's pass…</p></main>
<script>
(function () {
  var token = (location.hash || '').slice(1);
  try { if (token) sessionStorage.setItem('wyo.pass', token); else token = sessionStorage.getItem('wyo.pass') || ''; } catch (e) {}
  // The pass stays in this tab, not in the address bar (or in a screenshot of it).
  if (location.hash) history.replaceState(null, '', location.pathname);
  var app = document.getElementById('app');
  var LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><rect x="9.6" y="13" width="4.8" height="8" rx="1.2" fill="#F2B544"/></svg>';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function api(path, body) {
    return fetch(path, { method: body ? 'POST' : 'GET', headers: Object.assign({ authorization: 'Bearer ' + token }, body ? { 'content-type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
  }
  var draft = '';
  // Tonight, kept on this phone until the pass ends, so the page works with no internet.
  var SAVE = 'wyo.guest.saved';
  var last = null;
  var guide = null; // a guide opened on the phone: { kind, i } (or the emergency in progress, offline)
  function keep(s) { try { var k = Object.assign({}, s); delete k.questions; localStorage.setItem(SAVE, JSON.stringify({ at: Date.now(), s: k })); } catch (e) {} }
  function kept() { try { return JSON.parse(localStorage.getItem(SAVE) || 'null'); } catch (e) { return null; } }
  function forget() { try { localStorage.removeItem(SAVE); } catch (e) {} }
  function stepsOf(s) {
    if (!guide) return null;
    if (guide.kind === 'now' && s.incident) return { label: 'The emergency', source: s.incident.source, steps: s.incident.steps.map(function (x) { return x.text; }) };
    var g = (s.guides || []).filter(function (x) { return x.kind === guide.kind; })[0];
    return g ? { label: g.label, source: g.source, steps: g.steps, poison: g.poison_line } : null;
  }
  function guideCard(s) {
    var g = stepsOf(s);
    if (!g) return '';
    var i = Math.min(guide.i, g.steps.length);
    var list = g.steps.map(function (t, n) { return '<li class="' + (n < i ? 'done' : n === i ? 'now' : '') + '">' + esc(t) + '</li>'; }).join('');
    return '<section class="live"><h2>' + esc(g.label) + (i < g.steps.length ? ' · step ' + (i + 1) + ' of ' + g.steps.length : '') + '</h2>' +
      '<p class="step">' + esc(i < g.steps.length ? g.steps[i] : 'Stay with them and follow the 911 dispatcher until help arrives.') + '</p>' +
      (g.source ? '<p class="muted">' + esc(g.source) + '</p>' : '') +
      (g.poison ? '<a class="call" style="margin-top:10px" href="tel:' + esc(g.poison.replace(/[^0-9]/g, '')) + '">Call Poison Control</a>' : '') +
      '<ol class="steps">' + list + '</ol>' +
      '<div class="two"><button data-gstep="back" class="alt"' + (i === 0 ? ' disabled' : '') + '>Back</button><button data-gstep="next"' + (i >= g.steps.length ? ' disabled' : '') + '>Done, next step</button></div>' +
      '<button data-gclose class="alt">All guides</button></section>';
  }
  function render(s, offline) {
    if (s.ended) {
      forget();
      app.innerHTML = '<header>' + LOGO + 'While You’re Out</header><div class="ended"><h1>Tonight’s pass has ended</h1><p class="muted">Thank you' + (s.carer ? ', ' + esc(s.carer) : '') + '. If you still need anything, call the parents directly.</p></div>';
      return;
    }
    // Offline in an emergency: the guide carries on from the step the kitchen was on.
    if (offline && s.incident && s.incident.status === 'active' && !guide) guide = { kind: 'now', i: s.incident.current };
    var inc = !offline && s.incident && s.incident.status === 'active' ? s.incident : null;
    var callFirst = (s.contacts || []).find(function (c) { return c.phone; }) || null;
    var alerted = (s.contacts || []).slice(0, 2).map(function (c) { return c.name; }).join(' and ');
    var live = inc
      ? '<section class="live"><h2>Emergency · step ' + Math.min(inc.current + 1, inc.total) + ' of ' + inc.total + '</h2>' +
        '<p class="step">' + esc(inc.steps[inc.current] ? inc.steps[inc.current].text : 'Stay with them and follow the 911 dispatcher until help arrives.') + '</p>' +
        (inc.source ? '<p class="muted">' + esc(inc.source) + '</p>' : '') +
        '<div class="two"><button data-inc="back" class="alt"' + (inc.current === 0 ? ' disabled' : '') + '>Back</button><button data-inc="done">Done</button></div>' +
        '<button data-inc="resolved" class="alt">Help has arrived</button><p class="note">The kitchen screen and the parents’ phones follow along.</p></section>' +
        // A parent asked for this: in an emergency, reaching them is one tap (911 stays first, above).
        (callFirst ? '<section class="parent-call"><p class="muted">' + esc(alerted) + ' already know. Call when you can:</p><a class="sos call-parent" href="tel:' + esc(callFirst.phone.replace(/[^+0-9]/g, '')) + '">Call ' + esc(callFirst.name) + '</a></section>' : '')
      : guideCard(s);
    var guides = (s.guides || []).map(function (g) { return '<button data-guide="' + esc(g.kind) + '">' + esc(g.label) + '</button>'; }).join('');
    var ta = document.getElementById('ask');
    if (ta) draft = ta.value;
    var calls = s.contacts.map(function (c) {
      return '<div class="row"><div><b>' + esc(c.name) + '</b><span>' + esc(c.relation) + '</span></div>' + (c.phone ? '<a class="call" href="tel:' + esc(c.phone.replace(/[^+0-9]/g, '')) + '">Call</a>' : '') + '</div>';
    }).join('');
    var next = s.next.map(function (p) { return '<div class="row"><div><b>' + esc(p.title) + '</b></div><span class="t">' + esc(p.time) + '</span></div>'; }).join('');
    var qs = (s.questions || []).map(function (q) {
      return '<div class="q"><div>“' + esc(q.text) + '”</div>' + (q.answer ? '<div class="a">' + esc(q.answered_by) + ': ' + esc(q.answer) + '</div>' : '<div class="w">' + (q.status === 'expired' ? 'Nobody answered in time' : 'Waiting for an answer…') + '</div>') + '</div>';
    }).join('');
    app.innerHTML = '<header>' + LOGO + 'While You’re Out</header>' +
      (offline ? '<p class="offline" role="status">No internet right now. Everything below still works, and phone calls don’t need the internet.</p>' : '') +
      '<h1>Tonight · ' + esc(s.household) + '</h1><p class="muted">Everything here is in the parents’ own words.</p>' +
      '<span class="pass' + (s.minutes_left < 30 ? ' ending' : '') + '"><i></i>Your pass · until ' + esc(s.ends) + '</span>' +
      '<section><a class="sos" href="tel:911">Emergency? Call 911</a>' + (s.address ? '<p class="addr">Tell them: ' + esc(s.address) + '</p>' : '') +
      (s.epipen ? '<p class="muted" style="margin-top:6px">EpiPen: ' + esc(s.epipen) + '</p>' : '') + (live ? '' : '<p class="muted" style="margin-top:6px">Then say “Alexa, emergency” in the kitchen, or open a guide below.</p>') + '</section>' +
      live +
      (s.must_know.length ? '<section><h2>Must know</h2>' + s.must_know.map(function (m) { return '<p class="must">' + esc(m) + '</p>'; }).join('') + '</section>' : '') +
      '<section><h2>Call</h2>' + calls + '</section>' +
      (inc || guide || !guides ? '' : '<section><h2>If something happens</h2><div class="guides">' + guides + '</div><p class="note" style="margin:10px 0 0">Step by step, from the parents’ plan and general safety steps. Kept on this phone, so they work offline.</p></section>') +
      (offline
        ? '<section><h2>Ask the parents</h2><p class="muted">Asking needs the internet. Call them instead.</p></section>'
        : '<section><h2>Ask the parents</h2><textarea id="ask" maxlength="300" placeholder="Can she stay up to finish her movie?"></textarea><button id="send">Send to ' + esc(s.contacts[0] ? s.contacts[0].name : 'the parents') + '</button>' + (qs ? '<div style="margin-top:10px">' + qs + '</div>' : '') + '</section>') +
      (next ? '<section><h2>Next tonight</h2>' + next + '</section>' : '') +
      '<p class="note">This page is tonight’s Guest Pass from ' + esc(s.household) + '. It closes when the evening ends, and what it keeps on this phone is deleted then. The parents can see what is asked here.</p>';
    var t2 = document.getElementById('ask');
    if (!t2) return;
    t2.value = draft;
    document.getElementById('send').onclick = function () {
      var text = t2.value.trim();
      if (!text) return;
      this.disabled = true;
      api('guest/api/ask', { question: text }).then(function (r) {
        if (r.body && r.body.emergency) alertEmergency();
        draft = '';
        refresh();
      });
    };
  }
  function alertEmergency() {
    var b = document.querySelector('.sos');
    if (b) { b.scrollIntoView({ block: 'center' }); b.focus(); }
  }
  function offline() {
    var k = kept();
    if (k && k.s) render(k.s, true);
    else app.innerHTML = '<header>' + LOGO + 'While You’re Out</header><p class="offline" role="status">No internet, and nothing saved on this phone yet.</p><section><a class="sos" href="tel:911">Emergency? Call 911</a></section>';
  }
  function refresh() {
    if (!token) { render({ ended: true }); return; }
    api('guest/api/state').then(function (r) {
      if (r.status === 401 || r.status === 403) return render({ ended: true, carer: r.body && r.body.carer });
      if (r.status >= 500 || !r.body || !r.body.contacts) return offline();
      last = r.body;
      keep(last);
      if (guide && guide.kind === 'now') guide = null; // back online: the live guide takes over
      render(last, false);
    }).catch(offline);
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-guide],[data-gstep],[data-gclose],[data-inc]');
    if (!t) return;
    var s = last || (kept() || {}).s;
    var isOffline = !last || !navigator.onLine;
    if (t.hasAttribute('data-guide')) guide = { kind: t.getAttribute('data-guide'), i: 0 };
    else if (t.hasAttribute('data-gclose')) guide = null;
    else if (t.hasAttribute('data-gstep')) guide.i = Math.max(0, guide.i + (t.getAttribute('data-gstep') === 'next' ? 1 : -1));
    else if (t.hasAttribute('data-inc')) {
      t.disabled = true;
      var action = t.getAttribute('data-inc');
      return void api('guest/api/emergency', { action: action }).then(refresh).catch(function () {
        // The internet went mid-emergency: carry on here, from the step the kitchen was on.
        if (last && last.incident) { guide = { kind: 'now', i: last.incident.current + (action === 'done' ? 1 : action === 'back' ? -1 : 0) }; last = null; offline(); }
      });
    }
    if (s) render(s, isOffline);
    var top = document.querySelector('.live');
    if (top) top.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  window.addEventListener('online', refresh);
  window.addEventListener('offline', function () { last = null; offline(); });
  // Keep this page on the phone, so it opens even with no internet.
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('guest/sw.js', { scope: 'guest' }).catch(function () {});
  refresh();
  setInterval(function () { if (document.activeElement && document.activeElement.id === 'ask') return; if (guide && guide.kind !== 'now') return; refresh(); }, 10000);
})();
</script></body></html>`;

/** Keeps the sitter's page for when there's no internet: always the network first, the copy if it fails. */
export const GUEST_SW_JS = `const CACHE = 'wyo-guest-1';
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.add(self.registration.scope)).catch(() => {}));
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  const url = e.request.url.split('#')[0];
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone();
        if (r.ok) caches.open(CACHE).then((c) => c.put(url, copy));
        return r;
      })
      .catch(() => caches.match(url).then((r) => r || caches.match(self.registration.scope)).then((r) => r || new Response('Offline', { status: 503 }))),
  );
});
`;
