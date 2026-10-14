# While You're Out

Alexa+ add-on for whoever looks after your kids and home while you're out: a babysitter, a grandparent, a nanny, or a partner on the night shift.

The Echo Show in the kitchen becomes the sitter's guide for the evening, in the parents' own words, while the parents' phones stay in the loop.

Built for the Build, Ship, Shape: Amazon Developer Hackathon (Alexa+ track).

**Live demo:** [while-youre-out-wpj3.onrender.com](https://while-youre-out-wpj3.onrender.com) (the Echo Show simulator; follow the **Guided demo** panel) · **MCP endpoint:** `https://while-youre-out-wpj3.onrender.com/mcp` (Streamable HTTP, MCP 2025-11-25). It's on a free host: if nobody has visited for a while, the first load can take up to a minute.

## An evening with While You're Out

1. **6:00 pm.** "Priya is babysitting tonight" (or "We're heading out", and the Echo Show asks who in a form). The screen turns into **Tonight**: what's next with a countdown, Maya and Bruno with an allergy badge, big buttons. A three-question **handover check** before the parents leave; their phones see "Handover 3/3 ✓".
2. **Questions** are answered in the parents' exact words: "Can she have the cookies?" gets the peanut allergy and a guard, never "it's safe". Small questions get **Shadow Parent**: "the parents said yes 4 out of 5 times on weekends".
3. **Someone knocks.** The Ring doorbell rings; "Should I open the door?" checks who the parents said to expect, delivery windows and the parents' door rule. Unknown visitor: "Don't open", and the doorbell photo goes to the parents' lock screen with **Let them in / Don't open** buttons.
4. **"Her lips are swelling and she can't breathe."** The **Emergency Copilot** runs the doctor's plan one step at a time ("done", "next"), starts the 5-minute timer for the second EpiPen, and every parent phone follows live. Mom taps "I'm on my way"; the Echo Show says "Anita is on the way home".
5. **8:00 pm, lights out.** **Mom's goodnight message** plays on the Echo Show ("Mom left a message for Maya"), then the screen goes dim and warm. The parents get "Maya heard your goodnight message 💛".
6. **Morning.** The **debrief**: night wakes, asleep time against the plan, what ran out (to the shopping list). "Pay Priya": hours times her rate, approved on the parent's phone (never on the shared screen), and the Echo Show confirms.

## What's here

| Folder | What it is |
| --- | --- |
| `server/` | The MCP server (spec 2025-11-25, Streamable HTTP, MCP Apps, Tasks, elicitation), the parent's phone page, and the payment approval page |
| `simulator/` | An Echo Show 15 simulator that stands in for Alexa+: voice, MCP Apps cards, tasks, elicitation, a guided demo |

## Run it

Requires Node.js 22.13 or newer (the server uses the built-in `node:sqlite`; tested on Node 24). Chrome or Edge for the simulator's voice.

```bash
npm install
npm run dev          # MCP server on http://127.0.0.1:8787/mcp
npm run dev:sim      # Echo Show simulator on http://127.0.0.1:5173 (second terminal)
npm test             # 248 server tests and 63 simulator tests
```

For the demo, run the server with `WYO_DEMO=1 WYO_ESCALATE_MS=20000` (from `server/`: `WYO_DEMO=1 npx tsx src/index.ts`). The simulator's **guided demo** then walks through the whole evening one step at a time: one button says the next line, and it moves the house clock and rings the doorbell for you. Its first step resets the demo family, so a reload mid-demo starts clean (`POST /demo/reset`, demo mode only). The house clock is under Settings. "Open the parent's phone" opens the parent page.

**One URL for everything (hosting):** `npm run build -w simulator`, then the server also serves the simulator at `/`. The `Dockerfile` builds that into one container. The live demo runs it on Render's free plan (Docker, health check `/health`, `HOST=0.0.0.0`, `WYO_DEMO=1`, `WYO_PUBLIC_URL`, `ALLOWED_HOSTS`, plus the `WYO_PARENT_KEY` and `GEMINI_API_KEY` secrets). UptimeRobot checks `/health` every 5 minutes so the free instance doesn't sleep; `.github/workflows/keepalive.yml` is a backup ping (set the repository variable `DEMO_URL`).

**Notifications on the parent's phone:** tap "Turn on" on the parent page. Android Chrome and desktop browsers work straight away; on an iPhone, first use Share → Add to Home Screen and open it from there (iOS 16.4+). Push needs https, or `localhost` on the same computer.

## What judges can try

| Where | What to try |
| --- | --- |
| Echo Show | The **Tonight** screen (refreshes itself), every answer card, the doorbell, the emergency guide, the goodnight message, the who's-babysitting form, paying the sitter |
| Parent's phone | Live header, questions with one-tap answers (door questions with the photo), the live emergency view with "I'm on my way", goodnight message recorder, expected visitors, busy mode, House Brain, family setup, "Reset to the demo family" |

## Features

| Feature | What it does |
| --- | --- |
| Tonight screen | The Echo Show's home screen during a handoff: what's next with a countdown ring, the plan as tiles, children and pets with allergy badges, the parents' latest answer, and big buttons (Ask a parent, What's next?, Call Mom, Emergency). Dims to warm amber after lights out. An MCP App that calls `home_screen` through the host to stay current |
| Front Door Guard | Doorbell (Ring) + who the parents expect tonight + delivery windows + the parents' door rule. Deliveries: no need to open. Expected: check first, the parents confirm. Anyone else: don't open, and the doorbell photo goes to the parents as an urgent question they can answer from the lock screen. Never calls a stranger safe |
| Emergency Copilot | The fixed script one step at a time ("done", "next", "it's over"), the plan's timers with spoken warnings, a paramedic sheet, and the parents' phones following live; a parent's "I'm on my way" shows and is spoken on the Echo Show |
| Goodnight message | A parent records voice or video before leaving; it plays at lights out or when the child misses them, and the parent hears that it played |
| Pay the sitter | Hours (house clock, rounded up to the quarter hour) times the rate from the handoff form, plus a tip, approved on the parent's phone through MCP URL elicitation; the Echo Show hears it's done (`notifications/elicitation/complete`). Demo only: no money moves |
| Ask on screen | "We're heading out" with no name: an MCP form on the Echo Show asks who, their language and their rate |
| Live Tonight Plan | Tonight's timeline from the parents' routine, day-specific rules, the parents' own timing rules ("napped till 5" moves bedtime), reminders as steps come due |
| Teach-back | Three questions before the parents leave, checked without AI; wrong answers get the parents' words |
| Shadow Parent | How the parents usually answer small questions, by weekday or weekend; never decides, never for food, medicine or safety |
| Busy mode | "Urgent only" for 1–3 hours: small questions wait, urgent ones still come through |
| Morning debrief | Night wakes across evenings, asleep time vs the plan, teach-back result, supplies to the shopping list, "save as a house rule", Pay |
| Phone notifications | Web Push to the parents' phones with the page closed, routed by call order and escalation, with one-tap answers on the lock screen |
| Family setup | Children and pets with allergies in the parent's words, call order, doctors kept out of the question chain, address, time zone; reset to the demo family or start fresh |
| House Brain | Photo of the fridge note, the doctor's PDF or a WhatsApp message becomes proposed rules the parent confirms; codes and passwords are left out |
| Bilingual relay | Replies in the sitter's language, the parents' words kept on screen; emergency lines use fixed translations |
| Since your last visit | A returning sitter hears only what changed |

