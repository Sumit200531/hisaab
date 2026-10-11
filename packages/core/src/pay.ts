/**
 * Money formatting and the two channels shopkeepers actually use to collect:
 * a WhatsApp message and a UPI payment request.
 */

/** ₹ in the Indian numbering system: 124500.5 → "₹1,24,500.50", whole rupees without paise. */
export function formatINR(paise: number, opts: { sign?: boolean } = {}): string {
  const neg = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100), p = abs % 100;
  const body = new Intl.NumberFormat('en-IN').format(rupees) + (p ? '.' + String(p).padStart(2, '0') : '');
  return `${neg ? '−' : opts.sign && paise > 0 ? '+' : ''}₹${body}`;
}

/** Validate a UPI ID (VPA) such as ramesh.kirana@okaxis or 9876543210@ybl. */
export function isValidVpa(vpa: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9.\-_]{1,254}@[a-zA-Z][a-zA-Z0-9]{1,63}$/.test(vpa.trim());
}

/** Normalise an Indian mobile number to 10 digits, or null. Accepts +91, 0-prefix, spaces, dashes. */
export function normalizeIndianMobile(input: string): string | null {
  let d = input.replace(/[\s\-().]/g, '');
  if (d.startsWith('+91')) d = d.slice(3);
  else if (d.startsWith('0091')) d = d.slice(4);
  else if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** NPCI UPI deep link. The amount is fixed to two decimals as the spec requires. */
export function upiUri(p: { vpa: string; payee: string; amount?: number; note?: string }): string {
  if (!isValidVpa(p.vpa)) throw new Error('invalid UPI ID');
  const q = new URLSearchParams({ pa: p.vpa.trim(), pn: p.payee.slice(0, 50) || 'Payee', cu: 'INR' });
  if (p.amount && p.amount > 0) q.set('am', (p.amount / 100).toFixed(2));
  if (p.note) q.set('tn', p.note.slice(0, 50));
  return `upi://pay?${q.toString().replace(/\+/g, '%20')}`;
}

/** Link that opens WhatsApp with a ready message (to a number, or a contact picker without one). */
export function whatsappUrl(text: string, mobile?: string | null): string {
  const n = mobile ? normalizeIndianMobile(mobile) : null;
  return `https://wa.me/${n ? '91' + n : ''}?text=${encodeURIComponent(text)}`;
}

/** Link to the hosted pay page (QR + "pay with any UPI app" button), which WhatsApp shows as clickable. */
export function payPageUrl(base: string, p: { vpa: string; payee: string; amount: number; note?: string }): string {
  const q = new URLSearchParams({ pa: p.vpa.trim(), pn: p.payee, am: String(p.amount) });
  if (p.note) q.set('tn', p.note);
  return `${base.replace(/[#?].*$/, '')}#/pay?${q.toString()}`;
}

export type Lang = 'hi' | 'en';

export function reminderText(lang: Lang, p: { name: string; balance: number; shop: string; vpa?: string; payLink?: string }): string {
  const amt = formatINR(p.balance);
  const lines = lang === 'hi'
    ? [`नमस्ते ${p.name},`, `${p.shop || 'हमारी दुकान'} पर आपका ${amt} बाकी है।`]
    : [`Hello ${p.name},`, `Your pending balance at ${p.shop || 'our shop'} is ${amt}.`];
  if (p.payLink) lines.push(lang === 'hi' ? `UPI से भुगतान करें: ${p.payLink}` : `Pay by UPI: ${p.payLink}`);
  else if (p.vpa) lines.push(lang === 'hi' ? `UPI ID: ${p.vpa}` : `UPI ID: ${p.vpa}`);
  lines.push(lang === 'hi' ? 'धन्यवाद 🙏' : 'Thank you 🙏');
  return lines.join('\n');
}
