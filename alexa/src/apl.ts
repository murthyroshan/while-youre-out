// The add-on's cards on a real Echo Show, through a classic skill: APL (Alexa Presentation
// Language), Amazon's own screen format. An Alexa+ host renders the add-on's MCP Apps card (HTML);
// a classic skill can't, so each tool result's structuredContent becomes one APL layout instead,
// following the same Alexa+ design guide: brand top-left, one idea per screen, safety first, the
// parents' words in quotes, large touch targets, and red only for an emergency.

type Kind = 'danger' | 'warn' | 'ok' | 'info';
export interface CardModel {
  mood: 'day' | 'night' | 'emergency';
  topic: string;
  title: string;
  sub?: string;
  notes: Array<{ kind: Kind; title: string; text: string }>;
  rows: Array<{ title: string; sub?: string; when?: string; done?: boolean }>;
  buttons: Array<{ label: string; say: string }>;
  footer?: string;
}

const s = (v: unknown) => (v == null ? '' : String(v));
const quote = (f: { text?: string; said_by?: string }) => `“${s(f.text)}” (${s(f.said_by) || 'Parent'})`;

/** One tool result as an APL card. `spoken` is what Alexa says, used when a view has nothing else. */
export function cardModel(d: Record<string, any> | undefined, spoken: string): CardModel {
  const m: CardModel = { mood: 'day', topic: "While You're Out", title: '', notes: [], rows: [], buttons: [] };
  const view = d?.view ?? 'text';
  switch (view) {
    case 'home': {
      m.mood = d!.night ? 'night' : 'day';
      m.topic = d!.carer ? `${d!.carer} is babysitting` : 'Tonight';
      const n = d!.next;
      m.title = d!.night ? `${(d!.members ?? []).find((x: any) => x.kind === 'child')?.name ?? 'She'} is asleep` : n ? `Next: ${s(n.title)}` : d!.mode === 'parent' ? 'Tonight' : 'A quiet evening';
      m.sub = n ? s(n.time) : d!.mode === 'parent' ? 'Say “Priya is babysitting tonight” to start.' : undefined;
      m.rows = (d!.plan ?? []).slice(0, 5).map((p: any) => ({ title: s(p.title), when: s(p.time), done: p.status === 'done' }));
      if (d!.last_answer) m.notes.push({ kind: 'info', title: `${s(d!.last_answer.by)} answered`, text: `“${s(d!.last_answer.answer)}”` });
      m.buttons = d!.carer ? [{ label: 'Emergency', say: 'emergency' }, { label: 'Ask a parent', say: 'ask the parents' }] : [{ label: 'What can you do?', say: 'what can you do' }];
      break;
    }
    case 'briefing': {
      m.topic = 'Sitter mode is on';
      m.title = `Tonight with ${s(d!.carer)}`;
      m.sub = [d!.sitter?.label, d!.sitter?.note].filter(Boolean).join(' · ') || undefined;
      if (d!.must_know?.[0]) m.notes.push({ kind: 'danger', title: 'Must know', text: s(d!.must_know[0]) });
      if (d!.epipen) m.rows.push({ title: 'EpiPen', sub: s(d!.epipen) });
      if (d!.first_contact) m.rows.push({ title: 'Call first', sub: s(d!.first_contact) });
      const next = (d!.plan ?? []).find((p: any) => p.status !== 'done');
      if (next) m.rows.push({ title: `Next: ${s(next.title)}`, when: s(next.time) });
      m.buttons = [{ label: 'Start the handover check', say: 'quiz me' }];
      break;
    }
    case 'answer': {
      const facts: any[] = d!.facts ?? [];
      m.topic = { food: 'Food', medicine: 'Medicine', health: 'How she is', emergency: 'Emergency', pet_safety: 'The pet', safety_info: 'If it happens' }[s(d!.category)] ?? 'The parents’ notes';
      m.title = spoken.split(/(?<=[.!?])\s/)[0] ?? spoken;
      if (d!.allergy_alert) m.notes.push({ kind: 'danger', title: 'Allergy alert · the parents have been told', text: s(d!.allergy_alert) });
      if (d!.pet_alert) m.notes.push({ kind: 'danger', title: 'Call a vet now', text: s(d!.pet_alert) });
      const safety = facts.find((f) => f.risk === 'safety');
      if (safety) m.notes.push({ kind: 'danger', title: 'Allergy', text: quote(safety) });
      for (const f of facts.filter((f) => f !== safety).slice(0, 2)) m.rows.push({ title: s(f.text), sub: s(f.said_by) });
      if (d!.guard) m.notes.push({ kind: 'warn', title: 'Check first', text: s(d!.guard) });
      if (d!.suggest_ask_parent) m.buttons.push({ label: 'Ask the parents', say: 'yes' });
      if (['food', 'medicine'].includes(d!.category) || d!.allergy_alert) m.footer = 'Not medical advice. The parents’ own notes; ask them when unsure.';
      break;
    }
    case 'location':
      m.topic = 'Where it’s kept';
      m.title = s(d!.item);
      m.sub = s(d!.description);
      break;
    case 'plan':
      m.topic = 'Tonight’s plan';
      m.title = d!.plan_change ? 'Plan updated' : 'Tonight’s plan';
      m.sub = d!.plan_change ? s(d!.plan_change) : undefined;
      m.rows = (d!.items ?? []).map((p: any) => ({ title: s(p.title), when: s(p.time), done: p.status === 'done' }));
      break;
    case 'teachback': {
      m.topic = `Quick check before the parents leave${d!.carer ? ` · ${d!.carer}` : ''}`;
      const fb = d!.feedback;
      if (fb) m.notes.push(fb.correct ? { kind: 'ok', title: 'That’s right', text: '' } : { kind: fb.correct === null ? 'info' : 'danger', title: fb.correct === null ? 'Skipped. The parents said:' : 'Not quite. The parents said:', text: s(fb.answer) });
      if (d!.kind === 'question') {
        m.sub = `Question ${d!.number} of ${d!.total}`;
        m.title = s(d!.question);
        m.buttons = [{ label: 'Skip', say: 'skip' }];
      } else if (d!.summary) {
        m.title = d!.summary.right === d!.summary.total ? 'Handover confirmed' : 'Handover checked';
        m.sub = `${d!.summary.right} of ${d!.summary.total} right · the parents can see this on their phone`;
      }
      break;
    }
    case 'emergency': {
      m.mood = 'emergency';
      m.topic = 'EMERGENCY';
      const inc = d!.incident;
      const steps: any[] = inc?.steps ?? (d!.action_plan?.steps ?? []).map((x: any, i: number) => ({ text: x.text, state: i === 0 ? 'now' : 'todo' }));
      if (inc?.status === 'resolved') {
        m.topic = 'EMERGENCY OVER';
        m.title = 'Help has taken over';
        m.sub = 'The parents have been told. Say “emergency” again if anything changes.';
        break;
      }
      const at = inc ? inc.current : 0;
      m.title = steps[at] ? s(steps[at].text) : 'Stay with her and follow the 911 dispatcher until help arrives.';
      m.sub = steps.length ? `Step ${Math.min(at + 1, steps.length)} of ${steps.length}` : undefined;
      // The address is shown, never read aloud: the sitter reads it to 911 from here.
      if (d!.address) m.notes.push({ kind: 'danger', title: 'Call 911 from your phone. Tell them:', text: s(d!.address) });
      if (inc?.timers?.[0]) m.notes.push({ kind: 'warn', title: s(inc.timers[0].label), text: `${Math.ceil(inc.timers[0].remaining_seconds / 60)} min left` });
      if (d!.epipen_location) m.rows.push({ title: 'EpiPen', sub: s(d!.epipen_location) });
      m.rows.push({ title: 'Alerted', sub: (d!.parents_alerted ?? []).join(', ') || 'The parents' });
      m.buttons = steps[at] ? [{ label: 'Done', say: 'done' }, { label: 'Next step', say: 'next' }] : [{ label: 'Help has arrived', say: "it's over, the paramedics are here" }];
      m.footer = s(d!.note);
      break;
    }
    case 'question': {
      const who = s(d!.asked || 'a parent').replace(/\s*\(.*\)$/, '');
      m.topic = d!.answer ? `${s(d!.answered_by || who)} answered` : `Asking ${who}`;
      m.title = d!.answer ? `“${s(d!.answer)}”` : `“${s(d!.text)}”`;
      m.sub = d!.answer ? s(d!.text) : d!.status === 'expired' ? 'Nobody answered in time.' : `Waiting for ${who}…`;
      break;
    }
    case 'door': {
      m.topic = 'Front door';
      const v = s(d!.verdict);
      m.title = { unknown: 'Don’t open the door', expected: 'Check first', delivery: 'It’s a delivery', no_event: 'No one at the door camera', parent_decided: d!.decision ? `${d!.decision.by} answered` : 'A parent answered' }[v] ?? 'Front door';
      if (v === 'unknown') m.mood = 'day';
      if (d!.rule) m.notes.push({ kind: v === 'unknown' ? 'danger' : 'info', title: 'The parents’ rule', text: quote(d!.rule) });
      m.rows = [...(d!.expected ?? []), ...(d!.deliveries ?? [])].slice(0, 3).map((x: any) => ({ title: s(x.name), sub: s(x.note), when: s(x.window) }));
      break;
    }
    case 'menu':
      m.topic = s(d!.restaurant) || 'Dinner';
      m.title = d!.refused ? s(spoken.split(/(?<=[.!?])\s/)[0]) : 'Safe for tonight';
      m.rows = (d!.options ?? []).map((o: any) => ({ title: s(o.name), sub: s(o.safe), when: s(o.price) }));
      m.buttons = (d!.options ?? []).slice(0, 3).map((o: any) => ({ label: `Order ${o.name}`, say: `order the ${String(o.name).toLowerCase()}` }));
      if ((d!.left_out ?? []).length) m.footer = `Left out: ${(d!.left_out as any[]).slice(0, 4).map((l) => `${l.name} (${l.why})`).join(', ')}`;
      break;
    case 'order':
      m.topic = 'Dinner';
      m.title = `${s(d!.item)} · ${s(d!.price)}`;
      m.sub = d!.status === 'approved' ? `${s(d!.approved_by)} ordered it. Arrives ${s(d!.arrives)}.` : d!.status === 'declined' ? 'Not tonight.' : 'Waiting for a parent to approve it on their phone.';
      break;
    case 'summary':
      m.topic = 'The evening';
      m.title = `The evening with ${s(d!.carer)}`;
      for (const i of (d!.insights ?? []).slice(0, 2)) m.notes.push({ kind: 'info', title: 'Worth knowing', text: s(i) });
      m.rows = (d!.timeline ?? []).slice(-4).map((e: any) => ({ title: s(e.text), done: true }));
      m.buttons = [{ label: `Pay ${s(d!.carer)}`, say: `pay ${s(d!.carer)}` }];
      break;
    case 'pay':
      m.topic = `Pay ${s(d!.carer)}`;
      m.title = d!.status === 'paid' ? `${s(d!.carer)} has been paid ${s(d!.total)}` : s(d!.amount);
      m.sub = `${s(d!.hours)} at ${s(d!.rate)} an hour`;
      if (d!.status === 'pending') m.notes.push({ kind: 'info', title: 'Approve it on your phone', text: 'The payment happens there, never on this screen.' });
      break;
    case 'message':
      m.mood = 'night';
      m.topic = 'Goodnight';
      m.title = `${s(d!.from)} left a message for ${s(d!.for_name)}`;
      m.sub = d!.caption ? `“${s(d!.caption)}”` : undefined;
      break;
    case 'logged':
      m.topic = 'Noted for the parents';
      m.title = s(d!.event?.text) || spoken;
      if (d!.allergy_alert) m.notes.push({ kind: 'danger', title: 'Allergy alert · the parents have been told', text: s(d!.allergy_alert) });
      if (d!.pet_alert) m.notes.push({ kind: 'danger', title: 'Call a vet now', text: s(d!.pet_alert) });
      break;
    default:
      m.title = spoken;
  }
  if (!m.title) m.title = spoken;
  return m;
}

