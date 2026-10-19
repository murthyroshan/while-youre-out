# While You're Out

Alexa+ add-on for whoever looks after your kids and home while you're out: a babysitter, a grandparent, a nanny, or a partner on the night shift.

The Echo Show in the kitchen becomes the sitter's guide for the evening, in the parents' own words, while the parents' phones stay in the loop.

Built for the Build, Ship, Shape: Amazon Developer Hackathon (Alexa+ track).

**Live demo:** [while-youre-out-wpj3.onrender.com](https://while-youre-out-wpj3.onrender.com) (the Echo Show simulator: press **Watch the whole evening**, 3 minutes, hands-free; or scan the QR code and be Mom on your own phone; every visitor gets their own copy of the demo house) · **MCP endpoint:** `https://while-youre-out-wpj3.onrender.com/mcp` (Streamable HTTP, MCP 2025-11-25; a shared house; `/h/<any 16+ letters>/mcp` gives you a private one) · **Which version is live:** `/version`. It's on a free host: if nobody has visited for a while, the first load can take up to a minute.

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
npm test             # 286 server tests and 76 simulator tests
```

For the demo, run the server with `WYO_DEMO=1 WYO_ESCALATE_MS=20000` (from `server/`: `WYO_DEMO=1 npx tsx src/index.ts`). The simulator's **guided demo** then walks through the whole evening one step at a time: one button says the next line, and it moves the house clock and rings the doorbell for you. Its first step resets the demo family, so a reload mid-demo starts clean (`POST /demo/reset`, demo mode only). The house clock is under Settings. "Open the parent's phone" opens the parent page.

**One URL for everything (hosting):** `npm run build -w simulator`, then the server also serves the simulator at `/`. The `Dockerfile` builds that into one container. The live demo runs it on Render's free plan (Docker, health check `/health`, `HOST=0.0.0.0`, `WYO_DEMO=1`, `WYO_PUBLIC_URL`, `ALLOWED_HOSTS`, plus the `WYO_PARENT_KEY` and `GEMINI_API_KEY` secrets). UptimeRobot checks `/health` every 5 minutes so the free instance doesn't sleep; `.github/workflows/keepalive.yml` is a backup ping (set the repository variable `DEMO_URL`). Twice a day `.github/workflows/smoke.yml` uses the live demo the way a judge does (`node scripts/smoke.mjs <url>`: a fresh house over MCP, a house-manual answer, an emergency, the parent page) and fails loudly if anything is broken.

**Notifications on the parent's phone:** tap "Turn on" on the parent page. Android Chrome and desktop browsers work straight away; on an iPhone, first use Share → Add to Home Screen and open it from there (iOS 16.4+). Push needs https, or `localhost` on the same computer.

## What judges can try

| Where | What to try |
| --- | --- |
| Straight to a moment | [The knock at the door](https://while-youre-out-wpj3.onrender.com/?moment=door) · [the emergency](https://while-youre-out-wpj3.onrender.com/?moment=emergency) · [lights out](https://while-youre-out-wpj3.onrender.com/?moment=goodnight) · [paying the sitter](https://while-youre-out-wpj3.onrender.com/?moment=pay). Also `handover`, `questions`, `evening`, `ask`. The evening skips ahead silently, then plays from there |
| Your own phone | "Use your own phone" (or the QR code on the welcome card) opens the parent page for your demo house on your phone. Priya's questions arrive there, and "Watch the evening" waits for your answer |
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
| Shopping list agent | "We ran out of diapers": the parents are asked at once, on their lock screen, "Add diapers to the shopping list?" (Add to list / Not now). A yes puts it on the list (the family's Alexa shopping list in production; simulated here) and the Echo Show says so. Never a house rule |
| Lights out for the house | At bedtime the device dims the child's room, turns on the night light and checks the front door is locked. Simulated, and labelled so on screen: in production Alexa+ does this with the family's own smart home |
| Sitter first | Alexa+ add-ons can't start talking on their own. So whatever the sitter hasn't heard yet (a parent's answer, a reminder that came due) is told at the start of their next reply. Answers the device already announced are never repeated |
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
| `ask_parent_and_wait` | MCP task: completes when a parent answers, escalates down the call order; door questions carry the photo; shopping questions (`shopping_item`) put the item on the list on a yes |
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

Resources: `ui://while-youre-out/card-<hash>.html` (the MCP App, its address carrying a hash of its contents so hosts can cache it; its CSS and JavaScript live in `server/src/mcp/card/`), `house://manual`.

### Ordering dinner (agentic commerce)

"She won't eat the dal, can we order dinner?" crosses three services in one loop:

1. **A delivery partner's menu, filtered for this family** (`order_dinner`): anything with an allergen on file, anything labelled "may contain" one, and sweets after the parents' cut-off are left out, with the reason ("contains peanut", "may contain nuts", "no sweets after 6:00 pm"). Up to three safe dishes, as Alexa's Carousel pattern asks.
2. **A parent's approval** (`request_order`): the sitter can't spend money, so the order goes to the parents' phones; a dish that isn't safe is refused even when asked for by name. The order card refreshes itself (`order_status`) and returns what Alexa needs for its own notification: status, dish, price, arrival window and a reference.
3. **The front door:** once approved, the delivery joins tonight's expected visitors, so when the doorbell rings it's "Dinner from Corner Kitchen, due 6:45 pm to 7:00 pm. No need to open."

A sample restaurant; no money moves. In production this is an Alexa+ food-delivery partner and Amazon Pay.

### The whole house

The kitchen Echo Show is where the sitter talks, but the evening happens across the home, and each device follows the parents' own rules and what actually happens tonight (simulated devices; in production these are the family's own Fire TV, Echo Dot, Ring and smart home):

