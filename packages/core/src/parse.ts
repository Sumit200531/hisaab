/**
 * Understanding how a shopkeeper actually says or types an entry:
 *   "रमेश 450"   "ramesh ko saadhe chaar sau udhaar"   "सुनीता ने 2 हज़ार जमा किए"
 *   "pappu 1,250"  "dedh sau mile"  "₹1.5 lakh" "15k"
 *
 * Speech recognisers for hi-IN mostly emit digits, but people type and speak
 * number words too, including the fractional ones that have no English
 * equivalent (डेढ़ = 1½, ढाई = 2½, साढ़े = +½, सवा = +¼, पौने = −¼).
 */

const DEVANAGARI_DIGITS = '०१२३४५६७८९';

const UNITS: Record<string, number> = {};
const add = (n: number, ...words: string[]) => { for (const w of words) UNITS[w] = n; };
add(0, 'zero', 'shunya', 'शून्य');
add(1, 'one', 'ek', 'एक');
add(2, 'two', 'do', 'दो');
add(3, 'three', 'teen', 'tin', 'तीन');
add(4, 'four', 'char', 'chaar', 'चार');
add(5, 'five', 'panch', 'paanch', 'पांच', 'पाँच');
add(6, 'six', 'chhe', 'chhah', 'chah', 'che', 'छह', 'छः', 'छे');
add(7, 'seven', 'saat', 'sat', 'सात');
add(8, 'eight', 'aath', 'ath', 'आठ');
add(9, 'nine', 'nau', 'नौ');
add(10, 'ten', 'das', 'दस');
add(11, 'eleven', 'gyarah', 'gyaarah', 'ग्यारह');
add(12, 'twelve', 'barah', 'baarah', 'बारह');
add(13, 'thirteen', 'terah', 'तेरह');
add(14, 'fourteen', 'chaudah', 'चौदह');
add(15, 'fifteen', 'pandrah', 'pandrah', 'पंद्रह', 'पन्द्रह');
add(16, 'sixteen', 'solah', 'सोलह');
add(17, 'seventeen', 'satrah', 'सत्रह');
add(18, 'eighteen', 'atharah', 'athara', 'अठारह');
add(19, 'nineteen', 'unnis', 'unnees', 'उन्नीस');
add(20, 'twenty', 'bees', 'bis', 'बीस');
add(25, 'pachchis', 'pacchis', 'पच्चीस');
add(30, 'thirty', 'tees', 'tis', 'तीस');
add(40, 'forty', 'chalis', 'chaalis', 'चालीस');
add(50, 'fifty', 'pachas', 'pachaas', 'पचास');
add(60, 'sixty', 'saath', 'साठ');
add(70, 'seventy', 'sattar', 'सत्तर');
add(75, 'pachattar', 'पचहत्तर');
add(80, 'eighty', 'assi', 'अस्सी');
add(90, 'ninety', 'nabbe', 'नब्बे');

const MULT: Record<string, number> = {};
const mult = (n: number, ...w: string[]) => { for (const x of w) MULT[x] = n; };
mult(100, 'hundred', 'sau', 'सौ');
mult(1000, 'thousand', 'hazar', 'hazaar', 'hajar', 'हज़ार', 'हजार', 'k');
mult(100000, 'lakh', 'lac', 'lakhs', 'लाख');
mult(10000000, 'crore', 'karod', 'करोड़', 'करोड');

/** Standalone fractional numbers. */
const FRACTIONS: Record<string, number> = { dedh: 1.5, dedhh: 1.5, 'डेढ़': 1.5, 'डेढ': 1.5, dhai: 2.5, dhaai: 2.5, 'ढाई': 2.5 };
/** Modifiers applied to the next number: साढ़े चार = 4½, सवा दो = 2¼, पौने तीन = 2¾. */
const MODIFIERS: Record<string, number> = { sadhe: 0.5, saadhe: 0.5, 'साढ़े': 0.5, 'साढे': 0.5, sawa: 0.25, sava: 0.25, 'सवा': 0.25, paune: -0.25, 'पौने': -0.25 };

const GOT_WORDS = new Set(['jama', 'जमा', 'mile', 'मिले', 'mila', 'मिला', 'received', 'paid', 'payment', 'wapas', 'vapas', 'वापस', 'chukaye', 'चुकाए', 'chukaya', 'चुकाया', 'aaye', 'आए', 'aaya', 'आया']);
const GAVE_WORDS = new Set(['udhar', 'udhaar', 'उधार', 'baki', 'baaki', 'बाकी', 'baqi', 'liya', 'लिया', 'liye', 'लिए', 'credit', 'saman', 'samaan', 'सामान', 'khata', 'खाता']);
const FILLERS = new Set(['ko', 'को', 'ne', 'ने', 'ka', 'का', 'ke', 'के', 'ki', 'की', 'se', 'से', 'rs', 'rs.', 'inr', 'rupaye', 'rupay', 'rupees', 'rupee', 'रुपये', 'रुपए', 'रूपये', '₹', 'kiye', 'किए', 'kiya', 'किया', 'hai', 'है', 'hain', 'हैं', 'diye', 'दिए', 'diya', 'दिया', 'de', 'दे', 'aur', 'और', 'gaye', 'गए', 'gaya', 'गया', 'and']);

