// The sitter's own page: what the Guest Pass opens on her phone after she scans the QR code on the
// kitchen Echo Show. Tonight in the parents' words, who to call (one tap), ask the parents, and the
// emergency number. The pass token arrives in the address's fragment (never sent to the server in
// the URL, never in logs); the page keeps it for this tab only and takes it out of the address bar.
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
  function render(s) {
    if (s.ended) {
      app.innerHTML = '<header>' + LOGO + 'While You’re Out</header><div class="ended"><h1>Tonight’s pass has ended</h1><p class="muted">Thank you' + (s.carer ? ', ' + esc(s.carer) : '') + '. If you still need anything, call the parents directly.</p></div>';
      return;
    }
    var ta = document.getElementById('ask');
    if (ta) draft = ta.value;
    var calls = s.contacts.map(function (c) {
      return '<div class="row"><div><b>' + esc(c.name) + '</b><span>' + esc(c.relation) + '</span></div>' + (c.phone ? '<a class="call" href="tel:' + esc(c.phone.replace(/[^+0-9]/g, '')) + '">Call</a>' : '') + '</div>';
    }).join('');
    var next = s.next.map(function (p) { return '<div class="row"><div><b>' + esc(p.title) + '</b></div><span class="t">' + esc(p.time) + '</span></div>'; }).join('');
    var qs = s.questions.map(function (q) {
      return '<div class="q"><div>“' + esc(q.text) + '”</div>' + (q.answer ? '<div class="a">' + esc(q.answered_by) + ': ' + esc(q.answer) + '</div>' : '<div class="w">' + (q.status === 'expired' ? 'Nobody answered in time' : 'Waiting for an answer…') + '</div>') + '</div>';
    }).join('');
    app.innerHTML = '<header>' + LOGO + 'While You’re Out</header>' +
      '<h1>Tonight · ' + esc(s.household) + '</h1><p class="muted">Everything here is in the parents’ own words.</p>' +
      '<span class="pass' + (s.minutes_left < 30 ? ' ending' : '') + '"><i></i>Your pass · until ' + esc(s.ends) + '</span>' +
      '<section><a class="sos" href="tel:911">Emergency? Call 911</a>' + (s.address ? '<p class="addr">Tell them: ' + esc(s.address) + '</p>' : '') +
      (s.epipen ? '<p class="muted" style="margin-top:6px">EpiPen: ' + esc(s.epipen) + '</p>' : '') + '<p class="muted" style="margin-top:6px">Then say “Alexa, emergency” in the kitchen for the parents’ step-by-step plan.</p></section>' +
      (s.must_know.length ? '<section><h2>Must know</h2>' + s.must_know.map(function (m) { return '<p class="must">' + esc(m) + '</p>'; }).join('') + '</section>' : '') +
      '<section><h2>Call</h2>' + calls + '</section>' +
      '<section><h2>Ask the parents</h2><textarea id="ask" maxlength="300" placeholder="Can she stay up to finish her movie?"></textarea><button id="send">Send to ' + esc(s.contacts[0] ? s.contacts[0].name : 'the parents') + '</button>' + (qs ? '<div style="margin-top:10px">' + qs + '</div>' : '') + '</section>' +
      (next ? '<section><h2>Next tonight</h2>' + next + '</section>' : '') +
      '<p class="note">This page is tonight’s Guest Pass from ' + esc(s.household) + '. It closes when the evening ends. The parents can see what is asked here.</p>';
    var t2 = document.getElementById('ask');
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
  function refresh() {
    if (!token) { render({ ended: true }); return; }
    api('guest/api/state').then(function (r) {
      if (r.status === 401 || r.status === 403) render({ ended: true, carer: r.body && r.body.carer });
      else render(r.body);
    }).catch(function () {});
  }
  refresh();
  setInterval(function () { if (document.activeElement && document.activeElement.id === 'ask') return; refresh(); }, 10000);
})();
</script></body></html>`;
