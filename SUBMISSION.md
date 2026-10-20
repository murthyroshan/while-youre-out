# Devpost submission text

Copy each section into the matching Devpost field.

## Name
While You're Out

## Tagline
Your Echo Show knows your house. Tonight it hands that knowledge to whoever is looking after your kids, and keeps you one tap away.

## Track and mini challenges
- **Track:** Alexa+ (a self-hosted MCP server, spec 2025-11-25, Streamable HTTP)
- **Mini challenge:** Open Source (see the end of this file)

## Inspiration
Every time parents go out, someone else holds their child's safety: a babysitter, a grandparent, a nanny. What they need to know lives in a WhatsApp thread, a fridge note and a parent's head, and the questions come at the worst moments. About 1 in 20 U.S. children has a food allergy (CDC, 2024 data). More than 40% of them have had a severe reaction, and epinephrine is needed within minutes (FARE). A sitter shouldn't be scrolling WhatsApp when that happens.

## What it does
A guest mode for the smart home. When the parents head out, the kitchen Echo Show becomes the sitter's guide for the evening, in the parents' own words.

- **Setting up is pasting the message you'd send anyway.** Each line becomes a rule the parent confirms on their phone. A three-question check before they leave confirms the sitter knows what matters.
- **Questions get the parents' words, never a guess.**
  - "Can she have chicken satay?" gets "No. That can have peanuts in it."
  - Doses are never given.
  - A stranger at the door is never called safe.
- **What the notes don't cover goes to the parents.** It runs as an MCP Task that waits for an answer from the parent's lock screen. The doorbell photo, the dinner order and paying the sitter also run through the parents' phones.
- **In an emergency it reads the family's own plan, one step at a time.**
  - It starts the second-EpiPen timer and tells the sitter the parents have been alerted.
  - It puts "Call Mom" one tap away on the sitter's phone.
  - It keeps going on the kitchen screen and the sitter's phone if the internet drops.
- **Afterwards:** "All's well at home" when the child is asleep, Mom's goodnight message at bedtime, and a debrief in the morning.

## How we built it
- **The add-on:** an MCP server in TypeScript (the official SDK). It has 23 tools, each with an output schema, plus:
  - one MCP Apps card for every screen, sized per Echo device, light and dark;
  - Tasks, and form and URL elicitation;
  - resources with subscriptions;
  - OAuth 2.1 account linking;
  - a private demo house per visitor.
- **Safety is code, not a prompt:** the rules that decide what may be said give the same answer every time, in milliseconds, with no AI or internet. An AI's second look can only add caution.
- **No Alexa+ host is available to developers yet** (the add-on console says "Coming Soon"), so we built one. An open-source Echo Show simulator plays the Alexa+ host, and an Alexa-hosted skill that is an MCP host runs the same add-on on today's Alexa.
- **The parent's and the sitter's phones are web apps:** Web Push with lock-screen answers for parents, and an offline guide for the sitter.

## Who we built it with
We talked to six people in India: three parents, a grandparent and two babysitters. It was a small, informal sample, so we treat it as an early signal rather than proof.
- **Parents** hand over by talking and WhatsApp and still worry something will be forgotten.
- **Carers** call the parents most about food, sleep and a crying child, and feel they call too often.
- **Everyone** said it must be simple and private, and must still let the carer reach the parents directly.

What we changed because of them:
1. In an emergency, the parents-alerted line and the one-tap call.
2. "All's well" when the child is asleep.
3. Setup that works by pasting a message, without any AI.

## Challenges
- No Alexa+ access, so we built the host.
- Alexa-hosted skills run Node.js 16.
- An APL parameter named "payload" silently receives every data source.
- Making safety deterministic while still letting an AI help.

The full [friction log](FRICTION_LOG.md) has the details.

## Accomplishments
- **Safety, measured:**
  - 120 lines another AI wrote without seeing our tests: 102 of 120 (85%) on the first run, before any fix. That's the honest number. The rules alone missed 8 of its 12 emergencies; the AI's second look caught 7 of them, and the rules were fixed the same day;
  - 357 things a sitter might say that we wrote, with 49 of 49 emergencies recognised and no false alarms on the other 308, and 55 held-out lines scoring 50 of 55 (91%) on their only run.
- **Speed and robustness:** 19 ms p95 per tool call, against a 500 ms budget, and over 440 automated tests on every push.
- **Runs on real Alexa** today.

## What we learned
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
- **Why it matters:** until the Alexa+ add-on console opens, builders have no way to see their add-on on an Echo Show. This gives every MCP server that view today, and it's how While You're Out was built and tested.

## Images for Devpost
- **Thumbnail (3:2):** `media/devpost/00-thumbnail-3x2.jpg` (YouTube, 16:9: `media/devpost/thumbnail-youtube-1280x720.jpg`)
- **Gallery, in order:** `media/devpost/01-title.jpg` to `13-pay-the-sitter.jpg` (frames from the video, 1920 x 1080)
