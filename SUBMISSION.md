# Devpost submission text

Copy each section into the matching Devpost field. Lines like **[Devpost image: …]** are instructions, not text: in the "About the project" editor, put the cursor there, upload that image with the image button, and delete the line.

## Name
While You're Out

## Tagline
"Her lips are swelling." The kitchen Echo Show walks the babysitter through your family's own plan, step by step, and keeps you one tap away.

## Track and mini challenges
- **Track:** Alexa+ (a self-hosted MCP server, spec 2025-11-25, Streamable HTTP)
- **Mini challenge:** Open Source (see the end of this file)

## Inspiration
8:14 pm. The parents are at dinner, and the babysitter says it to the kitchen Echo Show: "Her lips are swelling." What should happen next isn't a friendly chat. It's the family's own allergy plan, one step at a time: where the EpiPen is, how to give it, call 911 from your phone, here's the address. A five-minute timer for the second dose. Both parents' phones following live. And if the Wi-Fi drops, the guide keeps going.

Every time parents go out, someone else holds their child's safety: a babysitter, a grandparent, a nanny. What they need to know lives in a WhatsApp thread, a fridge note and a parent's head. About 1 in 20 U.S. children has a food allergy (CDC, 2024 data); more than 40% of them have had a severe reaction, and epinephrine is needed within minutes (FARE). A sitter shouldn't be scrolling WhatsApp when that happens.

## What it does
A guest mode for the smart home. When the parents head out, the kitchen Echo Show becomes the sitter's guide for the evening, in the parents' own words.

**In one line:** it answers from the parents' own words, asks the parents whatever their words don't cover, and in an emergency walks the sitter through the family's own plan. Everything else below serves those three.

- **In an emergency it reads the family's own plan, one step at a time.**
  - It starts the second-EpiPen timer and tells the sitter the parents have been alerted.
  - It puts "Call Mom" one tap away on the sitter's phone.
  - It keeps going on the kitchen screen and the sitter's phone if the internet drops.

**[Devpost image: `media/blog/emergency.jpg`]**

- **Setting up is pasting the message you'd send anyway.** Each line becomes a rule the parent confirms on their phone. A three-question check before they leave confirms the sitter knows what matters.
- **Questions get the parents' words, never a guess.**
  - "Can she have chicken satay?" gets "No. That can have peanuts in it."
  - Doses are never given.
  - A stranger at the door is never called safe.

**[Devpost image: `media/blog/satay.jpg`]**

- **What the notes don't cover goes to the parents.** It runs as an MCP Task that waits for an answer from the parent's lock screen. The doorbell photo, the dinner order and paying the sitter also run through the parents' phones.
- **Afterwards:** "All's well at home" when the child is asleep, Mom's goodnight message at bedtime, and a debrief in the morning.

## How I built it
- **The add-on:** an MCP server in TypeScript (the official SDK). It has 23 tools, each with an output schema, plus:
  - one MCP Apps card for every screen, sized per Echo device, light and dark;
  - Tasks, and form and URL elicitation;
  - resources with subscriptions;
  - OAuth 2.1 account linking;
  - a private demo house per visitor.
- **Safety is code, not a prompt:** the rules that decide what may be said give the same answer every time, in milliseconds, with no AI or internet. An AI's second look can only add caution.
- **No Alexa+ host is available to developers yet** (the add-on console says "Coming Soon"), so I built a stand-in for it. An open-source Echo Show simulator plays the Alexa+ host, and an Alexa-hosted skill that is an MCP host runs the same add-on on today's Alexa.
- **The parent's and the sitter's phones are web apps:** Web Push with lock-screen answers for parents, and an offline guide for the sitter.

## Who I built it with
I talked to six people in India: three parents, a grandparent and two babysitters. It was a small, informal sample, so I treat it as an early signal rather than proof. The summary is in [RESEARCH.md](RESEARCH.md).
- **Parents** hand over by talking and WhatsApp and still worry something will be forgotten.
- **Carers** call the parents most about food, sleep and a crying child, and feel they call too often.
- **Everyone** said it must be simple and private, and must still let the carer reach the parents directly. All three parents, a mother in Hyderabad among them, said they'd only trust it if the sitter could still reach them.

What I changed because of them:
1. In an emergency, the parents-alerted line and the one-tap call.
2. "All's well" when the child is asleep.
3. Setup that works by pasting a message, without any AI.

## Challenges
- No Alexa+ access, so I built a stand-in for the host.
- Alexa-hosted skills run Node.js 16.
- An APL parameter named "payload" silently receives every data source.
- Making safety deterministic while still letting an AI help.
- Amazon's Alexa+ authentication pages and the MCP spec disagree on the 401 that starts account linking; I built to Amazon's.

