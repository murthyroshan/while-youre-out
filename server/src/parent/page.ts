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
  :root {
    --bg:#F6F3EE; --card:#fff; --ink:#0B1220; --midnight:#111A2E; --text2:#5B6475; --fill:#F2EEE8; --fill2:#FAF8F4;
    --cyan:#18C3E8; --amber:#F7B955; --coral:#F04438; --mint:#12B76A; --lav:#8B7CF6;
    --coral-ink:#B42318; --mint-ink:#067647; --amber-ink:#8A5700; --cyan-ink:#0B6E85; --lav-ink:#5B4BD6;
    /* older names the script still uses */
    --muted:var(--text2); --green:var(--mint-ink); --red:var(--coral-ink); --blue:var(--cyan-ink); --line:rgba(11,18,32,.08);
    --sh1:0 1px 2px rgba(11,18,32,.04), 0 6px 20px rgba(11,18,32,.06);
    --sh2:0 2px 6px rgba(11,18,32,.06), 0 18px 48px rgba(11,18,32,.16);
    --ease:cubic-bezier(.2,.8,.2,1); --spring:cubic-bezier(.32,1.28,.6,1);
    --nav-h:84px; --sheet-h:0px;
    --font:"SF Pro Text", "SF Pro", -apple-system, BlinkMacSystemFont, Inter, "Segoe UI", system-ui, sans-serif;
    --font-d:"SF Pro Display", "SF Pro", -apple-system, BlinkMacSystemFont, Inter, "Segoe UI", system-ui, sans-serif;
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  main, .card, .qsheet, .toast, .live { overflow-wrap: anywhere; }
  html { background: var(--bg); }
  body { margin: 0; font: 16px/1.45 var(--font); background: var(--bg); color: var(--ink); padding-bottom: calc(var(--nav-h) + var(--sheet-h) + 24px); -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
  :focus { outline: none; }
  :focus-visible { outline: 3px solid var(--cyan); outline-offset: 2px; border-radius: 8px; }
  .live :focus-visible, .alert :focus-visible { outline-color: #fff; }
  .sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  svg.i { width: 20px; height: 20px; flex: none; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

  /* ---------- large-title header ---------- */
  .hero { max-width: 560px; margin: 0 auto; padding: calc(10px + env(safe-area-inset-top)) 16px 0; }
  .hero .top { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; }
  .brand { display: flex; gap: 8px; align-items: center; min-width: 0; }
  .mark { width: 32px; height: 32px; flex: none; border-radius: 10px; display: grid; place-items: center; color: var(--amber); background: linear-gradient(150deg, #1B2742, #0B1220); box-shadow: 0 2px 6px rgba(11,18,32,.25), inset 0 1px 0 rgba(255,255,255,.12); }
  .mark svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  .brand b { font-size: 15px; font-weight: 650; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .me { position: relative; flex: none; display: inline-flex; align-items: center; gap: 2px; min-height: 44px; padding: 0 12px 0 14px; border-radius: 999px; background: #fff; box-shadow: var(--sh1); font-size: 12px; color: var(--text2); white-space: nowrap; cursor: pointer; }
  .me span { pointer-events: none; }
  .me select { appearance: none; -webkit-appearance: none; font: inherit; font-size: 14px; font-weight: 700; color: var(--ink); background: transparent; border: 0; padding: 10px 18px 10px 4px; max-width: 120px; text-overflow: ellipsis; cursor: pointer; }
  .me::after { content: ''; position: absolute; right: 14px; top: 50%; width: 6px; height: 6px; margin-top: -5px; border-right: 2px solid var(--text2); border-bottom: 2px solid var(--text2); transform: rotate(45deg); pointer-events: none; }
  .me:focus-within { box-shadow: var(--sh1), 0 0 0 3px var(--cyan); }
  .me select:focus-visible { outline: none; }
  .ttl { margin: 14px 2px 0; }
  .ttl h1 { margin: 0; font: 800 34px/1.1 var(--font-d); letter-spacing: -.028em; }
  .ttl small { display: block; margin-top: 2px; font-size: 15px; color: var(--text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* ---------- live status card ---------- */
  .live { position: relative; margin: 16px 0 0; padding: 16px 16px 16px; border-radius: 24px; color: #fff; overflow: hidden;
    background: radial-gradient(120% 90% at 0% 0%, rgba(24,195,232,.22), transparent 55%), radial-gradient(90% 70% at 100% 0%, rgba(247,185,85,.18), transparent 60%), linear-gradient(160deg, #1A2540, #0B1220 70%);
    box-shadow: 0 2px 6px rgba(11,18,32,.12), 0 18px 40px rgba(11,18,32,.22); transition: background-color .3s var(--ease); }
  .live.sos { background: radial-gradient(120% 90% at 100% 0%, rgba(255,255,255,.18), transparent 55%), linear-gradient(160deg, #F04438, #A11A12); }
  .live-top { display: flex; align-items: center; gap: 12px; }
  .ava { width: 44px; height: 44px; flex: none; border-radius: 50%; display: grid; place-items: center; font: 800 18px/1 var(--font-d); color: #0B1220; background: linear-gradient(140deg, #FFD58A, #F7B955 55%, #F08A4B); box-shadow: 0 0 0 3px rgba(255,255,255,.12); }
  .ava.home { color: var(--cyan); background: rgba(255,255,255,.08); }
  .ava svg { width: 22px; height: 22px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .live-who { flex: 1; min-width: 0; }
  .live #status { font-size: 14px; line-height: 1.35; color: #C9D3E3; }
  .live-dot { display: none; align-items: center; gap: 6px; flex: none; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #9BE8F8; padding: 5px 10px 5px 8px; border-radius: 999px; background: rgba(24,195,232,.12); }
  .live.on .live-dot { display: inline-flex; }
  .live-dot i { position: relative; width: 8px; height: 8px; border-radius: 50%; background: var(--cyan); }
  .live-dot i::after { content: ''; position: absolute; inset: 0; border-radius: 50%; background: var(--cyan); animation: ping 2.4s var(--ease) infinite; }
  .live.sos .live-dot { color: #fff; background: rgba(255,255,255,.18); }
  .live.sos .live-dot i, .live.sos .live-dot i::after { background: #fff; }
  @keyframes ping { 0% { transform: scale(1); opacity: .7; } 70%, 100% { transform: scale(2.6); opacity: 0; } }
  .live .now { margin-top: 14px; font: 750 26px/1.2 var(--font-d); letter-spacing: -.02em; min-height: 32px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
  .live .now small { flex-basis: 100%; font: 600 15px/1.35 var(--font); letter-spacing: 0; color: #FFD58A; }
  .cd { font: 700 14px/1 var(--font); letter-spacing: 0; padding: 6px 10px; border-radius: 999px; background: rgba(247,185,85,.16); color: #FFD58A; font-variant-numeric: tabular-nums; white-space: nowrap; transform: translateY(-3px); }
  .cd.is-now { background: rgba(24,195,232,.16); color: #9BE8F8; }
  .cd.late { background: rgba(240,68,56,.2); color: #FFB4AE; }
  .prog { margin-top: 14px; }
  .prog-bar { display: flex; gap: 4px; height: 6px; }
  .prog-bar i { flex: 1; border-radius: 999px; background: rgba(255,255,255,.14); transform-origin: left; }
  .prog-bar i.done { background: #4ADE9B; }
  .prog-bar i.late { background: var(--amber); }
  .prog-bar i.due { background: var(--cyan); }
  .prog-cap { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; color: #AEB9CC; margin-top: 8px; font-variant-numeric: tabular-nums; }
  .live .pills { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
  .live .pills:empty { display: none; }
  .lp { white-space: nowrap; font-size: 13px; font-weight: 600; padding: 5px 10px; border-radius: 999px; background: rgba(255,255,255,.1); color: #E6ECF5; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .lp.ok { background: rgba(18,183,106,.2); color: #8EF0C2; }
  .lp.warn { background: rgba(247,185,85,.18); color: #FFD58A; }
  .lp.bad { background: rgba(255,255,255,.2); color: #fff; }
  body:not([data-tab=tonight]) .live .prog, body:not([data-tab=tonight]) .live .pills { display: none; }

  /* ---------- layout, cards, type ---------- */
  main { padding: 0 16px 24px; max-width: 560px; margin: 0 auto; }
  .tabpane { display: none; }
  body[data-tab=tonight] .tabpane[data-tab=tonight], body[data-tab=house] .tabpane[data-tab=house], body[data-tab=family] .tabpane[data-tab=family] { display: block; animation: paneIn .28s var(--ease) both; }
  @keyframes paneIn { from { opacity: 0; transform: translateY(8px); } }
  .card { position: relative; background: var(--card); border: 0; border-radius: 24px; padding: 20px; margin: 16px 0; box-shadow: var(--sh1); }
  .card > strong:first-child { display: block; font: 700 17px/1.3 var(--font-d); letter-spacing: -.012em; margin: 0 0 4px; }
  .card > p.muted:first-of-type { margin-top: 4px; }
  h2.sec { font: 700 13px/1.2 var(--font); text-transform: uppercase; letter-spacing: .08em; color: var(--text2); margin: 32px 4px -4px; }
  .muted { color: var(--text2); font-size: 14px; line-height: 1.45; }
  .alist { list-style: none; margin: 10px 0 0; padding: 0; }
  .alist li { display: flex; gap: 12px; padding: 9px 0; border-top: 1px solid rgba(127,127,127,.18); font-size: 14px; line-height: 1.4; }
  .alist li:first-child { border-top: 0; }
  .alist .t { color: var(--text2); min-width: 64px; font-variant-numeric: tabular-nums; }
  .alist small { display: block; color: var(--text2); }
  ul { padding-left: 18px; margin: 8px 0; }
  .rise { animation: rise .32s var(--ease) both; }
  @keyframes rise { from { opacity: 0; transform: translateY(10px); } }

  /* ---------- buttons and controls ---------- */
  button { font: inherit; font-weight: 650; min-height: 44px; padding: 10px 16px; border-radius: 14px; border: 0; background: var(--fill); color: var(--ink); cursor: pointer; touch-action: manipulation; transition: transform .18s var(--ease), opacity .18s var(--ease), background-color .18s var(--ease); }
  button * { pointer-events: none; }
  button:active:not(:disabled) { transform: scale(.97); }
  button:disabled { opacity: .5; cursor: default; }
  button.ok { background: var(--ink); color: #fff; box-shadow: 0 1px 2px rgba(11,18,32,.2), 0 6px 16px rgba(11,18,32,.18); }
  button.no { background: #FEECEB; color: var(--coral-ink); }
  .wide { width: 100%; margin-top: 12px; min-height: 52px; font-size: 17px; border-radius: 16px; }
  .btns { display: flex; gap: 8px; }
  .btns > button { flex: 1 1 0; min-width: 0; min-height: 48px; padding-left: 6px; padding-right: 6px; overflow-wrap: normal; }
  .pbtns { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; margin-top: 12px; }
  .seg { display: flex; gap: 4px; padding: 4px; margin-top: 12px; border-radius: 16px; background: var(--fill); }
  .seg button { flex: 1 1 0; min-width: 0; min-height: 44px; background: transparent; border-radius: 12px; font-size: 15px; }
  .seg button:hover { background: rgba(255,255,255,.6); }
  .seg button:active:not(:disabled) { background: #fff; box-shadow: 0 1px 3px rgba(11,18,32,.12); }
  .scope { display: inline-flex; gap: 2px; padding: 3px; margin: 12px 0 0; border-radius: 14px; background: var(--fill); font-size: 14px; font-weight: 600; color: var(--text2); }
  .scope label { position: relative; display: flex; align-items: center; min-height: 40px; padding: 0 16px; border-radius: 11px; cursor: pointer; transition: background-color .18s var(--ease), color .18s var(--ease); }
  .scope input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }
  .scope label:has(input:checked) { background: #fff; color: var(--ink); box-shadow: 0 1px 3px rgba(11,18,32,.12); }
  .scope label:has(input:focus-visible) { outline: 3px solid var(--cyan); outline-offset: 1px; }
  input.sw { appearance: none; -webkit-appearance: none; position: relative; flex: none; width: 51px; height: 31px; margin: 0; border-radius: 999px; background: #DDD7CC; cursor: pointer; transition: background-color .22s var(--ease); }
  input.sw::before { content: ''; position: absolute; top: 2px; left: 2px; width: 27px; height: 27px; border-radius: 50%; background: #fff; box-shadow: 0 2px 4px rgba(11,18,32,.22); transition: transform .26s var(--spring); }
  input.sw:checked { background: var(--mint); }
  input.sw:checked::before { transform: translateX(20px); }
  .sw-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 52px; padding: 6px 0; border-top: 1px solid var(--line); font-size: 16px; cursor: pointer; }
  .sw-row:first-child { border-top: 0; }
  .sitter { border-top: 1px solid var(--line); padding: 12px 0 4px; }
  .sitter:first-child { border-top: 0; }
  .sitter summary { display: flex; align-items: center; gap: 12px; min-height: 48px; cursor: pointer; list-style: none; }
  .sitter summary::-webkit-details-marker { display: none; }
  .sitter summary b { font-size: 17px; }
  .sitter summary small { display: block; color: var(--text2); font-size: 13px; font-weight: 500; }
  .sitter .sv { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; font-weight: 750; color: #fff; flex: none; }
  .sitter .two { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
  .switch { display: flex; align-items: center; gap: 10px; margin: 10px 0; font-size: 15px; }
  .switch input { width: 20px; height: 20px; accent-color: var(--mint); }

  /* ---------- forms ---------- */
  textarea, .field input, .field select, .row input, .row select, .vadd input, .vadd select {
    display: block; width: 100%; font: inherit; color: var(--ink); min-height: 48px; padding: 12px 14px; border-radius: 14px; border: 1px solid transparent; background: var(--fill); transition: background-color .18s var(--ease), border-color .18s var(--ease), box-shadow .18s var(--ease); }
  textarea { margin-top: 12px; resize: vertical; line-height: 1.4; }
  textarea:focus, .field input:focus, .field select:focus, .row input:focus, .row select:focus, .vadd input:focus, .vadd select:focus { outline: none; background: #fff; border-color: var(--cyan); box-shadow: 0 0 0 4px rgba(24,195,232,.18); }
  ::placeholder { color: #737B8C; }
  .field { display: block; margin: 16px 0 0; font-size: 13px; font-weight: 650; color: var(--text2); }
  .field input, .field select { margin-top: 6px; }
  .from { font: 700 13px/1.2 var(--font); text-transform: uppercase; letter-spacing: .07em; color: var(--text2); margin: 24px 0 6px; }
  .perr { color: var(--coral-ink); font-size: 14px; margin: 8px 0 0; }
  .perr:empty { display: none; }
  .ferr { color: var(--coral-ink); font-size: 14px; font-weight: 600; min-height: 1em; margin: 12px 0 0; }
  .en { font-size: 14px; color: var(--text2); margin: -6px 0 12px; }
  .warn { font-size: 13px; color: var(--amber-ink); background: #FEF4DF; padding: 8px 12px; border-radius: 12px; margin-top: 8px; }
  .conflict { background: #FFF8EA; border-radius: 16px; padding: 12px 14px; margin-top: 10px; font-size: 14px; box-shadow: inset 0 0 0 1px rgba(247,185,85,.45); }
  .chip { display: inline-block; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 999px; background: #EEF1F6; color: #334E68; margin-right: 6px; }
  .chip.safety { background: #FEECEB; color: var(--coral-ink); }
  .upload { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 140px; padding: 20px 16px; margin-top: 16px; text-align: center; border: 2px dashed #D6CEC1; border-radius: 20px; background: var(--fill2); cursor: pointer; transition: transform .2s var(--ease), border-color .2s var(--ease), background-color .2s var(--ease); }
  .upload:hover { border-color: #BDB3A3; }
  .upload.drag { border-color: var(--cyan); background: #ECFAFD; transform: scale(1.01); }
  .upload:focus-within { outline: 3px solid var(--cyan); outline-offset: 2px; }
  .upload input { position: absolute; width: 1px; height: 1px; opacity: 0; }
  .up-ic { width: 48px; height: 48px; border-radius: 16px; display: grid; place-items: center; background: #fff; color: var(--ink); box-shadow: var(--sh1); margin-bottom: 6px; }
  .up-ic svg { width: 24px; height: 24px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .up-t { font-weight: 700; font-size: 16px; }
  .up-s { font-size: 13px; color: var(--text2); }
  .row { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 14px; margin-top: 10px; border-radius: 18px; background: var(--fill2); box-shadow: inset 0 0 0 1px var(--line); }
  .row .full { grid-column: 1 / -1; }
  .row label { font-size: 13px; font-weight: 650; color: var(--text2); }
  .row input, .row select { margin-top: 6px; background: #fff; box-shadow: inset 0 0 0 1px var(--line); }
  .row .tools { grid-column: 1 / -1; display: flex; gap: 6px; justify-content: flex-end; align-items: center; }
  .row .tools button { min-width: 44px; padding: 8px 12px; font-size: 14px; background: #fff; box-shadow: inset 0 0 0 1px var(--line); }
  .row .tools .grow { flex: 1; font-size: 14px; color: var(--text2); }
  .row .tools label { display: flex; gap: 10px; align-items: center; min-height: 44px; }
  .row .tools label input.sw { display: inline-block; width: 51px; height: 31px; border-radius: 999px; min-height: 0; margin: 0; padding: 0; border: 0; box-shadow: none; background: #DDD7CC; }
  .row .tools label input.sw:checked { background: var(--mint); }
  .order { display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: var(--ink); color: #fff; font-size: 13px; font-weight: 800; }
  .banner { background: linear-gradient(160deg, #FFF6E0, #FFEFD0); }
  .danger button { background: #fff; color: var(--coral-ink); box-shadow: inset 0 0 0 1px rgba(240,68,56,.35); }
  .danger button.armed { background: var(--coral-ink); color: #fff; box-shadow: none; }

  /* ---------- questions ---------- */
  .q { font: 650 19px/1.3 var(--font-d); letter-spacing: -.01em; margin: 0 0 14px; }
  .asker { font-size: 13px; color: var(--text2); margin: 0 0 6px; }
  .urgent { display: inline-block; font-size: 12px; font-weight: 750; letter-spacing: .02em; background: #FEECEB; color: var(--coral-ink); padding: 4px 10px; border-radius: 999px; margin-bottom: 10px; }
  .always-note { display: none; margin: 10px 0 0; font-size: 14px; color: var(--amber-ink); background: #FEF4DF; padding: 8px 12px; border-radius: 12px; }
  .card:has(input[value=always]:checked) .always-note { display: block; }
  .card[data-id] { box-shadow: var(--sh1), inset 0 0 0 1px rgba(247,185,85,.0); }
  .card[data-id]:has(.urgent) { box-shadow: var(--sh1), inset 0 0 0 2px rgba(240,68,56,.35); }
  .card.leaving { opacity: 0; transform: scale(.97); transition: opacity .22s var(--ease), transform .22s var(--ease); }
  .doorcam { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 16px; margin: 0 0 14px; background: #111; }

  /* ---------- question sheet ---------- */
  .qsheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 9; padding: 0 8px calc(var(--nav-h) + 8px); pointer-events: none; visibility: hidden; transition: visibility 0s linear .42s; }
  .qsheet.open { visibility: visible; transition: visibility 0s; }
  .qsheet .scrim { position: absolute; left: 0; right: 0; bottom: 0; top: -56px; background: linear-gradient(rgba(11,18,32,0), rgba(11,18,32,.34) 42%); opacity: 0; transition: opacity .32s var(--ease); }
  .qsheet.open .scrim { opacity: 1; }
  .qs { position: relative; pointer-events: auto; max-width: 560px; margin: 0 auto; padding: 6px 16px 12px; border-radius: 28px; background: #fff; box-shadow: var(--sh2); transform: translateY(calc(100% + var(--nav-h) + 40px)); transition: transform .44s var(--spring); }
  .qsheet.open .qs { transform: none; }
  .qsheet.bump .qs { animation: bump .5s var(--ease); }
  @keyframes bump { 30% { transform: translateY(-8px); } 60% { transform: translateY(2px); } }
  .grab { display: block; width: 100%; min-height: 28px; padding: 0; margin: 0 0 2px; background: none; border-radius: 0; }
  .grab::before { content: ''; display: block; width: 40px; height: 5px; margin: 0 auto; border-radius: 999px; background: #D9D3C8; }
  .grab:active:not(:disabled) { transform: none; }
  .qs-top { display: flex; gap: 12px; align-items: flex-start; }
  .qs-ava { width: 36px; height: 36px; flex: none; border-radius: 50%; display: grid; place-items: center; font: 800 15px/1 var(--font-d); color: #0B1220; background: linear-gradient(140deg, #FFD58A, #F7B955 55%, #F08A4B); }
  .qs-txt { min-width: 0; flex: 1; }
  .qs-txt .asker { margin: 0 0 2px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .qs-txt .asker .urgent { margin: 0; padding: 2px 8px; }
  .qs .q { font-size: 19px; margin: 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .qs .en { margin: 4px 0 0; font-size: 13px; }
  .qs-photo { display: block; width: 100%; aspect-ratio: 16 / 9; max-height: 34vh; object-fit: cover; border-radius: 18px; margin: 12px 0 0; background: #111; }
  .qs .btns { flex-direction: column; gap: 8px; margin-top: 14px; }
  .qs .btns > button { flex: none; width: 100%; min-height: 52px; font-size: 17px; border-radius: 16px; }
  .qs .btns > button:not(.ok):not(.no) { min-height: 44px; background: transparent; color: var(--cyan-ink); font-size: 16px; }
  .qs-more { display: block; width: 100%; min-height: 44px; margin-top: 2px; padding: 8px; background: none; color: var(--text2); font-size: 14px; font-weight: 600; }
  .qsheet.peek .qs-body { display: none; }
  .qsheet.peek .qs { padding-bottom: 14px; }
  .qs-done { position: absolute; inset: 0; z-index: 2; border-radius: inherit; background: #fff; display: grid; place-content: center; justify-items: center; gap: 10px; font: 700 17px/1.3 var(--font-d); animation: fadeIn .2s var(--ease) both; }
  .qs-done svg { width: 64px; height: 64px; }
  .qs-done circle { fill: var(--mint); transform-origin: center; animation: pop .42s var(--spring) both; }
  .qs-done path { fill: none; stroke: #fff; stroke-width: 3.2; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 30; stroke-dashoffset: 30; animation: draw .36s var(--ease) .16s forwards; }
  @keyframes pop { from { transform: scale(.4); opacity: 0; } }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  @keyframes fadeIn { from { opacity: 0; } }

  /* ---------- toasts ---------- */
  .toast { position: fixed; left: 50%; bottom: calc(var(--nav-h) + var(--sheet-h) + 12px); z-index: 11; display: flex; align-items: center; gap: 10px; max-width: min(92vw, 420px); padding: 12px 18px 12px 12px; border-radius: 999px; background: rgba(11,18,32,.94); color: #fff; font-size: 15px; font-weight: 600; box-shadow: 0 12px 32px rgba(11,18,32,.3); transform: translate(-50%, 16px) scale(.96); opacity: 0; pointer-events: none; transition: opacity .22s var(--ease), transform .3s var(--spring); }
  .toast::before { content: ''; width: 24px; height: 24px; flex: none; border-radius: 50%; background: var(--mint) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 12.5l4 4 8-9'/%3E%3C/svg%3E") center / 16px no-repeat; }
  .toast.bad::before { background: var(--coral) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round'%3E%3Cpath d='M12 7v6M12 17h.01'/%3E%3C/svg%3E") center / 16px no-repeat; }
  .toast.info::before { background: var(--cyan) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round'%3E%3Cpath d='M12 8h.01M12 11v6'/%3E%3C/svg%3E") center / 16px no-repeat; }
  .toast.show { opacity: 1; transform: translate(-50%, 0) scale(1); }
  .toast:empty { display: none; }

  /* ---------- tonight so far: a timeline ---------- */
  .feed { position: relative; list-style: none; padding: 0; margin: 14px 0 0; }
  .feed::before { content: ''; position: absolute; left: 17px; top: 20px; bottom: 20px; width: 2px; border-radius: 2px; background: #EEE9E1; }
  .feed li { position: relative; display: grid; grid-template-columns: 36px 1fr auto; gap: 12px; align-items: start; padding: 8px 0; }
  .feed.stagger li { animation: rise .34s var(--ease) both; animation-delay: calc(var(--i, 0) * 45ms); }
  .feed li.new { animation: slideIn .38s var(--spring) both; }
  @keyframes slideIn { from { opacity: 0; transform: translateY(-14px); } }
  .fi-ic { position: relative; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: #F1EDE6; color: var(--text2); box-shadow: 0 0 0 4px #fff; }
  .fi-ic svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .k-sleep .fi-ic { background: #E9ECF7; color: #2A3766; }
  .k-food .fi-ic { background: #FEF3DC; color: var(--amber-ink); }
  .k-mood .fi-ic { background: #E3F7FC; color: var(--cyan-ink); }
  .k-health .fi-ic { background: #FEECEB; color: var(--coral-ink); }
  .k-pet .fi-ic { background: #F4ECE2; color: #6B4E2E; }
  .k-door .fi-ic { background: #E3F7FC; color: var(--cyan-ink); }
  .k-answer .fi-ic { background: #EFECFE; color: var(--lav-ink); }
  .k-shop .fi-ic { background: #E3F6EC; color: var(--mint-ink); }
  .fi-tx { min-width: 0; padding-top: 7px; font-size: 15px; line-height: 1.38; }
  .fi-tx small { display: block; margin-top: 2px; font-size: 13px; color: var(--text2); }
  .fi-t { padding-top: 8px; font-size: 13px; color: var(--text2); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .empty { display: flex; align-items: center; gap: 12px; margin: 12px 0 0; color: var(--text2); font-size: 15px; }
  .empty .fi-ic { box-shadow: none; flex: none; }
  .feed-empty { margin: 6px 0 0; }

  /* ---------- emergency ---------- */
  .alert { color: #fff; background: radial-gradient(120% 90% at 100% 0%, rgba(255,255,255,.18), transparent 55%), linear-gradient(160deg, #F04438, #A11A12); box-shadow: 0 4px 10px rgba(161,26,18,.2), 0 18px 40px rgba(240,68,56,.32); }
  .alert p { margin: 8px 0 0; }
  .alert a.call { display: block; text-align: center; margin-top: 12px; background: #fff; color: var(--coral-ink); font-weight: 800; padding: 14px; border-radius: 16px; text-decoration: none; }
  .inc { padding: 20px; }
  .inc.enter { animation: sosIn .6s var(--ease) both; }
  .inc.enter::after { content: ''; position: absolute; inset: 0; border-radius: inherit; box-shadow: 0 0 0 6px rgba(240,68,56,.5); pointer-events: none; animation: ring 1s var(--ease) .2s both; }
  @keyframes sosIn { 0% { opacity: 0; transform: scale(.96); } 60% { opacity: 1; transform: scale(1.012); } 100% { transform: none; } }
  @keyframes ring { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(1.05); } }
  .inc-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .inc-head strong { font: 800 18px/1.25 var(--font-d); }
  .inc-head .elapsed { font-variant-numeric: tabular-nums; font-size: 13px; font-weight: 700; padding: 4px 10px; border-radius: 999px; background: rgba(0,0,0,.18); white-space: nowrap; }
  .inc-desc { font-size: 15px; opacity: .95; }
  .inc-prog { display: flex; gap: 4px; height: 6px; margin-top: 16px; }
  .inc-prog i { flex: 1; border-radius: 999px; background: rgba(255,255,255,.25); }
  .inc-prog i.done { background: #fff; }
  .inc-prog i.now { background: #FFD58A; }
  .inc-now { margin-top: 10px; padding: 14px 16px; border-radius: 18px; background: #fff; color: #5C0E09; font: 700 19px/1.3 var(--font-d); box-shadow: 0 6px 18px rgba(0,0,0,.14); }
  .inc-now small { display: block; margin-bottom: 4px; font: 750 12px/1.2 var(--font); letter-spacing: .08em; text-transform: uppercase; color: var(--coral-ink); }
  .inc-timer { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 10px; padding: 12px 16px; border-radius: 18px; background: rgba(0,0,0,.2); font-weight: 700; }
  .inc-timer b { font: 800 40px/1 var(--font-d); font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
  .inc-timer.up { background: #FFF3C4; color: #6B3F00; animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .72; } }
  .inc-steps { margin: 14px 0 0; padding-left: 22px; font-size: 14px; }
  .inc-steps li { margin: 6px 0; opacity: .82; }
  .inc-steps li.done { text-decoration: line-through; opacity: .7; }
  .inc-steps li.now { opacity: 1; font-weight: 750; }
  .inc-otw { margin-top: 12px; padding: 10px 14px; border-radius: 14px; background: rgba(255,255,255,.16); font-weight: 650; }
  .inc-label { margin: 18px 0 8px; font: 750 13px/1.2 var(--font); letter-spacing: .06em; text-transform: uppercase; }
  .otw { display: flex; gap: 4px; padding: 4px; border-radius: 20px; background: rgba(0,0,0,.2); }
  .otw button { flex: 1 1 0; min-width: 0; min-height: 68px; border-radius: 16px; background: #fff; color: #8A0D14; font: 800 26px/1 var(--font-d); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; box-shadow: 0 2px 6px rgba(0,0,0,.16); }
  .otw button small { font: 700 13px/1 var(--font); color: var(--coral-ink); }
  .inc .btns button { background: rgba(255,255,255,.95); color: #8A0D14; }
  .inc-log { list-style: none; padding: 0; margin: 14px 0 0; font-size: 13px; }
  .inc-log li { padding: 6px 0; border-top: 1px solid rgba(255,255,255,.2); }
  .inc-log span { font-variant-numeric: tabular-nums; margin-right: 8px; opacity: .85; }
  .inc.over { color: var(--ink); background: linear-gradient(160deg, #EFFBF4, #E3F6EC); }
  .inc.over .inc-log li { border-color: var(--line); }
  .inc-addr { font-size: 13px; opacity: .9; margin: 12px 0 0; }

  /* ---------- goodnight message ---------- */
  .gn-item { border-top: 1px solid var(--line); padding: 12px 0; }
  .gn-item:first-child { border-top: 0; }
  .gn-item .gn-meta { display: flex; justify-content: space-between; gap: 8px; align-items: center; font-size: 14px; }
  .gn-item .gn-meta button { min-height: 40px; padding: 6px 12px; font-size: 14px; }
  .gn-item audio, .gn-item video, #gnDraftMedia audio, #gnDraftMedia video { width: 100%; margin-top: 8px; border-radius: 14px; }
  .gn-item video, #gnDraftMedia video, #gnPreview { max-height: 260px; background: #000; }
  .gn-rec { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px; }
  .gn-rec button { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 52px; }
  .gn-rec button svg { width: 20px; height: 20px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  #gnPreview { width: 100%; border-radius: 16px; margin-top: 12px; }
  .gn-timer { display: flex; align-items: center; gap: 8px; margin: 10px 0 0; font-variant-numeric: tabular-nums; }
  .gn-timer .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--coral); animation: pulse 1.2s infinite; }
  .gn-timer button { margin-left: auto; }
  .gn-upload { display: block; margin-top: 14px; }
  .gn-upload input { font-size: 13px; min-height: 44px; max-width: 100%; }
  .gn-heart { color: var(--lav); }

  /* ---------- expected visitors ---------- */
  .vlist { list-style: none; padding: 0; margin: 12px 0 0; }
  .vlist li { display: flex; gap: 12px; align-items: center; padding: 10px 0; border-top: 1px solid var(--line); }
  .vlist li:first-child { border-top: 0; }
  .vlist .vi { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: #E3F7FC; color: var(--cyan-ink); flex: none; }
  .vlist .vi.box { background: #FEF3DC; color: var(--amber-ink); }
  .vlist .vi svg { width: 20px; height: 20px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .vlist .vt { flex: 1; min-width: 0; }
  .vlist .vt b { display: block; font-weight: 650; }
  .vlist .vt small { color: var(--text2); font-size: 13px; }
  .vlist button { min-height: 40px; padding: 6px 12px; font-size: 14px; }
  .vlist li.empty { border: 0; }
  .vadd { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
  .vadd #vAdd { min-height: 48px; }

  /* ---------- notifications, debrief ---------- */
  [hidden] { display: none !important; }
  .notify { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
  .notify p { margin: 4px 0 0; }
  .notify .on-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--mint); margin-right: 8px; vertical-align: middle; }
  .tl { list-style: none; padding: 0; margin: 8px 0 0; }
  .tl li { display: grid; grid-template-columns: 74px 1fr; gap: 8px; padding: 8px 0; border-top: 1px solid var(--line); font-size: 15px; }
  .tl li:first-child { border-top: 0; }
  .tl .t { color: var(--text2); font-variant-numeric: tabular-nums; }
  .debrief { background: linear-gradient(170deg, #fff 60%, #F7F4FF); }
  .debrief ul { padding-left: 20px; }
  .debrief li { margin: 4px 0; }

  /* ---------- skeletons ---------- */
  .sk { position: relative; overflow: hidden; display: block; height: 14px; margin: 12px 0; border-radius: 8px; background: #ECE7DF; }
  .sk::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,.6), transparent); transform: translateX(-100%); animation: shimmer 1.5s var(--ease) infinite; }
  .sk.w40 { width: 40%; } .sk.w60 { width: 60%; } .sk.w80 { width: 80%; } .sk.tall { height: 48px; border-radius: 14px; }
  .sk.dot { width: 36px; height: 36px; border-radius: 50%; margin: 0; flex: none; }
  .sk-row { display: flex; gap: 12px; align-items: center; margin: 10px 0; }
  .sk-row .sk { flex: 1; margin: 0; }
  .live .sk { background: rgba(255,255,255,.1); margin: 6px 0; }
  .live .sk::after { background: linear-gradient(90deg, transparent, rgba(255,255,255,.14), transparent); }
  .live .sk.big { height: 28px; width: 70%; }
  .live .sk.pill { display: inline-block; width: 110px; height: 26px; border-radius: 999px; margin: 0; }
  body.stalled .sk::after { animation: none; }
  @keyframes shimmer { to { transform: translateX(100%); } }

  /* ---------- tab bar ---------- */
  nav.tabs { position: fixed; left: 12px; right: 12px; bottom: calc(10px + env(safe-area-inset-bottom)); z-index: 10; max-width: 420px; margin: 0 auto; padding: 6px; border-radius: 28px; background: rgba(255,255,255,.8); -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px); box-shadow: 0 10px 30px rgba(11,18,32,.16), 0 1px 2px rgba(11,18,32,.08), inset 0 0 0 1px rgba(255,255,255,.7); }
  .tabs-in { position: relative; display: grid; grid-template-columns: repeat(3, 1fr); }
  .tab-ind { position: absolute; top: 0; bottom: 0; left: 0; width: calc(100% / 3); border-radius: 22px; background: var(--ink); box-shadow: 0 4px 12px rgba(11,18,32,.25); transform: translateX(calc(var(--ti, 0) * 100%)); transition: transform .34s var(--ease); }
  nav.tabs button { position: relative; z-index: 1; min-height: 54px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 4px; border-radius: 22px; background: none; color: var(--text2); font-size: 12px; font-weight: 650; transition: color .25s var(--ease), transform .18s var(--ease); }
  nav.tabs button[aria-selected=true] { color: #fff; }
  nav.tabs svg { width: 24px; height: 24px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  nav.tabs .badge { position: absolute; top: 4px; left: calc(50% + 6px); min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; display: grid; place-items: center; background: var(--coral); color: #fff; font-size: 11px; font-weight: 800; box-shadow: 0 0 0 2px #fff; }
  nav.tabs .badge:empty { display: none; }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
    button:active:not(:disabled) { transform: none; }
    .qs-done path { stroke-dashoffset: 0; }
  }
</style>
</head>
<body data-tab="tonight" class="loading">
<header class="hero">
  <div class="top">
    <div class="brand"><span class="mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 10.5 12 4l8 6.5"/><path d="M6 9.5V20h12V9.5"/><path d="M14.5 13.2a2.6 2.6 0 0 1-3.4-3.4 3 3 0 1 0 3.4 3.4Z"/></svg></span><b>While You're Out</b></div>
    <label class="me"><span>Answering as</span><select id="me"></select></label>
  </div>
  <div class="ttl"><h1 id="pageTitle">Tonight</h1><small id="household">Your home</small></div>
  <section class="live" id="live" aria-live="polite">
    <div class="live-top">
      <span class="ava home" id="liveAvatar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 10.5 12 4l8 6.5"/><path d="M6 9.5V20h12V9.5"/></svg></span>
      <div class="live-who"><div id="status">Connecting…</div></div>
      <span class="live-dot" aria-hidden="true"><i></i>Live</span>
    </div>
    <div class="now" id="liveNow"><span class="sk big" aria-hidden="true"></span></div>
    <div class="prog" id="liveProg" hidden></div>
    <div class="pills" id="livePills"><span class="sk pill" aria-hidden="true"></span><span class="sk pill" aria-hidden="true"></span></div>
  </section>
</header>
<main>
  <div class="tabpane" data-tab="tonight">
    <div id="emergency"></div>
    <div id="setupBanner"></div>
    <div id="questions"></div>
    <div id="debrief"></div>
    <div id="order"></div>
    <div id="pass"></div>
    <section class="card" aria-labelledby="feedTitle"><strong id="feedTitle">Tonight so far</strong><div id="log"><div class="sk-row" aria-hidden="true"><span class="sk dot"></span><span class="sk w80"></span></div><div class="sk-row" aria-hidden="true"><span class="sk dot"></span><span class="sk w60"></span></div><div class="sk-row" aria-hidden="true"><span class="sk dot"></span><span class="sk w80"></span></div></div></section>
    <section class="card" id="activity" aria-labelledby="activityTitle" hidden><strong id="activityTitle">Activity under the pass</strong><p class="muted">Everything done tonight on the Echo Show and on the sitter’s phone.</p><ul class="alist" id="alist"></ul></section>
    <div class="card" id="busy"><span class="sk w40" aria-hidden="true"></span><span class="sk tall" aria-hidden="true"></span></div>
    <h2 class="sec">Before you go</h2>
    <section class="card notify" id="notify" hidden></section>
    <section class="card" id="visitors">
      <strong>Expected tonight</strong>
      <p class="muted">Who might come to the door. Alexa checks this list when the bell rings. Anyone else, the sitter is told not to open and you get the doorbell photo.</p>
      <ul class="vlist" id="vlist"><li aria-hidden="true"><span class="sk dot"></span><span class="sk w60" style="flex:1"></span></li></ul>
      <div class="vadd">
        <input id="vName" maxlength="60" placeholder="Who? e.g. Nani, pizza" aria-label="Who is coming">
        <input id="vWhen" maxlength="40" placeholder="When? e.g. around 7" aria-label="When">
        <select id="vKind" aria-label="Person or delivery"><option value="person">Person</option><option value="delivery">Delivery</option></select>
        <button id="vAdd" class="ok">Add</button>
      </div>
      <p class="perr" id="vErr"></p>
    </section>
    <section class="card" id="goodnight">
      <strong>Goodnight message</strong>
      <p class="muted">Record a few words before you go. The Echo Show plays it at lights out, or when the sitter says your child is missing you.</p>
      <div id="gnList"></div>
      <div class="gn-rec">
        <button id="gnVoice"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>Record voice</button><button id="gnVideo"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3"/></svg>Record video</button>
      </div>
      <div id="gnLive" hidden><video id="gnPreview" muted playsinline></video><p class="gn-timer"><span class="dot"></span><b id="gnTime">0:00</b> Recording… <button id="gnStop" class="no">Stop</button></p></div>
      <div id="gnDraft" hidden>
        <div id="gnDraftMedia"></div>
        <label class="field">For<select id="gnFor"></select></label>
        <label class="field">Play it<select id="gnWhen"><option value="bedtime">At lights out</option><option value="missing">If they're missing us</option><option value="any">Either</option></select></label>
        <label class="field">Words to show on screen (optional)<input id="gnCaption" maxlength="160" placeholder="Goodnight Maya, sweet dreams"></label>
        <div class="pbtns"><button class="ok" id="gnSave">Save message</button><button id="gnDiscard">Discard</button></div>
      </div>
      <label class="muted gn-upload">Or upload a recording <input type="file" id="gnFile" accept="audio/*,video/*"></label>
      <p class="perr" id="gnErr"></p>
    </section>
  </div>
  <div class="tabpane" data-tab="house">
    <section class="card" id="teach">
      <strong>Teach the house</strong>
      <p class="muted">Snap the fridge note, upload the doctor's plan, or paste a message from your chats. Nothing is used until you confirm it. Codes and passwords are never stored.</p>
      <label class="upload" id="drop"><span class="up-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5Z"/><circle cx="12" cy="13" r="3.5"/></svg></span><span class="up-t">Add a photo or PDF</span><span class="up-s">Tap to choose, or drop a file here</span><input type="file" id="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf"></label>
      <textarea id="paste" rows="3" placeholder="Or paste a message or note here…" aria-label="Paste a message or note"></textarea>
      <button id="readText" class="ok wide">Read it</button>
      <p id="teachStatus" class="muted" aria-live="polite"></p>
    </section>
    <div id="proposals"></div>
    <section class="card">
      <strong>Suggestions from your past answers</strong>
      <p class="muted">When a sitter asks something small you've answered before, Alexa can tell them how you usually answer. It never decides for you, and never for food, medicine or safety.</p>
      <div id="shadow"><span class="sk w60" aria-hidden="true"></span><span class="sk w40" aria-hidden="true"></span><span class="sk w60" aria-hidden="true"></span></div>
    </section>
  </div>
  <div class="tabpane" data-tab="family">
    <section class="card" id="sitters" hidden>
      <strong>Your sitters</strong>
      <p class="muted">Alexa remembers each person who looks after the kids: their language, their rate, and what they already know. Someone back again gets a shorter handover check; someone new gets all of it.</p>
      <div id="slist"></div>
    </section>
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
<aside class="qsheet" id="qsheet" aria-label="Question waiting for you"></aside>
<div class="toast" id="toast" role="status" aria-live="polite" aria-atomic="true"></div>
<nav class="tabs" role="tablist" aria-label="Sections">
  <div class="tabs-in" role="presentation">
    <span class="tab-ind" aria-hidden="true"></span>
    <button role="tab" data-tabbtn="tonight" aria-selected="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>Tonight<span class="badge" id="badgeTonight"></span></button>
    <button role="tab" data-tabbtn="house" aria-selected="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/></svg>House<span class="badge" id="badgeHouse"></span></button>
    <button role="tab" data-tabbtn="family" aria-selected="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>Family</button>
  </div>
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
  var lastState = null; // the latest /parent/api/state, for toasts and the sheet
  // Only touch the DOM when what we'd write has changed, so the 2 s poll never flashes or
  // re-announces anything. (We remember what we wrote: browsers re-serialise innerHTML.)
  var written = {};
  function setHtml(id, html) {
    var el = document.getElementById(id);
    if (el && written[id] !== html) { written[id] = html; el.innerHTML = html; }
    return el;
  }
  function setText(id, text) {
    var el = document.getElementById(id);
    if (el && el.textContent !== text) el.textContent = text;
    return el;
  }
  // A real phone (not the demo's phone frame) says it is here, so the demo can wait for its answers.
  var solo = window.top === window ? Math.random().toString(36).slice(2, 12) : '';
  async function load() {
    var r;
    try { r = await fetch('/parent/api/state?k=' + encodeURIComponent(key) + (solo ? '&solo=' + solo : '')); } catch (e) { setText('status', 'Offline, retrying…'); document.body.classList.add('stalled'); return; }
    if (!r.ok) {
      setText('status', 'Not authorised');
      document.body.classList.add('stalled');
      if (!lastState) setHtml('liveNow', 'This link isn\\'t working<small>Open the parent link you were sent again.</small>');
      return;
    }
    var s = await r.json();
    lastState = s;
    document.body.classList.remove('loading', 'stalled');
    houseTz = s.timezone || undefined;
    if (s.parents.join('|') !== parentsShown) {
      parentsShown = s.parents.join('|');
      if (s.parents.indexOf(me) < 0) me = s.parents[0] || 'Parent';
      sel.innerHTML = (s.parents.length ? s.parents : ['Parent']).map(function (p) { return '<option' + (p === me ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('');
    }
    var tb = s.teachback;
    setText('status', s.handoff ? (s.handoff.carer_name + ' is looking after things' + (s.handoff.started_at ? ' · since ' + time(s.handoff.started_at) : '')) : 'No one is babysitting right now');
    renderLive(s, tb);
    var mKey = JSON.stringify(s.messages);
    if (mKey !== lastMessages) { lastMessages = mKey; renderMessages(s.messages || []); }
    var vKey = JSON.stringify(s.visitors);
    if (vKey !== lastVisitors) { lastVisitors = vKey; renderVisitors(s.visitors || []); }
    setText('badgeTonight', s.questions.length ? String(s.questions.length) : '');
    // Redraw only when something changed (not every second the clock moves), so buttons stay tappable.
    houseDevices = s.devices || null;
    var incKey = s.incident ? JSON.stringify(Object.assign({}, s.incident, { elapsed_seconds: 0, door: houseDevices && houseDevices.door, timers: s.incident.timers.map(function (t) { return Object.assign({}, t, { remaining_seconds: 0 }); }) })) : '';
    if (incKey !== lastIncident) {
      lastIncident = incKey; incReceived = Date.now();
      var em = document.getElementById('emergency');
      em.innerHTML = s.incident ? incidentCard(s.incident) : '';
      written.emergency = undefined;
      // One gentle pulse when an emergency first appears, not on every update.
      if (s.incident && !incShown && s.incident.status !== 'resolved' && em.firstChild) em.firstChild.classList.add('enter');
      incShown = Boolean(s.incident);
      tickIncident();
    }
    if (!s.incident) setHtml('emergency', s.emergency ? '<div class="card alert rise"><strong>Emergency reported · ' + esc(time(s.emergency.at)) + '</strong><p>' + esc(s.emergency.description) + '</p><p>Every contact has been alerted. Call ' + esc(s.handoff ? s.handoff.carer_name : 'the carer') + ' now.</p></div>' : '');
    var dKey = JSON.stringify([s.debrief && s.debrief.handoff_id, s.debrief && s.debrief.rule_suggestions.length, s.shopping, s.payment && s.payment.status]);
    if (dKey !== lastDebrief) { lastDebrief = dKey; renderDebrief(s); }
    var busyKey = String(s.busy_until);
    if (busyKey !== lastBusy) {
      lastBusy = busyKey;
      document.getElementById('busy').innerHTML = s.busy_until
        ? '<strong>Urgent questions only</strong><p class="muted">Until ' + esc(s.busy_until) + '. Small questions wait here for you.</p><button class="ok wide" data-busy="0">I\\'m free now</button>'
        : '<strong>Busy?</strong><p class="muted">Only urgent questions will reach you.</p><div class="seg" role="group" aria-label="Busy for"><button data-busy="60">1 hour</button><button data-busy="120">2 hours</button><button data-busy="180">3 hours</button></div>';
      lastQKey = null;
    }
    var shadowKey = JSON.stringify(s.shadow);
    if (shadowKey !== lastShadow) {
      lastShadow = shadowKey;
      var names = { screen: 'TV and screens', play: 'Play', bedtime: 'Staying up and bedtime extras' };
      document.getElementById('shadow').innerHTML = Object.keys(s.shadow).map(function (t) {
        return '<label class="sw-row"><span>' + esc(names[t] || t) + '</span><input type="checkbox" role="switch" class="sw" data-shadow="' + t + '"' + (s.shadow[t] ? ' checked' : '') + '></label>';
      }).join('');
    }
    // Only redraw questions when the set changes, so typing and choices aren't wiped by polling.
    var qKey = s.questions.map(function (q) { return q.id; }).join(',');
    if (qKey !== lastQKey) { lastQKey = qKey; renderQuestions(s); }
    setHtml('setupBanner', s.parents.length ? '' :
      '<div class="card banner rise"><strong>Set up your family to start</strong><p class="muted">Add who Alexa looks after and who to call. It takes a minute.</p><button class="ok" id="openFamily">Set up now</button></div>');
    renderFeed(s);
    renderPass(s);
    renderOrder(s);
    renderSitters(s.sitters || []);
  }

  // ---------- Sitter profiles: what the house remembers about each person, editable here ----------
  var lastSitters = null;
  var LANGS = [['en', 'English'], ['hi-IN', 'Hindi'], ['es-US', 'Spanish'], ['ta-IN', 'Tamil'], ['te-IN', 'Telugu'], ['bn-IN', 'Bengali']];
  function renderSitters(list) {
    var box = document.getElementById('slist');
    // Never redraw under someone typing.
    if (box.contains(document.activeElement)) return;
    var k2 = JSON.stringify(list);
    if (k2 === lastSitters) return;
    lastSitters = k2;
    document.getElementById('sitters').hidden = !list.length;
    box.innerHTML = list.map(function (p, i) {
      var facts = [p.evenings ? p.evenings + ' evening' + (p.evenings > 1 ? 's' : '') : 'Not here yet', p.last_visit ? 'last ' + new Date(p.last_visit).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '',
        p.last_check ? 'handover check ' + p.last_check.right + '/' + p.last_check.total : '', p.asked ? p.asked + ' question' + (p.asked > 1 ? 's' : '') + ' asked' : ''].filter(Boolean).join(' · ');
      var hueN = 0; for (var c = 0; c < p.name.length; c++) hueN = (hueN * 31 + p.name.charCodeAt(c)) % 360;
      return '<details class="sitter" data-sitter="' + esc(p.name) + '"><summary><span class="sv" style="background:hsl(' + hueN + ' 45% 42%)">' + esc(p.name.charAt(0)) + '</span><span><b>' + esc(p.name) + '</b>' + (p.note ? ' · ' + esc(p.note) : '') + '<small>' + esc(facts) + '</small></span></summary>' +
        '<div class="two"><label class="field">Language<select data-f="language">' + LANGS.map(function (l) { return '<option value="' + l[0] + '"' + ((p.language || 'en') === l[0] ? ' selected' : '') + '>' + l[1] + '</option>'; }).join('') + '</select></label>' +
        '<label class="field">Hourly rate ($)<input data-f="rate" type="number" min="0" max="500" step="0.5" inputmode="decimal" value="' + (p.rate_cents == null ? '' : p.rate_cents / 100) + '" placeholder="16"></label></div>' +
        '<label class="field">Note<input data-f="note" maxlength="120" value="' + esc(p.note || '') + '" placeholder="e.g. Rahul’s mother"></label>' +
        '<label class="sw-row"><span>Large text on the Echo Show</span><input type="checkbox" role="switch" class="sw" data-f="large_text"' + (p.large_text ? ' checked' : '') + '></label>' +
        '<p class="ferr" aria-live="polite"></p><div class="pbtns"><button class="ok" data-sitter-save>Save</button><button data-sitter-forget>Forget these settings</button></div></details>';
    }).join('');
  }
  document.addEventListener('click', async function (e) {
    var b = e.target.closest('button[data-sitter-save], button[data-sitter-forget]');
    if (!b) return;
    var d = b.closest('[data-sitter]');
    var f = function (n) { return d.querySelector('[data-f="' + n + '"]'); };
    var body = b.hasAttribute('data-sitter-forget') ? { name: d.dataset.sitter, forget: true }
      : { name: d.dataset.sitter, language: f('language').value, rate: f('rate').value === '' ? null : Number(f('rate').value), note: f('note').value, large_text: f('large_text').checked };
    b.disabled = true;
    var r = await post('/parent/api/sitter', body).catch(function () { return null; });
    b.disabled = false;
    if (r && r.ok) { toast(body.forget ? 'Forgotten ✓' : 'Saved. Alexa will remember next time ✓'); lastSitters = null; b.blur(); load(); }
    else { var j = r ? await r.json().catch(function () { return {}; }) : {}; d.querySelector('.ferr').textContent = j.error || 'Could not save. Try again.'; }
  });

  // ---------- Dinner the sitter wants to order: approve it here ----------
  var lastOrderKey = null;
  function renderOrder(s) {
    var o = s.order;
    var k2 = JSON.stringify(o);
    if (k2 === lastOrderKey) return;
    lastOrderKey = k2;
    if (!o) return setHtml('order', '');
    if (o.status === 'pending') {
      setHtml('order', '<section class="card rise"><strong>' + esc(o.requested_by) + ' wants to order dinner</strong>' +
        '<p class="muted">' + esc(o.item) + ' · ' + esc(o.price) + ' from ' + esc(o.restaurant) + '. Checked against the allergies and your rules.</p>' +
        '<div class="seg" role="group" aria-label="Dinner order"><button data-order="approve" data-id="' + o.id + '">Order it · ' + esc(o.price) + '</button><button data-order="decline" data-id="' + o.id + '">Not tonight</button></div>' +
        '<p class="muted" style="margin-top:8px">Demo order · no money moves.</p></section>');
    } else if (o.status === 'approved') {
      setHtml('order', '<section class="card"><strong>Dinner ordered</strong><p class="muted">' + esc(o.item) + ' · ' + esc(o.price) + ' · ref ' + esc(o.reference) + '. Arrives ' + esc(o.arrives || '') + '; the doorbell knows it’s expected.</p></section>');
    } else setHtml('order', '');
  }
  document.addEventListener('click', async function (e) {
    var b = e.target.closest('button[data-order]');
    if (!b) return;
    b.disabled = true;
    var r = await post('/parent/api/order', { id: Number(b.dataset.id), action: b.dataset.order, by: me || 'A parent' }).catch(function () { return null; });
    if (r && r.ok) toast(b.dataset.order === 'approve' ? 'Ordered. ' + carerName() + ' has been told ✓' : 'Okay, not tonight ✓');
    else { b.disabled = false; toast('Could not send. Try again.', true); }
    lastOrderKey = null;
    load();
  });

  // ---------- Guest Pass: who has tonight's pass, until when, and everything done under it ----------
  var lastPassKey = null;
  function renderPass(s) {
    var k2 = JSON.stringify([s.pass, (s.audit || []).length && s.audit[0].id]);
    if (k2 === lastPassKey) return;
    lastPassKey = k2;
    var p = s.pass;
    setHtml('pass', p && p.status === 'active'
      ? '<section class="card rise"><strong>' + esc(p.carer) + '’s Guest Pass</strong><p class="muted">Until ' + esc(p.ends) + ' · ' +
        (p.opened_on_phone ? 'open on ' + esc(p.carer) + '’s phone' : 'not opened on a phone yet') + '. It ends with the evening.</p>' +
        '<div class="seg" role="group" aria-label="Guest pass"><button data-pass="extend">Extend 1 hour</button><button data-pass="end">End pass</button></div></section>'
      : '');
    var a = (s.audit || []).slice(0, 12);
    document.getElementById('activity').hidden = !a.length;
    document.getElementById('alist').innerHTML = a.map(function (x) {
      return '<li><span class="t">' + esc(x.time) + '</span><span><b>' + esc(x.actor) + '</b> · ' + esc(x.action) + (x.detail ? '<small>' + esc(x.detail) + '</small>' : '') + '<small>' + esc(x.via) + '</small></span></li>';
    }).join('');
  }
  document.addEventListener('click', async function (e) {
    var b = e.target.closest('button[data-pass]');
    if (!b) return;
    b.disabled = true;
    await post('/parent/api/pass', { action: b.dataset.pass, minutes: 60, by: me || 'A parent' });
    lastPassKey = null;
    load();
  });

  // ---------- small icons (inline SVG, no assets) ----------
  var ICONS = {
    sleep: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    food: '<path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2-3 5s1 4 3 4v9"/>',
    mood: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>',
    health: '<path d="M12 21s-7-4.5-9-9.5C1.6 7.6 4.3 4 8 4c2 0 3.2 1 4 2.2C12.8 5 14 4 16 4c3.7 0 6.4 3.6 5 7.5-2 5-9 9.5-9 9.5Z"/>',
    pet: '<circle cx="5.5" cy="10" r="2"/><circle cx="9.5" cy="5.5" r="2"/><circle cx="14.5" cy="5.5" r="2"/><circle cx="18.5" cy="10" r="2"/><path d="M12 12c-3 0-5.5 3.5-5.5 6 0 1.7 1.5 2.5 3 2.2 1-.2 1.7-.7 2.5-.7s1.5.5 2.5.7c1.5.3 3-.5 3-2.2 0-2.5-2.5-6-5.5-6Z"/>',
    note: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/>',
    door: '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M3 21h18M14 12h.01"/>',
    answer: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/>',
    shop: '<circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/><path d="M3 4h2l2.4 11h10.2L20 8H6.2"/>'
  };
  function icon(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || ICONS.note) + '</svg>'; }

  // ---------- clock helpers: minutes since midnight in the household's time zone ----------
  function clockMinutes(str) {
    // "7:42 pm", "19:42", "7:42 p.m." -> 1182
    var m = /(\\d{1,2})[:.](\\d{2})\\s*([ap])?/i.exec(String(str || ''));
    if (!m) return null;
    var h = Number(m[1]) % 24;
    if (m[3]) { h = h % 12; if (/p/i.test(m[3])) h += 12; }
    return h * 60 + Number(m[2]);
  }
  function minutesOf(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return null;
    try { return clockMinutes(d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: houseTz })); }
    catch (e) { return d.getHours() * 60 + d.getMinutes(); }
  }
  function fmtMinutes(min) {
    min = ((min % 1440) + 1440) % 1440;
    var h = Math.floor(min / 60), m = min % 60;
    return (h % 12 === 0 ? 12 : h % 12) + ':' + String(m).padStart(2, '0') + ' ' + (h < 12 ? 'am' : 'pm');
  }

  // ---------- "Tonight so far": the log, the doorbell, the last answer and the shopping list in one feed ----------
  var lastFeed = null;
  var LOG_ICON = { sleep: 'sleep', food: 'food', mood: 'mood', health: 'health', pet: 'pet', note: 'note' };
  function renderFeed(s) {
    var h = s.home || {};
    var la = h.last_answer;
    var fKey = JSON.stringify([s.log, h.door, la && [la.by, la.answer, la.question], s.shopping, houseTz]);
    if (fKey === lastFeed) return;
    lastFeed = fKey;
    var now = h.clock && typeof h.clock.minutes === 'number' ? h.clock.minutes : minutesOf(new Date().toISOString());
    // How long ago, in minutes, wrapping past midnight (an evening can run past 12).
    function ago(min) {
      if (min == null) return 0;
      var d = ((now - min) % 1440 + 1440) % 1440;
      return d > 1380 ? 0 : d; // a minute or two ahead of the clock is just now, not yesterday
    }
    var items = [];
    (s.log || []).forEach(function (e, i) {
      var min = minutesOf(e.at);
      items.push({ id: 'l' + (e.id != null ? e.id : e.at + e.text), ago: ago(min), order: i, kind: LOG_ICON[e.kind] ? e.kind : 'note', text: esc(e.text), t: min == null ? time(e.at) : fmtMinutes(min) });
    });
    if (h.door) {
      var dm = clockMinutes(h.door.time);
      items.push({ id: 'd' + h.door.time + h.door.label + (h.door.decision || ''), ago: ago(dm), order: -1, kind: 'door', text: 'Doorbell: ' + esc(h.door.label),
        sub: h.door.decision ? esc(h.door.decision) : 'No answer yet', t: h.door.time });
    }
    if (la) {
      items.push({ id: 'a' + la.by + la.answer + la.question, ago: la.minutes_ago, order: -1, kind: 'answer', text: esc(la.by) + ' answered “' + esc(la.answer) + '”',
        sub: esc(la.question), t: la.minutes_ago < 1 ? 'Just now' : fmtMinutes(now - la.minutes_ago) });
    }
    // Newest first; the shopping list has no time, so it sits at the end.
    items.sort(function (a, b) { return a.ago - b.ago || b.order - a.order; });
    if (s.shopping && s.shopping.length) {
      items.push({ id: 's' + s.shopping.join('|'), kind: 'shop', text: 'On the shopping list', sub: s.shopping.map(esc).join(', '), t: '' });
    }
    // First paint: the list rises in, one item after another. After that only new items slide in from the top.
    var first = feedSeen === null, seen = {};
    items.forEach(function (it) { seen[it.id] = true; });
    document.getElementById('log').innerHTML = items.length
      ? '<ul class="feed' + (first ? ' stagger' : '') + '">' + items.map(function (it, i) {
          var fresh = !first && !feedSeen[it.id];
          return '<li class="k-' + it.kind + (fresh ? ' new' : '') + '"' + (first ? ' style="--i:' + Math.min(i, 8) + '"' : '') + '><span class="fi-ic">' + icon(it.kind) + '</span><span class="fi-tx">' + it.text +
            (it.sub ? '<small>' + it.sub + '</small>' : '') + '</span><span class="fi-t">' + esc(it.t) + '</span></li>';
        }).join('') + '</ul>'
      : '<p class="empty k-note"><span class="fi-ic">' + icon('sleep') + '</span>Quiet so far. Updates from home show up here.</p>';
    feedSeen = seen;
  }
  var feedSeen = null;

  // ---------- toasts ----------
  var toastTimer = null;
  function toast(msg, kind) {
    var t = document.getElementById('toast');
    clearTimeout(toastTimer);
    t.classList.toggle('bad', kind === true || kind === 'bad');
    t.classList.toggle('info', kind === 'info');
    t.textContent = msg;
    void t.offsetWidth; // restart the entrance if a toast is already showing
    t.classList.add('show');
    toastTimer = setTimeout(function () {
      t.classList.remove('show');
      toastTimer = setTimeout(function () { t.textContent = ''; }, 320);
    }, 3200);
  }
  function carerName() { return lastState && lastState.handoff ? lastState.handoff.carer_name : 'the sitter'; }

  // ---------- the bottom sheet sits above the floating tab bar; keep the page padded for it ----------
  var navEl = document.querySelector('nav.tabs');
  var sheetEl = document.getElementById('qsheet');
  var docked = '';
  function dock() {
    // Read layout once, write CSS variables only if they changed (no layout thrash on every poll).
    var navH = Math.round(window.innerHeight - navEl.getBoundingClientRect().top);
    var card = sheetEl.classList.contains('open') && sheetEl.querySelector('.qs');
    var sheetH = card ? card.offsetHeight + 8 : 0;
    var next = navH + '|' + sheetH;
    if (next === docked) return;
    docked = next;
    var root = document.documentElement.style;
    root.setProperty('--nav-h', navH + 'px');
    root.setProperty('--sheet-h', sheetH + 'px');
  }
  window.addEventListener('resize', dock);
  dock();
  var lastQKey = null, lastBusy = null, lastShadow = null, lastDebrief = null;
  function renderDebrief(s) {
    var d = s.debrief;
    if (!d) { document.getElementById('debrief').innerHTML = ''; return; }
    var h = '<div class="card debrief rise"><strong>Last night with ' + esc(d.carer) + '</strong>';
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
  var cardSeen = {};
  function renderQuestions(s) {
    // In busy mode, small questions are grouped under one quiet heading.
    var urgent = s.questions.filter(function (q) { return q.urgency === 'urgent' || !s.busy_until; });
    var waiting = s.busy_until ? s.questions.filter(function (q) { return q.urgency !== 'urgent'; }) : [];
    document.getElementById('questions').innerHTML = urgent.map(questionCard).join('') +
      (waiting.length ? '<p class="from">Waiting until you\\'re free (' + waiting.length + ')</p>' + waiting.map(questionCard).join('') : '');
    var seen = {};
    s.questions.forEach(function (q) { seen[q.id] = true; });
    cardSeen = seen;
    renderSheet(s, urgent);
    function questionCard(q) {
      // Only cards that just arrived rise in; the rest stay still when the list redraws.
      return '<div class="card' + (cardSeen[q.id] ? '' : ' rise') + '" data-id="' + q.id + '">' + (q.urgency === 'urgent' ? '<span class="urgent">Urgent</span>' : '') +
        '<p class="asker">' + esc(s.handoff ? s.handoff.carer_name : 'The sitter') + ' asks · ' + esc(time(q.asked_at)) + '</p><p class="q">“' + esc(q.text) + '”</p>' +
        (q.text_english ? '<p class="en">In English: “' + esc(q.text_english) + '”</p>' : '') +
        (q.door_snapshot && !q.shopping_item ? '<img class="doorcam" src="' + esc(q.door_snapshot) + '" alt="Doorbell camera photo">' : '') +
        answerButtons(q) +
        '<textarea placeholder="Or type an answer…" aria-label="Type your own answer" rows="1"></textarea>' +
        (q.urgency === 'urgent'
          ? '<input type="radio" name="s' + q.id + '" value="tonight" checked hidden><p class="muted">Food, medicine and safety answers apply to tonight only.</p></div>'
          : '<div class="scope" role="radiogroup" aria-label="How long this answer counts"><label><input type="radio" name="s' + q.id + '" value="tonight" checked> Just tonight</label><label><input type="radio" name="s' + q.id + '" value="always"> Always</label></div>' +
            '<p class="always-note">Your answer will be saved as a house rule for every future handoff.</p></div>');
    }
  }
  // The one-tap answers for a question. The same buttons (and data-a answers) on the card and the sheet.
  function answerButtons(q) {
    if (q.shopping_item) return '<div class="btns"><button class="ok" data-a="Yes, add it to the list.">Add to list</button><button class="no" data-a="Not now.">Not now</button></div>';
    if (q.door_snapshot) return '<div class="btns"><button class="ok" data-a="It\\'s fine, you can let them in.">Let them in</button><button class="no" data-a="Don\\'t open the door. I\\'ll call you.">Don\\'t open</button><button data-a="Please call me.">Call me</button></div>';
    return '<div class="btns"><button class="ok" data-a="Yes, that\\'s fine.">Approve</button><button class="no" data-a="No, please don\\'t.">Deny</button><button data-a="Please call me.">Call me</button></div>';
  }
  // ---------- the question sheet: the newest question, one tap to answer ----------
  var sheetId = null, knownQ = null, sheetHold = false, sheetPeek = false;
  function renderSheet(s, shown) {
    var who = s.handoff ? s.handoff.carer_name : 'The sitter';
    // A toast for questions that arrived while the page is open (not the ones there when it loaded).
    var ids = {};
    s.questions.forEach(function (q) { ids[q.id] = true; });
    if (knownQ) {
      var fresh = shown.filter(function (q) { return !knownQ[q.id]; }).pop();
      if (fresh) toast(fresh.door_snapshot && !fresh.shopping_item ? 'Someone is at the door. ' + who + ' is asking.' : 'New question from ' + who, 'info');
    }
    knownQ = ids;
    if (sheetHold) return; // the "sent" check is playing; we redraw when it ends
    var q = shown[shown.length - 1];
    if (!q) {
      sheetId = null;
      sheetEl.classList.remove('open', 'bump', 'peek');
      dock();
      return;
    }
    if (sheetId !== q.id) sheetPeek = false;
    var more = s.questions.length - 1;
    var photo = q.door_snapshot && !q.shopping_item;
    var html = '<div class="scrim"></div><div class="qs' + (q.urgency === 'urgent' ? ' urgent-q' : '') + '" data-id="' + q.id + '">' +
      '<button class="grab" data-qpeek="1" aria-label="Show or hide the answer buttons"></button>' +
      '<div class="qs-top"><span class="qs-ava" aria-hidden="true">' + esc(who.charAt(0).toUpperCase()) + '</span>' +
      '<div class="qs-txt"><p class="asker">' + (q.urgency === 'urgent' ? '<span class="urgent">Urgent</span>' : '') + '<span>' + esc(who) + ' asks · ' + esc(time(q.asked_at)) + '</span></p>' +
      '<p class="q">“' + esc(q.text) + '”</p>' + (q.text_english ? '<p class="en">In English: “' + esc(q.text_english) + '”</p>' : '') + '</div></div>' +
      '<div class="qs-body">' + (photo ? '<img class="qs-photo" src="' + esc(q.door_snapshot) + '" alt="Doorbell camera photo">' : '') +
      '<input type="radio" name="qs' + q.id + '" value="tonight" checked hidden>' +
      answerButtons(q) +
      '<button class="qs-more" data-qmore="1">' + (more > 0 ? '+' + more + ' more question' + (more > 1 ? 's' : '') : 'Type an answer or save it as a rule') + '</button></div></div>';
    var wasOpen = sheetEl.classList.contains('open');
    if (written.qsheet !== html) { written.qsheet = html; sheetEl.innerHTML = html; }
    sheetEl.classList.toggle('peek', sheetPeek);
    var g = sheetEl.querySelector('.grab');
    if (g) g.setAttribute('aria-expanded', String(!sheetPeek));
    if (!wasOpen) {
      void sheetEl.offsetWidth; // start below the screen, then spring up
      sheetEl.classList.add('open');
    } else if (sheetId !== q.id) {
      // A newer question replaced the one showing: nudge it so the change is noticed.
      sheetEl.classList.remove('bump');
      void sheetEl.offsetWidth;
      sheetEl.classList.add('bump');
    }
    sheetId = q.id;
    dock();
  }
  document.addEventListener('click', function (e) {
    if (!e.target.closest('button[data-qpeek]')) return;
    sheetPeek = !sheetPeek;
    sheetEl.classList.toggle('peek', sheetPeek);
    var g = sheetEl.querySelector('.grab');
    if (g) g.setAttribute('aria-expanded', String(!sheetPeek));
    dock();
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('button[data-qmore]')) return;
    setTab('tonight');
    var list = document.getElementById('questions');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    var first = list.querySelector('.card[data-id]');
    if (first) { first.setAttribute('tabindex', '-1'); first.focus({ preventScroll: true }); }
  });
  document.addEventListener('click', async function (e) {
    var b = e.target.closest('button[data-a]');
    if (!b) return;
    var card = b.closest('.card, .qs');
    var box = card.querySelector('textarea');
    var typed = box ? box.value.trim() : '';
    var picked = card.querySelector('input[type=radio]:checked');
    var scope = picked ? picked.value : 'tonight';
    var inSheet = card.classList.contains('qs');
    b.disabled = true;
    var wait = 0;
    try {
      var r = await fetch('/parent/api/answer', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ k: key, id: Number(card.dataset.id), answer: typed || b.dataset.a, scope: scope, by: me }) });
      if (r.ok && inSheet) {
        // A check draws itself, then the sheet slides away (or on to the next question).
        sheetHold = true;
        wait = 1000;
        card.insertAdjacentHTML('beforeend', '<div class="qs-done" role="status"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30"/><path d="M20 33l8 8 16-17"/></svg>Sent to ' + esc(carerName()) + '</div>');
      } else if (r.ok) {
        toast('Sent to ' + carerName() + ' ✓');
        card.classList.add('leaving');
        wait = 220;
      } else if (r.status === 409) toast('Someone already answered that one.', 'info');
      else { toast('Could not send. Try again.', true); b.disabled = false; }
    } catch (err) { b.disabled = false; toast('Offline. Your answer was not sent.', true); }
    setTimeout(function () {
      sheetHold = false;
      written.qsheet = null;
      lastQKey = null; // redraw: the question was answered here or already closed elsewhere
      load();
    }, wait);
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
    if (!s.ai_available) teachStatus.textContent = 'Reading notes needs an AI key on the server.';
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
  function importFile(f) {
    var label = f.type === 'application/pdf' ? 'PDF: ' + f.name : 'Photo of a note';
    sendImport('/parent/api/import/file?k=' + encodeURIComponent(key) + '&by=' + encodeURIComponent(me) + '&label=' + encodeURIComponent(label),
      { method: 'POST', headers: { 'content-type': f.type || 'application/octet-stream' }, body: f });
  }
  document.getElementById('file').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    importFile(f);
    e.target.value = '';
  });
  // The drop zone also takes a file dragged onto it (on a laptop).
  var dropZone = document.getElementById('drop');
  ['dragenter', 'dragover'].forEach(function (t) {
    dropZone.addEventListener(t, function (e) { e.preventDefault(); dropZone.classList.add('drag'); });
  });
  ['dragleave', 'drop'].forEach(function (t) {
    dropZone.addEventListener(t, function () { dropZone.classList.remove('drag'); });
  });
  dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    if (!/^image\\/|^application\\/pdf$/.test(f.type)) { teachStatus.textContent = 'That needs to be a photo or a PDF.'; return; }
    importFile(f);
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
    // Inside the demo's phone frame (an embedded page) notifications don't apply.
    if (window.top !== window) { notifyBox.hidden = true; return; }
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
        ? '<div><strong><span class="on-dot" aria-hidden="true"></span>Notifications on</strong><p class="muted">Questions and emergencies reach this phone even when the page is closed.</p></div><div class="pbtns" style="margin:0"><button data-push="test">Send a test</button><button data-push="off">Turn off</button></div>'
        : '<div><strong>Get notified on this phone</strong><p class="muted">So questions and emergencies reach you even when this page is closed.</p></div><button class="ok" data-push="on">Turn on</button>';
    }
    notifyBox.innerHTML = h + (msg ? '<p class="muted" style="flex-basis:100%">' + esc(msg) + '</p>' : '');
    notifyBox.hidden = false;
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
        '<div class="tools"><span class="grow"><span class="chip">' + (m.kind === 'pet' ? 'Pet' : 'Child') + '</span></span><button data-remove="member" aria-label="Remove ' + esc(m.name || 'this one') + '">Remove</button></div></div>';
    }).join('') : '<p class="empty"><span class="fi-ic">' + icon('mood') + '</span>No children or pets yet.</p>';
    var order = 0;
    document.getElementById('fContacts').innerHTML = fam.contacts.length ? fam.contacts.map(function (c, i) {
      var badge = c.doctor ? '<span class="order" title="Doctor">Dr</span>' : '<span class="order">' + (++order) + '</span>';
      return '<div class="row" data-contact="' + i + '">' +
        '<label>Name<input data-f="name" maxlength="40" value="' + esc(c.name) + '"></label>' +
        '<label>Who they are<input data-f="relation" maxlength="40" value="' + esc(c.relation) + '" placeholder="Mom, Grandpa, Neighbour"></label>' +
        '<label class="full">Phone<input data-f="phone" type="tel" maxlength="25" value="' + esc(c.phone) + '" placeholder="+1 206 555 0142"></label>' +
        '<div class="tools">' + badge + '<label class="grow"><input type="checkbox" role="switch" class="sw" data-f="doctor"' + (c.doctor ? ' checked' : '') + '> Doctor</label>' +
        '<button data-move="-1" aria-label="Move up">↑</button><button data-move="1" aria-label="Move down">↓</button><button data-remove="contact">Remove</button></div></div>';
    }).join('') : '<p class="empty"><span class="fi-ic">' + icon('answer') + '</span>No contacts yet. Add at least one person to call.</p>';
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
  var lastIncident = null, incReceived = Date.now(), incShown = false;
  function mmss(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
  function incidentCard(i) {
    if (i.status === 'resolved') {
      return '<div class="card inc over"><strong>Emergency over</strong><p class="muted">Started ' + esc(i.started) + '. ' + esc((i.updates[i.updates.length - 1] || {}).by || 'The sitter') + ' said it\\'s over.</p>' +
        '<ul class="inc-log">' + i.updates.slice(-6).map(function (u) { return '<li><span>' + esc(u.time) + '</span>' + esc(u.by) + ': ' + esc(u.text) + '</li>'; }).join('') + '</ul></div>';
    }
    var now = i.steps[i.current];
    return '<div class="card alert inc"><div class="inc-head"><strong>Emergency · ' + esc(i.started) + '</strong><span class="elapsed" data-elapsed="' + i.elapsed_seconds + '"></span></div>' +
      '<p class="inc-desc">' + esc(i.carer || 'The sitter') + ' said: “' + esc(i.description) + '”</p>' +
      '<div class="inc-prog" role="progressbar" aria-label="Emergency steps" aria-valuemin="0" aria-valuemax="' + i.total + '" aria-valuenow="' + Math.min(i.current, i.total) + '">' +
        i.steps.map(function (st) { return '<i class="' + esc(st.state) + '"></i>'; }).join('') + '</div>' +
      (now ? '<div class="inc-now"><small>Step ' + (i.current + 1) + ' of ' + i.total + ' right now</small>' + esc(now.text) + '</div>' : '<div class="inc-now"><small>All steps done</small>Waiting for help to arrive</div>') +
      i.timers.map(function (t) { return '<div class="inc-timer" data-left="' + t.remaining_seconds + '"><span>' + esc(t.label) + '</span><b></b></div>'; }).join('') +
      '<ol class="inc-steps">' + i.steps.map(function (st) { return '<li class="' + st.state + '">' + esc(st.text) + '</li>'; }).join('') + '</ol>' +
      (i.on_the_way.length ? '<p class="inc-otw">' + i.on_the_way.map(function (o) { return esc(o.name) + ' is on the way · home by ' + esc(o.eta); }).join('<br>') + '</p>' : '') +
      '<p class="inc-label" id="otwLabel">I’m on my way · home in</p><div class="otw" role="group" aria-labelledby="otwLabel">' +
        [10, 20, 30].map(function (n) { return '<button data-otw="' + n + '" aria-label="I\\'m on my way, home in ' + n + ' minutes">' + n + '<small>min</small></button>'; }).join('') + '</div>' +
      '<ul class="inc-log">' + i.updates.slice(-4).reverse().map(function (u) { return '<li><span>' + esc(u.time) + '</span>' + esc(u.by) + ': ' + esc(u.text) + '</li>'; }).join('') + '</ul>' +
      (i.address ? '<p class="inc-addr">Home: ' + esc(i.address) + '</p>' : '') +
      (houseDevices && houseDevices.door && !houseDevices.door.locked
        ? '<p class="inc-otw">Front door unlocked' + (houseDevices.door.by ? ' by ' + esc(houseDevices.door.by) : '') + ' · porch light on</p>'
        : '<button class="ok wide" data-door="unlock">Unlock the front door for the paramedics</button>') + '</div>';
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
  var houseDevices = null;
  document.addEventListener('click', async function (e) {
    var b = e.target.closest('button[data-door]');
    if (!b) return;
    b.disabled = true;
    var r = await post('/parent/api/door', { action: b.dataset.door, by: me || 'A parent' }).catch(function () { return null; });
    if (r && r.ok) toast('Front door unlocked. ' + carerName() + ' has been told ✓');
    else { b.disabled = false; toast('Could not unlock. Try again.', true); }
    lastIncident = null;
    load();
  });
  document.addEventListener('click', async function (e) {
    var b = e.target.closest('button[data-otw]');
    if (!b) return;
    b.disabled = true;
    var r = await post('/parent/api/incident', { action: 'on_the_way', minutes: Number(b.dataset.otw), by: me }).catch(function () { return null; });
    if (r && r.ok) toast('Told ' + carerName() + ' you\\'re on your way ✓');
    else { b.disabled = false; toast('Could not send. Try again.', true); }
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
    }).join('') || '<p class="empty k-answer"><span class="fi-ic">' + icon('answer') + '</span>No message yet. It takes a minute.</p>';
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
    // A minute stays small (about 2.3 MB): a goodnight message plays on a kitchen screen, not a cinema.
    recorder = new MediaRecorder(recStream, { audioBitsPerSecond: 64000, videoBitsPerSecond: 240000 });
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
  var VI_PERSON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
  var VI_BOX = '<svg viewBox="0 0 24 24"><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5Z"/><path d="m3 7.5 9 4.5 9-4.5M12 12v9"/></svg>';
  function renderVisitors(list) {
    document.getElementById('vlist').innerHTML = list.length ? list.map(function (v) {
      return '<li class="rise"><span class="vi' + (v.kind === 'delivery' ? ' box' : '') + '" aria-hidden="true">' + (v.kind === 'delivery' ? VI_BOX : VI_PERSON) + '</span><span class="vt"><b>' + esc(v.name) + '</b><small>' +
        esc([v.window, v.note].filter(Boolean).join(' · ') || (v.kind === 'delivery' ? 'Delivery' : 'Any time tonight')) + '</small></span>' +
        '<button data-vremove="' + v.id + '" aria-label="Remove ' + esc(v.name) + '">Remove</button></li>';
    }).join('') : '<li class="empty"><span class="fi-ic">' + icon('door') + '</span>Nobody yet. The sitter won\\'t open the door to anyone.</li>';
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
  var TABS = ['tonight', 'house', 'family'];
  var TITLES = { tonight: 'Tonight', house: 'House', family: 'Family' };
  function setTab(t) {
    if (TABS.indexOf(t) < 0) t = 'tonight';
    document.body.dataset.tab = t;
    document.querySelectorAll('[data-tabbtn]').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tabbtn === t)); });
    navEl.style.setProperty('--ti', String(TABS.indexOf(t))); // the active pill slides across
    setText('pageTitle', TITLES[t]);
    try { sessionStorage.setItem('wyo.tab', t); } catch (e) {}
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('[data-tabbtn]').forEach(function (b) { b.addEventListener('click', function () { setTab(b.dataset.tabbtn); }); });
  try { var savedTab = sessionStorage.getItem('wyo.tab'); if (savedTab) setTab(savedTab); } catch (e) {}

  function renderLive(s, tb) {
    var h = s.home || {};
    setText('household', (s.household && s.household.name) || 'Your home');
    // The live card: who's with the kids (avatar + live dot), then one big line for what's next.
    var live = document.getElementById('live');
    live.classList.toggle('on', Boolean(s.handoff));
    live.classList.toggle('sos', Boolean(s.emergency || (s.incident && s.incident.status !== 'resolved')));
    var ava = document.getElementById('liveAvatar');
    ava.classList.toggle('home', !s.handoff);
    setHtml('liveAvatar', s.handoff ? esc(String(s.handoff.carer_name || '?').charAt(0).toUpperCase()) : '<svg viewBox="0 0 24 24"><path d="M4 10.5 12 4l8 6.5"/><path d="M6 9.5V20h12V9.5"/></svg>');
    var now = '', pills = [], prog = '';
    function chip(text, kind) { return '<span class="cd' + (kind ? ' ' + kind : '') + '">' + text + '</span>'; }
    if (s.emergency) {
      now = 'Emergency reported<small>' + esc(time(s.emergency.at)) + ' · see below</small>';
      pills.push('<span class="lp bad">Every contact alerted</span>');
    } else if (!s.handoff) {
      now = s.debrief ? 'Last night with ' + esc(s.debrief.carer) + '<small>Your debrief is below</small>' : 'All quiet at home';
    } else if (h.night) {
      var kid = ((h.members || []).filter(function (m) { return m.kind === 'child'; })[0] || {}).name;
      now = h.asleep_since
        ? (kid ? esc(kid) + ' is asleep' : 'All asleep') + chip('since ' + esc(h.asleep_since))
        : 'Past bedtime<small>Nobody has said ' + (kid ? esc(kid) + ' is' : 'they are') + ' asleep yet</small>';
    } else if (h.next) {
      var m = h.next.minutes_until;
      now = esc(h.next.title) + (m > 180 ? chip('at ' + esc(h.next.time)) : m > 60 ? chip('in ' + Math.floor(m / 60) + ' h ' + (m % 60 ? (m % 60) + ' min' : '')) : m > 1 ? chip('in ' + m + ' min') : m >= -5 ? chip('now', 'is-now') : chip(-m + ' min late', 'late'));
    } else if ((h.plan || []).length) {
      now = 'Tonight\\'s plan is done' + chip('all set', 'is-now');
    } else {
      now = 'All good at home';
    }
    // How far through tonight's plan the evening is: done or late items count as passed.
    var plan = h.plan || [];
    if (s.handoff && !s.emergency && plan.length) {
      var passed = plan.filter(function (p) { return p.status === 'done' || p.status === 'late'; }).length;
      var late = plan.filter(function (p) { return p.status === 'late'; }).length;
      var label = passed + ' of ' + plan.length + ' done' + (late ? ' · ' + late + ' late' : '');
      prog = '<div class="prog-bar" role="progressbar" aria-label="Tonight\\'s plan" aria-valuemin="0" aria-valuemax="' + plan.length + '" aria-valuenow="' + passed + '" aria-valuetext="' + label + '">' +
        plan.map(function (p) { return '<i class="' + esc(p.status) + '" title="' + esc(p.title + ' · ' + p.time) + '"></i>'; }).join('') + '</div>' +
        '<div class="prog-cap"><span>' + label + '</span><span>' + (h.next ? esc(h.next.title) + ' at ' + esc(h.next.time) : h.night ? 'Night time' : '') + '</span></div>';
    }
    if (tb) pills.push(tb.done ? '<span class="lp ' + (tb.right === tb.total ? 'ok' : 'warn') + '">Handover ' + tb.right + '/' + tb.total + (tb.right === tb.total ? ' ✓' : '') + '</span>' : '<span class="lp">Handover check ' + tb.answered + '/' + tb.total + '</span>');
    if (s.questions.length) pills.push('<span class="lp warn">' + s.questions.length + ' question' + (s.questions.length > 1 ? 's' : '') + ' for you</span>');
    if (h.last_log) pills.push('<span class="lp">' + esc(h.last_log.time) + ' · ' + esc(h.last_log.text.length > 34 ? h.last_log.text.slice(0, 32) + '…' : h.last_log.text) + '</span>');
    if (s.busy_until) pills.push('<span class="lp">Urgent only till ' + esc(s.busy_until) + '</span>');
    setHtml('liveNow', now);
    setHtml('livePills', pills.join(''));
    setHtml('liveProg', prog).hidden = !prog;
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
