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
  ol.tl { list-style: none; padding: 0; margin: 6px 0; }
  ol.tl li { display: grid; grid-template-columns: 82px 1fr; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--line); }
  ol.tl .t { font-variant-numeric: tabular-nums; color: var(--muted); }
  ol.tl li.done { opacity: .55; }
  ol.tl li.due .t, ol.tl li.due strong { color: var(--accent); }
  ol.tl li.late .t { color: var(--red); }
  ol.tl small { color: var(--muted); }
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
  function timeline(items) {
    var mark = { done: '✓', due: '●', late: '!', upcoming: '' };
    return '<ol class="tl">' + items.map(function (i) {
      return '<li class="' + esc(i.status) + '"><span class="t">' + esc(i.time) + '</span><span><strong>' + esc(i.title) + '</strong> <span class="m">' + (mark[i.status] || '') + '</span>' +
        (i.checklist && i.checklist.length ? '<br><small>' + esc(i.checklist.join(' · ')) + '</small>' : '') + '</span></li>';
    }).join('') + '</ol>';
  }
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
      if (!facts.length && !d.guard && !d.allergy_alert && !d.shadow) h += '<p>The parents haven\\'t covered this yet.</p>';
      if (d.guard) h += '<div class="guard">' + esc(d.guard) + '</div>';
      if (d.shadow) h += '<div class="quote" style="border-left-color:var(--accent)"><strong>Usually: ' + esc(d.shadow.likely) + '</strong> · ' + d.shadow.agree + ' of ' + d.shadow.total + ' times' + (d.shadow.days ? ' on ' + esc(d.shadow.days) : '') +
        '<small>' + esc(d.shadow.message) + '</small></div>';
      if (d.busy_until) h += '<p class="pill">Urgent questions only until ' + esc(d.busy_until) + '</p>';
      return '<h1>What the parents said</h1>' + h;
    },
    teachback: function (d) {
      var fb = d.feedback;
      var h = '<h1>Quick check' + (d.carer ? ', ' + esc(d.carer) : '') + '</h1>';
      if (fb) h += fb.correct ? '<div class="quote">✓ That\\'s right.</div>' :
        fb.correct === null ? '<p class="pill">Skipped</p><div class="quote">' + esc(fb.answer) + '</div>' :
        '<div class="alert"><strong>The parents said</strong><br>' + esc(fb.answer) + '</div>';
      if (d.kind === 'question') h += '<h2>Question ' + d.number + ' of ' + d.total + '</h2><p style="font-size:22px">' + esc(d.question) + '</p>';
      if (d.kind === 'done') h += '<h2>Handover check</h2><p style="font-size:22px">' + d.summary.right + ' of ' + d.summary.total + ' right</p>';
      return h;
    },
    plan: function (d) {
      var items = d.items || [];
      return '<h1>Tonight\\'s plan</h1>' +
        (d.plan_change ? '<div class="guard">' + esc(d.plan_change) + '</div>' : (d.shift_reason ? '<p class="pill">Adjusted tonight</p>' : '')) +
        (items.length ? timeline(items) : '<p>The parents haven\\'t given times for tonight.</p>');
    },
    briefing: function (d) {
      var since = d.since_last_visit;
      return '<h1>Tonight with ' + esc(d.carer) + '</h1>' +
        (since ? '<div class="guard"><strong>Since your last visit</strong>' +
          list(since.added.map(function (a) { return a.text + ' (' + a.said_by + ')'; }).concat(since.removed.map(function (r) { return 'No longer: ' + r.text; }))) + '</div>' : '') +
        (d.plan && d.plan.length ? '<h2>Tonight</h2>' + timeline(d.plan) : '') +
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
        return (isNaN(t) ? '' : t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: d.timezone || undefined }) + ' · ') + e.text;
      });
      return '<h1>Evening with ' + esc(d.carer) + '</h1>' +
        (d.insights && d.insights.length ? '<h2>Worth knowing</h2>' + list(d.insights) : '') +
        '<h2>Timeline</h2>' + (times.length ? list(times) : '<p>Nothing was logged.</p>') +
        '<h2>Questions</h2>' + (d.questions && d.questions.length ? list(d.questions) : '<p>No questions tonight.</p>');
    }
  };

  function render(result) {
    var d = result && result.structuredContent;
    var root = document.getElementById('root');
    if (!d || !d.view || !renderers[d.view]) { root.innerHTML = '<p>' + esc((result && result.content && result.content[0] && result.content[0].text) || '') + '</p>'; }
    else root.innerHTML = renderers[d.view](d);
    // Bilingual relay: what the carer heard in their language, above the parents' original words.
    if (d && d.spoken && d.language && d.language !== 'en') {
      root.insertAdjacentHTML('afterbegin', '<div class="quote" lang="' + esc(d.language) + '" style="font-size:18px;border-left-color:var(--accent)">' + esc(d.spoken) + '<small>Said in ' + esc(d.language) + ' · the parents\\' own words are below</small></div>');
    }
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
