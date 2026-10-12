// Browser speech: recognition (Chrome/Edge) and speech synthesis. No keys or servers needed.

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
};

const RecognitionCtor: (new () => Recognition) | undefined =
  (globalThis as any).SpeechRecognition ?? (globalThis as any).webkitSpeechRecognition;

export const canListen = Boolean(RecognitionCtor);

/** Listens once and resolves with the final transcript (empty string if nothing was heard). */
export function listenOnce(lang: string, onInterim?: (text: string) => void): { done: Promise<string>; stop: () => void } {
  if (!RecognitionCtor) return { done: Promise.resolve(''), stop: () => {} };
  const rec = new RecognitionCtor();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = '';
  const done = new Promise<string>((resolve) => {
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      onInterim?.(finalText + interim);
    };
    rec.onerror = () => resolve(finalText.trim());
    rec.onend = () => resolve(finalText.trim());
  });
  try {
    rec.start();
  } catch {
    return { done: Promise.resolve(''), stop: () => {} };
  }
  return { done, stop: () => rec.stop() };
}

let queue = Promise.resolve();
// Bumped by stopSpeaking(): anything queued before that is skipped, not spoken late.
let generation = 0;

/** Speaks text in order; resolves when this utterance has finished (or was skipped). */
export function speak(text: string, lang = 'en-US', onStart?: () => void, onEnd?: () => void): Promise<void> {
  const synth = globalThis.speechSynthesis;
  if (!synth || !text) return Promise.resolve();
  const myGeneration = generation;
  queue = queue.then(
    () =>
      new Promise<void>((resolve) => {
        if (myGeneration !== generation) return resolve();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang;
        const voice = synth.getVoices().find((v) => v.lang === lang) ?? synth.getVoices().find((v) => v.lang.startsWith(lang.slice(0, 2)));
        if (voice) u.voice = voice;
        u.rate = 1.02;
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          clearTimeout(guard);
          onEnd?.();
          resolve();
        };
        // Some browsers never fire onend for long utterances; don't let the queue hang.
        const guard = setTimeout(finish, 2000 + text.length * 120);
        u.onstart = () => onStart?.();
        u.onend = finish;
        u.onerror = finish;
        synth.speak(u);
      }),
  );
  return queue;
}

/** Stops the current utterance and drops everything still waiting in the queue. */
export function stopSpeaking() {
  generation++;
  globalThis.speechSynthesis?.cancel();
}
