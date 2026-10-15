import { textOf } from '../mcp';
// The same deterministic emergency rules the server uses, so the device never routes an
// emergency into "where is" or "ask a parent" first.
import { isEmergency } from '../../../server/src/domain/safety';
import type { Brain, DeviceIO } from './types';

const QUESTION_START = /^(can|could|is|are|was|were|what|when|where|how|should|does|do|did|may|why|which|who|whose|will|would|has|have)\b/i;
const LOG_STATUS =
  /\b(is |was |went |fell )?(asleep|to bed|to sleep|woke( up)?|ate|eaten|had (her|his|their)? ?(dinner|bath|milk|snack)|threw up|brushed|took (her|his) bath|walked|fed (the )?\w+|is crying|was crying|gave (her|him) |napped|nap (ended|ends|was)|up from (her|his) nap|used the last|ran out of|run out of|we'?re out of|is out of|running low on|no more)\b/i;
// Words that are never a carer's name ("She is watching TV", "Who is babysitting?").
const NOT_A_NAME = new Set(
  'who what which she he they it someone somebody nobody everyone mom dad mum daddy mommy maya bruno the a an this that there here i you we my her his our their your anita rahul'.split(' '),
);
// Confirmations only count when that's all the person said ("Okay, she can't breathe" is not a yes).
const YES = /^(yes|yeah|yep|yup|sure|ok|okay|yes please|please|please do|go ahead|do it|ask (them|her|him)|ask)[.!]*$/i;
const NO = /^(no|nope|no thanks|never ?mind|don'?t|not now|cancel|no,? don'?t)[.!]*$/i;
const THANKS = /^(thanks|thank you|thank you so much|cool|great|got it|alright|ok thanks|okay thanks)[.!]*$/i;
const GREETING = /^(hi|hello|hey|hi there|hello there|good (morning|afternoon|evening))[.!]*$/i;

const LANGS: Record<string, string> = {
  hindi: 'hi-IN', spanish: 'es-US', tamil: 'ta-IN', telugu: 'te-IN', bengali: 'bn-IN', marathi: 'mr-IN',
  gujarati: 'gu-IN', kannada: 'kn-IN', malayalam: 'ml-IN', punjabi: 'pa-IN', urdu: 'ur-IN', tagalog: 'fil-PH',
};

type Pending = { kind: 'ask'; question: string } | { kind: 'ask_what' } | { kind: 'end' } | { kind: 'replace'; name: string } | { kind: 'teachback' };
// The emergency guide: "done" / "I gave the EpiPen", "next", "repeat that", "the paramedics are here".
const EMERGENCY_DONE = /^(done|did it|i did it|ok(ay)?,? done|finished|yes,? done|gave (it|her|him|the epi ?pen)|i gave (it|her|him|the epi ?pen)( to her| to him)?|epi ?pen (is )?(given|done|in)|called( 911)?|i called( 911)?|911 (is )?called|they'?re coming)[.!]*$/i;
const EMERGENCY_NEXT = /^(next( step)?|skip( it)?|what'?s next|and then\??|what now\??)[.!?]*$/i;
const EMERGENCY_BACK = /^(back|go back|repeat( that)?|say (that|it) again|what\??)[.!?]*$/i;
const EMERGENCY_OVER = /^(it'?s over|all clear|false alarm|(the )?(paramedics|ambulance|ems|help) (is |are )?here|help has (arrived|come)|it'?s over,? the paramedics are here|she'?s (fine|ok(ay)?|better) now|he'?s (fine|ok(ay)?|better) now)[.!]*$/i;
/** What a short reply means while the emergency guide is on screen, if anything. */
export function emergencyAction(u: string): 'done' | 'next' | 'back' | 'resolved' | null {
  return EMERGENCY_DONE.test(u) ? 'done' : EMERGENCY_NEXT.test(u) ? 'next' : EMERGENCY_BACK.test(u) ? 'back' : EMERGENCY_OVER.test(u) ? 'resolved' : null;
}
// "Call Mom", "phone Anita", "video call dad".
const CALL = /^(?:please |can you |could you )?(?:call|phone|ring|video call|facetime|drop in on)\s+(?:to\s+)?(.+?)(?:\s+(?:now|please|for me))?[.!?]*$/i;
// "Someone's knocking, should I open?", "who's at the door?", "the doorbell rang".
const DOOR = /\b(knock\w*|doorbell|bell rang|ring(ing|s)?|someone|somebody|who'?s|who is)\b.*\b(door|outside|porch)\b|\b(should|can|do|shall) i (open|answer|get) (the|that) door\b|\blet (him|her|them) in\b|\bdoorbell\b/i;
// "Maya misses her mom", "she's crying for her dad", "play Mom's message".
const MISSING = /\b(miss(es|ing)?|crying for|asking for|wants?) (her |his |their )?(mom|mum|mommy|mummy|mama|dad|daddy|papa|parents|mother|father)\b/i;
// "She won't stop crying", "Maya is upset": comfort, so Mom's message helps. Not when she's hurt or ill.
const UPSET = /\b(won'?t stop crying|keeps? crying|(is|she'?s|he'?s|they'?re) (crying|upset|sad|homesick)|can'?t (settle|calm down|stop crying)|inconsolable)\b/i;
const HURT = /\b(hurt|fell|fall(en)?|bump(ed)?|bleed|blood|pain|cut|sick|fever|vomit|threw up|burn|rash|hit)\b/i;
const PLAY_MESSAGE = /\bplay (the |mom'?s |mum'?s |dad'?s |the parents'? |their |her |his )?(goodnight |good night |bedtime )?(message|video|recording)\b/i;
const HOW_IS_IT_GOING = /^(how'?s it going|how is it going|how are things|what'?s happening( tonight)?|home|go home|show (the )?home( screen)?|tonight)[.!?]*$/i;

/**
 * A deterministic stand-in for the Alexa+ language model. It needs no API key, so the
 * demo works anywhere, and it maps plain speech to the add-on's tools with simple rules.
 */
export class RuleBrain implements Brain {
  readonly name = 'Rules (no AI key needed)';
  private pending: Pending | null = null;
  private inEmergency = false;
  private firstContact = 'a parent';
  private carer: string | null = null;
  private busyUntil: string | null = null;

  /** What the home screen says about tonight, so a reload mid-evening keeps working. */
  sync(state: { carer: string | null; firstContact?: string | null; busyUntil?: string | null }) {
    this.carer = state.carer;
    if (state.firstContact) this.firstContact = state.firstContact;
    this.busyUntil = state.busyUntil ?? null;
  }

  /**
   * With `out`, a phrase the rules don't recognise is declined (out.declined = true, nothing done)
   * instead of going to the house manual, so the hybrid brain can ask the model.
   */
  async handle(raw: string, io: DeviceIO, out?: { declined?: boolean }) {
    const u = raw
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .trim()
      .replace(/^(hey |ok |okay )?alexa[,.!\s]*/i, '')
      .trim();
    if (!u) return;

    // Safety first: anything that sounds like an emergency skips every other rule.
    // During an emergency, short replies move the step-by-step guide on.
    if (this.inEmergency) {
      const action = emergencyAction(u);
      if (action) {
        const r = await io.tool('emergency_step', { action });
        if (r.isError || r.structuredContent?.resolved) this.inEmergency = false;
        return io.say(textOf(r));
      }
    }

    if (isEmergency(u)) {
      this.pending = null;
      const e = await this.emergency(io, u);
      return io.say(textOf(e));
    }

    // During the teach-back check, the carer's next replies are answers ("skip" moves on).
    if (this.pending?.kind === 'teachback') {
      const skip = /^(skip|pass|next|i don'?t know|not sure|no idea)[.!]*$/i.test(u);
      if (/^(stop|cancel|later)[.!]*$/i.test(u)) {
        this.pending = null;
        return io.say("Okay, we'll skip the check.");
      }
      const r = await io.tool('teachback', skip ? { skip: true } : { answer: u });
      if (r.structuredContent?.emergency) {
        this.pending = null;
        const e = await this.emergency(io, u);
        return io.say(textOf(e));
      }
      if (r.structuredContent?.kind !== 'question') this.pending = null;
      return io.say(textOf(r));
    }

    // After "Ask the parents", the next thing said is the question.
    if (this.pending?.kind === 'ask_what') {
      this.pending = null;
      if (NO.test(u)) return io.say('Okay.');
      return this.askParent(u, io);
    }

    const calling = CALL.exec(u);
    if (calling) {
      this.pending = null;
      if (!io.call) return io.say("This device can't make calls.");
      const name = await io.call(calling[1]);
      return io.say(`Calling ${name}.`);
    }

    if (YES.test(u)) {
      const p = this.pending;
      this.pending = null;
      if (!p) return io.say("Sorry, I'm not sure what you'd like me to do. You can ask me anything about the house.");
      if (p.kind === 'ask') return this.askParent(p.question, io);
      if (p.kind === 'end') return this.endHandoff(io);
      return this.startHandoff(p.name, io, true);
    }
    if (NO.test(u)) {
      this.pending = null;
      return io.say('Okay.');
    }
    if (THANKS.test(u)) return io.say("You're welcome.");
    if (GREETING.test(u)) return io.say(this.carer ? `Hi ${this.carer}. Ask me anything about the house.` : 'Hi. Ask me anything about the house.');

    // Any other request replaces a pending offer, so a later "okay" can't fire a stale action.
    this.pending = null;

    const handoff =
      u.match(/\b(?:start (?:a |the )?handoff for|hand(?:ing)? (?:it |things |the house )?over to)\s+([a-z][\w'-]*)/i) ??
      u.match(/^([a-z][\w'-]*) (?:is|will be|'s) (?:babysitting|minding|looking after (?:the kids|maya|her|them|things)|watching (?:the kids|maya|her|them)|taking care of (?:the kids|maya|her|them))\b/i);
    if (handoff && !NOT_A_NAME.has(handoff[1].toLowerCase())) {
      const lang = /\bin (hindi|spanish|tamil|telugu|bengali|marathi|gujarati|kannada|malayalam|punjabi|urdu|tagalog)\b/i.exec(u)?.[1]?.toLowerCase();
      return this.startHandoff(cap(handoff[1]), io, false, lang ? LANGS[lang] : undefined);
    }

    // "We're heading out": the add-on asks who's babysitting.
    if (/^(ok(ay)?,? )?(we'?re|we are|i'?m|i am) (heading|going|leaving|off)( out| now)?( for the (night|evening))?[.!]*$/i.test(u)) return this.startHandoff(undefined, io, false);

    if (/^(please )?pay (the )?(sitter|babysitter|nanny|[a-z][\w'-]*)( now| please)?[.!]*$/i.test(u) && !/^pay (attention|for)\b/i.test(u)) {
      const r = await io.tool('pay_sitter');
      return io.say(textOf(r));
    }

    if (/^(please )?end (the )?handoff\b/i.test(u)) return this.endHandoff(io);
    if (/\b(we'?re|we are|the parents are|parents are) (back|home)\b|\b(mom|dad|mum)(?:'?s| is) (back|home)\b/i.test(u) && !u.endsWith('?')) {
      // The carer and child say "we're back" too, so confirm before ending.
      if (!this.carer) return io.say('Welcome back.');
      this.pending = { kind: 'end' };
      return io.say(`Welcome back. Should I end ${this.carer}'s handoff?`);
    }

    if (DOOR.test(u) && !/\b(key|code|lock)\b/i.test(u)) return this.door(u, io);

    if (PLAY_MESSAGE.test(u) || ((MISSING.test(u) || (UPSET.test(u) && !HURT.test(u))) && !QUESTION_START.test(u))) {
      const r = await io.tool('play_message', { when: PLAY_MESSAGE.test(u) ? 'any' : 'missing' });
      return io.say(textOf(r));
    }

    if (HOW_IS_IT_GOING.test(u)) {
      const r = await io.tool('home_screen');
      return io.say(textOf(r));
    }

    if (/\b(what'?s next|what is next|what now|what'?s the plan|what is the plan|tonight'?s plan|plan for tonight|what (do|should) (i|we) do (next|now)|schedule)\b/i.test(u)) {
      const r = await io.tool('tonight_plan', { announce: false });
      return io.say(textOf(r));
    }

    const where = u.match(/^(?:where(?:'s| is| are| do i find| can i find| do they keep)|find)\s+(?:the |her |his |my |their |maya'?s )?(.+?)\??$/i);
    if (where && !/^(they|them|mom|dad|mum|parents|the parents|her parents|his parents|you|we|i|everyone|anita|rahul)\b/i.test(where[1])) {
      const r = await io.tool('where_is', { item: where[1] });
      if (r.structuredContent?.found === false) return this.askHouse(u, io); // maybe the manual says
      return io.say(textOf(r));
    }

    const ask = u.match(/^(?:can you |could you |please )?ask (?:mom|dad|mum|the parents|her parents|his parents|them|anita|rahul)\b[\s,:]*(?:if |whether |about )?(.*)$/i);
    if (ask) {
      const q = ask[1]?.trim();
      if (!q || /^(something|a question)$/i.test(q)) {
        this.pending = { kind: 'ask_what' };
        return io.say('What should I ask them?');
      }
      return this.askParent(q, io);
    }

    // "Remember: no juice after 7" from a parent teaches the house; during a handoff it's a log entry.
    const remember = /^(?:please )?remember(?: that)?[:,]?\s+(.+)$/i.exec(u);
    if (remember && !this.carer) {
      const r = await io.tool('import_note', { text: cap(remember[1]) });
      if (!r.structuredContent?.handoff_active) return io.say(textOf(r));
    }

    const explicitLog = u.match(/^(?:log|note|write down|remember)(?: that)?[:,]?\s+(.+)$/i);
    if (explicitLog || (!QUESTION_START.test(u) && !u.endsWith('?') && LOG_STATUS.test(u))) {
      const text = explicitLog ? explicitLog[1] : u;
      const kind = /asleep|sleep|bed|woke/i.test(text) ? 'sleep' : /ate|eaten|dinner|milk|snack/i.test(text) ? 'food' : 'note';
      const r = await io.tool('log_event', { text: cap(text), kind });
      const s = r.structuredContent ?? {};
      // Logging never bypasses safety: the server flags emergencies, allergens and medicine.
      if (s.emergency) {
        const e = await this.emergency(io, text);
        return io.say(textOf(e));
      }
      if (s.allergy_alert) return io.say(String(s.allergy_alert));
      if (s.medicine_alert) return io.say(String(s.medicine_alert));
      // Something ran out: the parents are asked to add it to the shopping list.
      const shop = s.shopping_ask as { question: string; shopping_item: string } | undefined;
      if (shop) {
        io.say(textOf(r));
        return io.task('ask_parent_and_wait', { question: shop.question, shopping_item: shop.shopping_item }, (result) => io.say(textOf(result)));
      }
      if (s.plan_change || r.isError) return io.say(textOf(r));
      return io.say(`Got it. ${textOf(r).replace(/^Logged: /, 'I noted: ')}`);
    }

    if (out && !QUESTION_START.test(u) && !u.endsWith('?')) {
      out.declined = true;
      return;
    }
    return this.askHouse(u, io);
  }

  /** Another brain answered: offers made earlier ("Want me to ask?") no longer apply. */
  forgetOffers() {
    if (this.pending?.kind !== 'teachback') this.pending = null;
  }

  private async askHouse(u: string, io: DeviceIO) {
    const r = await io.tool('ask_house', { question: u });
    if (r.isError) return io.say("Sorry, I couldn't check that.");
    const s = r.structuredContent ?? {};
    if (s.emergency) {
      const e = await this.emergency(io, u);
      return io.say(textOf(e));
    }
    if (s.busy_until !== undefined) this.busyUntil = (s.busy_until as string | null) ?? null;
    io.say(textOf(r));
    if (s.suggest_ask_parent && !s.allergy_alert) {
      this.pending = { kind: 'ask', question: u };
      // Food guards and Shadow Parent already end with "I can ask" (in English underneath a translation).
      if (!/\bI can ask\b/i.test(String(s.english ?? textOf(r)))) io.say(`Want me to ask ${this.firstContact}?`);
    }
  }

  /** With no name, the add-on asks on screen who is babysitting (a form). */
  private async startHandoff(name: string | undefined, io: DeviceIO, replace: boolean, language?: string) {
    const args: Record<string, unknown> = { replace };
    if (name) args.carer_name = name;
    if (language) args.language = language;
    const r = await io.tool('start_handoff', args);
    if (r.isError) {
      const s = r.structuredContent ?? {};
      if (s.view === 'handoff_conflict') this.pending = { kind: 'replace', name: String(name ?? s.requested ?? '') };
      return io.say(textOf(r) || "Sorry, I couldn't start the handoff.");
    }
    if (r.structuredContent?.view === 'handoff_cancelled') return io.say(textOf(r)); // the parent cancelled the form
    this.carer = String(r.structuredContent?.carer ?? name ?? '');
    const first = r.structuredContent?.first_contact as string | undefined;
    if (first) this.firstContact = first.replace(/\s*\(.*\)/, '');
    io.say(textOf(r));
    // Straight into the teach-back check, while the parent is still at the door.
    const tb = await io.tool('teachback', {});
    if (!tb.isError && tb.structuredContent?.kind === 'question') {
      this.pending = { kind: 'teachback' };
      io.say(textOf(tb));
    }
  }

  private async endHandoff(io: DeviceIO) {
    const r = await io.tool('end_handoff');
    this.carer = null;
    return io.say(textOf(r));
  }

  /** Starts the emergency script; from then on "done" and "next" move its guide on. */
  private async emergency(io: DeviceIO, description: string) {
    this.pending = null;
    this.inEmergency = true;
    return io.tool('emergency', { description });
  }

  private async door(u: string, io: DeviceIO) {
    const r = await io.tool('door_check', { question: u });
    const s = r.structuredContent ?? {};
    if (s.emergency) {
      const e = await this.emergency(io, u);
      return io.say(textOf(e));
    }
    io.say(textOf(r));
    // The parents see the doorbell photo and can answer from their lock screen.
    const ask = s.ask_parent as { question: string; door_event_id: number } | null | undefined;
    if (ask) io.task('ask_parent_and_wait', { question: ask.question, door_event_id: ask.door_event_id }, (result) => io.say(textOf(result)));
  }

  private askParent(question: string, io: DeviceIO) {
    io.say(
      this.busyUntil
        ? `Okay. ${this.firstContact} asked for urgent questions only until ${this.busyUntil}, so it'll reach them then. I'll tell you the answer.`
        : `Okay, I'm asking ${this.firstContact} now. I'll tell you when they answer.`,
    );
    io.task('ask_parent_and_wait', { question }, (result) => io.say(textOf(result)));
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
