# Alexa+ add-on rules: how While You're Out meets each one

Every rule below is quoted from Amazon's Alexa+ add-on documentation (the design guide, the functional requirements and the policy requirements). Each row says how we meet it and what proves it: a test that fails the build if it stops being true, or, where there's no test, says so. ✅ met · ◐ partly met · ✗ not met.

## Policy

| Rule (Amazon's words) | | How we meet it | Proof |
|---|---|---|---|
| "Your add-on must not be targeted towards children… must never target children or collect their data." | ✅ | It's for the adults looking after children. Voice always gets the carer's view; nothing is collected from a child; the family's own details are entered by the parents. The Alexa skill is listed as not child-directed and using no personal information. | `test/compliance.test.ts` (skill listing) |
| Healthcare and medical: "rejected if it claims to provide life-saving assistance or emergency intervention capability." | ✅ | The add-on never claims to call 911 or to intervene: "This device can't call 911: use your phone." Medical steps are the parents' own saved plan, attributed to it ("From the doctor's plan the parents saved"), or general safety steps that send the sitter to 911 or Poison Control. | `test/contract.test.ts` (terms say it doesn't call 911); `test/compliance.test.ts` (no reply among 357 says it called for help) |
| Medical information: attribute it to a source and include "…not a substitute for professional medical advice…". | ✅ | Every emergency screen carries the source and the disclaimer; food and medicine answers on screen carry "Not medical advice". | `test/compliance.test.ts`; `src/domain/emergency.ts` |
| "Food safety information must include a disclaimer to consult healthcare professionals." | ✅ | Food answers on screen: "Not medical advice: if in doubt, ask a parent or a healthcare professional." It never says a food is safe. | `test/compliance.test.ts`; the safety evaluation ([eval/REPORT.md](server/eval/REPORT.md)) |
| Privacy: "rejected if it collects or recites private personal information via voice." | ✅ | The home address is shown, never said; codes, keys and the parents' plans are never said, and codes a parent sends are never stored. | `test/compliance.test.ts` (none of 357 replies says the address, the alarm code or the key) |
| Privacy and terms URLs. | ✅ | `/privacy` and `/terms`, linked from the skill listing. (The live demo serves them once the latest version is deployed.) | `test/contract.test.ts` |
| A one-time permission prompt. | ◐ | The demo has no sign-in, so there is no consent screen to show. For a real household, account linking (OAuth 2.1 with PKCE, at `/linked/mcp`) is where the parent consents. | `test/oauth.test.ts` |
| LLM wrapper: "rejected if its core functionality is simply relaying customer queries to a third-party AI/LLM." | ✅ | Every safety decision, every answer and every emergency script is deterministic code over the parents' own notes. AI is used only to read a parent's pasted notes (each confirmed by the parent) and to translate. The whole safety evaluation runs with no AI at all. | `test/safety-eval.test.ts` |

## Functional requirements

| Rule | | How we meet it | Proof |
|---|---|---|---|
| Show an interim "still working" message when tools are slow; aim for results within 3 seconds. | ✅ | Every tool declares `_meta.ui.invoking` and `invoked`. Every tool's p95 is about 20 ms over real MCP HTTP. | `test/contract.test.ts`; `test/speed.test.ts`; [eval/SPEED.md](server/eval/SPEED.md) |
| "Never show API codes, JSON or tool names to the customer." | ✅ | What is said and shown is plain sentences. | `test/contract.test.ts`; `test/compliance.test.ts` (357 replies) |
| "Keep voice responses under 30 seconds." | ✅ | Spoken replies are kept within 30 words (about 12 seconds); the rest is on screen. | `simulator/test/voice.test.ts` (the guided evening); `test/compliance.test.ts` (none of 357 replies is over 75 words, 30 seconds at a speaking pace) |
| "Voice and screen must never contradict each other." | ✅ | The same tool result drives both: what is said is the first sentences of what's shown. No automated test compares them. | By construction (`src/mcp/server.ts`) |
| Answer "What can you do?". | ✅ | In under 30 words. | `test/contract.test.ts` |
| "Get explicit confirmation before high-consequence actions." | ✅ | Replacing a handoff in progress asks first; dinner is ordered and the sitter paid only after a parent approves on their own phone; a parent's rule change is confirmed by the parent. | `test/edge.test.ts`; `test/orders.test.ts`; `test/elicit.test.ts` |
| "Every tool in tools/list must be invocable, and inputs must be validated against the schema." | ✅ | Every tool has an input schema (validated) and an output schema; malformed and hostile calls get a 4xx or a tool error, never a crash. | `test/contract.test.ts`; `test/speed.test.ts` (fuzz); [eval/SPEED.md](server/eval/SPEED.md) (1,500 fuzzed requests, 0 server errors) |
| "Always return something." | ✅ | Every path returns a result or an `isError` result with a sentence; a field of the wrong type is dropped and logged rather than failing the answer. | `test/contract.test.ts` |

## Design guide

| Rule | | How we meet it | Proof |
|---|---|---|---|
| Author at 768×480; typography scales (zoom 1.667 on Echo Show 8/15); read `hostContext.deviceClass`. | ✅ | One root scale from the device class. On the short screens (Echo Show 5 and 21, under 440 of the 480 base height) only what matters is kept: the title shrinks, the second and third plan steps and the "alerted" list give way, so the steps, the address and the 911 note always fit. On a phone, one column. | `test/design.test.ts`; every screen on every device in [the gallery](site/public/screens.html) (`#echo-show-5`, `#echo-show-21`, `#phone`, …) |
| Light and dark modes required. | ✅ | Both, with Alexa's card colours; contrast checked in both. | `test/design.test.ts` |
| "One title, one or two supporting fields, and one clear action"; scannable "in under a second". | ✅ | Each card has one title and one primary action; safety first, in the parents' words. | [The screens gallery](site/public/screens.html) (`node scripts/screens.mjs`) |
| Brand colour only on accents and final actions; avoid saturated backgrounds. | ✅ | One accent (the porch light); red only for an emergency. | `test/design.test.ts` (no gradients or glows on large fields) |
| Inline by default; fullscreen only for dense or multi-step content. | ✅ | Fullscreen only for Tonight, the emergency guide and the goodnight message. | `src/mcp/card/card.js` |
| "Voice-only is the always-on baseline." | ✅ | Everything works with no screen: the Alexa skill runs on an Echo Dot, and the evaluation judges the words alone. | `alexa/test/skill.test.ts` (Echo Dot); `test/safety-eval.test.ts` |
| Patterns: List, Carousel, Card, Map. "Don't invent alternatives." | ✅ | Card for answers, List for the plan, Carousel for the dinner menu. | `src/mcp/card/card.js` |
| Carousel: "return 3–5 items and start delivering the first within 500ms." | ◐ | Up to 3 dishes, by design: only dishes that are safe for the child are offered, so tonight there may be fewer. Delivered in about 20 ms. | `test/orders.test.ts` |
| The widget runs in a sandboxed iframe: no localStorage, talk to the host only via postMessage, declare network access in `_meta.ui.csp`. | ✅ | No browser storage; postMessage only (MCP Apps); the add-on's own origin declared for photos and the goodnight message. | `test/compliance.test.ts`; `test/card.test.ts` |
| "Ship a single hashed, gzipped HTML bundle." | ◐ | One HTML bundle with a content-hashed `ui://` address. Gzip: the hosted demo's proxy compresses web pages, but MCP's streamed responses (which carry the card) are not compressed. | `test/card.test.ts` |
| Accessibility: 48×48 touch targets, contrast 4.5:1, no more than 3 flashes per second, alt text, every task by voice alone or touch alone. | ✅ | All buttons at least 48×48; contrast checked in both themes; nothing repeats faster than a third of a second, and motion stops with reduced motion; every image is described; an emergency is announced at once (`role="alert"`) and so is losing the connection; every button carries the words it sends, so it can be said as well as tapped. | `test/design.test.ts`; `test/compliance.test.ts` |

## Tools

| Rule | | How we meet it | Proof |
|---|---|---|---|
| "One meaningful customer intent" per tool. | ✅ | 23 tools, one job each (`ask_house`, `where_is`, `door_check`, `order_dinner`, `pay_sitter`, …). | `src/mcp/server.ts` |
| "Declare only what you honor." | ✅ | Annotations (read-only, destructive, open-world) on every tool, matching what it does. | `test/contract.test.ts` |
| Give Alexa notifications enough structured data for a useful message. | ✅ | Results carry the status, who, what and when (for example an order: dish, price, arrival window, reference). | `test/orders.test.ts`; `src/mcp/outputs.ts` |
