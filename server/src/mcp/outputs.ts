// What each tool returns (its outputSchema) and what an Alexa+ device shows while it runs
// (_meta.ui.invoking / invoked, from Amazon's MCP Toolkit client-lifecycle sample). The schemas are
// open (extra fields allowed) so a host can rely on the fields named here, and every field a card
// reads is described.
import * as z from 'zod/v4';

const opt = <T extends z.ZodType>(s: T) => s.nullable().optional();
const list = (what: string) => opt(z.array(z.any()).describe(what));
const text = (what: string) => opt(z.string().describe(what));
const flag = (what: string) => opt(z.boolean().describe(what));
const num = (what: string) => opt(z.number().describe(what));
const obj = (what: string) => opt(z.looseObject({}).describe(what));

/** Every result names the card that shows it ("answer", "location", "emergency", ...). */
const result = (views: string, shape: z.ZodRawShape) =>
  z.looseObject({ view: z.string().describe(`The card that shows this result: ${views}`), ...shape });

const fact = 'Each: text (the parent\'s exact words), said_by, source, when, category, risk';
const emergency = {
  kind: text('Kind of emergency: allergy_breathing, fire, gas, poison, intruder, missing, injury or general'),
  say_first: text('The first line to say, before anything else'),
  address: text('The home address, shown on screen for the 911 call (never said aloud)'),
  action_plan: obj('The steps: { source, steps: [{ step, text, timer_seconds }] }'),
  epipen_location: text('Where the EpiPen is kept, in the parents\' words'),
  epipen_photo: text('Photo of where the EpiPen is kept'),
  parents_alerted: list('Who was alerted'),
  paramedic_sheet: obj('What to tell paramedics: child, allergies, medicines, what happened'),
  note: text('What this guide is and is not (it does not call 911; not medical advice)'),
  incident: obj('Progress: current step, steps with state, timers, who is on the way, the log'),
  language: text("The carer's language"),
  spoken: text("The first line in the carer's language (a fixed translation, never an AI's)"),
  announce: list('What to say now, once each (timer warnings, a parent on the way)'),
  active: flag('Whether the emergency is still in progress'),
  resolved: flag('True when help has taken over'),
};

const payment = () => ({
  id: num('Payment request id'),
  carer: text('Who is being paid'),
  status: text('pending, paid, declined or not_opened'),
  hours: text('How long the evening was, e.g. "4 h 15 min"'),
  rate: text('Hourly rate'),
  amount: text('Amount for the hours'),
  tip: text('Tip added on the phone'),
  total: text('Amount plus tip'),
  url: text('The approval page (opened on the parent\'s phone, never on the shared screen)'),
  qr_svg: text('A QR code of the approval page'),
});