// ---------- the layout ----------

const PALETTE = {
  day: { bg: '#0E1116', card: '#1A1F27', text: '#FFFFFF', text2: '#B7C0CC', accent: '#3DB8F5' },
  night: { bg: '#120E0A', card: '#211A13', text: '#FCEBD3', text2: '#C9B79E', accent: '#F2B640' },
  emergency: { bg: '#5B0E12', card: '#7A1A1F', text: '#FFFFFF', text2: '#FFD9D6', accent: '#FFFFFF' },
};
const NOTE = { danger: '#FF8A80', warn: '#F2B640', ok: '#4ADE9A', info: '#7CC8F8' };

/** One APL document for every card: the layout reads everything from the data source. */
export const DOCUMENT = {
  type: 'APL',
  version: '2023.3',
  theme: 'dark',
  description: "While You're Out: a card from the add-on",
  mainTemplate: {
    // Not "payload": an APL parameter by that name receives every data source at once (a legacy rule).
    parameters: ['wyo'],
    items: [
      {
        type: 'Container',
        width: '100vw',
        height: '100vh',
        items: [
          { type: 'Frame', position: 'absolute', width: '100vw', height: '100vh', backgroundColor: '${wyo.card.colors.bg}' },
          {
            type: 'ScrollView',
            width: '100vw',
            height: '100vh',
            item: {
              type: 'Container',
              paddingLeft: '${wyo.card.pad}',
              paddingRight: '${wyo.card.pad}',
              paddingTop: '${wyo.card.pad * 0.6}',
              paddingBottom: '${wyo.card.pad}',
              items: [
                {
                  type: 'Container',
                  direction: 'row',
                  justifyContent: 'spaceBetween',
                  alignItems: 'center',
                  items: [
                    { type: 'Text', text: "While You're Out", fontSize: '${wyo.card.f.meta}', fontWeight: '700', color: '${wyo.card.colors.text2}' },
                    { type: 'Text', text: '${wyo.card.topic}', fontSize: '${wyo.card.f.meta}', fontWeight: '700', color: '${wyo.card.colors.accent}', maxLines: 1 },
                  ],
                },
                { type: 'Text', text: '${wyo.card.title}', fontSize: '${wyo.card.f.title}', fontWeight: '700', color: '${wyo.card.colors.text}', paddingTop: '${wyo.card.gap}', lineHeight: 1.15 },
                { type: 'Text', when: '${wyo.card.sub}', text: '${wyo.card.sub}', fontSize: '${wyo.card.f.body}', color: '${wyo.card.colors.text2}', paddingTop: '${wyo.card.gap * 0.4}' },
                {
                  type: 'Container',
                  when: '${wyo.card.notes.length > 0}',
                  data: '${wyo.card.notes}',
                  paddingTop: '${wyo.card.gap * 0.5}',
                  items: [
                    {
                      type: 'Frame',
                      backgroundColor: '${wyo.card.colors.card}',
                      borderRadius: '${wyo.card.gap * 0.6}',
                      borderWidth: 2,
                      borderColor: '${data.color}',
                      paddingTop: '${wyo.card.gap * 0.6}',
                      paddingBottom: '${wyo.card.gap * 0.6}',
                      paddingLeft: '${wyo.card.gap}',
                      paddingRight: '${wyo.card.gap}',
                      spacing: '${wyo.card.gap * 0.5}',
                      item: {
                        type: 'Container',
                        items: [
                          { type: 'Text', text: '${data.title}', fontSize: '${wyo.card.f.meta}', fontWeight: '700', color: '${data.color}' },
                          { type: 'Text', when: '${data.text}', text: '${data.text}', fontSize: '${wyo.card.f.body}', color: '${wyo.card.colors.text}' },
                        ],
                      },
                    },
                  ],
                },
                {
                  type: 'Container',
                  when: '${wyo.card.rows.length > 0}',
                  data: '${wyo.card.rows}',
                  paddingTop: '${wyo.card.gap * 0.5}',
                  items: [
                    {
                      type: 'Container',
                      direction: 'row',
                      alignItems: 'center',
                      spacing: '${wyo.card.gap * 0.3}',
                      paddingTop: '${wyo.card.gap * 0.35}',
                      paddingBottom: '${wyo.card.gap * 0.35}',
                      items: [
                        { type: 'Text', text: '${data.done ? "✓" : "•"}', fontSize: '${wyo.card.f.body}', color: '${data.done ? "#4ADE9A" : wyo.card.colors.accent}', width: '${wyo.card.f.body * 1.4}' },
                        {
                          type: 'Container',
                          grow: 1,
                          shrink: 1,
                          items: [
                            { type: 'Text', text: '${data.title}', fontSize: '${wyo.card.f.body}', fontWeight: '600', color: '${wyo.card.colors.text}' },
                            { type: 'Text', when: '${data.sub}', text: '${data.sub}', fontSize: '${wyo.card.f.meta}', color: '${wyo.card.colors.text2}' },
                          ],
                        },
                        { type: 'Text', when: '${data.when}', text: '${data.when}', fontSize: '${wyo.card.f.meta}', color: '${wyo.card.colors.text2}', paddingLeft: '${wyo.card.gap * 0.5}' },
                      ],
                    },
                  ],
                },
                {
                  type: 'Container',
                  direction: 'row',
                  wrap: 'wrap',
                  when: '${wyo.card.buttons.length > 0}',
                  data: '${wyo.card.buttons}',
                  paddingTop: '${wyo.card.gap * 0.6}',
                  items: [
                    {
                      type: 'TouchWrapper',
                      spacing: '${wyo.card.gap * 0.5}',
                      accessibilityLabel: '${data.label}',
                      onPress: [{ type: 'SendEvent', arguments: ['${data.say}'] }],
                      item: {
                        type: 'Frame',
                        // Alexa's minimum touch target: 48 dp high.
                        minHeight: 64,
                        backgroundColor: '${wyo.card.colors.accent}',
                        borderRadius: 32,
                        paddingLeft: '${wyo.card.gap}',
                        paddingRight: '${wyo.card.gap}',
                        paddingTop: 14,
                        paddingBottom: 14,
                        item: { type: 'Text', text: '${data.label}', fontSize: '${wyo.card.f.meta}', fontWeight: '700', color: '${wyo.card.colors.bg}' },
                      },
                    },
                  ],
                },
                { type: 'Text', when: '${wyo.card.footer}', text: '${wyo.card.footer}', fontSize: '${wyo.card.f.meta * 0.9}', color: '${wyo.card.colors.text2}', paddingTop: '${wyo.card.gap}' },
              ],
            },
          },
        ],
      },
    ],
  },
};

/** The APL directive for one card, sized for this device (and for a sitter who needs large text). */
export function aplDirective(card: CardModel, opts: { pixelWidth?: number; large?: boolean } = {}) {
  const small = (opts.pixelWidth ?? 1280) <= 1024; // Echo Show 5 and round displays
  const k = (small ? 0.72 : 1) * (opts.large ? 1.2 : 1);
  return {
    type: 'Alexa.Presentation.APL.RenderDocument',
    token: 'wyo-card',
    document: DOCUMENT,
    datasources: {
      wyo: {
        card: {
          ...card,
          sub: card.sub ?? '',
          footer: card.footer ?? '',
          notes: card.notes.map((n) => ({ ...n, color: NOTE[n.kind] })),
          rows: card.rows.slice(0, 5).map((r) => ({ title: r.title, sub: r.sub ?? '', when: r.when ?? '', done: Boolean(r.done) })),
          colors: PALETTE[card.mood],
          pad: Math.round(48 * k),
          gap: Math.round(24 * k),
          f: { title: Math.round(44 * k), body: Math.round(28 * k), meta: Math.round(22 * k) },
        },
      },
    },
  };
}