The full [friction log](FRICTION_LOG.md) has the details.

## Accomplishments
- **Safety, measured:**
  - 120 lines another AI wrote without seeing my tests: 102 of 120 (85%) on the first run, before any fix. That's the honest number. The rules alone missed 8 of its 12 emergencies; the AI's second look caught 7 of them, and the rules were fixed the same day;
  - 357 things a sitter might say that I wrote, with 49 of 49 emergencies recognised and no false alarms on the other 308, and 55 held-out lines scoring 50 of 55 (91%) on their only run.
- **Speed and robustness:** 19 ms p95 per tool call, against a 500 ms budget, and over 440 automated tests on every push.
- **Ready for Alexa+'s rules:** account linking and the service-level token built to Amazon's own authentication pages, and 14 Alexa+ and MCP transport checks run against the live demo twice a day.
- **Runs on real Alexa** today, through an Alexa-hosted skill that is an MCP host.

**[Devpost image: `media/blog/alexa-console.png`]**

## What I learned
Parents don't want an AI deciding about their child; they want their own words, available at the right moment, and to be reached when it matters. The best features came from listening: the one-tap call and "all's well".

## What's next
- Registering as an Alexa+ add-on as soon as the console opens.
- Testing with families in the U.S.
- Real integrations for the stand-ins (Ring, Amazon Pay, a delivery partner).
- More languages for carers. Hindi is already in.

## Links
- **Live demo (the highlights, 2½ minutes):** https://while-youre-out-wpj3.onrender.com/?moment=highlights
- **Website:** https://murthyroshan.github.io/while-youre-out/
- **Code (MIT):** https://github.com/murthyroshan/while-youre-out
- **MCP endpoint:** https://while-youre-out-wpj3.onrender.com/mcp
- **Video:** (add the YouTube or Vimeo link)

## Built with
TypeScript · Model Context Protocol (TypeScript SDK, MCP Apps) · Alexa Skills Kit (Alexa-hosted skills, APL) · Node.js · Express · SQLite · Web Push · React · Vite · three.js · Gemini API · Render · GitHub Pages

**Devpost "Built with" tags** (type each one; they make the Alexa+ features findable): `alexa-plus` · `mcp` · `mcp-apps` · `mcp-tasks` · `elicitation` · `oauth2` · `alexa-skills-kit` · `apl` · `typescript` · `node.js` · `express.js` · `sqlite` · `web-push` · `react` · `vite` · `three.js` · `gemini` · `render` · `github-actions`

## If the project existed before the hackathon
It didn't. Everything here was built during the submission window.

## Open Source mini challenge
- **Contribution URL / repo:** https://github.com/murthyroshan/alexa-addon-simulator (MIT)
- **GitHub username:** murthyroshan
- **What it is:** a test bench for Alexa+ add-ons. Point it at any MCP server and it talks to it the way Alexa+ does:
  - voice, with your own model key;
  - MCP Apps cards on seven Echo screens, with side-by-side comparison;
  - tasks and elicitation;
  - a card audit (text size, contrast, tap targets, fit);
  - a readiness score in six parts with exactly what to fix;
  - robustness tests and a Markdown report;
  - the same checks in CI: `npm run check -- <url>` and a GitHub Action (`murthyroshan/alexa-addon-simulator@v0.1.0`) that fails a build below a minimum score. While You're Out's own twice-daily live-demo check uses it.
- **Release:** https://github.com/murthyroshan/alexa-addon-simulator/releases/tag/v0.1.0 (MIT, 33 tests, CI on every push).
- **On the GitHub Marketplace:** https://github.com/marketplace/actions/alexa-add-on-readiness
- **How it differs from similar tools** (addon-sim, alexa-plus-mcp-checks, alexa-skill-mcp-bridge, compared in its README): it is the one that draws MCP Apps cards at the real size of seven Echo screens, measures them from inside the card (text size after CSS zoom, contrast, touch targets, fit) and turns that into a readiness score a CI build can fail on.
- **Why it matters:** until the Alexa+ add-on console opens, builders have no way to see their add-on on an Echo Show. This gives every MCP server that view today, and it's how While You're Out was built and tested.

## Images for Devpost
- **Thumbnail (3:2):** `media/devpost/00-thumbnail-3x2.jpg` (YouTube, 16:9: `media/devpost/thumbnail-youtube-1280x720.jpg`)
- **Gallery, in order:** `media/devpost/01-her-lips-are-swelling.jpg` to `13-title.jpg` (frames from the video, 1920 x 1080). It opens on the emergency, like the thumbnail and the video, then real Alexa, then the rest of the evening.
