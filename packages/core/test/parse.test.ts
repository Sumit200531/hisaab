import { describe, it, expect } from 'vitest';
import { parseAmount, parseQuickEntry, transliterate, phoneticKey, matchName, normalizeDigits } from '../src/index.js';

const rupees = (s: string) => { const p = parseAmount(s); return p === null ? null : p / 100; };

describe('amounts, the way people say them', () => {
  it.each([
    ['450', 450], ['450.50', 450.5], ['1,24,500', 124500], ['₹ 2,000', 2000], ['15k', 15000], ['2.5k', 2500],
    ['१२५०', 1250], ['₹१,२५०', 1250],
    ['sau', 100], ['do sau', 200], ['do sau pachas', 250], ['paanch hazar', 5000], ['do hazar paanch sau', 2500],
    ['ek lakh pachas hazar', 150000], ['1.5 lakh', 150000], ['2 hazar 500', 2500],
    ['dedh sau', 150], ['डेढ़ सौ', 150], ['dhai hazar', 2500], ['ढाई हज़ार', 2500],
    ['saadhe chaar sau', 450], ['साढ़े चार सौ', 450], ['sawa sau', 125], ['सवा लाख', 125000],
    ['paune do sau', 175], ['पौने दो सौ', 175], ['साढ़े तीन हज़ार', 3500],
    ['पांच सौ', 500], ['पाँच सौ रुपये', 500], ['twenty five', 25], ['five hundred', 500], ['two thousand five hundred', 2500]
  ])('%s → ₹%s', (input, expected) => expect(rupees(input)).toBe(expected));

  it.each(['', 'abc', '0', '-50', 'ramesh', 'sau ramesh'])('rejects %j', s => expect(parseAmount(s)).toBeNull());

  it('converts Devanagari digits', () => expect(normalizeDigits('०१२३४५६७८९')).toBe('0123456789'));
});

describe('quick entry: name, amount and direction from one line', () => {
  it.each([
    ['ramesh 450', { name: 'ramesh', amount: 45000, kind: null }],
    ['रमेश 450', { name: 'रमेश', amount: 45000, kind: null }],
    ['ramesh ko 450 udhaar', { name: 'ramesh', amount: 45000, kind: 'gave' }],
    ['सुनीता ने 2 हज़ार जमा किए', { name: 'सुनीता', amount: 200000, kind: 'got' }],
    ['pappu bhaiya saadhe chaar sau mile', { name: 'pappu bhaiya', amount: 45000, kind: 'got' }],
    ['450 ramesh ko', { name: 'ramesh', amount: 45000, kind: null }],
    ['pappu ko 500 do', { name: 'pappu', amount: 50000, kind: null }],
    ['ramesh ji ₹1,250 baki', { name: 'ramesh ji', amount: 125000, kind: 'gave' }],
    ['sharma uncle dedh sau', { name: 'sharma uncle', amount: 15000, kind: null }]
  ])('%s', (input, want) => expect(parseQuickEntry(input)).toMatchObject(want));

  it('words after the amount become the note', () => {
    expect(parseQuickEntry('ramesh 450 atta daal')).toMatchObject({ name: 'ramesh', amount: 45000, note: 'atta daal' });
  });
  it('an entry without an amount keeps the name', () => {
    expect(parseQuickEntry('ramesh')).toMatchObject({ name: 'ramesh', amount: null });
  });
});

describe('names across scripts', () => {
  it.each([
    ['रमेश', 'ramesh'], ['सुनीता', 'suneetaa'], ['पप्पू', 'pappoo'], ['राम', 'raam'], ['शर्मा', 'sharmaa'],
    ['ज़ाकिर', 'zaakir'], ['गुप्ता', 'guptaa'], ['कमल', 'kamal'], ['अमित', 'amit']
  ])('transliterates %s → %s', (hi, en) => expect(transliterate(hi)).toBe(en));

  it('Hindi and English spellings share a phonetic key', () => {
    const pairs = [['रमेश', 'Ramesh'], ['सुनीता', 'Sunita'], ['पप्पू', 'Pappu'], ['शर्मा जी', 'Sharma'], ['गुप्ता', 'Gupta'], ['ज़ाकिर', 'Zakir'], ['मोहन', 'Mohan'], ['Ramesh Bhaiya', 'ramesh']];
    for (const [a, b] of pairs) expect(phoneticKey(a), `${a} vs ${b}`).toBe(phoneticKey(b));
    expect(phoneticKey('Ramesh')).not.toBe(phoneticKey('Mahesh'));
  });

  it('matches what was spoken against the customer list', () => {
    const custs = [{ name: 'Ramesh Kumar' }, { name: 'Mahesh' }, { name: 'सुनीता दीदी' }, { name: 'Pappu' }, { name: 'Ram' }];
    const best = (q: string) => matchName(q, custs, c => c.name)[0]?.item.name;
    expect(best('रमेश')).toBe('Ramesh Kumar');
    expect(best('sunita')).toBe('सुनीता दीदी');
    expect(best('पप्पू')).toBe('Pappu');
    expect(best('ram')).toBe('Ram');
    expect(best('mahesh')).toBe('Mahesh');
    expect(matchName('xyz', custs, c => c.name)).toEqual([]);
  });
});
