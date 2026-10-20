// Bilingual relay: the carer hears answers in their own language while the parents' original
// words stay on screen. Translations are cached. Emergency lines never wait for an AI: they use
// fixed translations written in advance.
import type { DB } from '../db.js';
import type { AiClient } from '../ai/gemini.js';

export const LANGUAGES: Record<string, string> = {
  en: 'English',
  hi: 'Hindi',
  es: 'Spanish',
  ta: 'Tamil',
  te: 'Telugu',
  bn: 'Bengali',
  mr: 'Marathi',
  gu: 'Gujarati',
  kn: 'Kannada',
  ml: 'Malayalam',
  pa: 'Punjabi',
  ur: 'Urdu',
  tl: 'Tagalog',
  zh: 'Chinese',
  vi: 'Vietnamese',
  fr: 'French',
  ar: 'Arabic',
  pt: 'Portuguese',
};

/** "hi-IN" -> "hi"; unknown or English -> "en". */
export function languageCode(tag: string | null | undefined): string {
  const code = (tag ?? 'en').toLowerCase().split(/[-_]/)[0];
  return code in LANGUAGES ? code : 'en';
}

// Fixed translations for the lines that must never depend on an AI call.
const FIXED: Record<string, Record<string, string>> = {
  'Call 911 now on your phone. Tell them the address on the screen.': {
    hi: 'अभी अपने फ़ोन से 911 पर कॉल करें। उन्हें स्क्रीन पर लिखा पता बताएँ।',
    es: 'Llame al 911 ahora desde su teléfono. Dígales la dirección que aparece en la pantalla.',
  },
  'Get everyone out of the house now, then call 911 from outside.': {
    hi: 'सभी को अभी घर से बाहर निकालें, फिर बाहर से 911 पर कॉल करें।',
    es: 'Saque a todos de la casa ahora y luego llame al 911 desde afuera.',
  },
  "Call Poison Control now at 1-800-222-1222. If the child isn't breathing or won't wake up, call 911 instead.": {
    hi: 'अभी पॉइज़न कंट्रोल को 1-800-222-1222 पर कॉल करें। अगर बच्चा साँस नहीं ले रहा या जाग नहीं रहा, तो 911 पर कॉल करें।',
    es: 'Llame ahora a Control de Envenenamientos al 1-800-222-1222. Si no respira o no despierta, llame al 911.',
  },
};

export function fixedTranslation(text: string, lang: string): string | null {
  return FIXED[text]?.[lang] ?? null;
}

const SCHEMA = {
  type: 'object',
  properties: { translations: { type: 'array', items: { type: 'string' } } },
  required: ['translations'],
};

/**
 * Translates each text into `lang`, using the cache first. If the AI is unavailable or slow,
 * returns null for the ones it couldn't do, so callers fall back to English.
 */
export async function translateAll(db: DB, ai: AiClient, texts: string[], lang: string): Promise<Array<string | null>> {
  if (lang === 'en') return texts;
  const get = db.prepare('SELECT text FROM translations WHERE lang = ? AND source = ?');
  const out: Array<string | null> = texts.map((t) => fixedTranslation(t, lang) ?? (get.get(lang, t) as { text: string } | undefined)?.text ?? null);
  const missing = texts.map((t, i) => (out[i] === null && t.trim() ? i : -1)).filter((i) => i >= 0);
  if (!missing.length || !ai.available) return out;
  try {
    const { data } = await ai.generateJson<{ translations: string[] }>({
      system: [
        `Translate each item into ${LANGUAGES[lang]}, for a babysitter or grandparent listening to a home assistant.`,
        `Write it in ${LANGUAGES[lang]}'s usual native script (for example Devanagari for Hindi), not in Latin letters, so a ${LANGUAGES[lang]} voice can read it aloud.`,
        'Keep it natural and spoken. Keep names, times, numbers, phone numbers and brand names exactly as they are.',
        'Do not add, soften or remove anything: allergy and safety wording must stay exactly as strict.',
        "Translate quoted words too (what a parent said): the listener must understand them, and the original English is shown on screen separately.",
        'Return the same number of items, in the same order.',
      ].join(' '),
      parts: [{ text: JSON.stringify(missing.map((i) => texts[i])) }],
      schema: SCHEMA,
      timeoutMs: 12_000,
    });
    if (Array.isArray(data.translations) && data.translations.length === missing.length) {
      const put = db.prepare('INSERT OR REPLACE INTO translations (lang, source, text) VALUES (?, ?, ?)');
      missing.forEach((idx, j) => {
        const t = typeof data.translations[j] === 'string' ? data.translations[j].trim().slice(0, 2000) : '';
        if (t) {
          out[idx] = t;
          put.run(lang, texts[idx], t);
        }
      });
    }
  } catch {
    // Fall back to English for anything not translated.
  }
  return out;
}

export async function translateOne(db: DB, ai: AiClient, text: string, lang: string): Promise<string | null> {
  return (await translateAll(db, ai, [text], lang))[0];
}

// Letters beyond Latin (Devanagari, Tamil, Arabic...).
const NON_LATIN = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u;

/**
 * The carer's words in English, for the safety rules and the teach-back check, which read English.
 * English stays as it is. Null if it isn't English and the AI can't translate it right now.
 */
export async function englishOf(db: DB, ai: AiClient, text: string, carerLang: string): Promise<string | null> {
  if (!text.trim() || (carerLang === 'en' && !NON_LATIN.test(text))) return text;
  const cached = db.prepare("SELECT text FROM translations WHERE lang = 'en' AND source = ?").get(text) as { text: string } | undefined;
  if (cached) return cached.text;
  if (!ai.available) return null;
  try {
    const { data } = await ai.generateJson<{ translations: string[] }>({
      system:
        'Translate each item into plain English, literally, for safety rules to read. Keep names, times and numbers exactly. Do not answer it, soften it or add anything. Return the same number of items.',
      parts: [{ text: JSON.stringify([text]) }],
      schema: SCHEMA,
      timeoutMs: 6_000,
    });
    const t = typeof data.translations?.[0] === 'string' ? data.translations[0].trim().slice(0, 2000) : '';
    if (!t) return null;
    db.prepare("INSERT OR REPLACE INTO translations (lang, source, text) VALUES ('en', ?, ?)").run(text, t);
    return t;
  } catch {
    return null;
  }
}

/**
 * Sentences, never split inside a quote (what a parent said stays whole). Translating them one by
 * one keeps a model from dropping one ("...3 questions. What is Maya allergic to?").
 */
export function sentences(text: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (const ch of text) {
    current += ch;
    if (ch === '"') quoted = !quoted;
    else if (ch === '\u201c') quoted = true;
    else if (ch === '\u201d') quoted = false;
    else if (!quoted && /[.!?]/.test(ch)) {
      out.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) out.push(current.trim());
  return out.filter(Boolean);
}