export const OUTPUTS: Record<string, z.ZodType> = {
  start_handoff: result('briefing', {
    carer: text("The carer's name"),
    language: text("The carer's language"),
    must_know: list('The few things that matter most tonight (allergies first), in the parents\' words'),
    epipen: text("Where the EpiPen is, in the parents' words"),
    dinner: list('Food notes'),
    bedtime: list('Routine notes'),
    screen: list('Screen-time notes'),
    pets: list('Pet notes'),
    rules: list('House rules'),
    first_contact: text('Who to call first'),
    address: text('The home address (for the screen)'),
    plan: list("Tonight's plan: key, time, title, status"),
    since_last_visit: obj("What changed since this carer's last visit"),
    pass: obj("Tonight's Guest Pass: carer, ends, join_url and a QR code the sitter scans for her own phone"),
    parent_page: text("The public demo only: this house's parent page, to play the parent"),
  }),
  pay_sitter: result('pay', payment()),
  payment_status: result('pay', payment()),
  set_carer_language: result('language', { language: text('The language now used for the carer') }),
  teachback: result('teachback', {
    kind: text('question, feedback or result'),
    question: text('The question to ask the carer'),
    number: num('Which question this is'),
    total: num('How many questions'),
    carer: text("The carer's name"),
  }),
  tonight_plan: result('plan', { items: list("Tonight's plan: key, time, title, status, checklist"), now: text('The time now'), shift: num('Minutes the plan moved'), shift_reason: text('Why it moved'), due: list('Announcements due now') }),
  home_screen: result('home', {
    mode: text('parent (nobody babysitting) or carer'),
    household: text('Family name'),
    carer: text("Who is babysitting"),
    clock: obj('The time in the house'),
    next: obj("What's next: title, time, minutes_until, checklist"),
    plan: list("Tonight's plan"),
    night: flag('Bedtime has passed: the screen dims'),
    asleep_since: text('When the child fell asleep'),
    members: list('Children and pets: name, kind, badges'),
    parents: list('Who to call, in order'),
    questions_waiting: num('Questions waiting for a parent'),
    last_answer: obj("The parents' latest answer"),
    busy_until: text('Parents asked for urgent questions only until this time'),
    door: obj('The latest doorbell event'),
    timezone: text("The house's time zone"),
  }),
  import_note: result('note', { handoff_active: flag('Whether a handoff is running'), facts: list('What was learned from the note') }),
  ask_house: result('answer, location or question', {
    category: text('food, medicine, routine, rules, emergency, general, ...'),
    facts: list(fact),
    guard: text('A sentence that must be said with the facts (food and medicine)'),
    suggest_ask_parent: flag("The notes don't settle it: offer to ask a parent"),
    emergency: flag('This is an emergency: call the emergency tool now'),
    exact: flag('False when the notes only come close'),
    allergy_alert: text('The child ate something with an allergen: say this; the parents have been alerted'),
    shadow: obj('How the parents usually answer this kind of question'),
    item: text('For "where is": the thing'),
    description: text('For "where is": where it is kept, in the parents\' words'),
  }),
  where_is: result('location', { item: text('The thing'), description: text("Where it is kept, in the parents' words"), photo_url: text('A photo of the place') }),
  log_event: result('log', { event: obj('What was logged: at, kind, text'), allergy_alert: text('Read aloud: the parents have been alerted'), medicine_alert: text('Read aloud') }),
  ask_parent: result('question', {
    id: num('Question id (for check_parent_answer)'),
    text: text('The question'),
    status: text('pending or answered'),
    urgency: text('normal or urgent'),
    asked: text('Who was asked'),
    emergency: flag('This is an emergency: call the emergency tool now'),
    busy_until: text('Parents asked for urgent questions only until this time'),
  }),
  check_parent_answer: result('question', { id: num('Question id'), status: text('pending or answered'), answer: text("The parent's answer"), answered_by: text('Who answered') }),
  ask_parent_and_wait: result('question', { id: num('Question id'), status: text('answered or expired'), answer: text("The parent's answer"), answered_by: text('Who answered') }),
  emergency: result('emergency', emergency),
  emergency_step: result('emergency', emergency),
  emergency_status: result('emergency', emergency),
  end_handoff: result('debrief', {
    carer: text("The carer's name"),
    timeline: list("The evening's log"),
    questions: list('Questions asked and answered'),
    insights: list('What stood out'),
    rule_suggestions: list('Answers worth keeping as house rules'),
    supplies: list('Things running low'),
  }),
  play_message: result('message', { from: text('Who recorded it'), relation: text('Mom, Dad, ...'), for_name: text('Who it is for'), kind: text('audio or video'), caption: text('What it says'), url: text('The recording') }),
  door_check: result('door', {
    event: obj('The doorbell event: who, snapshot, time'),
    rule: obj("The parents' door rule"),
    expected: list('Visitors expected tonight'),
    deliveries: list('Deliveries expected tonight'),
    verdict: text('open, check_first or dont_open'),
    say: text('What to say'),
    ask_parent: obj('The question sent to a parent, if any'),
  }),
};

/** What the device shows while a tool runs, and once it has answered. */
export const STATUS: Record<string, { invoking: string; invoked: string }> = {
  start_handoff: { invoking: 'Getting the house ready for tonight…', invoked: 'Ready for tonight' },
  pay_sitter: { invoking: "Working out tonight's pay…", invoked: 'Pay request sent' },
  payment_status: { invoking: 'Checking the payment…', invoked: 'Payment' },
  set_carer_language: { invoking: 'Switching language…', invoked: 'Language set' },
  teachback: { invoking: 'Checking the handover…', invoked: 'Handover check' },
  tonight_plan: { invoking: "Reading tonight's plan…", invoked: "Tonight's plan" },
  home_screen: { invoking: 'Looking at tonight…', invoked: 'Tonight' },
  import_note: { invoking: "Reading the parents' note…", invoked: 'Note added' },
  ask_house: { invoking: "Checking the parents' notes…", invoked: "From the parents' notes" },
  where_is: { invoking: 'Looking it up…', invoked: "Where it's kept" },
  log_event: { invoking: 'Noting it down…', invoked: 'Noted' },
  ask_parent: { invoking: 'Asking a parent…', invoked: 'Question sent' },
  check_parent_answer: { invoking: 'Checking for an answer…', invoked: "The parents' answer" },
  ask_parent_and_wait: { invoking: 'Asking a parent…', invoked: 'A parent answered' },
  emergency: { invoking: 'Opening the emergency guide…', invoked: 'Emergency guide' },
  emergency_step: { invoking: 'Next step…', invoked: 'Emergency guide' },
  emergency_status: { invoking: 'Updating…', invoked: 'Emergency guide' },
  end_handoff: { invoking: 'Wrapping up the evening…', invoked: "Tonight's summary" },
  play_message: { invoking: 'Finding the message…', invoked: 'A message from home' },
  door_check: { invoking: "Checking who's expected…", invoked: 'At the door' },
};