- **Living room Fire TV:** when the sitter says the kids are watching, the parents' "one hour of TV at most" starts; the TV pauses at the limit, or when bath or bed comes, with a message from the parent on the screen.
- **The child's Echo Dot:** at lights out the night light comes on and the parent's goodnight message plays *in the child's room* (white noise if there isn't one); the TV goes off and the front door is checked.
- **Front door (Ring):** besides the doorbell, in an emergency the porch light comes on for the paramedics, and a parent can unlock the door from their phone; the next emergency step tells the sitter.
- **The parent's Bee:** "she napped until 4:30" said to Mom's Bee moves tonight's bedtime by the parents' own rule, and the sitter hears it on her next reply.
- **Live over MCP:** `house://tonight` (the plan and the house) supports `resources/subscribe`; a subscribed host gets `notifications/resources/updated` the moment it changes.

The simulator shows each room under the Echo Show; the guided evening includes Mom's Bee, the TV pausing for bath and the door unlocked for the paramedics.

### Account linking and the Guest Pass

- **Account linking (OAuth 2.1, as Alexa+ add-ons link):** `/linked/mcp` is the add-on as Alexa calls it after linking. Without a token it answers a bare `401` whose `WWW-Authenticate` header points at `/.well-known/oauth-protected-resource/linked/mcp`; that names the authorization server (`/.well-known/oauth-authorization-server`): authorization code with **PKCE S256 only**, a refresh token with every access token (rotated on use), revocation, statically registered clients with exact redirect URIs (Alexa's, by region), and self-registration for localhost tools only (so the MCP Inspector can link). Linking gives the household its own house; its token picks it on every request. `/mcp` stays open, so trying the demo never needs a token.
- **Guest Pass:** the handoff issues tonight's sitter a pass (five hours unless a parent extends it). The Echo Show shows it as a QR code; the sitter scans it and has tonight on her own phone (`/guest`): what matters most, the address and the EpiPen for a 911 call, one tap to call each contact, and *ask the parents*. The pass token travels in the link's fragment and leaves the address bar once read. At its end time the parents are asked to extend it; half an hour later it closes by itself, and it always ends with the evening. **Everything done under the pass**, on the kitchen Echo Show or on the sitter's phone, is in an activity log on the parents' phone, in plain words.

## The simulator

Real Alexa+ add-on access is partner-only, so the simulator plays Alexa's part:

- Connects with the official MCP client over Streamable HTTP and declares elicitation (form and URL), like Alexa+.
- An MCP Apps host: sandboxed `ui://` cards, `ui/initialize` with host context, `tools/call` from cards (only for tools whose visibility includes `app`), `ui/message` from card buttons, display modes.
- Runs `ask_parent_and_wait` as an MCP task, shows its status, and announces the answer.
- Voice in and out (Chrome or Edge), or type. "Brains" stand in for the Alexa+ language model:
  - **Rules first, Gemini when needed** (the default): the built-in rules answer everything they recognise at once (every guided demo line, "where's the EpiPen", "she's asleep", the door) with no model call. Other languages and phrasings they don't know go to Gemini, and both share the conversation.
  - **Rules only**: pattern matching, instant, English, no key needed.
  - **Gemini for everything**: free speech in any language, function calling, one model call per turn.
  - The key stays on the server behind `/host/llm` (local pages only, 30 requests a minute). A model that is out of quota, busy or hanging is skipped for a while, and a turn never waits more than about 5 seconds before the rules answer.
- The server reads the carer's words in English for its safety rules and the handover check, translating them itself if the device didn't. If it can't, a question is never guessed at: "I can ask a parent".
- Each browser gets its own demo house (`/h/<id>` on the server: its own database, events and clock), so judges never see each other's evening. The guided demo's first step resets it.
- `?film=1` shows only the Echo Show, for recording; Space or → says the next guided demo line.
- Either way the device speaks the server's own text, never a model paraphrase, and emergencies, the emergency guide and the door photo are handled by fixed rules before any model call.
- Spoken replies stay within 30 words (a test plays the whole guided demo and checks every reply); the card shows the rest. The fixed emergency script is the one exception: it is always read in full.
- Simulated device features: Alexa calling and the Ring doorbell alert.

Checks against a running server (not unit tests): `npx tsx test/e2e-houses.ts http://127.0.0.1:8787` (two judges at once), `test/e2e-hybrid.ts` (timing), `test/e2e-language.ts` (a Hindi-speaking sitter, real Gemini).

## Built alongside: the Alexa+ add-on simulator

[alexa-addon-simulator](https://github.com/murthyroshan/alexa-addon-simulator) is a separate open-source tool we made from this project's simulator: point it at any MCP server to talk to it like Alexa+, see its MCP Apps cards on seven Echo screens, and get a readiness score (protocol, tools, cards, voice, speed, robustness). Running it on While You're Out found tool parameters without descriptions, tools without safety hints, and card text that shrank on the smallest Echo Show; all three are fixed here.

## What Alexa+ would need

Everything below works in the demo, but some of it is simulated because an add-on can't do it today. This is the list we would bring to the Alexa+ team, in the order it matters to families.

| Gap | What we did instead | What would make it real |
| --- | --- | --- |
| An add-on can't speak first | "Sitter first": a parent's answer or a due reminder is told at the start of the sitter's next reply; MCP Tasks for answers that take minutes | A proactive announcement API for add-ons (rate-limited, per household), so "Anita says yes" is heard when it arrives |
| Who is speaking | Voice always gets the sitter's view: anyone in the room can talk to the device | Speaker roles for guests, so a sitter can't change the parents' rules and a parent can (Voice ID with a guest role) |
| Reaching the parents | Web Push to the parent page, with lock-screen buttons | Alexa app notifications to household members, with actions, from an add-on |
| Emergencies | A fixed script from the family's own plan, timers, every parent phone live; the sitter calls 911 | A hand-off to Alexa Emergency Assist (agent call with the address and the plan), triggered by the add-on |
| The doorbell | Sample snapshots and a simulated Ring chime | Ring doorbell events and the latest snapshot, for add-ons the household allows |
| Lights out for the house | Simulated and labelled so on screen | Scoped smart-home actions from an add-on (dim a room, check a lock) |
| The shopping list | Our own list | Write access to the family's Alexa shopping list |
| Paying the sitter | MCP URL elicitation to a demo approval page on the parent's phone; no money moves | Amazon Pay for a person-to-person payment, approved by the parent |
| Timers | The card counts down and the device speaks the warnings | Device timers an add-on can start ("5 minutes to the second EpiPen") |
| The screen | MCP Apps cards that refresh themselves and ask for full screen | Echo Show support for MCP Apps display modes and cards calling tools, as in our simulator |

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
| `WYO_OAUTH_CLIENT_ID` / `WYO_OAUTH_CLIENT_SECRET` | `alexa-addon` / none | The app allowed to link households (Alexa) |
| `WYO_OAUTH_REDIRECTS` | Alexa's | Extra exact redirect URIs for that app, comma-separated |
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

The demo household's emergency plan is sample data written for the demo, not medical advice. The doorbell snapshots, the lullaby and the payment page are demo stand-ins; in production they would come from Ring, the parent's own recording, and a real payment provider. All media in the repository is our own: the doorbell snapshots are drawn by a script, and the lullaby is *Twinkle Twinkle Little Star* (a traditional melody) synthesized note by note.

## License

[MIT](LICENSE) © 2026 murthyroshan
