/** Thin wrapper over the Web Speech API (Chrome on Android supports hi-IN and en-IN). */
type Recognition = {
  lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

const Ctor = (): (new () => Recognition) | undefined =>
  (globalThis as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ??
  (globalThis as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

export const voiceSupported = () => !!Ctor();

/** Listen once. Resolves with the best transcript ('' if nothing was understood). */
export function listen(lang: 'hi' | 'en', onStart?: () => void): { done: Promise<string>; stop: () => void } {
  const C = Ctor();
  if (!C) return { done: Promise.resolve(''), stop: () => {} };
  const r = new C();
  r.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
  r.interimResults = false; r.maxAlternatives = 1; r.continuous = false;
  let text = '';
  const done = new Promise<string>(resolve => {
    r.onresult = e => { text = Array.from(e.results).map(x => x[0]?.transcript ?? '').join(' ').trim(); };
    r.onerror = () => resolve(text);
    r.onend = () => resolve(text);
  });
  try { r.start(); onStart?.(); } catch { /* already started */ }
  return { done, stop: () => { try { r.stop(); } catch { /* ignore */ } } };
}
