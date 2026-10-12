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
  .upload { display: block; text-align: center; padding: 14px; border: 2px dashed var(--line); border-radius: 12px; margin-top: 10px; cursor: pointer; font-weight: 600; }
  .upload input { display: none; }
  .wide { width: 100%; margin-top: 8px; }
  .from { font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 18px 0 4px; }
  .pcard textarea.ptext { margin-top: 6px; }
  .chip { display: inline-block; font-size: 12px; padding: 2px 8px; border-radius: 999px; background: #eef2f7; color: #334e68; margin-right: 6px; }
  .chip.safety { background: #fdecea; color: var(--red); }
  .warn { font-size: 13px; color: #8a5a00; background: #fff4d6; padding: 4px 8px; border-radius: 6px; margin-top: 6px; }
  .conflict { background: #fff7e6; border: 1px solid #f0c36d; border-radius: 8px; padding: 8px; margin-top: 8px; font-size: 14px; }
  .pbtns { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; margin-top: 8px; }
  .perr { color: var(--red); font-size: 14px; margin-top: 6px; }
  .en { font-size: 14px; color: var(--muted); margin-top: 4px; }
</style>
</head>
<body>
<header><strong>While You're Out</strong><small id="status">Connecting…</small>
  <label class="me">Answering as <select id="me"></select></label></header>
<main>
  <div id="emergency"></div>
  <div id="debrief"></div>
  <div class="card" id="busy"></div>
  <div id="questions"></div>
  <div class="card"><strong>Tonight so far</strong><div id="log" class="muted">Nothing logged yet.</div></div>
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
</main>
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
  var parentsShown = '';
  async function load() {
    var r;
    try { r = await fetch('/parent/api/state?k=' + encodeURIComponent(key)); } catch (e) { document.getElementById('status').textContent = 'Offline, retrying…'; return; }
    if (!r.ok) { document.getElementById('status').textContent = 'Not authorised'; return; }
    var s = await r.json();
    houseTz = s.timezone || undefined;
    if (s.parents.join('|') !== parentsShown) {
      parentsShown = s.parents.join('|');
      if (s.parents.indexOf(me) < 0) me = s.parents[0] || 'Parent';
      sel.innerHTML = s.parents.map(function (p) { return '<option' + (p === me ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('');
    }
    var tb = s.teachback;
    var tbText = !tb ? '' : tb.done
      ? (tb.right === tb.total ? ' · Handover confirmed ✓ (' + tb.right + '/' + tb.total + ')' : ' · Handover checked: ' + tb.right + '/' + tb.total + ' right, corrected on screen')
      : ' · Handover check in progress (' + tb.answered + '/' + tb.total + ')';
    document.getElementById('status').textContent = s.handoff ? (s.handoff.carer_name + ' is looking after things' + tbText) : 'No handoff in progress';
    document.getElementById('emergency').innerHTML = s.emergency ? '<div class="card alert"><strong>Emergency reported · ' + esc(time(s.emergency.at)) + '</strong><p>' + esc(s.emergency.description) + '</p><p>Every contact has been alerted. Call ' + esc(s.handoff ? s.handoff.carer_name : 'the carer') + ' now.</p></div>' : '';
    var dKey = JSON.stringify([s.debrief && s.debrief.handoff_id, s.debrief && s.debrief.rule_suggestions.length, s.shopping]);
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
        '<p class="q">' + esc(s.handoff ? s.handoff.carer_name : 'Carer') + ' asks: “' + esc(q.text) + '”</p>' +
        (q.text_english ? '<p class="en">In English: “' + esc(q.text_english) + '”</p>' : '') +
        '<div class="btns"><button class="ok" data-a="Yes, that\\'s fine.">Approve</button><button class="no" data-a="No, please don\\'t.">Deny</button><button data-a="Please call me.">Call me</button></div>' +
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

  load(); setInterval(load, 2000);
  loadProposals(); setInterval(loadProposals, 4000);
</script>
</body>
</html>`;
