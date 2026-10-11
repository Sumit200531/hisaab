import type { Lang } from '@hisaab/core';

/** Every string the app shows, in Hindi and English. Hindi is written the way shopkeepers speak it. */
const STRINGS = {
  appName: { hi: 'हिसाब', en: 'Hisaab' },
  tagline: { hi: 'उधार का पक्का हिसाब', en: 'Your udhaar khata' },

  // onboarding
  chooseLang: { hi: 'भाषा चुनें', en: 'Choose language' },
  welcomeTitle: { hi: 'अपनी दुकान का नाम', en: 'Name of your shop' },
  welcomeHint: { hi: 'यह नाम ग्राहकों को भेजे गए संदेशों में दिखेगा।', en: 'Customers see this name in your reminder messages.' },
  shopPlaceholder: { hi: 'जैसे: गुप्ता किराना स्टोर', en: 'e.g. Gupta Kirana Store' },
  start: { hi: 'शुरू करें', en: 'Start' },
  haveAccount: { hi: 'दूसरे फ़ोन पर पहले से हिसाब चला रहे हैं?', en: 'Already using Hisaab on another phone?' },
  linkPhone: { hi: 'वो खाता यहाँ लाएँ', en: 'Bring that khata here' },
  worksOffline: { hi: 'बिना इंटरनेट के भी चलता है। आपका हिसाब सिर्फ़ आपके फ़ोन में रहता है।', en: 'Works without internet. Your khata stays on your phone.' },

  // home
  toCollect: { hi: 'लेने हैं', en: 'To collect' },
  advance: { hi: 'एडवांस जमा', en: 'Advance held' },
  customers: { hi: 'ग्राहक', en: 'Customers' },
  search: { hi: 'नाम या फ़ोन से खोजें', en: 'Search name or phone' },
  gave: { hi: 'उधार दिया', en: 'Gave credit' },
  got: { hi: 'पैसे मिले', en: 'Got payment' },
  gaveShort: { hi: 'दिया', en: 'Gave' },
  gotShort: { hi: 'मिला', en: 'Got' },
  owes: { hi: 'लेने हैं', en: 'owes you' },
  inAdvance: { hi: 'जमा है', en: 'in advance' },
  settled: { hi: 'हिसाब बराबर', en: 'Settled' },
  noCustomersTitle: { hi: 'पहला ग्राहक जोड़ें', en: 'Add your first customer' },
  noCustomersBody: { hi: 'नीचे "उधार दिया" दबाएँ, नाम लिखें और रकम डालें। बस इतना ही।', en: 'Tap "Gave credit" below, type a name and the amount. That is all.' },
  noMatches: { hi: 'इस नाम का कोई ग्राहक नहीं', en: 'No customer with that name' },
  archivedHeading: { hi: 'पुराने ग्राहक', en: 'Old customers' },
  lastEntry: { hi: 'आख़िरी लेन-देन', en: 'Last entry' },

  // entry sheet
  whoGave: { hi: 'किसको उधार दिया?', en: 'Who took credit?' },
  whoPaid: { hi: 'किससे पैसे मिले?', en: 'Who paid?' },
  typeName: { hi: 'नाम लिखें', en: 'Type a name' },
  newCustomer: { hi: 'नया ग्राहक', en: 'New customer' },
  addAs: { hi: '"{name}" नया ग्राहक जोड़ें', en: 'Add "{name}" as new customer' },
  amount: { hi: 'रकम', en: 'Amount' },
  note: { hi: 'क्या लिया? (ज़रूरी नहीं)', en: 'What for? (optional)' },
  save: { hi: 'सेव करें', en: 'Save' },
  cancel: { hi: 'रहने दें', en: 'Cancel' },
  saved: { hi: '{amount} {kind} — {name}', en: '{amount} {kind} — {name}' },
  speak: { hi: 'बोलकर लिखें', en: 'Speak' },
  listening: { hi: 'सुन रहे हैं… जैसे "रमेश साढ़े चार सौ"', en: 'Listening… e.g. "Ramesh four fifty"' },
  heard: { hi: 'सुना: "{text}"', en: 'Heard: "{text}"' },
  notHeard: { hi: 'आवाज़ समझ नहीं आई। फिर से बोलें या लिखें।', en: 'Could not understand. Speak again or type.' },
  quickHint: { hi: 'या एक लाइन में लिखें: "रमेश 450"', en: 'Or type one line: "Ramesh 450"' },
  enterAmount: { hi: 'रकम डालें', en: 'Enter an amount' },
  pickCustomer: { hi: 'ग्राहक चुनें', en: 'Choose a customer' },
  date: { hi: 'तारीख़', en: 'Date' },
  today: { hi: 'आज', en: 'Today' },
  yesterday: { hi: 'कल', en: 'Yesterday' },

  // customer
  remind: { hi: 'WhatsApp पर याद दिलाएँ', en: 'Remind on WhatsApp' },
  call: { hi: 'फ़ोन करें', en: 'Call' },
  showQr: { hi: 'UPI QR दिखाएँ', en: 'Show UPI QR' },
  statement: { hi: 'पूरा हिसाब भेजें', en: 'Send statement' },
  edit: { hi: 'बदलें', en: 'Edit' },
  name: { hi: 'नाम', en: 'Name' },
  phone: { hi: 'मोबाइल नंबर', en: 'Mobile number' },
  addPhone: { hi: 'नंबर जोड़ें', en: 'Add number' },
  phoneInvalid: { hi: '10 अंकों का सही मोबाइल नंबर डालें', en: 'Enter a valid 10-digit mobile number' },
  archive: { hi: 'पुराने ग्राहकों में डालें', en: 'Move to old customers' },
  unarchive: { hi: 'वापस चालू करें', en: 'Make active again' },
  undo: { hi: 'ग़लत एंट्री हटाएँ', en: 'Remove wrong entry' },
  undoConfirm: { hi: 'यह एंट्री हटा दें? हिसाब से घट जाएगी, पर इतिहास में कटी हुई दिखेगी।', en: 'Remove this entry? It leaves the balance but stays crossed out in history.' },
  removed: { hi: 'एंट्री हटा दी', en: 'Entry removed' },
  entries: { hi: 'लेन-देन', en: 'Entries' },
  noEntries: { hi: 'अभी कोई लेन-देन नहीं', en: 'No entries yet' },
  balance: { hi: 'बाकी', en: 'Balance' },
  addPhoneFirst: { hi: 'WhatsApp भेजने के लिए पहले मोबाइल नंबर जोड़ें', en: 'Add a mobile number to send on WhatsApp' },
  addUpiFirst: { hi: 'QR के लिए पहले दुकान सेटिंग में अपनी UPI ID डालें', en: 'Add your UPI ID in Shop settings to show a QR' },
  scanToPay: { hi: 'स्कैन करके भुगतान करें', en: 'Scan to pay' },
  close: { hi: 'बंद करें', en: 'Close' },

  // settings
  settings: { hi: 'दुकान', en: 'Shop' },
  shopName: { hi: 'दुकान का नाम', en: 'Shop name' },
  owner: { hi: 'आपका नाम', en: 'Your name' },
  upi: { hi: 'आपकी UPI ID', en: 'Your UPI ID' },
  upiHint: { hi: 'जैसे 9876543210@ybl — इसी पर ग्राहक पैसे भेजेंगे', en: 'e.g. 9876543210@ybl — customers pay to this' },
  upiInvalid: { hi: 'UPI ID सही नहीं लग रही (जैसे naam@okaxis)', en: 'That does not look like a UPI ID (e.g. name@okaxis)' },
  language: { hi: 'भाषा', en: 'Language' },
  safety: { hi: 'हिसाब सुरक्षित रखें', en: 'Keep your khata safe' },
  safetyBody: { hi: 'फ़ोन खो गया या टूट गया तो हिसाब ना जाए — बैकअप WhatsApp पर ख़ुद को भेज दें।', en: 'If the phone is lost or broken, your khata is not — send a backup to yourself on WhatsApp.' },
  backupNow: { hi: 'बैकअप भेजें', en: 'Send backup' },
  backupSaved: { hi: 'बैकअप फ़ाइल तैयार है', en: 'Backup file ready' },
  lastBackup: { hi: 'आख़िरी बैकअप: {when}', en: 'Last backup: {when}' },
  never: { hi: 'कभी नहीं', en: 'never' },
  restore: { hi: 'बैकअप से वापस लाएँ', en: 'Restore from backup' },
  restored: { hi: '{n} नई एंट्री मिलीं', en: '{n} new entries restored' },
  restoreErrors: {
    hi: { 'not-a-backup': 'यह हिसाब की बैकअप फ़ाइल नहीं है', 'wrong-shop': 'यह फ़ाइल किसी दूसरी दुकान की है — सही कोड डालें', damaged: 'फ़ाइल ख़राब है' },
    en: { 'not-a-backup': 'This is not a Hisaab backup file', 'wrong-shop': 'This file belongs to another shop — enter its code', damaged: 'The file is damaged' }
  },
  secretCode: { hi: 'आपका गुप्त कोड', en: 'Your secret code' },
  secretCodeBody: { hi: 'दूसरे फ़ोन पर यही कोड डालें। इसे किसी को न बताएँ — इसके बिना कोई आपका हिसाब नहीं पढ़ सकता, हम भी नहीं।', en: 'Type this code on your other phone. Keep it private — without it nobody can read your khata, not even us.' },
  showCode: { hi: 'कोड दिखाएँ', en: 'Show code' },
  copy: { hi: 'कॉपी करें', en: 'Copy' },
  copied: { hi: 'कॉपी हो गया', en: 'Copied' },
  enterCode: { hi: 'दूसरे फ़ोन का गुप्त कोड डालें', en: 'Enter the secret code from the other phone' },
  codeInvalid: { hi: 'कोड 24 अक्षरों का होता है, फिर से जाँचें', en: 'The code has 24 characters; check it again' },
  link: { hi: 'जोड़ें', en: 'Link' },
  linkDone: { hi: 'यह फ़ोन जुड़ गया', en: 'This phone is linked' },
  linkNeedsData: { hi: 'अब पुराने फ़ोन से भेजी बैकअप फ़ाइल खोलें, या इंटरनेट से सिंक करें।', en: 'Now open the backup file from the old phone, or sync over the internet.' },
  sync: { hi: 'इंटरनेट से सिंक', en: 'Sync over internet' },
  syncNow: { hi: 'अभी सिंक करें', en: 'Sync now' },
  syncOn: { hi: 'चालू — {when}', en: 'On — {when}' },
  syncOff: { hi: 'बंद — हिसाब सिर्फ़ इस फ़ोन में है', en: 'Off — the khata is only on this phone' },
  syncBody: { hi: 'दो फ़ोन पर एक ही हिसाब। सब कुछ आपके फ़ोन पर ताला लगकर (एन्क्रिप्ट होकर) जाता है।', en: 'One khata on two phones. Everything is locked (encrypted) on your phone before it leaves.' },
  syncing: { hi: 'सिंक हो रहा है…', en: 'Syncing…' },
  syncDone: { hi: 'सिंक पूरा: {pulled} आईं, {pushed} गईं', en: 'Synced: {pulled} in, {pushed} out' },
  syncFailed: { hi: 'सिंक नहीं हो पाया: {msg}', en: 'Sync failed: {msg}' },
  syncFull: { hi: 'सर्वर पर जगह भर गई है', en: 'The server storage for this shop is full' },
  offline: { hi: 'इंटरनेट नहीं है — हिसाब फ़ोन में सेव है, बाद में सिंक होगा', en: 'No internet — saved on this phone, will sync later' },
  relayUrl: { hi: 'सिंक सर्वर', en: 'Sync server' },
  install: { hi: 'होम स्क्रीन पर लगाएँ', en: 'Add to home screen' },
  installBody: { hi: 'ऐप की तरह खुलेगा, बिना इंटरनेट भी।', en: 'Opens like an app, even without internet.' },
  about: { hi: 'हिसाब मुफ़्त और ओपन-सोर्स है।', en: 'Hisaab is free and open source.' },
  stats: { hi: '{c} ग्राहक · {e} लेन-देन', en: '{c} customers · {e} entries' },

  // pay page
  payTitle: { hi: '{shop} को भुगतान', en: 'Pay {shop}' },
  payButton: { hi: '{amount} UPI ऐप से भेजें', en: 'Pay {amount} with any UPI app' },
  payQrHint: { hi: 'किसी दूसरे फ़ोन से है तो यह QR स्कैन करें', en: 'Paying from another phone? Scan this QR' },
  payInvalid: { hi: 'यह भुगतान लिंक अधूरा है', en: 'This payment link is incomplete' },
  payNote: { hi: 'पैसे सीधे दुकानदार के खाते में जाते हैं। हिसाब ऐप पैसे नहीं रखता।', en: 'Money goes straight to the shopkeeper. Hisaab never holds money.' }
} as const;

