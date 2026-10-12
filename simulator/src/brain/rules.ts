import { textOf } from '../mcp';
// The same deterministic emergency rules the server uses, so the device never routes an
// emergency into "where is" or "ask a parent" first.
import { isEmergency } from '../../../server/src/domain/safety';
import type { Brain, DeviceIO } from './types';

const QUESTION_START = /^(can|could|is|are|was|were|what|when|where|how|should|does|do|did|may|why|which|who|whose|will|would|has|have)\b/i;
const LOG_STATUS =
  /\b(is |was |went |fell )?(asleep|to bed|to sleep|woke( up)?|ate|eaten|had (her|his|their)? ?(dinner|bath|milk|snack)|threw up|brushed|took (her|his) bath|walked|fed bruno|is crying|was crying|gave (her|him) )\b/i;
// Words that are never a carer's name ("She is watching TV", "Who is babysitting?").
const NOT_A_NAME = new Set(
  'who what which she he they it someone somebody nobody everyone mom dad mum daddy mommy maya bruno the a an this that there here i you we my her his our their your anita rahul'.split(' '),
);
// Confirmations only count when that's all the person said ("Okay, she can't breathe" is not a yes).
const YES = /^(yes|yeah|yep|yup|sure|ok|okay|yes please|please|please do|go ahead|do it|ask (them|her|him)|ask)[.!]*$/i;
const NO = /^(no|nope|no thanks|never ?mind|don'?t|not now|cancel|no,? don'?t)[.!]*$/i;
const SMALL_TALK = /^(thanks|thank you|thank you so much|cool|great|got it|alright|hi|hello|hey)[.!]*$/i;

type Pending = { kind: 'ask'; question: string } | { kind: 'end' } | { kind: 'replace'; name: string };

/**
 * A deterministic stand-in for the Alexa+ language model. It needs no API key, so the
 * demo works anywhere, and it maps plain speech to the add-on's tools with simple rules.
 */
export class RuleBrain implements Brain {
  readonly name = 'Rules (no AI key needed)';
  private pending: Pending | null = null;
  private firstContact = 'a parent';
  private carer: string | null = null;

  async handle(raw: string, io: DeviceIO) {
    const u = raw
      .trim()
      .replace(/^(hey |ok |okay )?alexa[,.!\s]*/i, '')
      .trim();
    if (!u) return;

    // Safety first: anything that sounds like an emergency skips every other rule.
    if (isEmergency(u)) {
      this.pending = null;
      const e = await io.tool('emergency', { description: u });
      return io.say(textOf(e));
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
    if (SMALL_TALK.test(u)) return io.say("You're welcome.");

    // Any other request replaces a pending offer, so a later "okay" can't fire a stale action.
    this.pending = null;

    const handoff =
      u.match(/\b(?:start (?:a |the )?handoff for|hand(?:ing)? (?:it |things |the house )?over to)\s+([a-z][\w'-]*)/i) ??
      u.match(/^([a-z][\w'-]*) (?:is|will be|'s) (?:babysitting|minding|looking after (?:the kids|maya|her|them|things)|watching (?:the kids|maya|her|them)|taking care of (?:the kids|maya|her|them))\b/i);
    if (handoff && !NOT_A_NAME.has(handoff[1].toLowerCase())) return this.startHandoff(cap(handoff[1]), io, false);

    if (/^(please )?end (the )?handoff\b/i.test(u)) return this.endHandoff(io);
    if (/\b(we'?re|we are|the parents are|parents are) (back|home)\b|\b(mom|dad|mum)(?:'?s| is) (back|home)\b/i.test(u) && !u.endsWith('?')) {
      // The carer and child say "we're back" too, so confirm before ending.
      if (!this.carer) return io.say('Welcome back.');
      this.pending = { kind: 'end' };
      return io.say(`Welcome back. Should I end ${this.carer}'s handoff?`);
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
      if (!q) return io.say('What should I ask them?');
      return this.askParent(q, io);
    }

    const explicitLog = u.match(/^(?:log|note|write down)(?: that)?[:,]?\s+(.+)$/i);
    if (explicitLog || (!QUESTION_START.test(u) && !u.endsWith('?') && LOG_STATUS.test(u))) {
      const text = explicitLog ? explicitLog[1] : u;
      const kind = /asleep|sleep|bed|woke/i.test(text) ? 'sleep' : /ate|eaten|dinner|milk|snack/i.test(text) ? 'food' : 'note';
      const r = await io.tool('log_event', { text: cap(text), kind });
      const s = r.structuredContent ?? {};
      // Logging never bypasses safety: the server flags emergencies, allergens and medicine.
      if (s.emergency) {
        const e = await io.tool('emergency', { description: text });
        return io.say(textOf(e));
      }
      if (s.allergy_alert) return io.say(String(s.allergy_alert));
      if (s.medicine_alert) return io.say(String(s.medicine_alert));
      if (r.isError) return io.say(textOf(r));
      return io.say(`Got it. ${textOf(r).replace(/^Logged: /, 'I noted: ')}`);
    }

    return this.askHouse(u, io);
  }

  private async askHouse(u: string, io: DeviceIO) {
    const r = await io.tool('ask_house', { question: u });
    if (r.isError) return io.say("Sorry, I couldn't check that.");
    const s = r.structuredContent ?? {};
    if (s.emergency) {
      const e = await io.tool('emergency', { description: u });
      return io.say(textOf(e));
    }
    io.say(textOf(r));
    if (s.suggest_ask_parent && !s.allergy_alert) {
      this.pending = { kind: 'ask', question: u };
      io.say(`Want me to ask ${this.firstContact}?`);
    }
  }

  private async startHandoff(name: string, io: DeviceIO, replace: boolean) {
    const r = await io.tool('start_handoff', { carer_name: name, replace });
    if (r.isError) {
      if (r.structuredContent?.view === 'handoff_conflict') this.pending = { kind: 'replace', name };
      return io.say(textOf(r) || "Sorry, I couldn't start the handoff.");
    }
    this.carer = name;
    const first = r.structuredContent?.first_contact as string | undefined;
    if (first) this.firstContact = first.replace(/\s*\(.*\)/, '');
    return io.say(textOf(r));
  }

  private async endHandoff(io: DeviceIO) {
    const r = await io.tool('end_handoff');
    this.carer = null;
    return io.say(textOf(r));
  }

  private askParent(question: string, io: DeviceIO) {
    io.say(`Okay, I'm asking ${this.firstContact} now. I'll tell you when they answer.`);
    io.task('ask_parent_and_wait', { question }, (result) => io.say(textOf(result)));
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
