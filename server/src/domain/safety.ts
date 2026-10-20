// Deterministic safety rules. No AI here: these decide what the assistant may and may not say.

/** Straight quotes and single spaces, so "can’t" and "can't" are treated the same. */
export function normalise(text: string) {
  return text.replace(/[‘’ʼ`´]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
}

/** The family's own names. The rules below read roles ("the child", "the pet", "the parent"), so
 * they work for any family: names are swapped for roles before a rule reads the text. */
export interface FamilyNames {
  children: string[];
  pets: string[];
  adults: string[];
}
const NO_NAMES: FamilyNames = { children: [], pets: [], adults: [] };
const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** "Leo's lips are swelling" -> "the child's lips are swelling". */
export function withRoles(text: string, names: FamilyNames = NO_NAMES) {
  let t = text;
  const sub = (list: string[], role: string) => {
    for (const n of [...list].sort((a, b) => b.length - a.length)) {
      if (!n.trim()) continue;
      t = t.replace(new RegExp(`\\b${escapeRe(n.trim())}('s)?(?![\\w])`, 'gi'), (_m, s) => (s ? `${role}'s` : role));
    }
  };
  sub(names.children, 'the child');
  sub(names.pets, 'the pet');
  sub(names.adults, 'the parent');
  return t;
}

export type EmergencyKind = 'allergy_breathing' | 'unresponsive' | 'choking' | 'fire' | 'gas' | 'poison' | 'injury' | 'missing' | 'intruder' | 'water' | 'general';

const EMERGENCY_PATTERNS: Array<[EmergencyKind, RegExp]> = [
  ['allergy_breathing', /\b(can'?t|cannot|can not|couldn'?t) (breathe?|breath)\b|\bnot breathing|stopped breathing|(trouble|difficulty|struggling|hard time|problems?) (to )?breath(e|ing)?|hard to breathe?\b|\bwheez(e|es|ing)|\bgasping\b|turning blue|gone blue|lips? (are |is )?(turning )?blue/i],
  ['allergy_breathing', /\b(swell(ing|ed|s)?|swollen|puff(y|ing|ed)( up)?)\b.*\b(lips?|tongue|throat)\b|\b(lips?|tongue|throat)\b.*\b(swell(ing|ed|s)?|swollen|puff(y|ing|ed)( up)?)\b|\bface\b.*\b(swell(ing|ed|s)?|swollen)\b|\b(swell(ing|ed|s)?|swollen)\b.*\bface\b/i],
  ['allergy_breathing', /\b(having|has|had|is having) (an |a )?(allergic reaction|anaphyla\w*)|\banaphyla\w*|\bhives\b|\bbreaking out in (a rash|hives)/i],
  ['allergy_breathing', /\bthroat (is |feels )?(closing|tight|tightening|swelling)|\b(her|his|their|the child's) throat\b.*\bclos(ing|ed)\b/i],
  ['choking', /\b(is |she'?s |he'?s |they'?re |the child'?s |the child is )?chok(e|es|ed|ing)\b/i],
  ['choking', /\bclutch(ing|es|ed)? (at )?(her|his|their|the child's) (throat|neck)\b|\bsomething (is )?stuck in (her|his|their|the child's) throat\b|\b(can'?t|cannot|isn'?t|not) (make (a|any) (sound|noise)|making (a|any) (sound|noise)|speak|talk|cough|cry)\b[^.?!]*\b(swallow\w*|food|bite|eating|ate)\b/i],
  ['unresponsive', /\bunconscious|unresponsive|not responding|(isn'?t|is not|aren'?t|stopped) respond(ing)?|won'?t respond|\bfaint(ed|ing)\b|\b(going to|about to|gonna|might|could) faint\b|\bcollaps(e|ed|ing)\b|\b(can'?t|cannot) wake (her|him|them|the child)( up)?|\b(isn'?t|is not|not) waking( up)?|\b(she|he|the child|they) (won'?t|will not) wake( up)?\b|\bpassed out\b|\b(went|gone|goes|is|going) (all )?limp\b|\band (won'?t|will not|doesn'?t|isn'?t) wak(e|ing)( up)?\b/i],
  ['unresponsive', /\bseizure|convuls|\bfitting\b|\b(jerking|twitching|shaking) (violently|uncontrollably|all over)\b|\b(stiff|rigid) and (jerking|shaking|twitching)\b|\beyes (are )?(rolled|rolling) back\b/i],
  ['injury', /\bbleeding (a lot|badly|heavily|everywhere)|won'?t stop bleeding|\bbleeding\b.{0,25}\b(won'?t|doesn'?t|will not|isn'?t|can'?t) stop|can'?t stop the bleeding|lots of blood|\b(so much|a lot of|tons of|loads of) blood\b|\bblood (is )?(pouring|gushing|spurting|everywhere)\b|\b(gushing|pouring) blood\b|\bhit (his|her|their) head|(she|he|the child|they|the baby) (fell|fall|has fallen) (down|off|from|out)|\bfell down the stairs|\bburn(ed|t)? (her|his|their)\b|\bbroke (her|his) (arm|leg|wrist)|\bbone (is )?sticking out/i],
  ['poison', /\bswallowed (a |an |some |the |her |his )?(pills?|tablets?|battery|batteries|bleach|cleaner|detergent|pod|button battery|magnets?|coin|vitamins)\b|\b(drank|drunk|ate|eaten|got into|chewed) (some |the |a |her |his |my |grandma'?s )?(of the )?(bleach|cleaner|detergent|pills?|medicine|medication|vitamins|laundry pod|dishwasher pod|alcohol|wine|vodka|cigarette|vape|perfume)\b|\bpoison(ed|ing)?\b/i],
  ['missing', /\b(can'?t|cannot) find (the child|her|him|the kids?|the baby)\b|\b(the child|she|he|the baby) (is |'s )?(missing|gone missing|disappeared)\b|\blost (the child|her|him)\b/i],
  ['water', /\bdrown(ing|ed)?\b|\bunder (the )?water\b|\bin the pool\b.*\b(can'?t|not) (swim|breathing)/i],
  ['intruder', /\bbreak(ing)?[- ]in\b|\bbroke in\b|\bintruder\b|\bbroke (the |a |our )?(\w+ )?(window|door|lock)\b|\b(someone|somebody|a man|a woman|a stranger|a person) (is |'s |got )?(inside|in the house)\b|someone (is )?(trying to get in|in the house|breaking)|\bstranger (is )?(in|at|trying)|\b(someone|somebody|a man|a woman|a person|people|they)\b[^.?!]{0,15}\b(shattered|smashed|broke|kicked( in)?|forced( open)?)\b[^.?!]{0,30}\b(window|door|glass|lock)\b|\bfootsteps (downstairs|upstairs|inside|in the (house|basement|hall))\b|\b(hear|hearing|heard) (footsteps|someone|somebody|voices) (downstairs|upstairs|inside|in the (house|basement))\b/i],
  ['fire', /\b(there'?s|there is) (a )?fire\b|\bon fire\b|\bfire in\b|\bcaught fire\b|^fire!*$|\b(fire|smoke) alarm\b(?!.*\b(chirp|chirping|beep|beeping|battery|batteries|low)\b)|\bsmoke (coming|everywhere|in)\b|smells? (like |of )?(smoke|burning)|\bsomething'?s burning|\b(in|into|engulfed in|bursting into|burst into|up in) flames\b|\bflames (are |is )?(coming|everywhere|spreading|shooting)\b|\b(thick|black|heavy) (smoke|cloud)\b[^.?!]*\b(billow\w*|pour\w*|coming|filling|spreading)\b|\bsmoke (is )?(pouring|billowing|filling)\b|\bfull of smoke\b/i],
  ['fire', /\bspark(s|ing|ed)\b|\belectrical fire\b|\bexposed wires?\b|\b(got|getting) (a |an )?(electric )?shock\b|\belectrocut\w*/i],
  ['gas', /\bsmell(s|ing)? (like |of )?gas\b|\bgas leak\b|\brotten eggs?\b[^.?!]*\bsmell|\bsmell\w*\b[^.?!]*\brotten eggs?\b|\bcarbon monoxide|\bco alarm\b(?!.*\b(chirp|beep|battery)\b)/i],
  ['general', /\b(call|calling|dial) (911|999|112|an ambulance|the ambulance|emergency)\b|\bneed (an )?ambulance\b|(?<!\b(?:can|could|will|would) you )\bhelp me\b(?!\s+(?:with|to|find|understand|figure|pick|choose|decide|learn|know|remember|plan|cook|get|make|set|out|please with)\b)|\bemergency\b(?! (contact|number|plan|numbers|contacts))/i],
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
  /\b(what (do|should) i do if|what if|in case|is (a |an )?\w+ (a )?choking hazard|choking hazard|so (she|he|they|it|the child|the pet) (doesn'?t|won'?t|don'?t)|how (do|would) i (know|tell) if|what are the signs|signs of|how to use|how do i use|what happens if)\b/i;
// Phrases that look alarming but are not.
const NOT_EMERGENCY =
  /\b(chok(e|es|ed|ing)|dying|died) (with|of|from) laugh(ter|ing)?\b|\b(light|lighting|build|building|make|making) (a|the) fire\b|\bfireplace|camp ?fire|fire (truck|engine|station|fighter|man|men)|fireman|firework|\bfire tv\b|fire tablet|\bpassed out (on|in) (the )?(couch|sofa|bed|car|chair)\b.*\b(tired|watching|tv|movie|asleep)|\b(eyes?|face) (is |are )?puffy from (crying|sleep|her nap|his nap|the nap)|band-?aid fell|button fell|book fell|\bso (he|she|they|it|the pet|the dog|the child|the baby) (won'?t|doesn'?t|don'?t) wake\b|swallowed (her |his |the |some )?medicine (fine|without|okay|ok|no problem)/i;

const FOOD_WORDS =
  /\b(eat|eats|ate|eating|eaten|food|snacks?|cookies?|biscuits?|cand(y|ies)|chocolates?|sweets?|desserts?|ice cream|cakes?|cupcakes?|juice|milk|drinks?|dinner|lunch|breakfast|nuts?|peanuts?|peanut butter|almonds?|cashews?|hazelnuts?|walnuts?|pecans?|pistachios?|treats?|fruits?|chips|crisps|meals?|hungry|dip|bread|toast|cereal|yogh?urt|cheese|eggs?|pizza|popcorn|gum|lollipops?|smoothies?|granola|bars?|snickers|nutella|reese'?s|m&ms?|kit ?kat|oreos?|goldfish|crackers?|pb ?& ?j|popsicles?|ice pops?|lollies|marshmallows?|jelly beans?|gummy bears?|gummies|brownies?|muffins?|donuts?|doughnuts?|pancakes?|waffles?|sandwich(es)?|noodles|pasta|rice|fries|nuggets|apples?|bananas?|grapes?|berries|strawberr(y|ies)|soda|lemonade|hot chocolate|cocoa|leftovers|biscuits?|sweeties|chips|nuts|satay|pad thai|trail mix|pesto|curry|stir[- ]?fry|kung pao|brittle|nougat|baklava|macarons?|praline|marzipan|dumplings?|tacos?|burgers?|hot ?dogs?|soup|salad|dal|sushi|takeout|takeaway|snack bars?)\b/i;
const MEDICINE_WORDS =
  /\b(medicines?|medications?|meds|pills?|syrup|doses?|dosage|calpol|tylenol|ibuprofen|motrin|advil|aspirin|paracetamol|acetaminophen|melatonin|vitamins?|gummies|gummy vitamins|fever|inhaler|puffer|antihistamines?|benadryl|zyrtec|claritin|epipen|eye drops|cough syrup|antibiotics?|cream for)\b|\b(has|have|running|got|with) a (high |slight )?temperature\b|\b(her|his|their) temperature\b/i;

// A worry about how a child is, short of an emergency: the assistant never judges how serious it is.
const HEALTH_WORDS =
  /\b(rash(es)?|spots|bump(ed|s)? (her|his|their) head|bonked|concussion|vomit(s|ed|ing)?|threw up|throw(s|ing)? up|feels? sick|is sick|been sick|unwell|diarrh(o)?ea|tummy ?ache|stomach ?ache|headache|ear ?ache|sore throat|cough(s|ing)?|nose ?bleed|bleeding|cut (her|his|their)(self|selves)?|scraped?|bruised?|stung|sting|bitten|(bug|insect|spider|mosquito|tick|dog) bite|splinter|a burn\b|dizzy|lethargic|limping|sprain(ed)?|twisted (her|his) (ankle|wrist)|hurt (her|his|their)(self|selves)?|is (it|this|that) serious|should i (be worried|worry))\b/i;

const PET_SUBJECT = /\b(the pet|the dog|the cat|the puppy|the kitten|dogs?|cats?|puppy|kitten)\b/i;
// Foods and things that are poisonous to dogs and cats.
const PET_TOXIC =
  /\b(chocolates?|cocoa|brownies?|grapes?|raisins?|xylitol|sugar-?free gum|onions?|garlic|macadamias?|avocados?|ibuprofen|paracetamol|acetaminophen|tylenol|advil|pills?|tablets?|medicines?|vitamins?|supplements?|rat poi?s[eo]n|poi?s[eo]n|pesticides?|insecticides?|slug (bait|pellets)|antifreeze|lil(y|ies)|cannabis|weed|coffee|caffeine|alcohol|wine|beer)\b/i;

// Things a household assistant must never store or reveal.
const SECRET_PATTERNS =
  /\b(alarm code|door code|gate code|garage code|keypad|lock ?box|pin (code|number)|the pin\b|pin for|password|passcode|passwords|wi-?fi code|safe combination|combination (to|for)|spare key|key is under|key under|hidden key|code (for|to) (the )?(front |back |garage |side )?(door|alarm|gate|garage|lock|safe|house)|(credit|debit) card|card number|bank|social security|ssn)\b/i;
const RETURN_TIME =
  /\bwhen(?:'s| is| are| will| do| does) (they|mom|dad|mum|you|the parents|the parent|her parents|his parents|their parents)\b|\bwhat time (are|will|is|do|does) .*\b(home|back)\b|\bwhen\b.*\b(get|be|come|coming|getting) (home|back)\b|\bhow long (will|are|is|until) .*\b(out|gone|away|back|home)\b|\b(are|is) (they|mom|dad|the parents|the parent) (back|home) (soon|yet)\b|\bwhere (are|is|did) (they|mom|dad|mum|the parents|the parent|her parents|his parents)\b/i;

const NOT_EMERGENCY_ALL = new RegExp(NOT_EMERGENCY.source, 'gi');

export type QuestionCategory = 'emergency' | 'safety_info' | 'medicine' | 'health' | 'food' | 'return_time' | 'secret' | 'general';

export function emergencyKind(raw: string, names: FamilyNames = NO_NAMES): EmergencyKind | null {
  const text = withRoles(normalise(raw), names);
  if (HYPOTHETICAL.test(text)) return null;
  // Harmless phrases ("Fire TV", "the fireplace", "choking with laughter") are taken out of the
  // message, not used to wave all of it through: "we're watching Fire TV and now she can't
  // breathe" is still an emergency.
  const rest = text.replace(NOT_EMERGENCY_ALL, ' ');
  for (const [kind, re] of EMERGENCY_PATTERNS) if (re.test(rest)) return kind;
  return null;
}

export function classifyQuestion(raw: string, names: FamilyNames = NO_NAMES): QuestionCategory {
  const q = withRoles(normalise(raw), names);
  if (emergencyKind(q)) return 'emergency';
  if (!NOT_EMERGENCY.test(q) && HYPOTHETICAL.test(q) && EMERGENCY_PATTERNS.some(([, re]) => re.test(q))) return 'safety_info';
  if (/\bhow (do|would|should|can) (i|you|we) (use|give)\b.*\b(epi-?pen|auto-?injector)|\b(epi-?pen|auto-?injector)\b.*\bhow\b/i.test(q)) return 'safety_info';
  if (SECRET_PATTERNS.test(q)) return 'secret';
  if (RETURN_TIME.test(q)) return 'return_time';
  if (MEDICINE_WORDS.test(q)) return 'medicine';
  if (HEALTH_WORDS.test(q)) return 'health';
  if (FOOD_WORDS.test(q) && !(PET_SUBJECT.test(q) && !/\b(the child|the kids?|the baby|she|her|he|him)\b/i.test(q))) return 'food';
  return 'general';
}

export function isEmergency(text: string, names: FamilyNames = NO_NAMES) {
  return emergencyKind(text, names) !== null;
}

/** "Can Bruno have some grapes?": the food, if it can poison a dog or cat. */
export function petToxicAsk(raw: string, names: FamilyNames = NO_NAMES): string | null {
  const t = withRoles(normalise(raw), names);
  if (!PET_SUBJECT.test(t) || /\b(the child|the kids?|the baby)\b/i.test(t)) return null;
  return PET_TOXIC.exec(t)?.[1]?.toLowerCase() ?? null;
}

/** "Bruno ate a chocolate bar": what the pet got into, if it can poison a dog or cat. */
export function petPoison(raw: string, names: FamilyNames = NO_NAMES): string | null {
  const t = withRoles(normalise(raw), names);
  // About the child too ("Maya and the dog ate…")? Then it's the child's safety rules that answer.
  if (/\b(the child|the kids?|the baby)\b[^.?!]{0,30}\b(ate|eaten|eats|got into|swallowed|chewed|licked|drank)\b/i.test(t)) return null;
  const m = /\b(the pet|the dog|the cat|the puppy|the kitten|dog|cat|puppy|kitten)\b[^.?!]{0,40}?\b(ate|eaten|eats|got into|swallowed|chewed|licked( up)?|drank|stole|snatched|grabbed|scarfed( down)?|gobbled( up)?|wolfed( down)?|devoured|vacuumed up|tore (open|into)|got hold of)\b[^.?!]{0,50}/i.exec(t);
  if (!m) return null;
  // "Maya dropped some macadamia nuts and Bruno snatched them": what it was can come first.
  const sentence = t.slice(t.slice(0, m.index).search(/[^.?!]*$/)).split(/[.?!]/)[0];
  return (PET_TOXIC.exec(m[0]) ?? PET_TOXIC.exec(sentence))?.[1]?.toLowerCase() ?? null;
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
export const HEALTH_GUARD =
  "I can't judge how serious it is. If there's trouble breathing, swelling of the lips or face, she's hard to wake, or keeps vomiting, say \"emergency\". Otherwise I can ask a parent right now.";
export const HEALTH_GUARD_SPOKEN = "I can't judge how serious it is. If breathing is hard or she's hard to wake, say \"emergency\". I can ask a parent now.";
export const SAFETY_INFO_NOTE =
  "If it happens, say \"emergency\" and I'll read out the parents' plan step by step and alert them.";

// Words the assistant must never use to describe food or medicine.
export const FORBIDDEN_REASSURANCE = /\b(safe to (eat|give|have)|it'?s safe|that'?s safe|go ahead|yes,? (she|he|they) can (eat|have))\b/i;

export const FOOD_GUARD_SPOKEN = "Unsure? Don't give it. I can ask a parent.";
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
