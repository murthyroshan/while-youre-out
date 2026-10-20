# Friction log

What got in the way while building While You're Out, in the order we hit it. Each entry: what we tried, what we expected, what happened, how bad it was, how we got around it, and what would fix it.

Severity: **Blocker** (couldn't do it at all), **Major** (cost hours, or fails silently), **Minor** (an annoyance with an easy workaround).

## 1. Registering the add-on with Alexa+

- **Task:** register our MCP server as an Alexa+ add-on and try it on a real Alexa+ device or in a console simulator.
- **Steps:** opened the Alexa+ Developer Console link from the hackathon page (checked again on Oct 19, 2026).
- **Expected:** a way to register an MCP endpoint (Streamable HTTP URL, auth) and test it.
- **Actual:** the console shows "Coming Soon". There is no way to run an add-on on Alexa+.
- **Severity:** Blocker for testing on the real host.
- **Workaround:** we built the host ourselves: an [open-source Echo Show simulator](https://github.com/murthyroshan/alexa-addon-simulator) that talks to any MCP add-on the Alexa+ way (voice, MCP Apps cards, tasks, elicitation). We also built an Alexa-hosted custom skill that is an MCP host, so the same add-on runs on today's Alexa.
- **Suggestion:** a developer sandbox before general availability. Register an MCP URL, then test it in the existing developer console simulator with MCP Apps cards rendered on the Echo Show display. Even text-only would let builders find host problems early.

## 2. Alexa-hosted skills run Node.js 16

- **Task:** run the MCP TypeScript client inside an Alexa-hosted skill, so the skill can call the add-on.
- **Steps:** built the skill with esbuild, imported it, opened it in the Test tab.
- **Expected:** a current Node.js LTS, with the global `fetch` and web streams the MCP client needs.
- **Actual:** the skill crashed on launch with `fetch is not defined`. Alexa-hosted skills run Node.js 16, which reached end of life in 2023. The runtime version isn't shown in the code editor.
- **Severity:** Major. The error only shows in the logs (see 5), and nothing in the console says which Node.js version runs.
- **Workaround:** bundled `undici` 5 and Node's own `node:stream/web` as globals ([alexa/src/polyfill.ts](alexa/src/polyfill.ts)), and set esbuild's target to `node16`.
- **Suggestion:** offer Node.js 20 or 22 for Alexa-hosted skills, and show the runtime version in the code editor's header.

## 3. An APL parameter named "payload" receives every data source

- **Task:** show our cards on the Echo Show through APL, from one data source.
- **Steps:** declared `mainTemplate.parameters: ["payload"]` and sent a data source called `payload`.
- **Expected:** the parameter receives that data source.
- **Actual:** a blank screen, with no error. A parameter named `payload` receives *all* data sources (a legacy rule), so every binding was one level off.
- **Severity:** Major. It fails silently.
- **Workaround:** renamed the parameter (to `wyo`; see [alexa/src/apl.ts](alexa/src/apl.ts)).
- **Suggestion:** have the APL authoring tool warn when a parameter is named `payload`, or show a render-time warning in the device display when bindings resolve to nothing.

## 4. An empty APL list renders one item

- **Task:** show "nothing yet" lists (no questions asked tonight) on the Echo Show.
- **Expected:** an empty `data` array renders no items.
- **Actual:** one empty item rendered.
- **Severity:** Minor.
- **Workaround:** a `when` condition on the list's length.
- **Suggestion:** document it on the Sequence and Container pages, or render nothing for an empty array.

## 5. The skill's logs don't load from the console

- **Task:** read the skill's error after the crash in 2.
- **Steps:** Code tab, then CloudWatch Logs.
- **Expected:** the recent log lines.
- **Actual:** "Unable to load content".
- **Severity:** Major. It's the main way to see why a hosted skill failed.
- **Workaround:** the Test tab's JSON output and the device display, then guessing.
- **Suggestion:** show the last request's log lines inline in the Test tab, next to the JSON output.

## 6. Import Code and zip files made on Windows

- **Task:** import our built `lambda/` folder with the console's Import Code.
- **Steps:** zipped it with Windows PowerShell's `Compress-Archive` and imported it.
- **Expected:** the files land in `lambda/`.
- **Actual:** the paths inside the zip use backslashes, so the import didn't see a `lambda/` folder.
- **Severity:** Minor, but anyone on Windows will hit it.
- **Workaround:** zipped with Python's `zipfile`, which writes forward slashes.
- **Suggestion:** accept backslash paths, or show the expected structure and say why a zip doesn't match.

## 7. The developer profile asks for a business name

- **Task:** create a developer account to host a hackathon skill.
- **Expected:** a personal developer account for testing.
- **Actual:** "Customer facing business name" is required before you can continue.
- **Severity:** Minor.
- **Workaround:** filled it in.
- **Suggestion:** make it optional until a skill is submitted for certification.

## 8. Calling a task tool from a stateless client (MCP TypeScript SDK)

- **Task:** from the skill (a new MCP client on every request), call `ask_parent_and_wait`, which requires a task.
- **Expected:** `client.experimental.tasks.callToolStream` sends it as a task.
- **Actual:** the client sends a call as a task only after it has listed tools and seen `taskSupport`. On a fresh client the call errors.
- **Severity:** Minor.
- **Workaround:** call `listTools()` first ([alexa/src/skill.ts](alexa/src/skill.ts)).
- **Suggestion:** a clearer error ("list tools first") or a per-call option to send as a task.

## 9. Saying the skill's name the way people say it

- **Task:** open the skill in the developer console's Test tab, the way a parent would say it.
- **Steps:** the invocation name is "while you are out" (the rules allow an apostrophe only in a possessive, like "sam's", so "you're" can't be used). Typed "open while you're out".
- **Expected:** Alexa matches the contraction everyone actually says to the invocation name.
- **Actual:** "I'm not quite sure how to help you with that." Only "open while you are out" works, and nothing in the Test tab says the name didn't match.
- **Severity:** Major for real families: almost nobody says "you are out" out loud.
- **Workaround:** the README and the video use the exact phrase "open while you are out".
- **Suggestion:** match common contractions to invocation names (you're, it's, don't), or let developers list a few spoken variants; and in the Test tab, show the invocation Alexa heard when nothing matched.

## 10. Getting a sharp picture of the Echo Show display

- **Task:** a clear screenshot of the skill's APL card on the console's simulated Echo Show, for the README and the video.
- **Steps:** Test tab, Device Display, "Hub Landscape Medium".
- **Expected:** a way to see or save the display at the device's own resolution.
- **Actual:** the display is drawn scaled down to fit the panel (about 880 pixels wide for a 1280 x 800 screen), with no full-size view or export. A screenshot of it is too small to show.
- **Severity:** Minor.
- **Workaround:** in the browser's developer tools, pinned the renderer at 1:1 and took the screenshot in two halves.
- **Suggestion:** a "save screenshot" button on the device display that exports at native resolution, or a pop-out full-size view.
