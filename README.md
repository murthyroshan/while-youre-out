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

**Notifications on the parent's phone:** tap "Turn on" on the parent page. Android Chrome and desktop browsers work straight away; on an iPhone, first use Share → Add to Home Screen and open it from there (iOS 16.4+). Push needs https, or `localhost` on the same computer.

For a quick demo, set `WYO_ESCALATE_MS=20000` so an unanswered question moves to the next contact after 20 seconds.

## The simulator

Real Alexa+ add-on access is partner-only, so the simulator plays Alexa's part:

- Connects to the MCP server with the official MCP client over Streamable HTTP.
- Voice in and out with the browser's speech APIs (Chrome or Edge), or type instead.
- A minimal MCP Apps host: renders the server's `ui://` card in a sandboxed iframe and speaks the MCP Apps postMessage protocol (`ui/initialize`, `tool-input`, `tool-result`, `size-changed`).
- Runs `ask_parent_and_wait` as an MCP task and shows its status as it changes.
- Two "brains" stand in for the Alexa+ language model (switch at the top of the device):
  - **Gemini**: understands free speech in any language and picks the MCP tools with function calling. The key stays on the server, behind `/host/llm` (local pages only, 30 requests a minute).
  - **Rules**: pattern matching, works with no API key. Gemini falls back to it for a turn if the model is busy.
- Either way the device speaks the server's own reply text (the parents' words, guards, emergency script), never a model paraphrase, and emergencies are caught by fixed rules before any model call (English, Hindi, Spanish).

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
| `WYO_PUBLIC_URL` | local address | Base URL used in links to the parent page |
| `WYO_DEMO` | off | `1` enables the demo clock |
| `WYO_HOST_LLM` | on | `0` turns off the simulator's Gemini proxy (`/host/llm`) |
| `WYO_VAPID_PUBLIC_KEY` / `WYO_VAPID_PRIVATE_KEY` | generated | Keys for push notifications. Generated and saved in the database if not set; set them when the database isn't kept between restarts, or phones must turn notifications on again |
| `GEMINI_API_KEY` | (none) | In `server/.env`; needed for House Brain, translation and the Gemini brain |
| `WYO_GEMINI_MODELS` / `WYO_GEMINI_CHAT_MODELS` | built-in list | Comma-separated Gemini models for reading notes / for the simulator brain |

## House Brain: teach the house from notes you already have

On the parent page, under **Teach the house**, upload a photo of the fridge note or the doctor's allergy plan (PDF), or paste a WhatsApp message. Gemini reads it into proposed cards:

- Each card keeps the note's own words and shows where it came from. Notes in other languages (e.g. Hinglish) get an English translation.
- Codes, PINs, passwords and key locations are left out and never stored; the page says how many were left out.
- If a new rule disagrees with a saved one (bedtime 8:30 vs lights out at 8), the card asks: use the new one, keep both, or keep the old one.
- Nothing is used until a parent confirms it. A new emergency plan replaces the old one only when the parent says so.

Setup: put `GEMINI_API_KEY=...` in `server/.env` (free key from Google AI Studio; git ignores the file). The server asks three models at once and uses the first good answer, because the free tier is often busy; override with `WYO_GEMINI_MODELS`. Try it on the samples: `npx tsx scripts/try-house-brain.ts` (from `server/`), or upload `server/samples/fridge-note.png` on the parent page.

## Signature features

| Feature | What it does |
| --- | --- |
| Live Tonight Plan | Builds tonight's timeline from the parents' routine ("bath at 7:15 … lights out at 8"), prefers day-specific rules ("bedtime 8:30 on Fridays"), applies their rules as the evening goes ("napped till 5" moves bedtime 30 minutes), ticks steps off from the log, and announces each step once when due |
| Teach-back | Before the parents leave: "What is Maya allergic to? Where is the EpiPen? Who do you call first?" Answers are checked without AI; wrong ones get the parents' own words |
| Shadow Parent | On small questions (TV, play, staying up) it says how the parents usually answer: "The parents said yes to this 4 out of 5 times on weekends, and it's Saturday". Never decides, never for food, medicine or safety; switchable per topic |
| Busy mode | A parent taps "urgent only" for 1–3 hours: small questions wait quietly, urgent ones still come through |
| Morning debrief | Night wakes across recent sitter evenings, asleep time vs the plan, teach-back result, supplies that ran out (to a shopping list), and one-tap "save as a house rule" |
| Since your last visit | A returning sitter hears only what changed in the house manual |
| Phone notifications | Real push notifications to the parents' phones, even with the page closed: a question goes to whoever is first in the call order (then the next if nobody answers), urgent questions and emergencies buzz every phone and stay on screen, busy mode keeps small questions quiet |
| Photo check-in | "Send Mom a photo saying good night": the Echo Show counts down, takes the picture and sends it to the parents only (not the neighbour). Never shown to a carer or sent to an AI; deleted after a week |
| Family setup | Children and pets (with allergies in the parent's words), who to call in order, doctors kept out of the question chain, home address and time zone. "Reset to the demo family" and "Start fresh" for anyone trying it |
| Bilingual relay | Replies in the sitter's language (native script), the parents' words kept on screen; safety rules read an English rendering; emergency lines use fixed translations |

**Demo clock:** run the server with `WYO_DEMO=1` and the simulator shows a day-and-time control, so a video can jump to Saturday 7:45 pm.

## MCP tools

| Tool | Purpose |
| --- | --- |
| `import_note` | Reads a dictated note into proposed cards the parent confirms on their phone |
| `teachback` | Three quick questions before the parents leave; result shown on the parent's phone |
| `tonight_plan` | Tonight's timeline from the parents' routine, adjusted by their rules; announces steps as they come due |
| `start_handoff` | Switches to carer mode and returns tonight's briefing (asks before replacing a running handoff) |
| `set_carer_language` | Switches replies to the carer's language (e.g. `hi-IN`, `es-US`) |
| `ask_house` | Answers in the parents' exact words; food and medicine always carry a guard |
| `where_is` | Where something is kept, with the parents' photo |
| `log_event` | The carer's log of the evening |
| `ask_parent` / `check_parent_answer` | Ask a parent without blocking |
| `ask_parent_and_wait` | MCP task: completes when a parent answers, escalates down the contact chain |
| `emergency` | Fixed safety script from the family's own data; alerts every contact |
| `end_handoff` | Ends carer mode and returns the evening summary |
| `send_photo` | Sends a photo from the device camera to the parents (the host attaches the image) |

Resources: `ui://while-youre-out/card.html` (MCP App card), `house://manual` (carer view of the manual).

## Safety rules (enforced in code, not by the AI)

- Never says a food or medicine is safe, never gives doses. Food and medicine answers from a parent apply to tonight only.
- Never reveals codes, keys or when the parents will be back, and never stores codes a parent sends. Voice always gets the carer's view, because anyone in the room can talk to the device.
- Emergencies are checked before anything else, including inside logs, "where is" and "ask a parent" requests.
- Each kind of emergency gets a fixed script: the parents' action plan for allergy or breathing, "get everyone out" for fire or gas, Poison Control for poisoning, and so on. Medical cases defer to the 911 dispatcher.
- Logging that the child ate an allergen (including brand names such as Snickers or Nutella) or was given medicine alerts the parents immediately.
- "What do I do if..." questions read the plan without raising an alarm.

The demo household's emergency plan is sample data written for the demo, not medical advice.
