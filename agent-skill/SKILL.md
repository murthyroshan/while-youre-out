---
name: while-youre-out
description: Use when connected to the While You're Out MCP server, an add-on for whoever looks after a family's children and home while the parents are out (a babysitter, a grandparent, a nanny). Explains which tool answers what, and the safety rules an agent must never bend when it relays the add-on's answers.
---

# While You're Out

The add-on holds the parents' own notes for tonight (allergies, where the EpiPen is, bedtime, the house rules, who to call) and answers the person looking after the children, on an Echo Show or any MCP host. Its safety rules are enforced in its code. Your job as the host is to call the right tool, say what it returns, and never weaken it.

## The rules (never bend these)

1. **Emergencies first.** If any result has `emergency: true`, or the person describes trouble breathing, swelling, choking, someone unresponsive, fire, gas, poisoning, a missing child or a break-in, call `emergency` straight away with their words. Then move the guide with `emergency_step` when they say "done", "next", "back" or "it's over". Never say you have called 911 or anyone else: the add-on can't, and neither can you. Tell them to call 911 from their phone.
2. **Never decide on food or medicine yourself.** Don't say a food is safe, don't give a dose, don't reassure. Ask `ask_house`, and say the `guard` sentence it returns, in full.
3. **Say alerts first, word for word.** `allergy_alert` and `pet_alert` mean the parents have already been told; read them before anything else.
4. **Never say private details aloud.** The home address is shown on screen, never spoken. Codes, keys and when the parents will be back are not shared.
5. **The parents' words, not yours.** Answers quote the parents. Don't paraphrase a rule into something softer, and don't fill a gap with your own advice: if the add-on says the parents haven't covered it, offer to ask them (`ask_parent_and_wait`).
6. **Short to say, the rest on screen.** Keep what you say to the add-on's spoken text; the card carries the detail.

## Which tool for what

| When the person says… | Call |
|---|---|
| "Priya is babysitting tonight" (a parent, handing over) | `start_handoff` (it asks for the name on screen if you leave it out) |
| "Quiz me" / the handover check | `teachback` |
| "Where's the EpiPen?", "where are her pyjamas?" | `where_is` |
| Any question about food, bedtime, screens, rules, the pet | `ask_house` |
| "What's next?", "what's the plan?" | `tonight_plan` |
| The kitchen screen, glanceable | `home_screen` |
| "She fell asleep at 8:10", "we ran out of diapers" | `log_event` |
| "Ask Mom if she can stay up" | `ask_parent_and_wait` (a task: it waits for the parent's answer). On a host without tasks: `ask_parent`, then `check_parent_answer` |
| "Someone's at the door, should I open?" | `door_check` |
| "Can we order dinner?" | `order_dinner`, then `request_order` with the dish they choose; `order_status` to follow it |
| An emergency | `emergency`, then `emergency_step`; `emergency_status` to refresh |
| "She misses her mom" | `play_message` |
| "She speaks Hindi" | `set_carer_language` |
| A parent pasting notes ("here are my notes for the sitter") | `import_note` (nothing is used until the parent confirms it) |
| The parents are home | `end_handoff`, then `pay_sitter` (approved on the parent's phone); `payment_status` to follow it |

## Good to know

- Every result has `structuredContent` with a `view` (the card to show) and the text to say. Show the card when you can; say the text.
- A notice at the start of a reply ("Anita answered…", "Reminder: bath at 7:15") is something the person hasn't heard yet: say it.
- Asking a parent can take minutes. With `ask_parent_and_wait`, tell the person you've asked and carry on; the answer arrives when the task completes, or at the start of a later reply.
- The demo house has a parent page (`/parent`) where someone can answer as Mom; `/connect` shows this house's MCP address.