type Key = keyof typeof STRINGS;
type Simple = { [K in Key]: (typeof STRINGS)[K] extends { hi: string } ? K : never }[Key];

export function t(lang: Lang, key: Simple, params: Record<string, string | number> = {}): string {
  const s = (STRINGS[key] as { hi: string; en: string })[lang];
  return s.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''));
}

export function restoreError(lang: Lang, reason: string): string {
  const m = STRINGS.restoreErrors[lang] as Record<string, string>;
  return m[reason] ?? m.damaged;
}

const HI_MONTHS = ['जन', 'फ़र', 'मार्च', 'अप्रै', 'मई', 'जून', 'जुला', 'अग', 'सित', 'अक्टू', 'नव', 'दिस'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "आज", "कल", "12 अक्टू" — dates the way a register is read. */
export function dayLabel(lang: Lang, ms: number, now = Date.now()): string {
  const d = new Date(ms), n = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(n) - startOf(d)) / 86_400_000);
  if (diff === 0) return t(lang, 'today');
  if (diff === 1) return t(lang, 'yesterday');
  const m = (lang === 'hi' ? HI_MONTHS : EN_MONTHS)[d.getMonth()];
  return `${d.getDate()} ${m}${d.getFullYear() !== n.getFullYear() ? ' ' + d.getFullYear() : ''}`;
}

export function timeLabel(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'am' : 'pm'}`;
}

export function agoLabel(lang: Lang, ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return lang === 'hi' ? 'अभी' : 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return lang === 'hi' ? `${m} मिनट पहले` : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return lang === 'hi' ? `${h} घंटे पहले` : `${h} h ago`;
  return dayLabel(lang, ms, now);
}