## MCP tools

| Tool | Purpose |
| --- | --- |
| `start_handoff` | Sitter mode and tonight's briefing; with no name, asks on screen (form elicitation) |
| `home_screen` | The Tonight screen (`visibility: ["model", "app"]`; the card refreshes itself with it) |
| `teachback` | The handover check |
| `tonight_plan` | Tonight's timeline; announces steps as they come due, and the goodnight message at lights out |
| `ask_house` | Answers in the parents' exact words; food and medicine always carry a guard; Shadow Parent |
| `where_is` | Where something is kept, with the parents' photo |
| `log_event` | The evening's log; allergen and medicine alerts; plan changes |
| `ask_parent` / `check_parent_answer` | Ask a parent without blocking |
| `ask_parent_and_wait` | MCP task: completes when a parent answers, escalates down the call order; door questions carry the photo |
| `door_check` | Front Door Guard |
| `emergency` | Fixed safety script from the family's own data; alerts every contact; opens the guide |
| `emergency_step` | Move the guide on: done, next, back, resolved |
| `emergency_status` | Card and device only (MCP Apps visibility `app`): the screen's live state, timers and spoken warnings |
| `play_message` | The parents' goodnight message |
| `pay_sitter` | Pay the sitter through URL elicitation |
| `payment_status` | Card and device only (visibility `app`): whether the payment went through |
| `set_carer_language` | Replies in the carer's language |
| `import_note` | A parent's dictated rule ("remember: no juice after 7") becomes proposed rules they confirm on their phone. Refused during a handoff: a sitter's "remember she napped" is a log entry |
| `end_handoff` | Ends sitter mode and returns the evening summary |

