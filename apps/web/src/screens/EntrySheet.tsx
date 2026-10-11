import { useEffect, useMemo, useRef, useState } from 'react';
import { formatINR, matchName, parseQuickEntry, type EntryKind } from '@hisaab/core';
import { useApp } from '../lib/use';
import { listen, voiceSupported } from '../lib/voice';
import { Keypad } from '../ui/Keypad';
import { IClose, IMic, IPlus } from '../ui/Icons';

type When = 'today' | 'yesterday' | string;   // or yyyy-mm-dd

function whenToMs(w: When): number {
  const now = new Date();
  if (w === 'today') return now.getTime();
  if (w === 'yesterday') { const d = new Date(now); d.setDate(d.getDate() - 1); d.setHours(19, 0, 0, 0); return d.getTime(); }
  const [y, m, d] = w.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Record udhaar or a payment. Three taps for the common case:
 * pick the customer, type the amount on the keypad, save. A whole entry can
 * also be spoken or typed in one line ("रमेश साढ़े चार सौ").
 */
export function EntrySheet() {
  const app = useApp();
  const sheet = app.sheet!;
  const st = app.ledger.state();
  const [kind, setKind] = useState<EntryKind>(sheet.kind);
  const [cid, setCid] = useState<string | undefined>(sheet.cid);
  const [newName, setNewName] = useState('');
  const [query, setQuery] = useState('');
  const [paise, setPaise] = useState(0);
  const [note, setNote] = useState('');
  const [when, setWhen] = useState<When>('today');
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [touched, setTouched] = useState(false);
  const stopRef = useRef<() => void>(() => {});
  const nameRef = useRef<HTMLInputElement>(null);
  const L = app.tr;

  const live = useMemo(() => st.customers.filter(c => !c.archived), [st]);
  const suggestions = useMemo(() => {
    const q = query.trim();
    if (!q) return live.slice(0, 6).map(c => ({ item: c, score: 0 }));
    return matchName(q, st.customers, c => c.name).slice(0, 6);
  }, [query, live, st.customers]);
  const exact = suggestions.some(s => s.item.name.toLowerCase() === query.trim().toLowerCase());

  useEffect(() => { if (!sheet.cid) setTimeout(() => nameRef.current?.focus(), 250); }, [sheet.cid]);
  useEffect(() => () => stopRef.current(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') app.closeSheet(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [app]);

  /** Apply a parsed one-liner: name, amount, direction, note. */
  const applyLine = (text: string, fromVoice: boolean) => {
    const p = parseQuickEntry(text);
    if (p.amount) setPaise(p.amount);
    if (p.kind) setKind(p.kind);
    if (p.note) setNote(p.note);
    if (p.name) {
      const best = matchName(p.name, st.customers, c => c.name)[0];
      if (best && best.score >= 75) { setCid(best.item.cid); setNewName(''); setQuery(''); }
      else { setQuery(p.name); if (fromVoice) setCid(undefined); }
    }
    return p;
  };

  const onNameInput = (v: string) => {
    setQuery(v);
    // "ramesh 450" typed in one go: split it into name and amount
    if (/\d|सौ|हज़ार|हजार|sau|hazar/i.test(v) && /\s/.test(v.trim())) {
      const p = parseQuickEntry(v);
      if (p.amount && p.name) { setPaise(p.amount); setQuery(p.name); if (p.kind) setKind(p.kind); }
    }
  };

  const speak = async () => {
    if (listening) { stopRef.current(); return; }
    setHeard('');
    const { done, stop } = listen(app.lang, () => setListening(true));
    stopRef.current = stop;
    const text = await done;
    setListening(false);
    if (!text) { setHeard(L('notHeard')); return; }
    setHeard(L('heard', { text }));
    applyLine(text, true);
  };

  const customer = cid ? st.byId[cid] : undefined;
  const chosenName = customer?.name ?? newName;
  const canSave = !!chosenName && paise > 0;

  const save = async () => {
    setTouched(true);
    if (!canSave) return;
    const id = cid ?? app.addCustomer(newName.trim());
    await app.addEntry(id, kind, paise, note.trim(), when === 'today' ? undefined : whenToMs(when));
  };

  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const custom = when !== 'today' && when !== 'yesterday';

  return (
    <div className="scrim" onClick={e => { if (e.target === e.currentTarget) app.closeSheet(); }}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <header className={`sheet-head ${kind}`}>
          <h2 id="sheet-title">{L(kind === 'gave' ? 'gave' : 'got')}</h2>
          <button className="close-x" onClick={() => app.closeSheet()} aria-label={L('cancel')}><IClose /></button>
        </header>

        <div className="seg" role="group" aria-label={L('amount')} style={{ marginBottom: 14 }}>
          <button type="button" aria-pressed={kind === 'gave'} onClick={() => setKind('gave')} style={kind === 'gave' ? { background: 'var(--gave)' } : undefined}>{L('gave')}</button>
          <button type="button" aria-pressed={kind === 'got'} onClick={() => setKind('got')} style={kind === 'got' ? { background: 'var(--got)' } : undefined}>{L('got')}</button>
        </div>

        {chosenName ? (
          <div className="chosen">
            <span className="nm">{chosenName}{!cid && <small style={{ fontFamily: 'var(--body)', fontSize: 14, color: 'var(--focus)', display: 'block' }}>{L('newCustomer')}</small>}</span>
            {customer && customer.balance !== 0 && <span className={`v ${customer.balance > 0 ? 'gave' : 'got'}`} style={{ font: '400 18px var(--display)' }}>{formatINR(Math.abs(customer.balance))}</span>}
            <button className="link-btn" onClick={() => { setCid(undefined); setNewName(''); setTimeout(() => nameRef.current?.focus(), 30); }}>{L('edit')}</button>
          </div>
        ) : (
          <div>
            <label className="sr-only" htmlFor="entry-name">{L(kind === 'gave' ? 'whoGave' : 'whoPaid')}</label>
            <div className="quick">
              <input id="entry-name" ref={nameRef} className={`input${touched && !chosenName ? ' bad' : ''}`} value={query} autoComplete="off"
                placeholder={L(kind === 'gave' ? 'whoGave' : 'whoPaid')} onChange={e => onNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && query.trim()) { const top = suggestions[0]; if (top && top.score >= 75) setCid(top.item.cid); else { setNewName(query.trim()); } } }} />
              {voiceSupported() && <button type="button" className={`mic${listening ? ' on' : ''}`} onClick={speak} aria-label={L('speak')} aria-pressed={listening}><IMic /></button>}
            </div>
            <div className="hint">{listening ? L('listening') : heard || L('quickHint')}</div>
            <ul className="suggest" aria-label={L('pickCustomer')}>
              {suggestions.map(({ item }) => (
                <li key={item.cid}><button type="button" onClick={() => { setCid(item.cid); setQuery(''); }}>
                  <span>{item.name}</span>
                  {item.balance !== 0 && <span className={`v ${item.balance > 0 ? 'gave' : 'got'}`} style={{ font: '400 18px var(--display)' }}>{formatINR(Math.abs(item.balance))}</span>}
                </button></li>
              ))}
              {query.trim() && !exact && (
                <li><button type="button" className="new" onClick={() => { setNewName(query.trim().slice(0, 60)); setQuery(''); }}>
                  <span>{L('addAs', { name: query.trim().slice(0, 60) })}</span><IPlus />
                </button></li>
              )}
            </ul>
            {touched && !chosenName && <div className="err">{L('pickCustomer')}</div>}
          </div>
        )}

        <div className={`amount-display ${kind}`} aria-live="polite" aria-label={L('amount')}>
          {paise ? formatINR(paise) : <span className="ph">{L('enterAmount')}</span>}
        </div>
        {touched && !paise && <div className="err" style={{ marginTop: -4, marginBottom: 8 }}>{L('enterAmount')}</div>}
        <Keypad value={paise ? String(Math.round(paise / 100)) : ''} onChange={v => setPaise(v ? Number(v) * 100 : 0)} label={L('amount')} />

        <label className="field">
          <span className="sr-only">{L('note')}</span>
          <input className="input" value={note} maxLength={140} placeholder={L('note')} onChange={e => setNote(e.target.value)} />
        </label>

        <div className="when-chips" role="group" aria-label={L('date')}>
          <button type="button" className="chip" aria-pressed={when === 'today'} onClick={() => setWhen('today')}>{L('today')}</button>
          <button type="button" className="chip" aria-pressed={when === 'yesterday'} onClick={() => setWhen('yesterday')}>{L('yesterday')}</button>
          <label className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} aria-pressed={custom}>
            <span className="sr-only">{L('date')}</span>
            <input type="date" value={custom ? when : ''} max={isoDay(new Date())} min="2000-01-01"
              onChange={e => setWhen(e.target.value || 'today')} style={{ border: 0, background: 'transparent', font: 'inherit', color: 'inherit', width: 150 }} />
          </label>
        </div>
        {when === 'yesterday' && <div className="hint">{yesterday.toLocaleDateString(app.lang === 'hi' ? 'hi-IN' : 'en-IN')}</div>}

        <button className={`big-btn ${kind}`} style={{ width: '100%', marginTop: 18 }} onClick={save} aria-disabled={!canSave}>
          {L('save')} {paise ? formatINR(paise) : ''}
        </button>
      </section>
    </div>
  );
}
