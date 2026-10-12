// The parent's phone page. Served by the MCP server itself: no app to install.
export const PARENT_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>While You're Out · Parent</title>
<style>
  :root { --bg:#f7f4ef; --card:#fff; --ink:#1f2933; --muted:#6b7280; --green:#1e7b4f; --red:#c0392b; --line:#e7e1d6; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; background: var(--bg); color: var(--ink); }
  header { padding: 16px; background: #1f2933; color: #fff; }
  header small { color: #cbd2d9; display:block; }
  header .me { display:block; margin-top: 6px; font-size: 14px; color: #cbd2d9; }
  header select { font: inherit; margin-left: 4px; }
  main { padding: 12px 16px 40px; max-width: 520px; margin: 0 auto; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px; margin: 12px 0; }
  .q { font-size: 18px; margin: 0 0 10px; }
  .btns { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  button { font: inherit; padding: 12px 8px; border-radius: 10px; border: 1px solid var(--line); background: #fff; }
  button.ok { background: var(--green); color: #fff; border: 0; }
  button.no { background: #fff; color: var(--red); border-color: var(--red); }
  .scope { display:flex; gap: 14px; margin: 10px 0 0; color: var(--muted); font-size: 14px; }
  .alert { background: var(--red); color: #fff; }
  .muted { color: var(--muted); font-size: 14px; }
  ul { padding-left: 18px; margin: 6px 0; }
  .urgent { display:inline-block; font-size: 12px; background:#fdecea; color: var(--red); padding: 2px 8px; border-radius: 999px; margin-bottom: 6px; }
  .always-note { display: none; margin: 8px 0 0; font-size: 14px; color: #8a5a00; background: #fff4d6; padding: 6px 8px; border-radius: 6px; }
  .card:has(input[value=always]:checked) .always-note { display: block; }
  textarea { width: 100%; margin-top: 8px; font: inherit; padding: 8px; border-radius: 8px; border: 1px solid var(--line); }
</style>
</head>
<body>
<header><strong>While You're Out</strong><small id="status">Connecting…</small>
  <label class="me">Answering as <select id="me"></select></label></header>
<main>
  <div id="emergency"></div>
  <div id="questions"></div>
  <div class="card"><strong>Tonight so far</strong><div id="log" class="muted">Nothing logged yet.</div></div>
</main>
<script>
  var params = new URLSearchParams(location.search);
  var key = params.get('k') || '';
  var me = params.get('as') || '';
  try { me = me || localStorage.getItem('wyo.me') || ''; } catch (e) {}
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
  function time(iso){ var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  var sel = document.getElementById('me');
  sel.addEventListener('change', function () { me = sel.value; try { localStorage.setItem('wyo.me', me); } catch (e) {} });
  var parentsShown = '';
  async function load() {
    var r;
    try { r = await fetch('/parent/api/state?k=' + encodeURIComponent(key)); } catch (e) { document.getElementById('status').textContent = 'Offline, retrying…'; return; }
    if (!r.ok) { document.getElementById('status').textContent = 'Not authorised'; return; }
    var s = await r.json();
    if (s.parents.join('|') !== parentsShown) {
      parentsShown = s.parents.join('|');
      if (s.parents.indexOf(me) < 0) me = s.parents[0] || 'Parent';
      sel.innerHTML = s.parents.map(function (p) { return '<option' + (p === me ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('');
    }
    document.getElementById('status').textContent = s.handoff ? (s.handoff.carer_name + ' is looking after things') : 'No handoff in progress';
    document.getElementById('emergency').innerHTML = s.emergency ? '<div class="card alert"><strong>Emergency reported · ' + esc(time(s.emergency.at)) + '</strong><p>' + esc(s.emergency.description) + '</p><p>Every contact has been alerted. Call ' + esc(s.handoff ? s.handoff.carer_name : 'the carer') + ' now.</p></div>' : '';
    // Only redraw questions when the set changes, so typing and choices aren't wiped by polling.
    var qKey = s.questions.map(function (q) { return q.id; }).join(',');
    if (qKey !== lastQKey) { lastQKey = qKey; renderQuestions(s); }
    document.getElementById('log').innerHTML = s.log.length ? '<ul>' + s.log.map(function (e) { return '<li>' + esc(time(e.at)) + ' ' + esc(e.text) + '</li>'; }).join('') + '</ul>' : 'Nothing logged yet.';
  }
  var lastQKey = null;
  function renderQuestions(s) {
    document.getElementById('questions').innerHTML = s.questions.map(function (q) {
      return '<div class="card" data-id="' + q.id + '">' + (q.urgency === 'urgent' ? '<span class="urgent">Urgent</span>' : '') +
        '<p class="q">' + esc(s.handoff ? s.handoff.carer_name : 'Carer') + ' asks: “' + esc(q.text) + '”</p>' +
        '<div class="btns"><button class="ok" data-a="Yes, that\\'s fine.">Approve</button><button class="no" data-a="No, please don\\'t.">Deny</button><button data-a="Please call me.">Call me</button></div>' +
        '<textarea placeholder="Or type an answer…"></textarea>' +
        (q.urgency === 'urgent'
          ? '<input type="radio" name="s' + q.id + '" value="tonight" checked hidden><p class="muted">Food, medicine and safety answers apply to tonight only.</p></div>'
          : '<div class="scope"><label><input type="radio" name="s' + q.id + '" value="tonight" checked> Just tonight</label><label><input type="radio" name="s' + q.id + '" value="always"> Always</label></div>' +
            '<p class="always-note">Your answer will be saved as a house rule for every future handoff.</p></div>');
    }).join('');
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
  load(); setInterval(load, 2000);
</script>
</body>
</html>`;
