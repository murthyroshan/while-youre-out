// Deterministic safety rules. No AI here: these decide what the assistant may and may not say.

/** Straight quotes and single spaces, so "can’t" and "can't" are treated the same. */
export function normalise(text: string) {
  return text.replace(/[‘’ʼ`´]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
}

export type EmergencyKind = 'allergy_breathing' | 'unresponsive' | 'choking' | 'fire' | 'gas' | 'poison' | 'injury' | 'missing' | 'intruder' | 'water' | 'general';

const EMERGENCY_PATTERNS: Array<[EmergencyKind, RegExp]> = [
  ['allergy_breathing', /\b(can'?t|cannot|can not|couldn'?t) (breathe?|breath)\b|\bnot breathing|stopped breathing|(trouble|difficulty|struggling|hard time|problems?) (to )?breath(e|ing)?|hard to breathe?\b|\bwheez(e|es|ing)|\bgasping\b|turning blue|gone blue|lips? (are |is )?(turning )?blue/i],
  ['allergy_breathing', /\b(swell(ing|ed|s)?|swollen|puff(y|ing|ed)( up)?)\b.*\b(lips?|tongue|throat)\b|\b(lips?|tongue|throat)\b.*\b(swell(ing|ed|s)?|swollen|puff(y|ing|ed)( up)?)\b|\bface\b.*\b(swell(ing|ed|s)?|swollen)\b|\b(swell(ing|ed|s)?|swollen)\b.*\bface\b/i],
  ['allergy_breathing', /\b(having|has|had|is having) (an |a )?(allergic reaction|anaphyla\w*)|\banaphyla\w*|\bhives\b|\bbreaking out in (a rash|hives)/i],
  ['choking', /\b(is |she'?s |he'?s |they'?re |maya'?s |maya is )?chok(e|es|ed|ing)\b/i],
  ['unresponsive', /\bunconscious|unresponsive|not responding|won'?t respond|\bfaint(ed|ing)?\b|\bcollaps(e|ed|ing)\b|\b(can'?t|cannot) wake (her|him|them|maya)( up)?|\b(isn'?t|is not|not) waking( up)?|\b(she|he|maya|they) (won'?t|will not) wake( up)?\b|\bpassed out\b/i],
  ['unresponsive', /\bseizure|convuls|\bfitting\b/i],
  ['injury', /\bbleeding (a lot|badly|heavily|everywhere)|won'?t stop bleeding|lots of blood|\bhit (his|her|their) head|(she|he|maya|they|the baby) (fell|fall|has fallen) (down|off|from|out)|\bfell down the stairs|\bburn(ed|t)? (her|his|their)\b|\bbroke (her|his) (arm|leg|wrist)|\bbone (is )?sticking out/i],
  ['poison', /\bswallowed (a |an |some |the |her |his )?(pills?|tablets?|battery|batteries|bleach|cleaner|detergent|pod|button battery|magnets?|coin|vitamins)\b|\b(drank|drunk|ate|eaten|got into|chewed) (some |the |a |her |his |my |grandma'?s )?(of the )?(bleach|cleaner|detergent|pills?|medicine|medication|vitamins|laundry pod|dishwasher pod|alcohol|wine|vodka|cigarette|vape|perfume)\b|\bpoison(ed|ing)?\b/i],
  ['missing', /\b(can'?t|cannot) find (maya|her|him|the kids?|the baby)\b|\b(maya|she|he|the baby) (is |'s )?(missing|gone missing|disappeared)\b|\blost (maya|her|him)\b/i],
  ['water', /\bdrown(ing|ed)?\b|\bunder (the )?water\b|\bin the pool\b.*\b(can'?t|not) (swim|breathing)/i],
  ['intruder', /\bbreak(ing)?[- ]in\b|\bbroke in\b|\bintruder\b|someone (is )?(trying to get in|in the house|breaking)|\bstranger (is )?(in|at|trying)/i],
  ['fire', /\b(there'?s|there is) (a )?fire\b|\bon fire\b|\bfire in\b|\bcaught fire\b|^fire!*$|\b(fire|smoke) alarm\b(?!.*\b(chirp|chirping|beep|beeping|battery|batteries|low)\b)|\bsmoke (coming|everywhere|in)\b|smells? (like |of )?(smoke|burning)|\bsomething'?s burning/i],
  ['gas', /\bsmell(s|ing)? (like |of )?gas\b|\bgas leak\b|\bcarbon monoxide|\bco alarm\b(?!.*\b(chirp|beep|battery)\b)/i],
  ['general', /\b(call|calling|dial) (911|999|112|an ambulance|the ambulance|emergency)\b|\bneed (an )?ambulance\b|\bhelp me\b|\bemergency\b(?! (contact|number|plan|numbers|contacts))/i],
  // Common phrasings in Hindi and Spanish, so a grandparent or nanny is caught instantly without an AI.
  ['allergy_breathing', /(सांस|साँस|सास)\s*(नहीं|नही)|सांस लेने में (दिक्कत|तकलीफ)|(होंठ|होठ|जीभ|गला|चेहरा)\s*.*सूज|saa?ns\s+nahi|no puede respirar|no respira|le cuesta respirar|se le (hinch|est[aá] hinchando)|reacci[oó]n al[eé]rgica/i],
  ['choking', /दम घुट|गले में (कुछ )?फंस|se est[aá] ahogando|se atragant/i],
  ['unresponsive', /बेहोश|होश नहीं|उठ नहीं (रही|रहा)|behosh|inconsciente|no despierta|se desmay[oó]|convulsi/i],
  ['fire', /\bआग\b|आग लग|धुआं|धुँआ|\bincendio\b|hay fuego|\bfuego\b/i],
  ['gas', /गैस की (बदबू|गंध)|huele a gas|fuga de gas/i],
  ['poison', /(ज़हर|जहर|ब्लीच|दवाई|दवा).*(पी|खा) (लिया|ली|गई|गया)|se (tom[oó]|bebi[oó]) (cloro|lej[ií]a|pastillas|veneno)|envenen/i],
  ['missing', /(माया|बच्ची|बच्चा) (नहीं मिल|गायब)|no encuentro a|se perdi[oó]/i],
];

// Questions about what to do *if* something happens: answered from the plan, nobody is alerted.
const HYPOTHETICAL =
  /\b(what (do|should) i do if|what if|in case|is (a |an )?\w+ (a )?choking hazard|choking hazard|so (she|he|they|it|maya|bruno) (doesn'?t|won'?t|don'?t)|how (do|would) i (know|tell) if|what are the signs|signs of|how to use|how do i use|what happens if)\b/i;
// Phrases that look alarming but are not.
const NOT_EMERGENCY =
  /\bfireplace|camp ?fire|fire (truck|engine|station|fighter|man|men)|fireman|firework|\bfire tv\b|fire tablet|\bpassed out (on|in) (the )?(couch|sofa|bed|car|chair)\b.*\b(tired|watching|tv|movie|asleep)|\b(eyes?|face) (is |are )?puffy from (crying|sleep|her nap|his nap|the nap)|band-?aid fell|button fell|book fell|\bso (he|she|they|it|bruno|the dog) (won'?t|doesn'?t|don'?t) wake\b|swallowed (her |his |the |some )?medicine (fine|without|okay|ok|no problem)/i;

const FOOD_WORDS =
  /\b(eat|eats|ate|eating|eaten|food|snacks?|cookies?|biscuits?|cand(y|ies)|chocolates?|sweets?|desserts?|ice cream|cakes?|cupcakes?|juice|milk|drinks?|dinner|lunch|breakfast|nuts?|peanuts?|peanut butter|almonds?|cashews?|hazelnuts?|walnuts?|pecans?|pistachios?|treats?|fruits?|chips|crisps|meals?|hungry|dip|bread|toast|cereal|yogh?urt|cheese|eggs?|pizza|popcorn|gum|lollipops?|smoothies?|granola|bars?|snickers|nutella|reese'?s|m&ms?|kit ?kat|oreos?|goldfish|crackers?|pb ?& ?j|popsicles?|ice pops?|lollies|marshmallows?|jelly beans?|gummy bears?|gummies|brownies?|muffins?|donuts?|doughnuts?|pancakes?|waffles?|sandwich(es)?|noodles|pasta|rice|fries|nuggets|apples?|bananas?|grapes?|berries|strawberr(y|ies)|soda|lemonade|hot chocolate|cocoa|leftovers|biscuits?|sweeties|chips|nuts)\b/i;
const MEDICINE_WORDS =
  /\b(medicines?|medications?|meds|pills?|syrup|doses?|dosage|calpol|tylenol|ibuprofen|motrin|advil|aspirin|paracetamol|acetaminophen|melatonin|vitamins?|gummies|gummy vitamins|fever|inhaler|puffer|antihistamines?|benadryl|zyrtec|claritin|epipen|eye drops|cough syrup|antibiotics?|cream for)\b|\b(has|have|running|got|with) a (high |slight )?temperature\b|\b(her|his|their) temperature\b/i;

// Things a household assistant must never store or reveal.
const SECRET_PATTERNS =
  /\b(alarm code|door code|gate code|garage code|keypad|lock ?box|pin (code|number)|the pin\b|pin for|password|passcode|passwords|wi-?fi code|safe combination|combination (to|for)|spare key|key is under|key under|hidden key|code (for|to) (the )?(front |back |garage |side )?(door|alarm|gate|garage|lock|safe|house)|(credit|debit) card|card number|bank|social security|ssn)\b/i;
const RETURN_TIME =
  /\bwhen(?:'s| is| are| will| do| does) (they|mom|dad|mum|you|the parents|her parents|his parents|their parents|anita|rahul)\b|\bwhat time (are|will|is|do|does) .*\b(home|back)\b|\bwhen\b.*\b(get|be|come|coming|getting) (home|back)\b|\bhow long (will|are|is|until) .*\b(out|gone|away|back|home)\b|\b(are|is) (they|mom|dad|the parents) (back|home) (soon|yet)\b|\bwhere (are|is|did) (they|mom|dad|mum|the parents|her parents|his parents)\b/i;

export type QuestionCategory = 'emergency' | 'safety_info' | 'medicine' | 'food' | 'return_time' | 'secret' | 'general';

export function emergencyKind(raw: string): EmergencyKind | null {
  const text = normalise(raw);
  if (HYPOTHETICAL.test(text) || NOT_EMERGENCY.test(text)) return null;
  for (const [kind, re] of EMERGENCY_PATTERNS) if (re.test(text)) return kind;
  return null;
}

export function classifyQuestion(raw: string): QuestionCategory {
  const q = normalise(raw);
  if (emergencyKind(q)) return 'emergency';
  if (!NOT_EMERGENCY.test(q) && HYPOTHETICAL.test(q) && EMERGENCY_PATTERNS.some(([, re]) => re.test(q))) return 'safety_info';
  if (SECRET_PATTERNS.test(q)) return 'secret';
  if (RETURN_TIME.test(q)) return 'return_time';
  if (MEDICINE_WORDS.test(q)) return 'medicine';
  if (FOOD_WORDS.test(q)) return 'food';
  return 'general';
}

export function isEmergency(text: string) {
  return emergencyKind(text) !== null;
}

export function containsSecret(text: string) {
  return SECRET_PATTERNS.test(normalise(text)) || /\b\d{4,}\b/.test(text) && /\b(code|pin|password|combination)\b/i.test(text);
}

export function mentionsMedicine(text: string) {
  return MEDICINE_WORDS.test(normalise(text));
}

// The guard sentence attached to every food or medicine answer. It never says "safe" or "yes".
// The full sentence is on the card; the spoken one is shorter (Echo Show replies are heard).
export const FOOD_GUARD =
  "I can't say whether a specific food is safe. Check the label, and if you're not sure, don't give it. I can ask a parent right now.";
export const MEDICINE_GUARD =
  "I never decide on medicine or doses. Don't give any medicine unless a parent tells you to directly. I can ask a parent right now.";
export const SECRET_REFUSAL =
  "That's something the parents keep private, so I can't share it. If it's important, I can ask them for you.";
export const RETURN_TIME_REFUSAL =
  "The parents keep their plans private, but they're reachable. If you need them, I can ask them for you.";
export const SAFETY_INFO_NOTE =
  "If it happens, say \"emergency\" and I'll read out the parents' plan step by step and alert them.";

// Words the assistant must never use to describe food or medicine.
export const FORBIDDEN_REASSURANCE = /\b(safe to (eat|give|have)|it'?s safe|that'?s safe|go ahead|yes,? (she|he|they) can (eat|have))\b/i;

export const FOOD_GUARD_SPOKEN = "If you're not sure, don't give it. I can ask a parent.";
export const MEDICINE_GUARD_SPOKEN = "Don't give any medicine unless a parent tells you to. I can ask them.";

/** Echo Show replies are heard, not read: a spoken reply stays within this many words. */
export const SPOKEN_WORDS = 30;
export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;
/** The first sentence of a parent's note, in their exact words (the card shows the rest). */
export const firstSentence = (s: string) => /^.*?[.!?](?=\s|$)/.exec(s.trim())?.[0] ?? s.trim();
/** Always the first line, then more lines while they fit in the budget. */
export function fitSpoken(lines: string[], budget = SPOKEN_WORDS): string[] {
  const out: string[] = [];
  let used = 0;
  for (const line of lines) {
    const n = wordCount(line);
    if (out.length && used + n > budget) continue;
    out.push(line);
    used += n;
  }
  return out;
}
