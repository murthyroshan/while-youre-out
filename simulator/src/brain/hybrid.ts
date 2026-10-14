// Rules first, the model only when needed: the way real voice assistants work. The built-in rules
// answer everything they recognise at once (every guided-demo line, "where's the EpiPen", "she's
// asleep", the door), with no model call and no quota. Other languages and phrasings the rules
// don't recognise go to Gemini, which falls back to the rules if it is unavailable. Both share the
// conversation, so the model knows what the rules already asked.
import { GeminiBrain } from './gemini';
import { RuleBrain } from './rules';
import type { Brain, DeviceIO } from './types';

// Letters beyond Latin (Devanagari, Tamil, Arabic...): the rules only understand English.
const OTHER_SCRIPT = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u;

export class HybridBrain implements Brain {
  readonly name = 'Rules first, Gemini when needed';

  constructor(
    private rules: RuleBrain,
    private model: GeminiBrain,
  ) {}

  async handle(raw: string, io: DeviceIO) {
    if (!OTHER_SCRIPT.test(raw)) {
      const said: string[] = [];
      const listening: DeviceIO = {
        ...io,
        say: (t) => {
          said.push(t);
          io.say(t);
        },
      };
      const out: { declined?: boolean } = {};
      await this.rules.handle(raw, listening, out);
      if (!out.declined) return this.model.note(raw, said);
    }
    this.rules.forgetOffers();
    await this.model.handle(raw, io);
  }
}
