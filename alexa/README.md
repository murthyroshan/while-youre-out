# While You're Out on today's Alexa (a free Alexa-hosted skill)

Alexa+ add-ons aren't open to everyone yet, so this is the same add-on on the Alexa you can use today: a custom skill that acts as an **MCP host**, as Alexa+ does. Each turn it connects to the add-on over MCP (Streamable HTTP), turns what was said into tool calls (with the simulator's rule brain, standing in for the Alexa+ model), says the answer, and shows the card on an Echo Show in APL, Amazon's screen format.

- **Free:** Alexa-hosted skills run on Amazon's account, not yours. No AWS account or billing.
- **Every Alexa account gets its own demo house**, named by a hash of the Alexa user id; nothing personal reaches the add-on. The first reply puts that house's parent page in the Alexa app, so someone can be Mom on their phone.
- **What carries over from Alexa+:** the same tools, the same safety rules (they're in the add-on, not the skill), the parents' answers told on the next turn, the emergency guide moving on "done" and "next", and the cards' design rules (brand top-left, safety first, large touch targets, the address shown and never spoken).
- **What doesn't:** a classic skill can't speak first, so a parent's answer is told the next time the sitter talks; and it can't render the add-on's HTML card, so each card is redrawn in APL ([src/apl.ts](src/apl.ts)).

## Try it in the Alexa developer console (about 5 minutes)

1. Sign in at [developer.amazon.com/alexa/console/ask](https://developer.amazon.com/alexa/console/ask) with your Amazon account (creating the developer profile is free).
2. **Create Skill** → name *While You're Out* → primary locale **English (IN)** or **English (US)** → type **Other** → **Custom** model → hosting **Alexa-hosted (Node.js)** → template **Start from scratch** → Create. Wait about a minute while Amazon sets it up.
3. **Build** tab → *Interaction Model* → **JSON Editor** → drag in `skill-package/interactionModels/custom/en-US.json` (the same file works for every English locale) → **Save** → **Build skill**.
4. **Build** tab → *Interfaces* → turn on **Alexa Presentation Language** (tick the Echo Show devices) → **Save**.
5. **Code** tab → **Import Code** → choose `alexa-lambda.zip` (the `lambda` folder zipped: `index.js` and `package.json`) → import → **Deploy**.
6. **Test** tab → set testing to **Development** → tick **Device Display** → type or say:
   - *open while you are out*
   - *Priya is babysitting tonight* (then answer the three handover questions)
   - *where's the EpiPen?* · *can Maya have chicken satay?* · *someone is knocking, should I open the door?*
   - *her lips are swelling* → *done* → *next* → *it's over, the paramedics are here*

Any Echo device signed in to the same Amazon account can use the skill in development too: *"Alexa, open while you are out."*

**In Hindi:** in the console, add the language *Hindi (IN)* (the language menu at the top left), and in its JSON Editor drop `skill-package/interactionModels/custom/hi-IN.json` (Devanagari, Hinglish and English sentences), then build. If the console asks for the invocation name in Devanagari, use *व्हाइल यू आर आउट*. On a Hindi Echo the add-on answers the sitter in Hindi once the handoff is on, and an emergency said in Hindi is caught by the add-on's own rules, with no AI in the way. Other Hindi questions are translated on the server, which needs a Gemini key there.

## Build it yourself

```sh
node alexa/build.mjs            # interaction models (5 English locales and Hindi) + lambda/index.js, one file, no dependencies
npx tsx --test alexa/test/*.test.ts   # real Alexa request envelopes through the skill to the add-on
```

The skill talks to the hosted demo (`SERVER` in [src/skill.ts](src/skill.ts)). The built file in `lambda/` is checked in, and CI fails if it doesn't match the source.
