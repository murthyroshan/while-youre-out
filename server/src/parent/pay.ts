// The page a parent opens (from the Echo Show's URL elicitation) to approve paying the sitter.
// A demo: no money moves. In production this is where a real payment provider would sit.
import type { Payment } from '../domain/payments.js';
import { dollars, duration } from '../domain/payments.js';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function payPage(p: Payment) {
  const paid = p.status === 'paid';
  const declined = p.status === 'declined';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Pay ${esc(p.carer)} · While You're Out</title>
<style>
  :root { --ink:#1d2433; --muted:#667085; --green:#16815a; --line:#ebe5db; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.45 "Amazon Ember", Inter, system-ui, -apple-system, "Segoe UI", sans-serif; background: #f6f2ec; color: var(--ink); }
  main { max-width: 440px; margin: 0 auto; padding: 24px 18px 40px; }
  .card { background: #fff; border: 1px solid var(--line); border-radius: 22px; padding: 20px; box-shadow: 0 8px 24px rgba(29,36,51,.06); }
  .demo { font-size: 12.5px; font-weight: 700; color: #7a5200; background: #fff4d6; border-radius: 999px; padding: 4px 10px; display: inline-block; }
  h1 { font-size: 22px; margin: 12px 0 2px; }
  .total { font-size: 46px; font-weight: 800; letter-spacing: -.02em; margin: 14px 0 0; }
  .muted { color: var(--muted); font-size: 14px; }
  .rows { margin: 16px 0; border-top: 1px solid var(--line); }
  .rows div { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--line); }
  .tips { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 8px 0 16px; }
  .tips button { font: inherit; font-weight: 700; padding: 10px; border-radius: 12px; border: 1px solid var(--line); background: #fff; }
  .tips button[aria-pressed=true] { border-color: var(--green); background: #eaf7f0; color: var(--green); }
  .cardline { display: flex; align-items: center; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 14px; margin-bottom: 14px; }
  .chip { width: 38px; height: 26px; border-radius: 6px; background: linear-gradient(135deg, #2c3a55, #5b6b8c); }
  .pay { width: 100%; font: inherit; font-weight: 800; font-size: 18px; padding: 15px; border: 0; border-radius: 16px; background: var(--green); color: #fff; }
  .later { width: 100%; font: inherit; padding: 12px; border: 0; background: none; color: var(--muted); margin-top: 6px; }
  .done { text-align: center; padding: 20px 0 6px; }
  .done .tick { width: 72px; height: 72px; border-radius: 50%; display: grid; place-items: center; margin: 0 auto 10px; background: #eaf7f0; color: var(--green); font-size: 38px; }
</style>
</head>
<body>
<main>
  <div class="card">
    <span class="demo">Demo payment · no money moves</span>
    ${
      paid
        ? `<div class="done"><div class="tick">✓</div><h1>${esc(p.carer)} has been paid</h1><p class="total">${dollars(p.amount_cents + p.tip_cents)}</p><p class="muted">The Echo Show has been told. You can close this page.</p></div>`
        : declined
          ? `<div class="done"><h1>Payment cancelled</h1><p class="muted">Nothing was paid. Ask Alexa to "pay ${esc(p.carer)}" to try again.</p></div>`
          : `<h1>Pay ${esc(p.carer)} for tonight</h1>
    <p class="muted">Approve it here; the Echo Show in the kitchen never takes payments.</p>
    <p class="total" id="total">${dollars(p.amount_cents)}</p>
    <div class="rows">
      <div><span>Time</span><b>${duration(p.minutes)}</b></div>
      <div><span>Rate</span><b>${dollars(p.rate_cents)} an hour</b></div>
      <div><span>Evening</span><b>${dollars(p.amount_cents)}</b></div>
    </div>
    <p class="muted" style="margin:0">Add a tip?</p>
    <div class="tips" role="group" aria-label="Tip">
      <button data-tip="0" aria-pressed="true">None</button><button data-tip="500" aria-pressed="false">$5</button><button data-tip="1000" aria-pressed="false">$10</button><button data-tip="2000" aria-pressed="false">$20</button>
    </div>
    <div class="cardline"><span class="chip"></span><span>Saved card •••• 4242<br><span class="muted">Demo card</span></span></div>
    <button class="pay" id="pay">Pay ${dollars(p.amount_cents)}</button>
    <button class="later" id="later">Not now</button>
    <p class="muted" id="err" role="alert" style="color:#c81e28"></p>`
    }
  </div>
</main>
${
  paid || declined
    ? ''
    : `<script>
  var amount = ${p.amount_cents}, tip = 0;
  function fmt(c) { return '$' + (c / 100).toFixed(c % 100 ? 2 : 0); }
  document.querySelectorAll('[data-tip]').forEach(function (b) {
    b.addEventListener('click', function () {
      tip = Number(b.dataset.tip);
      document.querySelectorAll('[data-tip]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      document.getElementById('total').textContent = fmt(amount + tip);
      document.getElementById('pay').textContent = 'Pay ' + fmt(amount + tip);
    });
  });
  async function send(action) {
    document.getElementById('pay').disabled = true;
    var r = await fetch(location.pathname, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: action, tip: tip }) });
    if (r.ok) return location.reload();
    document.getElementById('pay').disabled = false;
    document.getElementById('err').textContent = (await r.json().catch(function () { return {}; })).error || 'Could not pay. Try again.';
  }
  document.getElementById('pay').addEventListener('click', function () { send('pay'); });
  document.getElementById('later').addEventListener('click', function () { send('decline'); });
</script>`
}
</body>
</html>`;
}
