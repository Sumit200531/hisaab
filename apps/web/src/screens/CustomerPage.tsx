import { useState } from 'react';
import { formatINR, isValidVpa, normalizeIndianMobile, payPageUrl, reminderText, upiUri, whatsappUrl, type Entry } from '@hisaab/core';
import { useApp } from '../lib/use';
import { dayLabel, timeLabel } from '../lib/i18n';
import { Qr } from '../ui/Qr';
import { IEdit, IPhone, IQr, IShare, IWhatsapp } from '../ui/Icons';

/** Base URL of this app, for pay links that open in the customer's browser. */
export const appBase = () => location.href.replace(/#.*$/, '');

export function CustomerPage({ cid }: { cid: string }) {
  const app = useApp();
  const L = app.tr;
  const st = app.ledger.state();
  const c = st.byId[cid];
  const [editing, setEditing] = useState(false);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [qr, setQr] = useState(false);

  if (!c) return <main className="page"><div className="empty"><h2>{L('noMatches')}</h2><a className="btn" href="#/">{L('close')}</a></div></main>;

  const shop = st.settings.shopName || (app.lang === 'hi' ? 'दुकान' : 'Shop');
  const vpa = st.settings.upi;
  const mobile = normalizeIndianMobile(c.phone);
  const due = c.balance > 0 ? c.balance : 0;

  // running balance, computed oldest → newest, shown newest first
  const live = [...c.entries].reverse();
  const running = new Map<string, number>();
  let bal = 0;
  for (const e of live) { if (!e.voided) bal += e.kind === 'gave' ? e.amt : -e.amt; running.set(e.eid, bal); }
  const byDay: { day: string; rows: Entry[] }[] = [];
  for (const e of c.entries) {
    const d = dayLabel(app.lang, e.at);
    if (byDay.at(-1)?.day === d) byDay.at(-1)!.rows.push(e); else byDay.push({ day: d, rows: [e] });
  }

  const remind = () => {
    const payLink = vpa && isValidVpa(vpa) && due ? payPageUrl(appBase(), { vpa, payee: shop, amount: due, note: c.name }) : undefined;
    const text = reminderText(app.lang, { name: c.name, balance: c.balance, shop, vpa: payLink ? undefined : vpa, payLink });
    window.open(whatsappUrl(text, mobile), '_blank', 'noopener');
  };

  const statement = () => {
    const lines = [`${shop} — ${c.name}`, ''];
    for (const e of c.entries.filter(x => !x.voided).slice(0, 25).reverse()) {
      lines.push(`${dayLabel(app.lang, e.at)}  ${e.kind === 'gave' ? L('gaveShort') : L('gotShort')} ${formatINR(e.amt)}${e.note ? ` (${e.note})` : ''}`);
    }
    lines.push('', `${L('balance')}: ${formatINR(Math.abs(c.balance))} ${c.balance > 0 ? L('owes') : c.balance < 0 ? L('inAdvance') : L('settled')}`);
    window.open(whatsappUrl(lines.join('\n'), mobile), '_blank', 'noopener');
  };

  return (
    <main className="page" id="main">
      <section className="cust-head">
        <div className="backbar">
          <h2 style={{ font: '400 32px/1.15 var(--display)', margin: 0, flex: 1, overflowWrap: 'anywhere' }}>{c.name}</h2>
          <button className="btn" style={{ minHeight: 46, padding: '0 14px' }} onClick={() => setEditing(true)} aria-label={`${L('edit')} ${c.name}`}><IEdit /></button>
        </div>
        {c.phone && <div className="hint" style={{ fontSize: 16 }}>{c.phone}</div>}
        <div className="bal-label" style={{ marginTop: 12 }}>{c.balance > 0 ? L('owes') : c.balance < 0 ? L('inAdvance') : L('settled')}</div>
        <div className={`bal v ${c.balance > 0 ? 'gave' : c.balance < 0 ? 'got' : 'zero'}`} data-testid="balance">{formatINR(Math.abs(c.balance))}</div>

        <div className="cust-actions">
          {c.balance > 0 && <button className="btn wa wide" onClick={remind}><IWhatsapp />{L('remind')}</button>}
          {mobile ? <a className="btn" href={`tel:+91${mobile}`}><IPhone />{L('call')}</a> : <button className="btn" onClick={() => setEditing(true)}><IPhone />{L('addPhone')}</button>}
          <button className="btn" onClick={() => vpa ? setQr(true) : app.notify(L('addUpiFirst'), 'warn')}><IQr />QR</button>
          {c.entries.length > 0 && <button className="btn wide" onClick={statement}><IShare />{L('statement')}</button>}
        </div>
        {c.balance > 0 && !mobile && <div className="hint">{L('addPhoneFirst')}</div>}
      </section>

      {c.entries.length === 0 ? <p className="hint" style={{ padding: '20px 0' }}>{L('noEntries')}</p> : (
        <table className="khata">
          <caption className="sr-only">{L('entries')}</caption>
          <thead><tr><th>{L('entries')}</th><th className="num">{L('gaveShort')}</th><th className="num">{L('gotShort')}</th></tr></thead>
          <tbody>
            {byDay.map(g => [
              <tr key={g.day} className="day-row"><td colSpan={3}>{g.day}</td></tr>,
              ...g.rows.map(e => (
                <tr key={e.eid} className={`entry${e.voided ? ' voided' : ''}`} onClick={() => setEntry(e)} tabIndex={0} onKeyDown={k => { if (k.key === 'Enter') setEntry(e); }}>
                  <td>
                    <div className="when">{timeLabel(e.at)}</div>
                    {e.note && <div className="note">{e.note}</div>}
                    {!e.voided && <div className="running">{L('balance')} {formatINR(running.get(e.eid)!)}</div>}
                  </td>
                  <td className="num gave">{e.kind === 'gave' ? formatINR(e.amt) : ''}</td>
                  <td className="num got">{e.kind === 'got' ? formatINR(e.amt) : ''}</td>
                </tr>
              ))
            ])}
          </tbody>
        </table>
      )}

      {editing && <EditCustomer cid={cid} onClose={() => setEditing(false)} />}

      {entry && (
        <div className="scrim" onClick={e => { if (e.target === e.currentTarget) setEntry(null); }}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="entry-title">
            <h2 id="entry-title" style={{ color: entry.kind === 'gave' ? 'var(--gave)' : 'var(--got)' }}>
              {formatINR(entry.amt)} {L(entry.kind === 'gave' ? 'gaveShort' : 'gotShort')}
            </h2>
            <p>{dayLabel(app.lang, entry.at)}, {timeLabel(entry.at)}{entry.note ? ` — ${entry.note}` : ''}</p>
            {!entry.voided && <p>{L('undoConfirm')}</p>}
            <div className="stack">
              {!entry.voided && <button className="btn danger block" onClick={() => { void app.voidEntry(entry.eid); setEntry(null); }}>{L('undo')}</button>}
              <button className="btn block" onClick={() => setEntry(null)}>{L('close')}</button>
            </div>
          </div>
        </div>
      )}

      {qr && vpa && (
        <div className="scrim" onClick={e => { if (e.target === e.currentTarget) setQr(false); }}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="qr-title" style={{ textAlign: 'center' }}>
            <h2 id="qr-title">{L('scanToPay')}</h2>
            <div style={{ font: '400 40px var(--display)', color: 'var(--gave)' }}>{due ? formatINR(due) : ''}</div>
            <div style={{ background: '#fff', padding: 12, borderRadius: 16, display: 'inline-block', margin: '10px 0' }}>
              <div style={{ width: 'min(260px, 66vw)' }}><Qr text={upiUri({ vpa, payee: shop, amount: due || undefined, note: c.name })} label={L('scanToPay')} /></div>
            </div>
            <p>{shop} · {vpa}</p>
            <button className="btn block" onClick={() => setQr(false)}>{L('close')}</button>
          </div>
        </div>
      )}
    </main>
  );
}

function EditCustomer({ cid, onClose }: { cid: string; onClose: () => void }) {
  const app = useApp();
  const L = app.tr;
  const c = app.ledger.state().byId[cid];
  const [name, setName] = useState(c.name);
  const [phone, setPhone] = useState(c.phone);
  const [tried, setTried] = useState(false);
  const phoneOk = !phone.trim() || !!normalizeIndianMobile(phone);
  const save = async () => {
    setTried(true);
    if (!name.trim() || !phoneOk) return;
    await app.updateCustomer(cid, 'name', name.trim().slice(0, 60));
    await app.updateCustomer(cid, 'phone', phone.trim() ? normalizeIndianMobile(phone)! : '');
    onClose();
  };
  return (
    <div className="scrim" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="edit-title" onSubmit={e => { e.preventDefault(); void save(); }}>
        <h2 id="edit-title">{L('edit')}</h2>
        <label className="field"><span>{L('name')}</span>
          <input id="cust-name" className={`input${tried && !name.trim() ? ' bad' : ''}`} value={name} maxLength={60} onChange={e => setName(e.target.value)} />
        </label>
        <label className="field"><span>{L('phone')}</span>
          <input id="cust-phone" className={`input${tried && !phoneOk ? ' bad' : ''}`} value={phone} inputMode="tel" autoComplete="tel" maxLength={20} placeholder="98765 43210" onChange={e => setPhone(e.target.value)} />
          {tried && !phoneOk && <div className="err">{L('phoneInvalid')}</div>}
        </label>
        <div className="stack">
          <button className="btn primary block" type="submit">{L('save')}</button>
          <button className="btn block" type="button" onClick={() => { void app.updateCustomer(cid, 'archived', !c.archived); onClose(); }}>{c.archived ? L('unarchive') : L('archive')}</button>
          <button className="btn block" type="button" onClick={onClose}>{L('cancel')}</button>
        </div>
      </form>
    </div>
  );
}