export function normalizeDigits(s: string): string {
  return s.replace(/[०-९]/g, d => String(DEVANAGARI_DIGITS.indexOf(d)));
}

function tokenize(text: string): string[] {
  return normalizeDigits(text)
    .replace(/₹\s*/g, ' ₹ ')
    .replace(/(\d),(?=\d)/g, '$1')                    // 1,24,500 → 124500
    .replace(/(\d)\s*(k|lakh|lac|crore)\b/gi, '$1 $2') // 15k → 15 k
    .toLowerCase()
    .split(/[\s,!?।]+/)
    .filter(Boolean);
}

type NumTok = { kind: 'num'; v: number } | { kind: 'mult'; v: number } | { kind: 'mod'; v: number };
function classify(tok: string): NumTok | null {
  if (/^\d+(\.\d+)?$/.test(tok)) return { kind: 'num', v: parseFloat(tok) };
  if (tok in UNITS) return { kind: 'num', v: UNITS[tok] };
  if (tok in FRACTIONS) return { kind: 'num', v: FRACTIONS[tok] };
  if (tok in MULT) return { kind: 'mult', v: MULT[tok] };
  if (tok in MODIFIERS) return { kind: 'mod', v: MODIFIERS[tok] };
  return null;
}

/** Evaluate a run of number tokens: "do hazar paanch sau" = 2500, "saadhe chaar sau" = 450. */
function evaluate(toks: NumTok[]): number | null {
  let total = 0, group = 0, current = 0, pendingMod = 0, seen = false;
  for (const t of toks) {
    if (t.kind === 'mod') { pendingMod = t.v; continue; }
    if (t.kind === 'num') {
      let v = t.v;
      if (pendingMod) { v += pendingMod; pendingMod = 0; }
      current += v; seen = true;
      continue;
    }
    // multiplier
    const base = current || (pendingMod ? 1 + pendingMod : 1);   // "sawa sau" = 1¼ × 100
    pendingMod = 0;
    if (t.v === 100) { group += base * 100; current = 0; }
    else { total += (group + base) * t.v; group = 0; current = 0; }
    seen = true;
  }
  if (!seen) return null;
  return total + group + current;
}

export interface QuickEntry {
  amount: number | null;        // paise
  kind: 'gave' | 'got' | null;  // null when the words don't say
  name: string;                 // the words that are not amount/keywords
  note: string;
}

/**
 * Split free text into amount, direction and name. The longest run of number
 * tokens is the amount; direction keywords decide gave/got; what remains is the name.
 */
export function parseQuickEntry(text: string): QuickEntry {
  const toks = tokenize(text);
  // find the longest contiguous run of number tokens
  let best: [number, number] | null = null;
  for (let i = 0; i < toks.length; i++) {
    if (!classify(toks[i])) continue;
    let j = i + 1;
    while (j < toks.length) {
      const cur = classify(toks[j]), prev = classify(toks[j - 1])!;
      if (!cur) break;
      // two plain numbers in a row only combine as tens + units ("twenty five", "bees paanch" is not a thing);
      // "500 do" means "give 500", not 502
      if (cur.kind === 'num' && prev.kind === 'num' && !(prev.v >= 20 && prev.v < 100 && prev.v % 10 === 0 && cur.v < 10 && !/^\d/.test(toks[j]))) break;
      j++;
    }
    // a lone modifier or multiplier word is not an amount ("sawa" could be a name)
    const run = toks.slice(i, j).map(classify) as NumTok[];
    const isAmount = run.some(r => r.kind === 'num') || (run.some(r => r.kind === 'mod') && run.some(r => r.kind === 'mult'));
    if (isAmount && (!best || j - i > best[1] - best[0])) best = [i, j];
    i = j;
  }
  let amount: number | null = null;
  if (best) {
    const v = evaluate(toks.slice(best[0], best[1]).map(classify) as NumTok[]);
    if (v !== null && v > 0) amount = Math.round(v * 100);
  }
  let kind: QuickEntry['kind'] = null;
  const nameParts: string[] = [];
  const noteParts: string[] = [];
  toks.forEach((t, i) => {
    if (best && i >= best[0] && i < best[1]) return;
    if (GOT_WORDS.has(t)) { kind = 'got'; return; }
    if (GAVE_WORDS.has(t)) { kind ??= 'gave'; return; }
    if (FILLERS.has(t)) return;
    // words before the amount are the name; words after it are a note ("ramesh 450 atta daal")
    if (!best || i < best[0]) nameParts.push(t); else noteParts.push(t);
  });
  // "450 ramesh ko" — nothing before the amount, so the trailing words are the name
  if (!nameParts.length && noteParts.length) nameParts.push(noteParts.shift()!);
  return { amount, kind, name: nameParts.join(' '), note: noteParts.join(' ') };
}

