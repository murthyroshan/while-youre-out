// One MCP App (ui:// resource) that renders every While You're Out card.
// It speaks the MCP Apps postMessage protocol directly so it has no build step:
// ui/initialize -> ui/notifications/initialized -> receives ui/notifications/tool-result.

export const CARD_URI = 'ui://while-youre-out/card.html';
export const CARD_MIME = 'text/html;profile=mcp-app';

export const CARD_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>While You're Out</title>
<style>
  :root { --bg:#fffaf3; --ink:#1f2933; --muted:#6b7280; --red:#c0392b; --redbg:#fdecea; --line:#eadfce; --accent:#1d6fb8; }
  @media (prefers-color-scheme: dark) { :root { --bg:#16181d; --ink:#f3f4f6; --muted:#9ca3af; --redbg:#3a1714; --line:#2b2f36; } }
  * { box-sizing: border-box; }
  body { margin:0; font: 16px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; background: var(--bg); color: var(--ink); }
  .card { padding: 18px 20px; }
  h1 { font-size: 20px; margin: 0 0 10px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 14px 0 6px; }
  .quote { border-left: 4px solid var(--line); padding: 6px 10px; margin: 6px 0; }
  .quote small { display:block; color: var(--muted); font-size: 12px; }
  .alert { background: var(--redbg); border-left: 6px solid var(--red); padding: 10px 12px; border-radius: 6px; margin: 8px 0; }
  .guard { background: #fff4d6; color:#5c4400; padding: 10px 12px; border-radius: 6px; margin-top: 10px; }
  .emergency { background: var(--red); color: #fff; padding: 18px 20px; }
  .emergency h1 { font-size: 26px; }
  .emergency .addr { font-size: 22px; font-weight: 700; margin: 8px 0 14px; }
  .emergency ol { padding-left: 22px; }
  .emergency li { margin: 6px 0; }
  .pill { display:inline-block; font-size:12px; padding:2px 8px; border-radius: 999px; background: var(--line); margin-right: 6px; }
  html { scrollbar-gutter: stable; }
  img.photo { display:block; max-width: 100%; max-height: 260px; object-fit: contain; border-radius: 8px; margin-top: 8px; }
  .emergency img.photo { max-height: 160px; background: #fff; }
  ul { padding-left: 20px; margin: 4px 0; }
</style>
</head>
<body>
<div id="root" class="card"><p>Loading…</p></div>
<script>
(function () {
  var nextId = 1;
  var pending = {};
  function send(msg) { window.parent.postMessage(msg, '*'); }
  function request(method, params) {
    var id = nextId++;
    send({ jsonrpc: '2.0', id: id, method: method, params: params });
    return new Promise(function (resolve) { pending[id] = resolve; });
  }
  function notify(method, params) { send({ jsonrpc: '2.0', method: method, params: params || {} }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]; }); }
  function quote(f) { return '<div class="quote">' + esc(f.text) + '<small>' + esc(f.said_by || '') + (f.source ? ' · ' + esc(f.source) : '') + '</small></div>'; }
  function list(items) { return items && items.length ? '<ul>' + items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>' : ''; }

  var renderers = {
    answer: function (d) {
      var h = '';
      var facts = d.facts || [];
      if (d.allergy_alert) h += '<div class="alert"><strong>Allergy alert</strong><br>' + esc(d.allergy_alert) + '</div>';
      // Red box only for facts the parents marked as safety-critical (not any text that mentions "allergy").
      var safety = facts.filter(function (f) { return f.risk === 'safety'; });
      safety.forEach(function (f) { h += '<div class="alert"><strong>' + (f.category === 'allergy' ? 'Allergy' : 'Important') + '</strong><br>' + esc(f.text) + '<small style="display:block">' + esc(f.said_by) + '</small></div>'; });
      facts.filter(function (f) { return safety.indexOf(f) < 0; }).forEach(function (f) { h += quote(f); });
      if (!facts.length && !d.guard && !d.allergy_alert) h += '<p>The parents haven\\'t covered this yet.</p>';
      if (d.guard) h += '<div class="guard">' + esc(d.guard) + '</div>';
      return '<h1>What the parents said</h1>' + h;
    },
    briefing: function (d) {
      return '<h1>Tonight with ' + esc(d.carer) + '</h1>' +
        (d.must_know.length ? '<div class="alert"><strong>Must know</strong>' + list(d.must_know) + (d.epipen ? '<div>EpiPen: ' + esc(d.epipen) + '</div>' : '') + '</div>' : '') +
        '<h2>Dinner</h2>' + list(d.dinner) + '<h2>Bedtime</h2>' + list(d.bedtime) +
        '<h2>Screen time</h2>' + list(d.screen) + (d.pets.length ? '<h2>Pets</h2>' + list(d.pets) : '') +
        (d.rules.length ? '<h2>Rules</h2>' + list(d.rules) : '') +
        '<h2>First call</h2><p>' + esc(d.first_contact) + '</p>';
    },
    location: function (d) {
      return '<h1>' + esc(d.item) + '</h1><p>' + esc(d.description) + '</p>' + (d.photo_url ? '<img class="photo" alt="" src="' + esc(d.photo_url) + '">' : '');
    },
    emergency: function (d) {
      document.body.className = 'emergency'; document.getElementById('root').className = 'emergency';
      return '<h1>' + esc(d.say_first) + '</h1><div class="addr">' + esc(d.address) + '</div>' +
        '<h2 style="color:#fff">' + esc(d.action_plan.source) + '</h2><ol>' +
        d.action_plan.steps.map(function (s) { return '<li>' + esc(s.text) + (s.timer_seconds ? ' <span class="pill">' + Math.round(s.timer_seconds / 60) + ' min timer</span>' : '') + '</li>'; }).join('') + '</ol>' +
        (d.epipen_location ? '<p><strong>EpiPen:</strong> ' + esc(d.epipen_location) + '</p>' : '') +
        (d.epipen_photo ? '<img class="photo" alt="Where the EpiPen is kept" src="' + esc(d.epipen_photo) + '">' : '') +
        '<p>Alerted: ' + esc(d.parents_alerted.join(', ')) + '</p><p style="opacity:.8;font-size:13px">' + esc(d.note) + '</p>';
    },
    question: function (d) {
      var title = d.answer ? esc(d.answered_by) + ' answered' : 'Asking ' + esc(d.asked);
      return '<h1>' + title + '</h1><p>“' + esc(d.text) + '”</p>' +
        (d.answer ? '<div class="quote">' + esc(d.answer) + '<small>' + esc(d.answered_by) + (d.scope === 'always' ? ' · saved as a rule' : ' · just tonight') + '</small></div>' : '<p class="pill">Waiting for an answer</p>');
    },
    summary: function (d) {
      var times = (d.timeline || []).map(function (e) {
        var t = new Date(e.at);
        return (isNaN(t) ? '' : t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' · ') + e.text;
      });
      return '<h1>Evening with ' + esc(d.carer) + '</h1>' +
        '<h2>Timeline</h2>' + (times.length ? list(times) : '<p>Nothing was logged.</p>') +
        '<h2>Questions</h2>' + (d.questions && d.questions.length ? list(d.questions) : '<p>No questions tonight.</p>');
    }
  };

  function render(result) {
    var d = result && result.structuredContent;
    var root = document.getElementById('root');
    if (!d || !d.view || !renderers[d.view]) { root.innerHTML = '<p>' + esc((result && result.content && result.content[0] && result.content[0].text) || '') + '</p>'; }
    else root.innerHTML = renderers[d.view](d);
    // Emergencies take the whole screen on hosts that support it.
    if (d && d.view === 'emergency') request('ui/request-display-mode', { mode: 'fullscreen' });
  }

  // Report the content's real size whenever it changes (after layout, not before).
  var lastH = 0;
  new ResizeObserver(function () {
    var r = document.getElementById('root').getBoundingClientRect();
    var h = Math.ceil(r.height);
    if (h > 0 && h !== lastH) { lastH = h; notify('ui/notifications/size-changed', { width: Math.ceil(r.width), height: h }); }
  }).observe(document.getElementById('root'));

  window.addEventListener('message', function (e) {
    var m = e.data;
    if (!m || m.jsonrpc !== '2.0') return;
    if (m.id != null && pending[m.id]) { pending[m.id](m.result); delete pending[m.id]; return; }
    if (m.method === 'ui/notifications/tool-result') render(m.params);
  });

  request('ui/initialize', {
    appInfo: { name: 'while-youre-out-card', version: '0.1.0' },
    appCapabilities: {},
    protocolVersion: '2026-01-26'
  }).then(function () { notify('ui/notifications/initialized'); });
})();
</script>
</body>
</html>`;
