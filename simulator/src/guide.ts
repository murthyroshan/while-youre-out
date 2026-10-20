// The demo, in the order a judge would try it (and the video tells it): one step at a time.
// say: what the sitter says. ring: the doorbell. bee: what Mom tells her Bee. door: Mom unlocks the front door from her
// phone. approve: Mom approves the dinner order from her phone. paste: Mom pastes a message into her phone and confirms
// what it learned.
export type TourAction = { say: string } | { ring: string } | { bee: string } | { door: 'unlock' } | { approve: 'order' } | { paste: string };
export interface GuideStep {
  title: string;
  note: string;
  /** Moves the house clock (demo mode) to [day, "HH:MM"] when the step starts. */
  clock?: [string, string];
  actions: TourAction[];
}
const say = (...lines: string[]): TourAction[] => lines.map((l) => ({ say: l }));
export const GUIDE: GuideStep[] = [
  // Parents told us setup decides whether they'd keep using it: so the evening starts with it.
  { title: 'Mom sets it up', clock: ['Sat', '17:45'], note: 'Mom pastes the WhatsApp message she’d send the sitter anyway. Each line becomes a house rule she confirms on her phone; nothing is used until she does. The Echo Show answers from it at once.', actions: [{ paste: 'Hi Priya! Maya can have one small yogurt after dinner. Bruno isn’t allowed on the sofa. Thanks!' }, ...say('Can Maya have a yogurt?')] },
  { title: 'Mom hands over to Priya', clock: ['Sat', '18:00'], note: 'The Echo Show becomes tonight’s screen, then checks Priya knows three key things.', actions: say('Priya is babysitting tonight', 'Peanuts', 'In the kitchen drawer by the stove', 'Anita') },
  { title: 'Priya asks questions', note: 'Answers come in the parents’ own words. Food always gets a safety check.', actions: say('Can Maya have the cookies on the counter?', "Where's the EpiPen?", 'Can she watch another episode?') },
  { title: 'Dinner', clock: ['Sat', '18:20'], note: 'Maya won’t eat the dal. Alexa offers only what’s safe for her peanut allergy; Mom approves the order on her phone, and the delivery is expected at the door.', actions: [...say("She won't eat the dal. Can we order dinner?", 'Order the mac and cheese'), { approve: 'order' }, ...say("What's next?")] },
  { title: 'The evening goes on', clock: ['Sat', '18:40'], note: 'Mom tells her Bee the nap ran late: bedtime moves by the parents’ own rule. The TV starts its one-hour limit. The diapers run out: Mom adds them to the list from her phone.', actions: [...say('Maya is watching cartoons'), { bee: 'Maya napped until 5 today' }, ...say('We ran out of diapers')] },
  { title: 'Dinner arrives', clock: ['Sat', '18:50'], note: 'The doorbell rings: it’s the dinner Mom ordered, so Alexa knows it’s expected.', actions: [{ ring: 'delivery' }, ...say("Someone's at the door. Is that our dinner?")] },
  { title: 'Bath time', clock: ['Sat', '19:45'], note: 'The living room TV pauses itself, with a message from Mom: the house follows the parents’ rules.', actions: say("What's next?") },
  { title: 'A knock at the door', clock: ['Sat', '20:10'], note: 'Nobody is expected, so: don’t open. The doorbell photo goes to Mom’s phone.', actions: [{ ring: 'stranger' }, ...say("Someone's knocking, should I open the door?")] },
  { title: 'Ask a parent', note: 'Open the parent’s phone below and answer. The Echo Show reads the reply out.', actions: say('Can she sleep in your bed?', 'Yes') },
  { title: 'Emergency', note: 'A fixed script, one step at a time, with the 5-minute EpiPen timer. The porch light comes on; Mom unlocks the door for the paramedics from her phone.', actions: [...say("Her lips are swelling and she can't breathe", 'I gave the EpiPen'), { door: 'unlock' }, ...say('Done', "It's over, the paramedics are here")] },
  { title: 'Lights out', clock: ['Sat', '20:30'], note: 'Mom’s goodnight message plays for Maya, and the screen dims.', actions: say('Maya misses her mom', 'She fell asleep at 8:10') },
  { title: 'The parents are back', clock: ['Sat', '23:00'], note: 'The evening summary, then pay Priya: Mom approves on her phone.', actions: say("We're back", 'Yes', 'Pay Priya') },
];

/** "Watch the highlights": the moments only an agent can do, in about two and a half minutes. The steps
 *  before them happen first, silently and fast, so the house is where it would be. */
export const HIGHLIGHTS = ['Mom sets it up', 'A knock at the door', 'Ask a parent', 'Emergency', 'Lights out'];

/** ?moment= links, by the step they open on (by title, so adding steps never moves them). */
export const MOMENTS: Record<string, string> = {
  setup: 'Mom sets it up',
  handover: 'Mom hands over to Priya',
  questions: 'Priya asks questions',
  dinner: 'Dinner',
  evening: 'The evening goes on',
  door: 'A knock at the door',
  ask: 'Ask a parent',
  emergency: 'Emergency',
  goodnight: 'Lights out',
  pay: 'The parents are back',
};