Resources: `ui://while-youre-out/card.html` (the MCP App; its CSS and JavaScript live in `server/src/mcp/card/`), `house://manual`.

## The simulator

Real Alexa+ add-on access is partner-only, so the simulator plays Alexa's part:

- Connects with the official MCP client over Streamable HTTP and declares elicitation (form and URL), like Alexa+.
- An MCP Apps host: sandboxed `ui://` cards, `ui/initialize` with host context, `tools/call` from cards (only for tools whose visibility includes `app`), `ui/message` from card buttons, display modes.
- Runs `ask_parent_and_wait` as an MCP task, shows its status, and announces the answer.
- Voice in and out (Chrome or Edge), or type. Two "brains" stand in for the Alexa+ language model:
  - **Rules** (the default): pattern matching, instant, no key needed. Every guided demo line works with it.
  - **Gemini** (under Settings): free speech in any language, function calling, one model call per turn. The key stays on the server behind `/host/llm` (local pages only, 30 requests a minute). The free tier allows about 20 requests a day per model, so a model out of quota is skipped until it resets and the rule brain answers within seconds.
- Either way the device speaks the server's own text, never a model paraphrase, and emergencies, the emergency guide and the door photo are handled by fixed rules before any model call.
- Spoken replies stay within 30 words (a test plays the whole guided demo and checks every reply); the card shows the rest. The fixed emergency script is the one exception: it is always read in full.
- Simulated device features: Alexa calling and the Ring doorbell alert.

## Settings (environment variables)

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8787` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address |
| `ALLOWED_HOSTS` | (none) | Comma-separated host names allowed when deployed |
| `ALLOWED_ORIGINS` | local pages only | Other browser origins allowed to call the server (pages the server serves itself always are) |
| `WYO_DB` | `:memory:` | SQLite file path |
| `WYO_PARENT_KEY` | `demo-parent-key` | Key for the parent page. Required (16+ characters) when `HOST` is not local |
| `WYO_ESCALATE_MS` | `180000` | How long a contact has to answer before the next one is asked |
| `WYO_PUBLIC_URL` | local address | Base URL for links (photos, media, payment pages) |
| `WYO_DEMO` | off | `1`: house clock, Ring doorbell, and the simulator's link to the parent page |
| `WYO_HOST_LLM` | on | `0` turns off the simulator's Gemini proxy (`/host/llm`) |
| `WYO_VAPID_PUBLIC_KEY` / `WYO_VAPID_PRIVATE_KEY` | generated | Push keys. Set them when the database isn't kept between restarts |
| `WYO_CARD_RELOAD` | off | `1` re-reads the card files on every request (for design work) |
| `WYO_SIMULATOR_DIR` | `simulator/dist` | Where the built simulator is served from |
| `GEMINI_API_KEY` | (none) | In `server/.env`; for House Brain, translation and the Gemini brain |
| `WYO_GEMINI_MODELS` / `WYO_GEMINI_CHAT_MODELS` | built-in list | Gemini models for reading notes / for the simulator brain |

Simulator: `VITE_MCP_URL` (default: the server that serves it, or `http://127.0.0.1:8787/mcp` in development), `VITE_PARENT_KEY`.

## Safety rules (enforced in code, not by the AI)

- Never says a food or medicine is safe, never gives doses. Food and medicine answers from a parent apply to tonight only.
- Never reveals codes, keys or when the parents will be back, and never stores codes a parent sends. Voice always gets the carer's view, because anyone in the room can talk to the device.
- Emergencies are checked before anything else, including inside logs, "where is", the door and "ask a parent" requests.
- Each kind of emergency gets a fixed script: the parents' action plan for allergy or breathing, "get everyone out" for fire or gas, Poison Control for poisoning. Medical cases defer to the 911 dispatcher. The step-by-step guide and its timers come from the same plan.
- A stranger at the door is never called safe; whether to open is the parents' call, with the photo.
- Logging an allergen (including brand names such as Snickers or Nutella) or medicine alerts the parents immediately.
- Payments are approved on the parent's own phone, never on the shared screen.

The demo household's emergency plan is sample data written for the demo, not medical advice. The doorbell snapshots, the lullaby and the payment page are demo stand-ins; in production they would come from Ring, the parent's own recording, and a real payment provider.

## License

[MIT](LICENSE) © 2026 murthyroshan
