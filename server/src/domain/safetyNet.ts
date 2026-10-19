// A second pair of eyes for emergencies: the rules in safety.ts are the floor (instant, the same
// every time, no AI); when they find nothing but the words hint at danger, an AI model is asked too,
// with a short deadline. It can only add caution: it can turn "not an emergency" into "emergency",
// never the other way, and it is never asked about something the rules already caught. If it's slow,
// busy or down, the rules' answer stands.
import type { AiClient } from '../ai/gemini.js';
import { withRoles, normalise, type FamilyNames } from './safety.js';

/** Words that might mean danger. Deliberately broad: a false hint only costs a quick AI check. */
const HINT =
  /\b(spark\w*|smok\w*|burn\w*|fire|flame\w*|gas|smell\w*|leak\w*|flood\w*|water|electric\w*|shock\w*|wire\w*|outlet|socket|blood\w*|bleed\w*|cut|hurt\w*|injur\w*|fell|fall\w*|fallen|head|breath\w*|chok\w*|gag\w*|cough\w*|blue|pale|grey|gray|limp|floppy|faint\w*|dizzy|confus\w*|seiz\w*|shak\w*|fit|unconscious|unresponsive|wake|waking|asleep|swallow\w*|ate|drank|drink\w*|pill\w*|tablet\w*|bleach|chemical\w*|poison\w*|battery|batteries|magnet\w*|swell\w*|swollen|rash|hives|itch\w*|vomit\w*|threw up|throwing up|fever|hot|cold|stuck|trapped|missing|lost|gone|find|inside|broke\w*|break\w*|window|stranger|someone|man|men|door|scream\w*|crying|help|scared|panic\w*|weird|wrong|strange|can'?t|won'?t|not)\b/i;

export const mightBeDanger = (text: string) => HINT.test(normalise(text));

const SYSTEM = `You check one thing a babysitter said to a home assistant. Is it an emergency that needs 911 (or local emergency services) right now: someone not breathing or struggling to breathe, choking, unconscious or unresponsive, a seizure, serious bleeding, a severe allergic reaction, a serious fall or head injury, poisoning, fire, smoke, sparking electrics, a gas leak, a break-in or intruder, a child missing, drowning? Answer emergency=true only for something happening now, not a question about what to do if, not a past event that is over, not a minor bump or a mild symptom. When unsure whether it is happening now and serious, answer true.`;
const SCHEMA = {
  type: 'object',
  properties: { emergency: { type: 'boolean' }, why: { type: 'string' } },
  required: ['emergency', 'why'],
};

/**
 * The AI's view, only when the rules found nothing and the words hint at danger. null means "no
 * change": no AI, no hint, too slow, or the AI agrees it isn't an emergency.
 */
export async function aiSeesEmergency(ai: AiClient, said: string, names: FamilyNames, timeoutMs = 2_000): Promise<{ why: string } | null> {
  if (!ai.available || !mightBeDanger(said)) return null;
  let timer: NodeJS.Timeout | undefined;
  try {
    const asked = ai.generateJson<{ emergency: boolean; why: string }>({
      system: SYSTEM,
      // Roles, not names: the model doesn't need to know who the family is.
      parts: [{ text: withRoles(normalise(said), names).slice(0, 500) }],
      schema: SCHEMA,
      timeoutMs,
    });
    // The deadline is ours to keep, whatever the client does with it.
    const late = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), timeoutMs)));
    const r = await Promise.race([asked, late]);
    const data = r?.data;
    return data?.emergency === true ? { why: String(data.why ?? '').slice(0, 200) } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
