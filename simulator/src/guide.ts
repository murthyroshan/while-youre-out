// The demo, in the order a judge would try it (and the video tells it): one step at a time.
// say: what the sitter says. ring: the doorbell. bee: what Mom tells her Bee. door: Mom unlocks the front door from her phone.
export type TourAction = { say: string } | { ring: string } | { bee: string } | { door: 'unlock' };
export interface GuideStep {
  title: string;
  note: string;
  /** Moves the house clock (demo mode) to [day, "HH:MM"] when the step starts. */
  clock?: [string, string];
  actions: TourAction[];
}
const say = (...lines: string[]): TourAction[] => lines.map((l) => ({ say: l }));
export const GUIDE: GuideStep[] = [
  { title: 'Mom hands over to Priya', clock: ['Sat', '18:00'], note: 'The Echo Show becomes tonight’s screen, then checks Priya knows three key things.', actions: say('Priya is babysitting tonight', 'Peanuts', 'In the kitchen drawer by the stove', 'Anita') },
  { title: 'Priya asks questions', note: 'Answers come in the parents’ own words. Food always gets a safety check.', actions: say('Can Maya have the cookies on the counter?', "Where's the EpiPen?", 'Can she watch another episode?') },
  { title: 'The evening goes on', clock: ['Sat', '18:40'], note: 'Mom tells her Bee the nap ran late: bedtime moves by the parents’ own rule. The TV starts its one-hour limit. The diapers run out: Mom adds them to the list from her phone.', actions: [...say('Maya is watching cartoons'), { bee: 'Maya napped until 5 today' }, ...say('We ran out of diapers')] },
  { title: 'Bath time', clock: ['Sat', '19:45'], note: 'The living room TV pauses itself, with a message from Mom: the house follows the parents’ rules.', actions: say("What's next?") },
  { title: 'A knock at the door', clock: ['Sat', '20:10'], note: 'Nobody is expected, so: don’t open. The doorbell photo goes to Mom’s phone.', actions: [{ ring: 'stranger' }, ...say("Someone's knocking, should I open the door?")] },
  { title: 'Ask a parent', note: 'Open the parent’s phone below and answer. The Echo Show reads the reply out.', actions: say('Can she sleep in your bed?', 'Yes') },
  { title: 'Emergency', note: 'A fixed script, one step at a time, with the 5-minute EpiPen timer. The porch light comes on; Mom unlocks the door for the paramedics from her phone.', actions: [...say("Her lips are swelling and she can't breathe", 'I gave the EpiPen'), { door: 'unlock' }, ...say('Done', "It's over, the paramedics are here")] },
  { title: 'Lights out', clock: ['Sat', '20:30'], note: 'Mom’s goodnight message plays for Maya, and the screen dims.', actions: say('Maya misses her mom', 'She fell asleep at 8:10') },
  { title: 'The parents are back', clock: ['Sat', '23:00'], note: 'The evening summary, then pay Priya: Mom approves on her phone.', actions: say("We're back", 'Yes', 'Pay Priya') },
];
