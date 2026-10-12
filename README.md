# While You're Out

Alexa+ add-on for whoever looks after your kids and home while you're out: a babysitter, a grandparent, a nanny, or a partner on the night shift.

Built for the Build, Ship, Shape: Amazon Developer Hackathon (Alexa+ track).

## What's here

| Folder | What it is |
| --- | --- |
| `server/` | The MCP server (spec 2025-11-25, Streamable HTTP) plus the parent's phone page |
| `simulator/` | Echo Show-style simulator that stands in for Alexa+: voice, MCP Apps cards, task status |

## Run it

```bash
npm install
npm run dev          # MCP server on http://127.0.0.1:8787/mcp
npm run dev:sim      # Echo Show simulator on http://127.0.0.1:5173 (second terminal)
npm test             # scripted evening against the real server
```

The server prints the parent page link, for example `http://127.0.0.1:8787/parent?k=demo-parent-key`. Open it in another window to answer the sitter's questions as a parent.

For a quick demo, set `WYO_ESCALATE_MS=20000` so an unanswered question moves to the next contact after 20 seconds.

## The simulator

Real Alexa+ add-on access is partner-only, so the simulator plays Alexa's part:

- Connects to the MCP server with the official MCP client over Streamable HTTP.
- Voice in and out with the browser's speech APIs (Chrome or Edge), or type instead.
- A minimal MCP Apps host: renders the server's `ui://` card in a sandboxed iframe and speaks the MCP Apps postMessage protocol (`ui/initialize`, `tool-input`, `tool-result`, `size-changed`).
- Runs `ask_parent_and_wait` as an MCP task and shows its status as it changes.
- The "brain" that maps speech to tools is rule-based for now, so it works without any API key. An AI brain comes next.

Settings: `VITE_MCP_URL` (default `http://127.0.0.1:8787/mcp`), `VITE_PARENT_KEY` (default `demo-parent-key`).

Settings (environment variables):

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8787` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address |
| `ALLOWED_HOSTS` | (none) | Comma-separated host names allowed when deployed |
| `ALLOWED_ORIGINS` | local pages only | Comma-separated browser origins allowed to call the server (e.g. the deployed simulator) |
| `WYO_DB` | `:memory:` | SQLite file path |
| `WYO_PARENT_KEY` | `demo-parent-key` | Key for the parent page. Required (16+ characters) when `HOST` is not local; the server refuses to start otherwise |
| `WYO_ESCALATE_MS` | `180000` | How long a contact has to answer before the next one is asked |

## MCP tools

| Tool | Purpose |
| --- | --- |
| `start_handoff` | Switches to carer mode and returns tonight's briefing |
| `ask_house` | Answers in the parents' exact words; food and medicine always carry a guard |
| `where_is` | Where something is kept, with the parents' photo |
| `log_event` | The carer's log of the evening |
| `ask_parent` / `check_parent_answer` | Ask a parent without blocking |
| `ask_parent_and_wait` | MCP task: completes when a parent answers, escalates down the contact chain |
| `emergency` | Fixed safety script from the family's own data; alerts every contact |
| `end_handoff` | Ends carer mode and returns the evening summary |

Resources: `ui://while-youre-out/card.html` (MCP App card), `house://manual` (carer view of the manual).

## Safety rules (enforced in code, not by the AI)

- Never says a food or medicine is safe, never gives doses. Food and medicine answers from a parent apply to tonight only.
- Never reveals codes, keys or when the parents will be back, and never stores codes a parent sends. Voice always gets the carer's view, because anyone in the room can talk to the device.
- Emergencies are checked before anything else, including inside logs, "where is" and "ask a parent" requests.
- Each kind of emergency gets a fixed script: the parents' action plan for allergy or breathing, "get everyone out" for fire or gas, Poison Control for poisoning, and so on. Medical cases defer to the 911 dispatcher.
- Logging that the child ate an allergen (including brand names such as Snickers or Nutella) or was given medicine alerts the parents immediately.
- "What do I do if..." questions read the plan without raising an alarm.

The demo household's emergency plan is sample data written for the demo, not medical advice.
