// While You're Out: one MCP App that renders every card. Plain JavaScript, no build step.
// Protocol (MCP Apps): ui/initialize -> ui/notifications/initialized -> ui/notifications/tool-result.
// The Tonight screen also calls tools through the host (tools/call) to keep itself up to date,
// and its buttons send what the carer would say (ui/message).
// Built to the Alexa+ add-on design guide: authored on the 768 x 480 base canvas, one root zoom
// per device (from the host's deviceClass), light and dark, the Card and List patterns, the logo
// top-left inline and top-centre fullscreen, 48 x 48 touch targets.
(function () {
  'use strict';
  var nextId = 1;
  var pending = {};
  var host = { displayMode: 'inline', theme: null, deviceClass: null, isMobile: false };
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

  // ---------- the surface: theme and one root scale, from the host ----------
  // deviceClass is authoritative; the window size is only a fallback for hosts that omit it.
  var BASE_W = 768, BASE_H = 480;
  function applySurface() {
    var root = document.documentElement;
    var W = window.innerWidth || BASE_W, H = window.innerHeight || BASE_H;
    var dc = String(host.deviceClass || '').toLowerCase();
    var compact = !!host.isMobile || /mobile|phone/.test(dc) || W < 600;
    var s;
    if (compact) s = 1;
    else if (/show.?5\b/.test(dc)) s = 1.25;
    else if (/show.?21/.test(dc)) s = 2.5;
    else if (/show|hub/.test(dc)) s = 1.667;
    else s = Math.max(0.75, Math.min(3, W / BASE_W));
    var dark = host.theme ? host.theme !== 'light' : !(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
    root.className = (dark ? 'theme-dark' : 'theme-light') + (compact ? ' compact' : '');
    root.style.setProperty('--scale', String(s));
    // Full-screen layouts fill the frame exactly: its height on the base canvas.
    root.style.setProperty('--vh', (H / s).toFixed(2) + 'px');
  }
  function readContext(ctx) {
    if (!ctx) return;
    if (ctx.displayMode) host.displayMode = ctx.displayMode;
    if (ctx.theme) host.theme = ctx.theme;
    if (ctx.deviceClass) host.deviceClass = ctx.deviceClass;
    if (typeof ctx.isMobile === 'boolean') host.isMobile = ctx.isMobile;
    applySurface();
  }
  window.addEventListener('resize', applySurface);
  applySurface();

  // ---------- helpers ----------
  // A step's title inside a sentence: "bath 7:15 pm", but "Bruno gets one cup 7:00 pm" (a name stays).
  function inSentence(title, members) {
    var first = String(title).split(/\s/)[0].toLowerCase();
    var named = (members || []).some(function (m) { return String(m.name).toLowerCase() === first; });
    return named ? title : title.charAt(0).toLowerCase() + title.slice(1);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function hue(name) { var h = 0; for (var i = 0; i < String(name).length; i++) h = (h * 31 + String(name).charCodeAt(i)) % 360; return h; }
  function avatar(name, cls, face) {
    var n = String(name || '?');
    if (face) return '<span class="av face ' + (cls || '') + '" style="background:hsl(' + hue(n) + ' 60% 82%)" aria-hidden="true">' + face + '</span>';
    return '<span class="av ' + (cls || '') + '" style="background:hsl(' + hue(n) + ' 65% 76%)" aria-hidden="true">' + esc(n.replace(/^(Dr\.|Mrs\.|Mr\.|Ms\.)\s*/, '').charAt(0).toUpperCase()) + '</span>';
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
  var SOURCE = { voice: 'told Alexa', photo: 'fridge note', whatsapp: 'texted', pdf: "doctor's letter", parent_answer: 'answered a question', setup: 'family setup', text: 'note' };

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
    if (/dog|cat|walk|feed|pet/.test(t)) return 'paw';
    if (/stor|book|read/.test(t)) return 'book';
    if (/medic|pill|dose/.test(t)) return 'pill';
    return 'clock';
  }
  var CATEGORY = { food: ['utensils', 'Food'], medicine: ['pill', 'Medicine'], safety_info: ['shield', 'Safety'], secret: ['shield', 'Private'], return_time: ['clock', 'When they’re back'], general: ['message', 'From the parents'] };
  var TOPIC = { screen: ['tv', 'TV & screens'], routine: ['moon', 'Bedtime & routine'], pet: ['paw', 'Pets'], rules: ['message', 'House rules'], house: ['door', 'The house'], contacts: ['phone', 'Contacts'], food: ['utensils', 'Food'], allergy: ['shield', 'Allergies'] };

  // ---------- the pieces every card is made of ----------
  // The logo: a house with its door lit. Attribution, as the design guide places it.
  var LOGO = '<svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><rect x="9.6" y="13" width="4.8" height="8" rx="1.2" fill="var(--accent)"/></svg>';
  function brand() { return '<div class="brand">' + LOGO + '<span>While You’re Out</span></div>'; }
  function card(inner, cls) { return '<div class="card ' + (cls || '') + '">' + brand() + '<div class="body">' + inner + '</div></div>'; }
  function topic(ic, text) { return '<div class="topic">' + icon(ic) + '<span>' + text + '</span></div>'; }
  function note(kind, ic, title, body) {
    return '<div class="note ' + kind + '">' + icon(ic) + '<div>' + (title ? '<strong>' + esc(title) + '</strong>' : '') + (body ? '<span>' + esc(body) + '</span>' : '') + '</div></div>';
  }
  function quote(f, close) {
    var qa = /^Q: (.*?) A: (.*)$/.exec(f.text || '');
    var text = qa ? '“' + qa[2] + '”' : f.text;
    var by = qa
      ? esc(f.said_by) + ' answered “' + esc(qa[1]) + '”'
      : esc(f.said_by || 'Parent') + (f.source && SOURCE[f.source] ? ' · ' + SOURCE[f.source] : '');
    return '<div class="quote' + (close ? ' close' : '') + '"><p>' + esc(text) + '</p><div class="by">' + avatar(f.said_by, 's') + '<span>' + by + (f.when ? ' · ' + ago(f.when) : '') + '</span></div></div>';
  }
  function rows(items) {
    return '<ul class="list">' + items.map(function (i) {
      return '<li class="' + esc(i.status || '') + '"><span class="lead">' + icon(i.icon || 'clock') + '</span><span class="what"><b>' + esc(i.title) + '</b>' + (i.sub ? '<span>' + esc(i.sub) + '</span>' : '') + '</span>' +
        (i.when ? '<span class="when tab">' + esc(i.when) + '</span>' : '<span></span>') + '</li>';
    }).join('') + '</ul>';
  }
  function planRows(items) {
    var LABEL = { done: 'Done', due: 'Now', late: 'Late' };
    return rows(items.map(function (p) {
      return { status: p.status, icon: p.status === 'done' ? 'check' : stepIcon(p.key, p.title), title: p.title, sub: p.checklist && p.checklist.length ? p.checklist.join(' · ') : (LABEL[p.status] || ''), when: p.time };
    }));
  }
  function button(label, sayText, kind, ic) {
    return '<button class="btn ' + (kind || '') + '" data-say="' + esc(sayText) + '">' + (ic ? icon(ic) : '') + '<span>' + esc(label) + '</span></button>';
  }
  function scene(actions) {
    if (!actions || !actions.length) return '';
    return '<div class="scene">' + actions.map(function (a) { return '<span class="pill">' + icon('moon') + esc(a.device) + ': ' + esc(a.state) + '</span>'; }).join('') + '<span class="fine">Simulated smart home</span></div>';
  }
  var DISCLAIMER = '<p class="fine">From the parents’ own notes. Not medical advice: if in doubt, ask a parent or a healthcare professional.</p>';

  // ---------- views ----------
  var views = {
    answer: function (d) {
      if (d.capabilities) return capabilities();
      var facts = d.facts || [];
      var tp = d.category === 'general' && facts[0] ? TOPIC[facts[0].category] : null;
      var cat = tp || CATEGORY[d.category] || CATEGORY.general;
      var safety = facts.filter(function (f) { return f.risk === 'safety'; });
      var words = facts.filter(function (f) { return safety.indexOf(f) < 0; });
      var h = topic(cat[0], esc(cat[1]));
      // Safety first: an allergy alert, then what keeps the child safe, in the parents' words.
      if (d.allergy_alert) h += note('danger', 'alert', 'Allergy alert · the parents have been told', d.allergy_alert);
      safety.slice(0, 1).forEach(function (f) { h += note('danger', 'shield', f.category === 'allergy' ? 'Allergy' : 'Important', f.text + ' (' + (f.said_by || 'Parent') + ')'); });
      if (words.length && d.exact !== false) h += words.slice(0, d.guard || safety.length ? 1 : 2).map(function (f) { return quote(f); }).join('');
      else if (words.length) h += '<p class="meta">The parents haven’t said exactly. The closest:</p>' + quote(words[0], true);
      if (d.shadow) {
        var s = d.shadow;
        h += note('info', 'sparkles', 'Usually ' + s.likely + ' · ' + s.agree + ' of ' + s.total + ' times' + (s.days ? ' on ' + s.days : ''), 'It’s your call, or I can ask them.');
      }
      if (d.guard) h += note('warn', 'info', 'Check first', d.guard);
      if (!facts.length && !d.guard && !d.allergy_alert && !d.shadow) h += '<div class="title">The parents haven’t covered this</div><p class="field">I can ask them right now.</p>';
      if (d.busy_until) h += '<span class="pill warn">' + icon('clock') + 'Urgent questions only until ' + esc(d.busy_until) + '</span>';
      if (d.suggest_ask_parent) h += '<div class="actions">' + button('Ask the parents', 'Ask the parents', 'primary', 'send') + '</div>';
      if (d.category === 'food' || d.category === 'medicine' || d.allergy_alert) h += DISCLAIMER;
      return card(h);
    },

    teachback: function (d) {
      var fb = d.feedback;
      var total = d.total || (d.summary && d.summary.total) || 3;
      var number = d.kind === 'done' ? total : d.number || 1;
      var bars = '';
      for (var i = 1; i <= total; i++) bars += '<i class="' + (i < number || d.kind === 'done' ? 'ok' : i === number ? 'on' : '') + '"></i>';
      var h = topic('check', 'Quick check before the parents leave' + (d.carer ? ' · ' + esc(d.carer) : '')) + '<div class="progress">' + bars + '</div>';
      if (fb) h += fb.correct ? note('ok', 'check', 'That’s right', '') : fb.correct === null ? note('info', 'info', 'Skipped. The parents said:', fb.answer) : note('danger', 'x', 'Not quite. The parents said:', fb.answer);
      if (d.kind === 'question') h += '<p class="meta">Question ' + d.number + ' of ' + d.total + '</p><div class="title l">' + esc(d.question) + '</div>';
      if (d.kind === 'done') {
        var sm = d.summary;
        var all = sm.right === sm.total;
        h += '<div class="confirm"><span class="tick' + (all ? '' : ' neutral') + '">' + icon('check') + '</span><div><div class="title">' + (all ? 'Handover confirmed' : 'Handover checked') + '</div>' +
          '<p class="field s">' + sm.right + ' of ' + sm.total + ' right · the parents can see this on their phone</p></div></div>';
      }
      return card(h);
    },

    plan: function (d) {
      var items = d.items || [];
      var h = topic('list', 'Tonight’s plan');
      if (d.plan_change) h += note('warn', 'sparkles', 'Plan updated', d.plan_change);
      else if (d.shift_reason) h += '<span class="pill warn">Adjusted tonight</span>';
      h += items.length ? planRows(items) : '<p class="field">The parents haven’t given times for tonight.</p>';
      return card(h + scene(d.smart_home));
    },

    briefing: function (d) {
      var h = topic('users', 'Sitter mode is on') + '<div class="title l">Tonight with ' + esc(d.carer) + '</div>';
      var since = d.since_last_visit;
      if (since && (since.added.length || since.removed.length)) {
        var changes = since.added.map(function (a) { return a.text; }).concat(since.removed.map(function (r) { return 'No longer: ' + r.text; }));
        h += note('info', 'sparkles', 'Since your last visit', changes.slice(0, 2).join(' · '));
      }
      if (d.must_know && d.must_know.length) h += note('danger', 'shield', 'Must know', d.must_know[0]);
      var r = [];
      if (d.epipen) r.push({ icon: 'pin', title: 'EpiPen', sub: d.epipen });
      if (d.first_contact) r.push({ icon: 'phone', title: 'Call first', sub: d.first_contact });
      var next = (d.plan || []).filter(function (p) { return p.status !== 'done'; })[0];
      if (next) r.push({ icon: stepIcon(next.key, next.title), title: 'Next: ' + next.title, when: next.time });
      if (r.length) h += rows(r);
      // Tonight's Guest Pass: the sitter scans it and has tonight on her own phone.
      if (d.pass && d.pass.qr_svg) {
        return card('<div class="cols pass"><div>' + h + '</div><div class="qr">' + d.pass.qr_svg +
          '<span>' + esc(d.pass.carer) + ', scan for tonight on your phone</span><span class="fine">Guest Pass until ' + esc(d.pass.ends) + '</span></div></div>');
      }
      return card(h);
    },

    location: function (d) {
      var pic = d.photo_url ? '<img alt="Where the ' + esc(d.item) + ' is kept" src="' + esc(d.photo_url) + '">' : '<div class="ph">' + icon('pin') + '</div>';
      return card(topic('pin', 'Where it’s kept') + '<div class="cols media"><div>' + pic + '</div><div><div class="title l">' + esc(d.item) + '</div><p class="field" style="margin-top:8px">' + esc(d.description) + '</p></div></div>');
    },

    emergency: function (d) { return emergencyView(d); },

    question: function (d) {
      var who = String(d.asked || 'a parent').replace(/\s*\(.*\)$/, '');
      var h = topic(d.door_snapshot ? 'door' : 'send', d.answer ? esc(d.answered_by || who) + ' answered' : 'Asking ' + esc(who));
      var text = '';
      if (d.answer) {
        text = '<div class="title">“' + esc(d.answer) + '”</div><p class="meta">' + esc(d.answered_by) + (d.scope === 'always' ? ' · saved as a house rule' : ' · just for tonight') + '</p><p class="asked">' + esc(d.text) + '</p>';
      } else {
        text = '<p class="asked big">' + esc(d.text) + '</p>' + (d.status === 'expired' ? '<p class="field">Nobody answered in time.</p>' : '<div class="waiting" aria-label="Waiting for an answer"><i></i><i></i><i></i><span>' + (d.busy_until ? 'Waiting until ' + esc(who) + ' is free' : 'Waiting for ' + esc(who)) + '</span></div>');
      }
      if (d.door_snapshot) h += '<div class="cols media"><div><img src="' + esc(d.door_snapshot) + '" alt="Doorbell camera photo"></div><div>' + text + '</div></div>';
      else h += text;
      return card(h);
    },

    summary: function (d) {
      var times = (d.timeline || []).slice(-5).map(function (e) {
        var t = new Date(e.at);
        return { status: 'done', icon: 'check', title: e.text, when: isNaN(t) ? '' : t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: d.timezone || undefined }) };
      });
      var h = topic('heart', 'The evening') + '<div class="title l">The evening with ' + esc(d.carer) + '</div>';
      if (d.insights && d.insights.length) h += note('info', 'sparkles', 'Worth knowing', d.insights.slice(0, 2).join(' · '));
      h += times.length ? rows(times) : '<p class="field">Nothing was logged.</p>';
      if (d.questions && d.questions.length) h += '<p class="meta">' + d.questions.length + ' question' + (d.questions.length > 1 ? 's' : '') + ' asked tonight</p>';
      return card(h + '<div class="actions">' + button('Pay ' + d.carer, 'Pay ' + d.carer, 'primary', 'heart') + '</div>');
    },

    logged: function (d) {
      var e = d.event || {};
      var h = '<div class="confirm"><span class="tick">' + icon('check') + '</span><div><p class="meta">Noted for the parents</p><div class="title">' + esc(e.text) + '</div></div></div>';
      if (d.allergy_alert) h += note('danger', 'alert', 'Allergy alert · the parents have been told', d.allergy_alert);
      if (d.medicine_alert) h += note('warn', 'pill', 'Medicine', d.medicine_alert);
      if (d.allergy_alert || d.medicine_alert) h += DISCLAIMER;
      return card(h);
    },

    language: function (d) {
      return card('<div class="confirm"><span class="tick neutral">' + icon('globe') + '</span><div class="title">' + esc(d.spoken || d.english || 'Language changed') + '</div></div>');
    },

    import: function (d) {
      return card('<div class="confirm"><span class="tick neutral">' + icon('sparkles') + '</span><div><div class="title">' + (d.count ? d.count + ' thing' + (d.count > 1 ? 's' : '') + ' to confirm' : 'Nothing new found') + '</div>' +
        '<p class="field s">Nothing is used until a parent confirms it on their phone.' + (d.dropped_secrets ? ' Codes and passwords were left out.' : '') + '</p></div></div>');
    },

    handoff_conflict: function (d) {
      return card(topic('users', 'Sitter mode') + '<div class="title">' + esc(d.current) + ' is already looking after things</div><p class="field">Should I end that and start one for ' + esc(d.requested) + '?</p>' +
        '<div class="actions">' + button('Yes, start one for ' + d.requested, 'Yes', 'primary') + button('No', 'No') + '</div>');
    },

    door: function (d) {
      var e = d.event;
      var V = {
        unknown: ['danger', 'alert', 'Don’t open the door', 'They’re not on tonight’s list. The photo went to the parents.'],
        expected: ['warn', 'users', 'Check first: ' + (d.expected[0] ? d.expected[0].name : 'expected'), 'Look through the window before you open. The parents are confirming.'],
        delivery: ['ok', 'check', 'It’s a delivery', 'No need to open. Bring it in once the driver has gone.'],
        no_event: ['info', 'door', 'No one at the door camera', 'Nobody has rung in the last few minutes.'],
        parent_decided: [d.decision && /let them in|fine|yes/i.test(d.decision.answer) ? 'ok' : 'danger', 'message', d.decision ? d.decision.by + ' answered' : 'A parent answered', d.decision ? '“' + d.decision.answer + '”' : ''],
      }[d.verdict] || ['info', 'door', 'Front door', ''];
      var pic = e && e.snapshot_url ? '<img src="' + esc(e.snapshot_url) + '" alt="Doorbell camera: ' + esc(e.label) + '"><p class="meta" style="margin-top:6px">Front door · ' + esc(e.time || '') + '</p>' : '<div class="ph">' + icon('door') + '</div>';
      var right = '<div class="title' + (V[0] === 'danger' ? '" style="color:var(--danger)' : '') + '">' + esc(V[2]) + '</div><p class="field s" style="margin-top:6px">' + esc(V[3]) + '</p>' +
        (d.rule ? '<div style="margin-top:12px">' + quote({ text: d.rule.text, said_by: d.rule.said_by }) + '</div>' : '');
      var people = (d.expected || []).concat(d.deliveries || []);
      var h = topic('door', 'Front door') + '<div class="cols media"><div>' + pic + '</div><div>' + right + '</div></div>';
      if (people.length) h += rows(people.slice(0, 2).map(function (v) { return { icon: 'users', title: v.name, sub: v.note || '', when: v.window || '' }; }));
      return card(h);
    },

    message: function (d) { return goodnight(d); },

    pay: function (d) {
      payData = d;
      if (d.status === 'paid') {
        return card('<div class="confirm"><span class="tick">' + icon('check') + '</span><div><p class="meta">Demo payment · no money moved</p><div class="title">' + esc(d.carer) + ' has been paid ' + esc(d.total) + '</div>' +
          '<p class="field s">' + esc(d.hours) + ' at ' + esc(d.rate) + ' an hour' + (d.tip ? ' + ' + esc(d.tip) + ' tip' : '') + '</p></div></div>');
      }
      var left = '<div class="amount tab">' + esc(d.amount) + '</div><p class="field" style="margin-top:8px">' + esc(d.hours) + ' at ' + esc(d.rate) + ' an hour</p>' +
        (d.status === 'declined' || d.status === 'not_opened'
          ? '<p class="field s" style="margin-top:12px">Not paid. You can pay later from the parent page.</p>'
          : '<div style="margin-top:12px">' + note('info', 'phone', 'Approve it on your phone', 'The payment happens there, never on this screen.') + '</div><div class="waiting" style="margin-top:10px"><i></i><i></i><i></i><span>Waiting for your approval</span></div>');
      var qr = d.qr_svg && d.status === 'pending' ? '<div class="qr">' + d.qr_svg + '<span>Or scan with your phone</span></div>' : '';
      return card(topic('heart', 'Pay ' + esc(d.carer)) + (qr ? '<div class="cols"><div>' + left + '</div><div>' + qr + '</div></div>' : left));
    },

    home: function (d) { return home(d); },
  };

  // "What can you do?": what this add-on is for, as a short list.
  function capabilities() {
    return card(topic('sparkles', 'Tonight’s house guide') + '<div class="title">Ask me about the house, in the parents’ own words</div>' +
      rows([
        { icon: 'pin', title: 'Where things are', sub: '“Where’s the EpiPen?”' },
        { icon: 'utensils', title: 'Food and bedtime', sub: '“Can she have a cookie?” · “What’s next?”' },
        { icon: 'send', title: 'Anything else', sub: 'I’ll ask the parents and tell you their answer' },
      ]) + note('danger', 'alert', 'Say “emergency” any time', 'You get the family’s own plan, step by step. This device can’t call 911: use your phone.'));
  }

  // ---------- Tonight: the home screen (fullscreen: a schedule is dense content) ----------
  var homeData = null;
  var homeReceived = 0;
  function houseMinutes() { return homeData ? homeData.clock.minutes + Math.floor((Date.now() - homeReceived) / 60000) : 0; }
  function clockText(min) {
    var h = Math.floor((((min % 1440) + 1440) % 1440) / 60), m = ((min % 60) + 60) % 60;
    return (h % 12 === 0 ? 12 : h % 12) + ':' + (m < 10 ? '0' : '') + m + ' ' + (h < 12 ? 'AM' : 'PM');
  }
  var WEEKDAY = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
  function whenText(until) {
    return until > 180 ? 'later tonight' : until > 60 ? 'in <b class="tab">' + Math.floor(until / 60) + ' h' + (until % 60 ? ' ' + (until % 60) + ' min' : '') + '</b>' : until > 1 ? 'in <b class="tab">' + until + ' min</b>' : until >= -5 ? '<b>now</b>' : '<b class="tab">' + -until + ' min late</b>';
  }

  function home(d) {
    homeData = d;
    homeReceived = Date.now();
    var mins = houseMinutes();
    var state = d.carer ? '<span class="pill warn">' + icon('users') + 'Sitter mode · ' + esc(d.carer) + '</span>' : '<span class="pill">' + icon('users') + 'Parent mode</span>';
    var bar = '<div class="bar"><div class="clock tab" id="clock">' + clockText(mins) + '<small>' + esc(WEEKDAY[d.clock.weekday] || '') + '</small></div>' + brand() + state + '</div>';
    var kid = (d.members.filter(function (m) { return m.kind === 'child'; })[0] || {}).name;

    if (d.mode !== 'parent' && d.night) {
      return '<div class="fs home night">' + bar + '<div class="sleep"><div class="moon">' + icon('moon') + '</div><div class="title l">' + (kid ? esc(kid) + (d.asleep_since ? ' is asleep' : '’s bedtime') : 'Quiet time') + '</div>' +
        '<p class="field">' + (d.asleep_since ? 'Asleep since ' + esc(d.asleep_since) + '. ' : '') + 'Say “Alexa” if you need anything.</p></div></div>';
    }

    var hero;
    if (d.mode === 'parent') {
      hero = '<section class="hero"><div class="label">While You’re Out</div><div class="title xl">Going out tonight?</div>' +
        '<p class="when">Say <b>“Priya is babysitting tonight”</b> and this screen becomes the sitter’s guide.</p>' +
        '<ol class="steps"><li><span><b>Tonight’s plan</b> from your own routine' + (d.plan.length ? ': ' + esc(d.plan.map(function (p) { return inSentence(p.title, d.members) + ' ' + p.time; }).slice(0, 2).join(', ')) : '') + '</span></li>' +
        '<li><span><b>A quick handover check</b> before you leave</span></li><li><span>Questions reach <b>your phone</b></span></li></ol></section>';
    } else if (d.next) {
      var n = d.next;
      var until = n.minutes_until - Math.floor((Date.now() - homeReceived) / 60000);
      var late = until < -5;
      var frac = Math.max(0.04, Math.min(1, 1 - Math.max(0, until) / 60));
      var later = d.plan.filter(function (p) { return p.status === 'upcoming' && p.key !== n.key; }).slice(0, 1);
      hero = '<section class="hero' + (late ? ' late' : '') + '"><div class="label">' + (late ? 'Running late' : 'Up next') + '</div><div class="title xl">' + esc(n.title) + '</div>' +
        '<p class="when" id="when"><span class="tab">' + esc(n.time) + '</span> · ' + whenText(until) + '</p>' +
        '<div class="bar-progress" aria-hidden="true"><i style="width:' + Math.round(frac * 100) + '%"></i></div>' +
        (later.length ? '<div class="later"><p class="meta">Later</p>' + planRows(later) + '</div>' : '') + '</section>';
    } else {
      hero = '<section class="hero"><div class="label">Tonight</div><div class="title xl">' + (d.plan.length ? 'All done' : 'A quiet evening') + '</div>' +
        '<p class="when">' + (d.plan.length ? 'Everything on the parents’ plan is done.' : 'Ask me anything about the house.') + '</p></section>';
    }

    var people = rows(d.members.slice(0, 3).map(function (m) {
      return { icon: m.kind === 'pet' ? 'paw' : 'heart', title: m.name, sub: m.allergy ? 'Allergy: ' + m.allergy : m.kind === 'pet' ? cap(m.age || 'pet') : m.age ? 'Age ' + m.age : '', status: m.allergy ? 'late' : '' };
    }));
    var news = '';
    if (d.last_answer) news = '<b>' + esc(d.last_answer.by) + '</b> answered “' + esc(d.last_answer.answer) + '”';
    else if (d.questions_waiting) news = d.questions_waiting + ' question' + (d.questions_waiting > 1 ? 's' : '') + ' waiting for the parents';
    else if (d.changes && d.changes.length) news = '<b>New since your last visit:</b> ' + esc(d.changes[0]);
    else if (d.door) news = '<b>Front door</b> · ' + esc(d.door.label) + (d.door.decision ? ' · ' + esc(d.door.decision) : '');
    else if (d.mode === 'parent' && d.parents.length) news = 'Questions go to <b>' + esc(d.parents.map(function (p) { return p.name; }).join(', then ')) + '</b>';
    var side = '<section class="side">' + people + (news ? '<div class="notice">' + news + '</div>' : '') + '</section>';

    var first = d.parents[0];
    var dock = d.mode === 'carer'
      ? '<div class="dock">' + button('Ask a parent', 'Ask the parents', 'primary', 'send') + button('Call ' + (first ? first.name : 'a parent'), 'Call ' + (first ? first.name : 'Mom'), '', 'phone') + button('Emergency', 'Emergency', 'danger', 'alert') + '</div>'
      : '';
    return '<div class="fs home">' + bar + '<div class="grid">' + hero + side + '</div>' + dock + '</div>';
  }

  // ---------- the emergency guide (fullscreen: a multi-step flow) ----------
  var emergencyData = null;
  var emergencyStep = null; // the step on screen, so a new one can slide in
  var payData = null;
  var emergencyReceived = 0;
  var showSheet = false;
  var emergencyTimer = null;

  function emergencyView(d) {
    var inc = d.incident || { steps: (d.action_plan.steps || []).map(function (s, i) { return { text: s.text, state: i === 0 ? 'now' : 'todo' }; }), current: 0, total: (d.action_plan.steps || []).length, timers: [], on_the_way: [], updates: [], status: 'active' };
    emergencyData = d;
    emergencyReceived = Date.now();
    var fresh = emergencyStep !== null && emergencyStep !== inc.current;
    emergencyStep = inc.current;
    if (inc.status === 'resolved') {
      return '<div class="fs emergency over"><div class="bar"><span class="flag">' + icon('check') + 'EMERGENCY OVER</span>' + brand() + '<span></span></div>' +
        '<div class="center"><div class="title xl">Help has taken over</div><p class="field" style="color:#D7F2E4">The parents have been told. Say “emergency” again if anything changes.</p>' +
        rows(inc.updates.slice(-4).map(function (u) { return { icon: 'check', title: u.by + ': ' + u.text, when: u.time }; })) + '</div></div>';
    }
    if (showSheet) return paramedicSheet(d);
    var step = inc.steps[inc.current];
    var dots = inc.steps.map(function (s) { return '<i class="' + s.state + '"></i>'; }).join('');
    var otw = inc.on_the_way.map(function (o) { return '<span class="chip home-soon">' + icon('heart') + esc(o.name) + ' is on the way · ' + esc(o.eta) + '</span>'; }).join('');
    var timer = inc.timers[0];
    var spoken = d.spoken && d.language && d.language !== 'en' ? '<div class="spoken" lang="' + esc(d.language) + '"><span class="pill">' + icon('globe') + 'Said in ' + esc(languageName(d.language)) + '</span>' + esc(d.spoken) + '</div>' : '';
    var side =
      (d.address ? '<div class="addr"><small>Call 911 from your phone. Tell them:</small><b>' + esc(d.address) + '</b></div>' : '') +
      (timer ? '<div class="box timer" data-timer="' + timer.remaining_seconds + '"><div><small>' + esc(timer.label) + '</small><b class="tab" id="timerText"></b></div></div>' : '') +
      (d.epipen_location ? '<div class="box"><small>EpiPen</small>' + esc(d.epipen_location) + '</div>' : '') +
      '<div class="box"><small>Alerted</small>' + esc((d.parents_alerted || []).join(', ') || 'The parents') + '</div>' +
      '<p class="warning">' + esc(d.note) + '</p>';
    return '<div class="fs emergency" role="alert"><div class="bar"><span class="flag">' + icon('alert') + 'EMERGENCY</span>' + brand() + '<span class="top-right"><span class="chip tab" id="elapsed"></span>' + otw + '</span></div>' + spoken +
      '<div class="grid"><div class="stepcard' + (fresh ? ' fresh' : '') + '">' +
      (step ? '<small>Step ' + (inc.current + 1) + ' of ' + inc.total + ' · ' + esc(d.action_plan.source) + '</small><p>' + esc(step.text) + '</p>'
        : '<small>All steps done</small><p>Stay with her and follow the 911 dispatcher until help arrives.</p>') +
      '<div class="dots">' + dots + '</div><div class="actions">' +
      (step ? button('Done', 'Done', 'ok', 'check') + button('Next step', 'Next step') : button('Help has arrived', "It's over, the paramedics are here", 'ok', 'check')) +
      '<button class="btn" data-sheet="1">' + icon('list') + '<span>For paramedics</span></button></div></div>' +
      '<div class="side">' + side + '</div></div></div>';
  }
  function paramedicSheet(d) {
    var p = d.paramedic_sheet || {};
    var inc = d.incident || { updates: [] };
    var block = function (title, items, empty) { return '<div class="block"><h3>' + title + '</h3>' + (items && items.length ? '<ul>' + items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>' : '<p>' + empty + '</p>') + '</div>'; };
    return '<div class="fs sheet"><div class="bar"><span class="pill danger">' + icon('list') + 'For the paramedics</span>' + brand() + '<span></span></div>' +
      '<div class="title">' + esc((d.address || '').split(',')[0] || 'Paramedic sheet') + '</div>' +
      '<div class="cols">' + block('Allergies', p.allergies, 'None on file') + block('Medicine', p.medicine_notes, 'None given tonight') +
      block('Doctor', p.doctor ? [p.doctor] : [], 'Not on file') + block('Tonight', inc.updates.map(function (u) { return u.time + ' · ' + u.text; }).concat((p.tonight || []).map(function (e) { return e.text; })), 'Nothing logged') + '</div>' +
      '<div class="actions"><button class="btn danger" data-sheet="0">' + icon('alert') + '<span>Back to the steps</span></button></div></div>';
  }
  function tickEmergency() {
    if (!emergencyData || !emergencyData.incident) return;
    var passed = (Date.now() - emergencyReceived) / 1000;
    var el = document.getElementById('elapsed');
    if (el) el.textContent = mmss(emergencyData.incident.elapsed_seconds + passed) + ' since the alert';
    document.querySelectorAll('.timer[data-timer]').forEach(function (r) {
      var left = Math.max(0, Number(r.getAttribute('data-timer')) - passed);
      var t = r.querySelector('#timerText');
      if (t) t.textContent = left > 0 ? mmss(left) : 'Now';
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

  // ---------- goodnight message (fullscreen media) ----------
  function goodnight(d) {
    var who = d.relation && /mom|mum|mother/i.test(d.relation) ? 'Mom' : d.relation && /dad|father/i.test(d.relation) ? 'Dad' : d.from;
    var media = d.kind === 'video'
      ? '<video id="media" src="' + esc(d.url) + '" playsinline></video>'
      : '<div class="wave" aria-hidden="true">' + Array(13).join('<i></i>') + '</div><audio id="media" crossorigin="anonymous" src="' + esc(d.url) + '"></audio>';
    // Alexa says who it's from first; then the message plays.
    setTimeout(function () { var m = document.getElementById('media'); if (m) m.play().catch(function () {}); }, 3500);
    return '<div class="fs goodnight ' + esc(d.kind) + '"><div class="bar"><span></span>' + brand() + '<span></span></div><div class="grid"><div>' +
      '<div class="title l">' + esc(who) + ' left a message for ' + esc(d.for_name || 'you') + '</div>' +
      (d.caption ? '<p class="caption">“' + esc(d.caption) + '”</p>' : '') +
      '<div class="actions" style="margin-top:16px"><button class="btn" id="replay">' + icon('heart') + '<span>Play again</span></button></div>' + scene(d.smart_home) + '</div>' +
      '<div class="player">' + media + '</div></div><p class="end" aria-live="polite">Sweet dreams, ' + esc(d.for_name || 'little one') + '</p></div>';
  }
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('#replay')) return;
    var m = document.getElementById('media');
    if (m) { m.currentTime = 0; m.play().catch(function () {}); }
  });
  document.addEventListener('play', function (e) { var g = document.querySelector('.goodnight'); if (g && e.target.id === 'media') g.classList.add('playing'); }, true);
  document.addEventListener('ended', function (e) { var g = document.querySelector('.goodnight'); if (g && e.target.id === 'media') { g.classList.remove('playing'); g.classList.add('ended'); } }, true);
  // The waveform follows the real voice (Web Audio); without it the bars just breathe.
  var waveCtx = null;
  document.addEventListener('play', function (e) {
    var m = e.target;
    if (!m || m.id !== 'media' || m.tagName !== 'AUDIO' || m.dataset.wired) return;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    var bars = document.querySelectorAll('.wave i');
    if (!Ctx || !bars.length) return;
    try {
      m.dataset.wired = '1';
      if (waveCtx) waveCtx.close();
      waveCtx = new Ctx();
      var an = waveCtx.createAnalyser();
      an.fftSize = 64;
      waveCtx.createMediaElementSource(m).connect(an);
      an.connect(waveCtx.destination);
      var data = new Uint8Array(an.frequencyBinCount);
      document.querySelector('.wave').classList.add('live');
      (function loop() {
        if (!document.body.contains(m)) return;
        an.getByteFrequencyData(data);
        var mid = (bars.length - 1) / 2;
        for (var i = 0; i < bars.length; i++) {
          var bin = Math.min(data.length - 1, Math.round((Math.abs(i - mid) / mid) * 10) + 1);
          bars[i].style.transform = 'scaleY(' + (0.3 + (data[bin] / 255) * 2.2).toFixed(2) + ')';
        }
        requestAnimationFrame(loop);
      })();
    } catch (err) { /* the bars keep their gentle animation */ }
  }, true);

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
  // "hi" reads as "Hindi" (in English: the parents' words beside it are English too).
  function languageName(code) {
    try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code; } catch (e) { return code; }
  }
  function spokenBanner(d) {
    return '<div class="note info" lang="' + esc(d.language) + '">' + icon('globe') + '<div><strong>Said in ' + esc(languageName(d.language)) + '</strong><span>' + esc(d.spoken) + '</span></div></div>';
  }
  // The emergency step must always be read in full: if it doesn't fit its card (a long plan, a
  // language banner, a small screen), the text gets smaller, never cut off.
  function fitStepText() {
    var el = document.querySelector('.stepcard p');
    if (!el) return;
    el.style.fontSize = '';
    if (!el.clientHeight) return;
    var size = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollHeight - el.clientHeight > size * 0.5 && size > 14) {
      size -= 1;
      el.style.fontSize = size + 'px';
    }
  }
  var stepObserver = window.ResizeObserver ? new ResizeObserver(function () { fitStepText(); }) : null;
  function watchStep() {
    var c = document.querySelector('.stepcard');
    if (!c) return;
    if (stepObserver) { stepObserver.disconnect(); stepObserver.observe(c); }
    requestAnimationFrame(fitStepText);
    setTimeout(fitStepText, 500);
  }
  var lastKey = null;
  function render(result) {
    current = result;
    var d = result && result.structuredContent;
    var root = document.getElementById('root');
    var view = (d && d.view) || 'text';
    // A new screen glides in. The live screens (Tonight, the emergency guide) refresh themselves
    // every few seconds: those refreshes must not replay the entrance, only real changes do.
    var key = view;
    if (d && view === 'home') key += ':' + d.mode + (d.night ? ':night' : '');
    if (d && view === 'emergency') key += ':' + (d.incident ? d.incident.status : '') + (showSheet ? ':sheet' : '');
    var live = view === 'home' || view === 'emergency';
    if (key !== lastKey || !live) {
      root.classList.remove('enter');
      void root.offsetWidth;
      root.classList.add('enter');
    } else {
      root.classList.remove('enter');
    }
    lastKey = key;
    if (view !== 'emergency') emergencyStep = null;
    if (!d || !d.view || !views[d.view]) {
      var text = (result && result.content && result.content[0] && result.content[0].text) || '';
      root.innerHTML = card(topic('message', 'Alexa') + '<div class="title">' + esc(text) + '</div>');
    } else {
      var html = views[d.view](d);
      // Bilingual relay: what the carer heard, in their language, above the parents' own words.
      if (d.spoken && d.language && d.language !== 'en' && d.view !== 'home' && d.view !== 'language' && d.view !== 'emergency') {
        html = html.replace('<div class="body">', function (m) { return m + spokenBanner(d); });
      }
      root.innerHTML = html;
      if (d.view === 'emergency') watchStep();
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
    // The schedule, the emergency guide and the goodnight message use the whole screen.
    if (d && (d.view === 'emergency' || d.view === 'home' || d.view === 'message') && host.displayMode !== 'fullscreen') request('ui/request-display-mode', { mode: 'fullscreen' }).catch(function () {});
  }

  // Report the content's real size whenever it changes (after layout, not before).
  var lastH = 0;
  new ResizeObserver(function () {
    var h = Math.ceil(document.documentElement.getBoundingClientRect().height);
    var w = Math.ceil(document.documentElement.getBoundingClientRect().width);
    if (h > 0 && h !== lastH) { lastH = h; notify('ui/notifications/size-changed', { width: w, height: h }); }
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
    // The surface changed (rotated, moved, theme switched): adapt in place, no reload, no tool call.
    if (m.method === 'ui/notifications/host-context-changed' && m.params) {
      readContext(m.params);
      if (current) render(current);
    }
  });

  request('ui/initialize', {
    appInfo: { name: 'while-youre-out-card', version: '0.3.0' },
    appCapabilities: { availableDisplayModes: ['inline', 'fullscreen'] },
    protocolVersion: '2026-01-26',
  }).then(function (r) {
    readContext(r && r.hostContext);
    if (!host.deviceClass && window.console) console.warn('While You’re Out card: the host sent no deviceClass; sizing from the frame width instead.');
    notify('ui/notifications/initialized');
  }).catch(function () { notify('ui/notifications/initialized'); });
})();
