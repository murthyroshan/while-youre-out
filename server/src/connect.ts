// "Use it from any MCP host": one page per demo house with its MCP address and how to add it to
// Claude, Claude Code, VS Code or the MCP Inspector, plus the parent page for the same house, so
// whoever connects can be Mom on their phone too. The add-on isn't tied to one host.

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function connectPage(mcpUrl: string, parentUrl: string) {
  const vscode = JSON.stringify({ servers: { 'while-youre-out': { type: 'http', url: mcpUrl } } }, null, 2);
  const block = (id: string, text: string) =>
    `<div class="code"><pre id="${id}">${esc(text)}</pre><button data-copy="${id}" aria-label="Copy">Copy</button></div>`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Connect · While You're Out</title>
<style>
  :root { color-scheme: light dark; --bg: #F6F4F0; --card: #FFFFFF; --inner: #F1EEE8; --text: #14181E; --text-2: #3E4652; --btn: #2D415E; --accent: #9A5800; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0B0E13; --card: #14181E; --inner: #1B2028; --text: #FFFFFF; --text-2: #C3CBD6; --btn: #2D415E; --accent: #F2B544; } }
  body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 32px 16px 48px; }
  h1 { font-size: 30px; line-height: 1.15; margin: 0 0 8px; } h2 { font-size: 18px; margin: 0 0 6px; }
  p { margin: 0 0 10px; color: var(--text-2); }
  section { background: var(--card); border-radius: 16px; padding: 18px; margin: 14px 0; }
  .code { display: flex; gap: 8px; align-items: flex-start; background: var(--inner); border-radius: 12px; padding: 10px 10px 10px 14px; margin: 8px 0; }
  pre { flex: 1; margin: 0; white-space: pre-wrap; word-break: break-all; font: 14px/1.45 ui-monospace, Consolas, monospace; }
  button { min-height: 44px; min-width: 64px; border: 0; border-radius: 999px; background: var(--btn); color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
  a { color: var(--accent); font-weight: 600; }
  :focus-visible { outline: 3px solid #1F6FD6; outline-offset: 2px; }
</style></head>
<body><main>
<h1>Connect While You're Out to any MCP host</h1>
<p>This is a demo house of your own, the Sharma family. The add-on is an MCP server (Streamable HTTP, no sign-in for the demo), so any host that supports remote MCP servers can use it, not only Alexa+.</p>
<section><h2>This house's MCP address</h2>${block('url', mcpUrl)}
<p>Open <a href="${esc(parentUrl)}" target="_blank" rel="noopener">the parent page for this house</a> on your phone to answer the sitter's questions as Mom.</p></section>
<section><h2>Claude</h2><p>Settings → Connectors → Add custom connector, and paste the address above.</p></section>
<section><h2>Claude Code</h2>${block('cc', `claude mcp add --transport http while-youre-out ${mcpUrl}`)}</section>
<section><h2>VS Code</h2><p>In <code>.vscode/mcp.json</code>:</p>${block('vs', vscode)}</section>
<section><h2>MCP Inspector</h2>${block('in', 'npx @modelcontextprotocol/inspector')}<p>Choose Streamable HTTP and paste the address.</p></section>
<section><h2>Then try</h2><p>"Priya is babysitting tonight." · "Where's the EpiPen?" · "Can Maya have chicken satay?" · "Someone is knocking, should I open the door?" · "Her lips are swelling."</p>
<p>An agent using it should follow <a href="https://github.com/murthyroshan/while-youre-out/blob/main/agent-skill/SKILL.md">the add-on's Agent Skill</a>: say the safety sentences it returns, and call the emergency tool the moment it says so.</p></section>
</main>
<script>
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-copy]');
  if (!b) return;
  navigator.clipboard.writeText(document.getElementById(b.getAttribute('data-copy')).textContent).then(function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1500); });
});
</script></body></html>`;
}
