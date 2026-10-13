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
  .notify { display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
  .notify p { margin: 4px 0 0; }
  .photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; margin-top: 8px; }
  .photos figure { margin: 0; }
  .photos img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 8px; display: block; background: #eee; }
  .photos figcaption { font-size: 13px; color: var(--muted); margin-top: 2px; }
  details.card > summary { cursor: pointer; font-weight: 600; list-style: none; }
  details.card > summary::-webkit-details-marker { display: none; }
  details.card > summary::after { content: '▸'; float: right; color: var(--muted); }
  details.card[open] > summary::after { content: '▾'; }
  .field { display: block; margin: 10px 0 0; font-size: 14px; color: var(--muted); }
  .field input, .field select, .row input, .row select { display: block; width: 100%; font: inherit; color: var(--ink); padding: 9px; border-radius: 8px; border: 1px solid var(--line); background: #fff; margin-top: 4px; }
  .row { border: 1px solid var(--line); border-radius: 10px; padding: 10px; margin-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .row .full { grid-column: 1 / -1; }
  .row label { font-size: 13px; color: var(--muted); }
  .row .tools { grid-column: 1 / -1; display: flex; gap: 6px; justify-content: flex-end; align-items: center; }
  .row .tools button { padding: 6px 10px; font-size: 14px; }
  .row .tools .grow { flex: 1; font-size: 13px; color: var(--muted); }
  .row .tools label { display: flex; gap: 6px; align-items: center; }
  .row .tools label input { display: inline; width: auto; margin: 0; }
  .order { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: #eef2f7; color: #334e68; font-size: 13px; font-weight: 700; }
  .ferr { color: var(--red); font-size: 14px; min-height: 1em; margin: 8px 0 0; }
  .banner { background: #fff4d6; border-color: #f0c36d; }
  .danger button { border-color: var(--red); color: var(--red); }
  .danger button.armed { background: var(--red); color: #fff; }
</style>
</head>
<body>
<header><strong>While You're Out</strong><small id="status">Connecting…</small>
  <label class="me">Answering as <select id="me"></select></label></header>
<main>
  <div id="emergency"></div>
  <div id="setupBanner"></div>
  <section class="card notify" id="notify" hidden></section>
  <div id="debrief"></div>
  <section class="card" id="photos" hidden></section>
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
  <details class="card" id="family">
    <summary>Your family</summary>
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
    <p class="muted" id="resetNote">Clears tonight, past evenings, photos and saved rules. Tap again to confirm.</p>
  </details>
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
    var phKey = s.photos.map(function (p) { return p.id; }).join(',');
    if (phKey !== lastPhotos) { lastPhotos = phKey; renderPhotos(s.photos); }
    document.getElementById('setupBanner').innerHTML = s.parents.length ? '' :
      '<div class="card banner"><strong>Set up your family to start</strong><p class="muted">Add who Alexa looks after and who to call. It takes a minute.</p><button class="ok" id="openFamily">Set up now</button></div>';
    document.getElementById('log').innerHTML = s.log.length ? '<ul>' + s.log.map(function (e) { return '<li>' + esc(time(e.at)) + ' ' + esc(e.text) + '</li>'; }).join('') + '</ul>' : 'Nothing logged yet.';
  }
  var lastQKey = null, lastBusy = null, lastShadow = null, lastDebrief = null, lastPhotos = null;
  function renderPhotos(photos) {
    var box = document.getElementById('photos');
    box.hidden = !photos.length;
    box.innerHTML = '<strong>Photos from home</strong><div class="photos">' + photos.slice().reverse().map(function (p) {
      var src = '/parent/api/photos/' + p.id + '?k=' + encodeURIComponent(key);
      return '<figure><a href="' + src + '" target="_blank" rel="noopener"><img src="' + src + '" alt="Photo from ' + esc(p.taken_by || 'home') + '" loading="lazy"></a>' +
        '<figcaption>' + esc(time(p.at)) + (p.taken_by ? ' · ' + esc(p.taken_by) : '') + (p.caption ? ' · “' + esc(p.caption) + '”' : '') + '</figcaption></figure>';
    }).join('') + '</div>';
  }
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
      famBox.open = true;
      lastQKey = lastBusy = lastShadow = lastDebrief = lastPhotos = lastPKey = null;
      parentsShown = null;
      load();
      loadProposals();
    }
  });
  document.addEventListener('click', function (e) {
    if (e.target.id !== 'openFamily') return;
    famBox.open = true;
    famBox.scrollIntoView({ behavior: 'smooth' });
  });
  loadFamily();

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
    data: { url: m.url || '/parent' },
  };
  if (m.image) options.image = m.image;
  e.waitUntil(self.registration.showNotification(m.title || "While You're Out", options));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/parent';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (new URL(list[i].url).pathname === '/parent' && 'focus' in list[i]) return list[i].focus();
    }
    return self.clients.openWindow(url);
  }));
});
`;
