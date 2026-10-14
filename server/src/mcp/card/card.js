// While You're Out: one MCP App that renders every card. Plain JavaScript, no build step.
// Protocol (MCP Apps): ui/initialize -> ui/notifications/initialized -> ui/notifications/tool-result.
// The Tonight screen also calls tools through the host (tools/call) to keep itself up to date,
// and its buttons send what the carer would say (ui/message).
(function () {
  'use strict';
  var nextId = 1;
  var pending = {};
  var host = { displayMode: 'inline' };
  var current = null; // the latest tool result
  var refreshTimer = null;
  var tickTimer = null;

  function send(msg) { window.parent.postMessage(msg, '*'); }
  function request(method, params) {
    var id = nextId++;
    send({ jsonrpc: '2.0', id: id, method: method, params: params || {} });
    return new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
      setTimeout(function () { if (pending[id]) { delete pending[id]; reject(new Error('timeout')); } }, 15000);
    });
  }
  function notify(method, params) { send({ jsonrpc: '2.0', method: method, params: params || {} }); }
  function say(text) {
    // The carer tapping a button is the same as saying it.
    request('ui/message', { role: 'user', content: [{ type: 'text', text: text }] }).catch(function () {});
  }

  // ---------- helpers ----------
  // A step's title inside a sentence: "bath 7:15 pm", but "Bruno gets one cup 7:00 pm" (a name stays).
  function inSentence(title, members) {
    var first = String(title).split(/\s/)[0].toLowerCase();
    var named = (members || []).some(function (m) { return String(m.name).toLowerCase() === first; });
    return named ? title : title.charAt(0).toLowerCase() + title.slice(1);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function andList(a) { return a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : (a[0] || ''); }
  function hue(name) { var h = 0; for (var i = 0; i < String(name).length; i++) h = (h * 31 + String(name).charCodeAt(i)) % 360; return h; }
  function avatar(name, cls) {
    var n = String(name || '?');
    return '<span class="av ' + (cls || '') + '" style="background:hsl(' + hue(n) + ' 75% 72%)" aria-hidden="true">' + esc(n.replace(/^(Dr\.|Mrs\.|Mr\.|Ms\.)\s*/, '').charAt(0).toUpperCase()) + '</span>';
  }
  function ago(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    var d = Math.round((Date.now() - t) / 86400000);
    if (d <= 0) return 'today';
    if (d === 1) return 'yesterday';
    if (d < 14) return d + ' days ago';
    if (d < 60) return Math.round(d / 7) + ' weeks ago';
    return Math.round(d / 30) + ' months ago';
  }
  var SOURCE = { voice: 'told Alexa', photo: 'fridge note', whatsapp: 'WhatsApp', pdf: "doctor's letter", parent_answer: 'answered a question', setup: 'family setup', text: 'note' };

  var ICONS = {
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    bath: '<path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.68 3 4 3.68 4 4.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M10 5 8 7"/><path d="M2 12h20"/><path d="M7 19v2"/><path d="M17 19v2"/>',
    tv: '<rect width="20" height="15" x="2" y="7" rx="2"/><path d="m17 2-5 5-5-5"/>',
    paw: '<circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.05Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/>',
    pin: '<path d="M20 10c0 5-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 15 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    sparkles: '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/>',
    door: '<path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.56v16.16a1 1 0 0 1-1.24.97L5 20V5.56a2 2 0 0 1 1.52-1.94l4-1A2 2 0 0 1 13 4.56Z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
    pill: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
    timer: '<path d="M10 2h4"/><path d="m12 14 3-3"/><circle cx="12" cy="14" r="8"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  };
  function icon(name) { return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || ICONS.info) + '</svg>'; }
  function stepIcon(key, title) {
    var t = (key + ' ' + title).toLowerCase();
    if (/dinner|supper|lunch|snack|eat/.test(t)) return 'utensils';
    if (/bath|shower/.test(t)) return 'bath';
    if (/bed|lights out|sleep|nap/.test(t)) return 'moon';
    if (/tv|screen|show|episode/.test(t)) return 'tv';
    if (/dog|cat|walk|feed|pet|bruno/.test(t)) return 'paw';
    if (/stor|book|read/.test(t)) return 'book';
    if (/medic|pill|dose/.test(t)) return 'pill';
    return 'clock';
  }
  var CATEGORY = { food: ['utensils', 'Food'], medicine: ['pill', 'Medicine'], safety_info: ['shield', 'Safety'], secret: ['shield', 'Private'], return_time: ['clock', 'When they’re back'], general: ['message', 'From the parents'] };

  var TOPIC = { screen: ['tv', 'TV & screens'], routine: ['moon', 'Bedtime & routine'], pet: ['paw', 'Pets'], rules: ['message', 'House rules'], house: ['door', 'The house'], contacts: ['phone', 'Contacts'], food: ['utensils', 'Food'], allergy: ['shield', 'Allergies'] };

  function quoteFact(f) {
    var by = esc(f.said_by || 'Parent') + (f.source && SOURCE[f.source] ? ' · ' + SOURCE[f.source] : '') + (f.when ? ' · ' + ago(f.when) : '');
    var text = f.text;
    var qa = /^Q: (.*?) A: (.*)$/.exec(text || '');
    if (qa) return '<div class="say">' + avatar(f.said_by) + '<div><p>“' + esc(qa[2]) + '”</p><span class="by">' + esc(f.said_by) + ' answered “' + esc(qa[1]) + '”' + (f.when ? ' · ' + ago(f.when) : '') + '</span></div></div>';
    return '<div class="say">' + avatar(f.said_by) + '<div><p>' + esc(text) + '</p><span class="by">' + by + '</span></div></div>';
  }
  function banner(kind, ic, title, body, by) {
    return '<div class="banner ' + kind + '">' + icon(ic) + '<div>' + (title ? '<strong>' + esc(title) + '</strong>' : '') + (body ? '<span>' + esc(body) + '</span>' : '') + (by ? '<span class="by">' + esc(by) + '</span>' : '') + '</div></div>';
  }
  function timeline(items) {
    var tag = { done: '<span class="pill green">' + icon('check') + ' Done</span>', due: '<span class="pill amber">Now</span>', late: '<span class="pill red">Late</span>', upcoming: '' };
    return '<ol class="tl">' + items.map(function (i) {
      return '<li class="' + esc(i.status) + '"><span class="t">' + esc(i.time) + '</span><span class="ic">' + icon(i.status === 'done' ? 'check' : stepIcon(i.key, i.title)) + '</span>' +
        '<span class="what"><strong>' + esc(i.title) + '</strong>' + (i.checklist && i.checklist.length ? '<small>' + esc(i.checklist.join(' · ')) + '</small>' : '') + '</span>' + (tag[i.status] || '') + '</li>';
    }).join('') + '</ol>';
  }
  function list(items) { return items && items.length ? '<ul>' + items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>' : ''; }
  function panel(inner, cls) { return '<div class="panel ' + (cls || '') + '">' + inner + '</div>'; }

  function legacyEmergency(d) {
      document.body.style.background = '#7a0b10';
      var steps = d.action_plan.steps || [];
      return '<div class="emergency" role="alert"><span class="flag">' + icon('alert') + ' EMERGENCY</span><h1>' + esc(d.say_first) + '</h1>' +
        (d.address ? '<div class="addr"><small>Tell 911 this address</small>' + esc(d.address) + '</div>' : '') +
        '<div class="cols"><div><div class="eyebrow" style="color:#ffd7d8">' + esc(d.action_plan.source) + '</div><ol class="steps">' +
        steps.map(function (s, i) { return '<li class="' + (i === 0 ? 'now' : '') + '">' + esc(s.text) + (s.timer_seconds ? ' <span class="pill" style="background:rgba(0,0,0,.25);color:#fff">' + icon('timer') + ' ' + Math.round(s.timer_seconds / 60) + ' min</span>' : '') + '</li>'; }).join('') +
        '</ol></div><div class="side">' +
        (d.epipen_photo ? '<img alt="Where the EpiPen is kept" src="' + esc(d.epipen_photo) + '">' : '') +
        (d.epipen_location ? '<div class="box"><strong>EpiPen</strong>' + esc(d.epipen_location) + '</div>' : '') +
        '<div class="box"><strong>Alerted</strong>' + esc((d.parents_alerted || []).join(', ') || 'The parents') + '</div>' +
        '<p class="note">' + esc(d.note) + '</p></div></div></div>';
    }

  // ---------- views ----------
  var views = {
    answer: function (d) {
      var facts = d.facts || [];
      var topic = d.category === 'general' && facts[0] ? TOPIC[facts[0].category] : null;
      var cat = topic || CATEGORY[d.category] || CATEGORY.general;
      // Wide screen: what keeps the child safe on the left, the parents' everyday words on the right.
      var safety = facts.filter(function (f) { return f.risk === 'safety'; });
      var words = facts.filter(function (f) { return safety.indexOf(f) < 0; });
      var left = '';
      if (d.allergy_alert) left += banner('safety', 'alert', 'Allergy alert · the parents have been told', d.allergy_alert);
      safety.forEach(function (f) { left += banner('safety', 'shield', f.category === 'allergy' ? 'Allergy' : 'Important', f.text, f.said_by + (f.source && SOURCE[f.source] ? ' · ' + SOURCE[f.source] : '')); });
      if (d.guard) left += banner('guard', 'info', '', d.guard);
      var right = (d.exact === false && words.length ? '<p class="sub">The parents haven’t said exactly. This is the closest.</p>' : '') + words.map(quoteFact).join('');
      var h = '<div class="eyebrow">' + icon(cat[0]) + esc(cat[1]) + '</div>';
      h += left && right ? '<div class="split"><div class="stack">' + left + '</div><div class="stack">' + right + '</div></div><div class="stack" style="margin-top:.75em">' : '<div class="stack">' + left + right;
      if (d.shadow) {
        var s = d.shadow;
        h += '<div class="usually"><div class="eyebrow">' + icon('sparkles') + 'How the parents usually answer</div>' +
          '<div class="big ' + esc(s.likely) + '">Usually ' + esc(s.likely) + '</div>' +
          '<div class="meter ' + esc(s.likely) + '"><i style="width:' + Math.round((100 * s.agree) / Math.max(1, s.total)) + '%"></i></div>' +
          '<span class="sub">' + s.agree + ' of ' + s.total + ' times' + (s.days ? ' on ' + esc(s.days) : '') + ' · it’s your call, or I can ask</span></div>';
      }
      if (!facts.length && !d.guard && !d.allergy_alert && !d.shadow) h += '<div class="empty">' + icon('message') + '<span>The parents haven’t covered this yet. Say <b>“ask them”</b> and I’ll check.</span></div>';
      if (d.busy_until) h += '<span class="pill amber">' + icon('clock') + ' Urgent questions only until ' + esc(d.busy_until) + '</span>';
      return panel(h + '</div>');
    },

    teachback: function (d) {
      var fb = d.feedback;
      var total = d.total || (d.summary && d.summary.total) || 3;
      var number = d.kind === 'done' ? total : d.number || 1;
      var dots = '';
      for (var i = 1; i <= total; i++) dots += '<i class="' + (i < number || d.kind === 'done' ? 'ok' : i === number ? 'on' : '') + '"></i>';
      var h = '<div class="eyebrow"><span class="dot"></span>Quick check before the parents leave' + (d.carer ? ' · ' + esc(d.carer) : '') + '</div><div class="dots">' + dots + '</div>';
      if (fb) h += fb.correct ? banner('ok', 'check', 'That’s right', '') : fb.correct === null ? banner('info', 'info', 'Skipped. The parents said:', fb.answer) : banner('safety', 'x', 'Not quite. The parents said:', fb.answer);
      if (d.kind === 'question') h += '<p class="sub" style="margin-top:.8em">Question ' + d.number + ' of ' + d.total + '</p><p class="q-big">' + esc(d.question) + '</p>';
      if (d.kind === 'done') {
        var sm = d.summary;
        var all = sm.right === sm.total;
        h += '<div class="score" style="margin-top:.6em"><span class="n" style="color:' + (all ? 'var(--green)' : 'var(--amber)') + '">' + sm.right + '/' + sm.total + '</span><div><div class="title" style="margin:0">' +
          (all ? 'Handover confirmed' : 'Handover checked') + '</div><span class="sub">The parents can see this on their phone.</span></div></div>';
      }
      return panel(h);
    },

    plan: function (d) {
      var items = d.items || [];
      var h = '<div class="eyebrow">' + icon('list') + 'Tonight’s plan</div>';
      if (d.plan_change) h += banner('guard', 'sparkles', 'Plan updated', d.plan_change);
      else if (d.shift_reason) h += '<span class="pill amber">Adjusted tonight</span>';
      return panel(h + (items.length ? timeline(items) : '<div class="empty">' + icon('clock') + '<span>The parents haven’t given times for tonight.</span></div>'));
    },

    briefing: function (d) {
      var since = d.since_last_visit;
      var h = '<div class="eyebrow"><span class="dot"></span>Sitter mode is on</div><div class="title">Tonight with ' + esc(d.carer) + '</div>';
      if (since) {
        var changes = since.added.map(function (a) { return a.text + ' (' + a.said_by + ')'; }).concat(since.removed.map(function (r) { return 'No longer: ' + r.text; }));
        h += '<div class="banner info">' + icon('sparkles') + '<div><strong>Welcome back. Since your last visit</strong>' + list(changes) + '</div></div>';
      }
      h += '<div class="grid2" style="margin-top:.9em">';
      if (d.must_know.length || d.epipen) h += '<div class="tile must"><h3>' + icon('shield') + 'Must know</h3>' + list(d.must_know) + (d.epipen ? '<p><b>EpiPen:</b> ' + esc(d.epipen) + '</p>' : '') + '</div>';
      if (d.plan && d.plan.length) h += '<div class="tile"><h3>' + icon('list') + 'Tonight</h3>' + timeline(d.plan.slice(0, 4)) + '</div>';
      [['utensils', 'Dinner', d.dinner], ['tv', 'Screen time', d.screen], ['paw', 'Pets', d.pets], ['message', 'House rules', d.rules]].forEach(function (t) {
        if (t[2] && t[2].length) h += '<div class="tile"><h3>' + icon(t[0]) + t[1] + '</h3>' + list(t[2]) + '</div>';
      });
      if (d.first_contact) h += '<div class="tile"><h3>' + icon('phone') + 'First call</h3><p><b>' + esc(d.first_contact) + '</b></p></div>';
      return panel(h + '</div>');
    },

    location: function (d) {
      return panel('<div class="eyebrow">' + icon('pin') + 'Where it’s kept</div><div class="where' + (d.photo_url ? '' : ' nophoto') + '">' +
        (d.photo_url ? '<img alt="Where the ' + esc(d.item) + ' is kept" src="' + esc(d.photo_url) + '">' : '') +
        '<div><div class="title">' + esc(d.item) + '</div><p class="desc">' + esc(d.description) + '</p></div></div>');
    },

    emergency: function (d) {
      document.body.style.background = '#7a0b10';
      var inc = d.incident;
      if (!inc) return legacyEmergency(d);
      emergencyData = d;
      emergencyReceived = Date.now();
      if (inc.status === 'resolved') {
        document.body.style.background = '#0d2a20';
        return '<div class="emergency over"><span class="flag">' + icon('check') + ' EMERGENCY OVER</span><h1>Help has taken over</h1>' +
          '<p class="sub" style="color:#c9f7e3">The parents have been told. Say “emergency” again if anything changes.</p>' +
          '<ul class="inc-log">' + inc.updates.slice(-6).map(function (u) { return '<li><b>' + esc(u.time) + '</b> ' + esc(u.by) + ': ' + esc(u.text) + '</li>'; }).join('') + '</ul></div>';
      }
      if (showSheet) return paramedicSheet(d);
      var step = inc.steps[inc.current];
      var dots = inc.steps.map(function (s) { return '<i class="' + s.state + '"></i>'; }).join('');
      var otw = inc.on_the_way.map(function (o) { return '<span class="otw">' + icon('heart') + ' ' + esc(o.name) + ' is on the way · home by ' + esc(o.eta) + '</span>'; }).join('');
      var timer = inc.timers[0];
      var C = 2 * Math.PI * 44;
      var side = (timer
        ? '<div class="eringbox"><div class="ering" data-timer="' + timer.remaining_seconds + '" data-total="' + (timer.remaining_seconds > 0 ? Math.max(timer.remaining_seconds, 60) : 1) + '">' +
          '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" stroke-width="7" fill="none" class="track"/><circle cx="50" cy="50" r="44" stroke-width="7" fill="none" class="prog" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="0"/></svg>' +
          '<b class="tab" id="timerText"></b></div><div><strong>' + esc(timer.label) + '</strong><span>' + esc(timer.step_text) + '</span></div></div>'
        : '') +
        (d.epipen_photo ? '<img alt="Where the EpiPen is kept" src="' + esc(d.epipen_photo) + '">' : '') +
        (d.epipen_location ? '<div class="box"><strong>EpiPen</strong>' + esc(d.epipen_location) + '</div>' : '') +
        '<div class="box"><strong>Alerted</strong>' + esc((d.parents_alerted || []).join(', ') || 'The parents') + '</div>';
      return '<div class="emergency guided" role="alert"><div class="etop"><span class="flag">' + icon('alert') + ' EMERGENCY</span><span class="elapsed tab" id="elapsed"></span>' + otw + '</div>' +
        '<h1 class="first">' + esc(d.say_first) + '</h1>' +
        (d.address ? '<div class="addr"><small>Tell 911 this address</small>' + esc(d.address) + '</div>' : '') +
        '<div class="cols"><div class="stepcard">' +
        (step
          ? '<small>Step ' + (inc.current + 1) + ' of ' + inc.total + ' · ' + esc(d.action_plan.source) + '</small><p>' + esc(step.text) + '</p>'
          : '<small>All steps done</small><p>Stay with her and follow the 911 dispatcher until help arrives.</p>') +
        '<div class="stepdots">' + dots + '</div><div class="stepbtns">' +
        (step ? '<button class="btn green" data-say="Done">' + icon('check') + ' Done</button><button class="btn" data-say="Next step">Next ›</button>' : '<button class="btn green" data-say="It\'s over, the paramedics are here">' + icon('check') + ' Help has arrived</button>') +
        '<button class="btn" data-sheet="1">' + icon('list') + ' For paramedics</button></div></div>' +
        '<div class="side">' + side + '<p class="note">' + esc(d.note) + '</p></div></div></div>';
    },

    question: function (d) {
      var who = String(d.asked || 'a parent').replace(/\s*\(.*\)$/, '');
      var h = '<div class="eyebrow">' + icon(d.door_snapshot ? 'door' : 'send') + (d.answer ? 'A parent answered' : 'Asking ' + esc(who)) + '</div>' +
        // About the front door: the doorbell photo beside the conversation.
        (d.door_snapshot ? '<div class="split door"><figure class="doorcam"><img src="' + esc(d.door_snapshot) + '" alt="Doorbell camera photo"></figure>' : '') +
        '<div class="chat"><div class="bubble me">“' + esc(d.text) + '”</div>';
      if (d.answer) h += '<div class="bubble them"><b>' + esc(d.answer) + '</b><span class="by">' + esc(d.answered_by) + (d.scope === 'always' ? ' · saved as a house rule' : ' · just for tonight') + '</span></div>';
      else if (d.status === 'expired') h += '<p class="sub">Nobody answered in time.</p>';
      else h += '<div class="typing" aria-label="Waiting for an answer"><i></i><i></i><i></i><span style="margin-left:.5em">' + (d.busy_until ? 'Waiting until ' + esc(who) + ' is free' : 'Waiting for ' + esc(who)) + '</span></div>';
      return panel(h + '</div>' + (d.door_snapshot ? '</div>' : ''));
    },

    summary: function (d) {
      var times = (d.timeline || []).map(function (e) {
        var t = new Date(e.at);
        return { time: isNaN(t) ? '' : t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: d.timezone || undefined }), title: e.text, status: 'done', key: '' };
      });
      return panel('<div class="eyebrow">' + icon('heart') + 'The evening</div><div class="title">Evening with ' + esc(d.carer) + '</div><div class="grid2">' +
        (d.insights && d.insights.length ? '<div class="tile"><h3>' + icon('sparkles') + 'Worth knowing</h3>' + list(d.insights) + '</div>' : '') +
        '<div class="tile"><h3>' + icon('clock') + 'Timeline</h3>' + (times.length ? timeline(times) : '<p class="sub">Nothing was logged.</p>') + '</div>' +
        '<div class="tile"><h3>' + icon('message') + 'Questions</h3>' + (d.questions && d.questions.length ? list(d.questions) : '<p class="sub">No questions tonight.</p>') + '</div></div>' +
        '<div class="stepbtns" style="margin-top:1em"><button class="btn green" data-say="' + esc('Pay ' + d.carer) + '">' + icon('heart') + ' Pay ' + esc(d.carer) + '</button></div>');
    },

    logged: function (d) {
      var e = d.event || {};
      var h = '<div class="confirm"><span class="tick">' + icon('check') + '</span><div><div class="eyebrow" style="margin:0">Noted for the parents</div><div class="title" style="margin:.1em 0 0">' + esc(e.text) + '</div></div></div>';
      if (d.allergy_alert) h += '<div style="margin-top:.8em">' + banner('safety', 'alert', 'Allergy alert · the parents have been told', d.allergy_alert) + '</div>';
      if (d.medicine_alert) h += '<div style="margin-top:.8em">' + banner('guard', 'pill', 'Medicine', d.medicine_alert) + '</div>';
      return panel(h);
    },

    language: function (d) { return panel('<div class="confirm"><span class="tick">' + icon('globe') + '</span><div><div class="title" style="margin:0">' + esc(d.spoken || d.english || 'Language changed') + '</div></div></div>'); },

    import: function (d) {
      return panel('<div class="confirm"><span class="tick">' + icon('sparkles') + '</span><div><div class="title" style="margin:0">' + (d.count ? d.count + ' thing' + (d.count > 1 ? 's' : '') + ' to confirm' : 'Nothing new found') + '</div>' +
        '<p class="sub">Nothing is used until a parent confirms it on their phone.' + (d.dropped_secrets ? ' Codes and passwords were left out.' : '') + '</p></div></div>');
    },

    handoff_conflict: function (d) {
      return panel('<div class="eyebrow">' + icon('users') + 'Sitter mode</div><div class="title">' + esc(d.current) + ' is already looking after things</div><p class="sub">Should I end that handoff and start one for ' + esc(d.requested) + '?</p>');
    },

    door: function (d) {
      var e = d.event;
      var V = {
        unknown: ['safety', 'alert', 'Don’t open the door', 'They’re not on tonight’s list. The photo went to the parents.'],
        expected: ['guard', 'users', 'Check first: ' + (d.expected[0] ? d.expected[0].name : 'expected'), 'Look through the window before you open. The parents are confirming.'],
        delivery: ['ok', 'check', 'It’s a delivery', 'No need to open. Bring it in once the driver has gone.'],
        no_event: ['info', 'door', 'No one at the door camera', 'Nobody has rung in the last few minutes.'],
        parent_decided: [d.decision && /let them in|fine|yes/i.test(d.decision.answer) ? 'ok' : 'safety', 'message', d.decision ? d.decision.by + ' answered' : 'A parent answered', d.decision ? '“' + d.decision.answer + '”' : ''],
      }[d.verdict] || ['info', 'door', 'Front door', ''];
      var cam = e && e.snapshot_url
        ? '<figure class="doorcam"><img src="' + esc(e.snapshot_url) + '" alt="Doorbell camera: ' + esc(e.label) + '"><figcaption><i></i>Front door · ' + esc(e.time || '') + '</figcaption></figure>'
        : '<div class="doorcam empty">' + icon('door') + '</div>';
      var people = (d.expected || []).concat(d.deliveries || []);
      var right = '<div class="banner ' + V[0] + ' big">' + icon(V[1]) + '<div><strong>' + esc(V[2]) + '</strong><span>' + esc(V[3]) + '</span></div></div>' +
        (d.rule ? quoteFact({ text: d.rule.text, said_by: d.rule.said_by }) : '') +
        (people.length ? '<div class="tile"><h3>' + icon('users') + 'Expected tonight</h3>' + list(people.map(function (v) { return v.name + (v.window ? ' · ' + v.window : '') + (v.note ? ' · ' + v.note : ''); })) + '</div>' : '');
      return panel('<div class="eyebrow">' + icon('door') + 'Front door</div><div class="split door">' + cam + '<div class="stack">' + right + '</div></div>');
    },

    message: function (d) {
      document.body.style.background = '#120c08';
      var who = d.relation && /mom|mum|mother/i.test(d.relation) ? 'Mom' : d.relation && /dad|father/i.test(d.relation) ? 'Dad' : d.from;
      var media = d.kind === 'video'
        ? '<video id="media" src="' + esc(d.url) + '" playsinline></video>'
        : '<div class="wave" aria-hidden="true">' + Array(9).join('<i></i>') + '</div><audio id="media" src="' + esc(d.url) + '"></audio>';
      // Alexa says who it's from first; then the message plays.
      setTimeout(function () { var m = document.getElementById('media'); if (m) m.play().catch(function () {}); }, 3500);
      return '<div class="goodnight ' + esc(d.kind) + '"><div class="gn-text"><div class="eyebrow" style="color:#e9c98f">' + icon('heart') + 'A message from home</div>' +
        '<h1>' + esc(who) + ' left a message for ' + esc(d.for_name || 'you') + '</h1>' +
        (d.caption ? '<p class="gn-caption">“' + esc(d.caption) + '”</p>' : '') +
        '<div class="stepbtns"><button class="btn" id="replay">' + icon('heart') + ' Play again</button></div></div>' +
        '<div class="gn-media">' + media + '</div></div>';
    },

    pay: function (d) {
      payData = d;
      if (d.status === 'paid') {
        return panel('<div class="confirm"><span class="tick">' + icon('check') + '</span><div><div class="eyebrow" style="margin:0">Demo payment · no money moved</div>' +
          '<div class="title" style="margin:.1em 0 0">' + esc(d.carer) + ' has been paid ' + esc(d.total) + '</div><p class="sub">' + esc(d.hours) + ' at ' + esc(d.rate) + ' an hour' + (d.tip ? ' + ' + esc(d.tip) + ' tip' : '') + '. Thank you!</p></div></div>');
      }
      return panel('<div class="eyebrow">' + icon('heart') + 'Pay ' + esc(d.carer) + '</div><div class="split pay">' +
        '<div><p class="q-big" style="margin:0">' + esc(d.amount) + '</p><p class="sub">' + esc(d.hours) + ' at ' + esc(d.rate) + ' an hour</p>' +
        (d.status === 'declined' || d.status === 'not_opened'
          ? '<p class="pill">Not paid. You can pay later from the parent page.</p>'
          : '<div class="banner info" style="margin-top:1em">' + icon('phone') + '<div><strong>Approve it on your phone</strong><span>The payment happens there, never on this screen.</span></div></div>' +
            '<div class="typing" style="margin-top:.8em"><i></i><i></i><i></i><span style="margin-left:.5em">Waiting for your approval</span></div>') +
        '</div>' + (d.qr_svg && d.status === 'pending' ? '<div class="qr">' + d.qr_svg + '<span>Or scan with your phone</span></div>' : '') + '</div>');
    },

    home: function (d) { return home(d); },
  };

  // ---------- Tonight: the home screen ----------
  var homeData = null;
  var homeReceived = 0;

  function houseMinutes() {
    if (!homeData) return 0;
    return homeData.clock.minutes + Math.floor((Date.now() - homeReceived) / 60000);
  }
  function clockText(min) {
    var h = Math.floor(((min % 1440) + 1440) % 1440 / 60), m = ((min % 60) + 60) % 60;
    return (h % 12 === 0 ? 12 : h % 12) + ':' + (m < 10 ? '0' : '') + m + '<span style="font-size:.45em;margin-left:.2em">' + (h < 12 ? 'AM' : 'PM') + '</span>';
  }
  var WEEKDAY = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };

  function home(d) {
    homeData = d;
    homeReceived = Date.now();
    document.body.style.background = d.night ? '#07090d' : '#090f1b';
    var mins = houseMinutes();
    var header = '<header><div class="clock tab" id="clock">' + clockText(mins) + '<small>' + esc(WEEKDAY[d.clock.weekday] || '') + (d.household ? ' · ' + esc(d.household) : '') + '</small></div><div class="who">' +
      (d.carer ? '<span class="pill amber">' + icon('users') + ' Sitter mode · ' + esc(d.carer) + '</span>' : '<span class="pill">' + icon('users') + ' Parent mode</span>') +
      (d.teachback && d.teachback.done ? '<span class="pill ' + (d.teachback.right === d.teachback.total ? 'green' : 'amber') + '">' + icon('check') + ' Handover ' + (d.teachback.right === d.teachback.total ? 'confirmed' : 'checked') + '</span>' : '') +
      (d.busy_until ? '<span class="pill">' + icon('clock') + ' Parents: urgent only till ' + esc(d.busy_until) + '</span>' : '') + '</div></header>';

    var main;
    if (d.mode === 'parent') {
      main = '<section class="next"><div class="eyebrow">' + icon('heart') + 'While You’re Out</div><div class="next-title">Going out tonight?</div>' +
        '<p class="next-when">Say <b>“Priya is babysitting tonight”</b> and this screen becomes the sitter’s guide.</p>' +
        '<ol class="how"><li><span><b>Tonight’s plan</b> from your own routine' + (d.plan.length ? ': ' + esc(d.plan.map(function (p) { return inSentence(p.title, d.members) + ' ' + p.time; }).slice(0, 3).join(', ')) : '') + '</span></li>' +
        '<li><span><b>A quick handover check</b> before you leave</span></li><li><span>Questions reach <b>your phone</b>; emergencies get a fixed script</span></li></ol></section>';
    } else if (d.night) {
      var kid = (d.members.filter(function (m) { return m.kind === 'child'; })[0] || {}).name;
      main = '<section class="next sleep"><div class="moon">' + icon('moon') + '</div><h2>' + (kid ? esc(kid) + (d.asleep_since ? ' is asleep' : '’s bedtime') : 'Quiet time') + '</h2>' +
        '<p>' + (d.asleep_since ? 'Asleep since ' + esc(d.asleep_since) + '. ' : '') + 'The screen stays dim. Say “Alexa” if you need anything.</p></section>';
    } else if (d.next) {
      var n = d.next;
      var until = n.minutes_until - Math.floor((Date.now() - homeReceived) / 60000);
      var late = until < -5;
      var whenText = until > 1 ? 'in <b class="tab">' + until + ' min</b>' : until >= -5 ? '<b>now</b>' : '<b class="tab">' + -until + ' min late</b>';
      var frac = Math.max(0.04, Math.min(1, 1 - Math.max(0, until) / 60));
      var C = 2 * Math.PI * 44;
      main = '<section class="next' + (late ? ' late' : '') + '"><div class="eyebrow"><span class="dot"></span>Up next</div><div class="next-row"><div><div class="next-title">' + esc(n.title) + '</div>' +
        '<div class="next-when" id="when"><span class="tab">' + esc(n.time) + '</span> · ' + whenText + '</div></div>' +
        '<div class="ring" aria-hidden="true"><svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="44" stroke-width="8" fill="none"/>' +
        '<circle class="prog" cx="50" cy="50" r="44" stroke-width="8" fill="none" stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - frac)).toFixed(1) + '"' + (late ? ' style="stroke:var(--red)"' : '') + '/></svg>' +
        '<span class="ic">' + icon(stepIcon(n.key, n.title)) + '</span></div></div>' +
        (n.checklist && n.checklist.length ? '<div class="checks">' + n.checklist.map(function (c) { return '<span class="pill">' + esc(c) + '</span>'; }).join('') + '</div>' : '') +
        '<div class="strip">' + d.plan.map(function (p) {
          return '<div class="st ' + esc(p.status) + '"><b>' + icon(p.status === 'done' ? 'check' : stepIcon(p.key, p.title)) + esc(p.title) + '</b><span>' + esc(p.time) + '</span></div>';
        }).join('') + '</div></section>';
    } else {
      main = '<section class="next"><div class="eyebrow">' + icon('check') + 'Tonight</div><div class="next-title">' + (d.plan.length ? 'All done' : 'A quiet evening') + '</div>' +
        '<p class="next-when">' + (d.plan.length ? 'Everything on the parents’ plan is done.' : 'The parents didn’t set times for tonight. Ask me anything about the house.') + '</p></section>';
    }

    var kids = d.members.map(function (m) {
      return '<div class="kid">' + avatar(m.name) + '<div><b>' + esc(m.name) + '</b><span class="meta">' + esc(m.kind === 'pet' ? cap(m.age || 'pet') : m.age ? 'Age ' + m.age : 'Child') + '</span></div>' +
        (m.allergy ? '<span class="pill red allergy">' + icon('shield') + ' ' + esc(m.allergy) + '</span>' : '') + '</div>';
    }).join('');
    var rows = [];
    if (d.last_answer) rows.push('<div class="row">' + icon('message') + '<div><b>' + esc(d.last_answer.by) + '</b> answered <q>' + esc(d.last_answer.answer) + '</q><br><span class="sub">' + (d.last_answer.minutes_ago < 1 ? 'just now' : d.last_answer.minutes_ago + ' min ago') + '</span></div></div>');
    if (d.questions_waiting) rows.push('<div class="row">' + icon('send') + '<div>' + d.questions_waiting + ' question' + (d.questions_waiting > 1 ? 's' : '') + ' waiting for the parents</div></div>');
    if (d.last_log) rows.push('<div class="row">' + icon('clock') + '<div><span class="tab">' + esc(d.last_log.time) + '</span> · ' + esc(d.last_log.text) + '</div></div>');
    if (d.door) rows.push('<div class="row">' + icon('door') + '<div><span class="tab">' + esc(d.door.time) + '</span> · ' + esc(d.door.label) + (d.door.decision ? '<br><span class="sub">' + esc(d.door.decision) + '</span>' : '') + '</div></div>');
    if (d.mode === 'parent' && d.parents.length) rows.push('<div class="row">' + icon('phone') + '<div>Questions go to <b>' + esc(andList(d.parents.map(function (p) { return p.name; }))) + '</b>, in your call order</div></div>');
    if (!rows.length && d.mode === 'carer') rows.push('<div class="row">' + icon('info') + '<div>Ask me anything about the house, or tell me how it’s going.</div></div>');
    var side = '<section class="side"><div class="kids">' + kids + '</div>' + (rows.length ? '<div class="status">' + rows.join('') + '</div>' : '') + '</section>';

    var first = d.parents[0];
    var footer = d.mode === 'carer'
      ? '<footer><button class="btn blue" data-say="Ask the parents">' + icon('message') + ' Ask a parent</button>' +
        '<button class="btn" data-say="What’s next?">' + icon('clock') + ' What’s next?</button>' +
        '<button class="btn green" data-say="' + esc('Call ' + (first ? first.name : 'Mom')) + '">' + icon('phone') + ' Call ' + esc(first ? first.name : 'a parent') + '</button>' +
        '<button class="btn red" data-say="Emergency">' + icon('alert') + ' Emergency</button></footer>'
      : '';
    return '<div class="home' + (d.night ? ' night' : '') + (d.mode === 'parent' ? ' parent' : '') + '">' + header + main + side + footer + '</div>';
  }

  // ---------- the emergency guide: ticking clock, timers, refresh ----------
  var emergencyData = null;
  var payData = null;
  var emergencyReceived = 0;
  var showSheet = false;
  var emergencyTimer = null;
  function paramedicSheet(d) {
    var p = d.paramedic_sheet || {};
    var inc = d.incident || { updates: [] };
    return '<div class="sheet"><div class="eyebrow">' + icon('list') + 'For the paramedics</div><h1>' + esc((d.address || '').split(',')[0] || 'Paramedic sheet') + '</h1>' +
      '<div class="grid2"><div class="tile must"><h3>' + icon('shield') + 'Allergies</h3>' + (list(p.allergies) || '<p>None on file</p>') + '</div>' +
      '<div class="tile"><h3>' + icon('pill') + 'Medicine</h3>' + (list(p.medicine_notes) || '<p>None given tonight</p>') + '</div>' +
      '<div class="tile"><h3>' + icon('phone') + 'Doctor</h3><p>' + esc(p.doctor || 'Not on file') + '</p></div>' +
      '<div class="tile"><h3>' + icon('clock') + 'Tonight</h3>' + list(inc.updates.map(function (u) { return u.time + ' · ' + u.text; }).concat((p.tonight || []).map(function (e) { return e.text; }))) + '</div></div>' +
      '<div class="stepbtns" style="margin-top:1em"><button class="btn red" data-sheet="0">' + icon('alert') + ' Back to the steps</button></div></div>';
  }
  function tickEmergency() {
    if (!emergencyData || !emergencyData.incident) return;
    var passed = (Date.now() - emergencyReceived) / 1000;
    var el = document.getElementById('elapsed');
    if (el) el.textContent = mmss(emergencyData.incident.elapsed_seconds + passed) + ' since the alert';
    document.querySelectorAll('.ering[data-timer]').forEach(function (r) {
      var left = Math.max(0, Number(r.getAttribute('data-timer')) - passed);
      var total = Number(r.getAttribute('data-total')) || 1;
      var t = r.querySelector('#timerText');
      if (t) t.textContent = left > 0 ? mmss(left) : 'Now';
      var prog = r.querySelector('.prog');
      if (prog) prog.setAttribute('stroke-dashoffset', String((2 * Math.PI * 44) * (1 - left / total)));
      r.classList.toggle('up', left <= 0);
    });
  }
  function mmss(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + (sec % 60 < 10 ? '0' : '') + (sec % 60); }
  function startEmergencyTimers() {
    stopEmergencyTimers();
    tickEmergency();
    emergencyTimer = setInterval(tickEmergency, 1000);
    // The parents' phones and the carer's "done" change the guide: keep the screen in step.
    refreshTimer = setInterval(function () {
      request('tools/call', { name: 'emergency_status', arguments: {} }).then(function (r) {
        var s = r && r.structuredContent;
        if (s && s.view === 'emergency' && JSON.stringify(s.incident) !== JSON.stringify(emergencyData && emergencyData.incident)) render(r);
      }).catch(function () {});
    }, 3000);
  }
  function stopEmergencyTimers() { clearInterval(emergencyTimer); emergencyTimer = null; }
  // Goodnight message: play again, and the wave moves while it plays.
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('#replay')) return;
    var m = document.getElementById('media');
    if (m) { m.currentTime = 0; m.play().catch(function () {}); }
  });
  document.addEventListener('play', function (e) { var g = document.querySelector('.goodnight'); if (g && e.target.id === 'media') g.classList.add('playing'); }, true);
  document.addEventListener('ended', function (e) { var g = document.querySelector('.goodnight'); if (g && e.target.id === 'media') g.classList.remove('playing'); }, true);

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-sheet]');
    if (!b || !current) return;
    showSheet = b.getAttribute('data-sheet') === '1';
    render(current);
  });

  function startHomeTimers() {
    stopHomeTimers();
    // The clock and countdown tick locally; the whole screen refreshes from the server.
    tickTimer = setInterval(function () {
      var el = document.getElementById('clock');
      if (el && homeData) el.innerHTML = clockText(houseMinutes()) + el.innerHTML.replace(/^[\s\S]*?(<small>)/, '$1');
    }, 15000);
    refreshTimer = setInterval(function () {
      request('tools/call', { name: 'home_screen', arguments: {} }).then(function (r) { if (r && r.structuredContent && r.structuredContent.view === 'home') render(r); }).catch(function () {});
    }, 30000);
  }
  function stopHomeTimers() { clearInterval(tickTimer); clearInterval(refreshTimer); tickTimer = refreshTimer = null; }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-say]');
    if (!b) return;
    b.disabled = true;
    setTimeout(function () { b.disabled = false; }, 1500);
    say(b.getAttribute('data-say'));
  });

  // ---------- render ----------
  function spokenBanner(d) {
    return '<div class="spoken" lang="' + esc(d.language) + '"><span class="pill">' + icon('globe') + ' Said in ' + esc(d.language) + '</span><p>' + esc(d.spoken) + '</p></div>';
  }
  function render(result) {
    current = result;
    var d = result && result.structuredContent;
    var root = document.getElementById('root');
    document.body.style.background = '';
    if (!d || !d.view || !views[d.view]) {
      var text = (result && result.content && result.content[0] && result.content[0].text) || '';
      root.innerHTML = panel('<div class="eyebrow">' + icon('message') + 'Alexa</div><p class="title" style="font-weight:600">' + esc(text) + '</p>');
    } else {
      var html = views[d.view](d);
      // Bilingual relay: what the carer heard, in their language, above the parents' own words.
      if (d.spoken && d.language && d.language !== 'en' && d.view !== 'home' && d.view !== 'language') {
        html = d.view === 'emergency' ? html.replace('<h1>', spokenBanner(d) + '<h1>') : html.replace('<div class="panel ">', '<div class="panel ">' + spokenBanner(d));
      }
      root.innerHTML = html;
    }
    stopHomeTimers();
    stopEmergencyTimers();
    if (d && d.view === 'pay' && d.status === 'pending') {
      // Turns into "Paid" by itself once the parent approves on their phone.
      refreshTimer = setInterval(function () {
        request('tools/call', { name: 'payment_status', arguments: { id: d.id } }).then(function (r) {
          if (r && r.structuredContent && r.structuredContent.status !== 'pending') render(r);
        }).catch(function () {});
      }, 3000);
    }
    if (d && d.view === 'home') startHomeTimers();
    else if (d && d.view === 'emergency' && d.incident && d.incident.status === 'active') startEmergencyTimers();
    // Emergencies and the home screen take the whole screen on hosts that support it.
    if (d && (d.view === 'emergency' || d.view === 'home') && host.displayMode !== 'fullscreen') request('ui/request-display-mode', { mode: 'fullscreen' }).catch(function () {});
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
    if (m.id != null && pending[m.id] && !m.method) {
      var p = pending[m.id];
      delete pending[m.id];
      if (m.error) p.reject(m.error); else p.resolve(m.result);
      return;
    }
    if (m.method === 'ui/notifications/tool-result') render(m.params);
    if (m.method === 'ui/notifications/host-context-changed' && m.params) {
      if (m.params.displayMode) host.displayMode = m.params.displayMode;
    }
  });

  request('ui/initialize', {
    appInfo: { name: 'while-youre-out-card', version: '0.2.0' },
    appCapabilities: { availableDisplayModes: ['inline', 'fullscreen'] },
    protocolVersion: '2026-01-26',
  }).then(function (r) {
    if (r && r.hostContext && r.hostContext.displayMode) host.displayMode = r.hostContext.displayMode;
    notify('ui/notifications/initialized');
  }).catch(function () { notify('ui/notifications/initialized'); });
})();
