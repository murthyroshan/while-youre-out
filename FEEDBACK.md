# Product feedback

Every tool, API and SDK I used: what for, what worked, what needs work, how onboarding felt, and whether I'd use it again. The details of each problem are in the [friction log](FRICTION_LOG.md).

## Amazon

**Alexa+ add-ons (MCP), the track's core**
- **Used for:** the add-on's design. An MCP server, spec 2025-11-25, Streamable HTTP, with 23 tools, MCP Apps cards, Tasks, form and URL elicitation, resources, and OAuth 2.1 account linking.
- **What worked:** building on the open MCP standard means one server works with Alexa+, today's Alexa (through a skill) and any MCP host, such as Claude, VS Code or the MCP Inspector. The design guidance for add-on cards (device classes, light and dark) was clear and easy to test against.
- **What needs work:** I couldn't run the add-on on Alexa+ at all, because the add-on console says "Coming Soon" (friction log 1). Everything had to be tested on a host I built myself.
- **Onboarding:** the docs and policies were good; access to the platform is the gap.
- **Again?** Yes, and I'd register on day one if a sandbox existed.

**Alexa Skills Kit: Alexa-hosted skills and the developer console**
- **Used for:** running the same add-on on today's Alexa. A custom skill that is an MCP host, with free hosting, Import Code, and the Test tab with the Echo Show display.
- **What worked:** free hosting with no AWS account. The Test tab's device display made the Echo Show cards real, and real Alexa voice in the console is great for a demo.
- **What needs work:**
  - Node.js 16 (friction 2);
  - logs that don't load (5);
  - Windows zips (6);
  - a business name required for a personal account (7).
- **Onboarding:** quick to a skill that answers in the Test tab. The profile and the runtime surprises took longest.
- **Again?** Yes.

**APL (Alexa Presentation Language)**
- **Used for:** the Echo Show screens in the skill: launch, the emergency guide, the EpiPen, "emergency over".
- **What worked:** responsive layouts across Echo Show sizes; data binding once I'd learned the rules.
- **What needs work:** the silent `payload` rule (friction 3), and empty lists (4).
- **Again?** Yes.

**AWS:** not used. The project runs without an AWS account, and I didn't enter the AWS Builder mini challenge.

## Others

**MCP TypeScript SDK (@modelcontextprotocol/sdk)**
- **Used for:** the server, the simulator's client and the skill's client.
- **What worked:** Streamable HTTP, output schemas validated on the server, elicitation, and resources with subscriptions all worked first time.
- **What needs work:** the experimental tasks API on a fresh client (friction 8).
- **Again?** Yes.

**MCP Apps**
- **Used for:** one card (`ui://`) for every screen.
- **What worked:** sandboxed HTML cards and host context (theme, device class).
- **What needs work:** there's no Echo host to preview them on, which is why I built a stand-in.

**Gemini API**
- **Used for:**
  - reading photos and pasted notes into house rules (pasted text now also works without it);
  - an optional "second look" at messages that might be emergencies (it can only add caution);
  - the safety evaluation's chatbot baseline and independent test set.
- **What worked:** JSON-schema output.
- **What needs work:** the free tier's daily quota ran out mid-evaluation.
- **Again?** Yes, behind rules that work without it.

**Render (hosting), GitHub Pages (the website), three.js and Vite (the 3D site and game), web-push (parent notifications), node:sqlite**
- All worked as documented.
- One friction: Render's free tier sleeps when idle, so an uptime monitor keeps the demo awake for judges.
