import { describe, it, expect } from 'vitest';
import { formatINR, isValidVpa, normalizeIndianMobile, upiUri, whatsappUrl, payPageUrl, reminderText } from '../src/index.js';

describe('formatting rupees', () => {
  it.each([[0, '₹0'], [45000, '₹450'], [45050, '₹450.50'], [12450000, '₹1,24,500'], [1234567800, '₹1,23,45,678'], [-5000, '−₹50'], [5, '₹0.05']])(
    '%i paise → %s', (p, s) => expect(formatINR(p)).toBe(s));
  it('can show a plus sign', () => expect(formatINR(100, { sign: true })).toBe('+₹1'));
});

describe('UPI and phone numbers', () => {
  it.each(['ramesh@okaxis', '9876543210@ybl', 'shop.kirana-1@paytm', 'a_b@upi'])('accepts %s', v => expect(isValidVpa(v)).toBe(true));
  it.each(['', 'ramesh', '@okaxis', 'ramesh@', 'ram esh@ok', 'x@1bank', 'a@b'])('rejects %j', v => expect(isValidVpa(v)).toBe(false));

  it.each([['9876543210', '9876543210'], ['+91 98765 43210', '9876543210'], ['09876543210', '9876543210'], ['919876543210', '9876543210'], ['98765-43210', '9876543210'],
    ['5876543210', null], ['98765', null], ['abc', null]])('%s → %s', (i, o) => expect(normalizeIndianMobile(i)).toBe(o));

  it('builds an NPCI upi:// link with a two-decimal amount', () => {
    const u = upiUri({ vpa: 'shop@okaxis', payee: 'Gupta Kirana', amount: 45050, note: 'Hisaab' });
    expect(u).toBe('upi://pay?pa=shop%40okaxis&pn=Gupta%20Kirana&cu=INR&am=450.50&tn=Hisaab');
    expect(() => upiUri({ vpa: 'bad', payee: 'x' })).toThrow();
  });

  it('builds WhatsApp links with or without a number', () => {
    expect(whatsappUrl('नमस्ते', '+91 98765 43210')).toBe('https://wa.me/919876543210?text=' + encodeURIComponent('नमस्ते'));
    expect(whatsappUrl('hi')).toBe('https://wa.me/?text=hi');
  });

  it('builds a clickable pay page link', () => {
    const u = payPageUrl('https://x.github.io/hisaab/#/home', { vpa: 'a@ybl', payee: 'Shop', amount: 45000 });
    expect(u).toBe('https://x.github.io/hisaab/#/pay?pa=a%40ybl&pn=Shop&am=45000');
  });

  it('writes reminders in Hindi and English', () => {
    const hi = reminderText('hi', { name: 'रमेश जी', balance: 45000, shop: 'गुप्ता किराना', payLink: 'https://p' });
    expect(hi).toContain('₹450 बाकी है');
    expect(hi).toContain('https://p');
    const en = reminderText('en', { name: 'Ramesh', balance: 45000, shop: '', vpa: 'a@ybl' });
    expect(en).toContain('pending balance at our shop is ₹450');
    expect(en).toContain('a@ybl');
  });
});