/** Parse a typed amount field: "450", "450.5", "1,250", "₹ 2.5k", "डेढ़ सौ". Returns paise or null. */
export function parseAmount(text: string): number | null {
  const toks = tokenize(text).filter(t => t !== '₹' && !FILLERS.has(t));
  if (!toks.length || !toks.every(t => classify(t))) return null;
  const v = evaluate(toks.map(classify) as NumTok[]);
  if (v === null || !(v > 0)) return null;
  const p = Math.round(v * 100);
  return p > 0 ? p : null;
}

/* ------------------------------------------------------------------ names */

const CONS: Record<string, string> = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh',
  'ष': 'sh', 'स': 's', 'ह': 'h', 'ळ': 'l'
};
const NUKTA: Record<string, string> = { 'ज': 'z', 'फ': 'f', 'ड': 'r', 'ढ': 'rh', 'क': 'q', 'ख': 'kh', 'ग': 'g' };
const VOWELS: Record<string, string> = { 'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऑ': 'o' };
const MATRAS: Record<string, string> = { 'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o' };

/** Romanise Devanagari (ITRANS-like, with word-final schwa deletion): रमेश → ramesh, सुनीता → sunita. */
export function transliterate(s: string): string {
  let out = '';
  const chars = [...s.normalize('NFC')];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (CONS[ch]) {
      const nukta = chars[i + 1] === '़';
      out += nukta ? (NUKTA[ch] ?? CONS[ch]) : CONS[ch];
      if (nukta) i++;
      const next = chars[i + 1];
      if (next && MATRAS[next]) { out += MATRAS[next]; i++; }
      else if (next === '्') { i++; }                       // virama: no vowel
      else {
        const endOfWord = !next || /[\s.,]/.test(next) || (!CONS[next] && !VOWELS[next] && !/[ऀ-ॿ]/.test(next));
        if (!endOfWord) out += 'a';
      }
    } else if (VOWELS[ch]) out += VOWELS[ch];
    else if (MATRAS[ch]) out += MATRAS[ch];
    else if (ch === 'ं' || ch === 'ँ') out += 'n';
    else if (ch === 'ः') out += 'h';
    else if (/[०-९]/.test(ch)) out += String(DEVANAGARI_DIGITS.indexOf(ch));
    else out += ch;
  }
  return out;
}

const HONORIFICS = new Set(['ji', 'jee', 'bhai', 'bhaiya', 'bhaiyya', 'didi', 'di', 'sahab', 'saheb', 'chacha', 'chachi', 'aunty', 'uncle', 'bhabhi', 'mausi', 'kaka', 'kaki', 'sir', 'madam', 'maam']);

/** A sound-alike key that survives Hindi/English spelling differences: Ramesh, रमेश, Rameshh → "rms". */
export function phoneticKey(s: string): string {
  let t = transliterate(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  t = t.split(/[^a-z0-9]+/).filter(w => w && !HONORIFICS.has(w)).join(' ');
  t = t.replace(/ph/g, 'f').replace(/sh|shh|ss/g, 's').replace(/chh|ch/g, 'c').replace(/kh/g, 'k').replace(/gh/g, 'g')
    .replace(/th/g, 't').replace(/dh/g, 'd').replace(/bh/g, 'b').replace(/jh/g, 'j').replace(/z/g, 'j').replace(/q/g, 'k')
    .replace(/w/g, 'v').replace(/ck/g, 'k').replace(/x/g, 'ks');
  return t.split(' ').map(w => (w[0] + w.slice(1).replace(/[aeiouyh]/g, '')).replace(/(.)\1+/g, '$1')).join(' ');
}

export interface NameMatch<T> { item: T; score: number }

/** Rank candidates by how well their name matches what was said or typed, in either script. */
export function matchName<T>(query: string, items: T[], nameOf: (t: T) => string): NameMatch<T>[] {
  const q = phoneticKey(query).trim();
  const ql = transliterate(query).toLowerCase().trim();
  if (!q) return [];
  const out: NameMatch<T>[] = [];
  for (const item of items) {
    const name = nameOf(item);
    const k = phoneticKey(name).trim();
    const nl = transliterate(name).toLowerCase();
    let score = 0;
    if (nl === ql) score = 100;
    else if (k === q) score = 90;
    else if (k.split(' ')[0] === q.split(' ')[0] && q.split(' ')[0].length >= 2) score = 75;
    else if (nl.startsWith(ql) && ql.length >= 2) score = 70;
    else if (k.startsWith(q) && q.length >= 2) score = 60;
    else if (nl.includes(ql) && ql.length >= 3) score = 40;
    if (score) out.push({ item, score });
  }
  return out.sort((a, b) => b.score - a.score);
}
