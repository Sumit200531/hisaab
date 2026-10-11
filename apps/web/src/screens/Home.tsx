import { useMemo, useState } from 'react';
import { formatINR, matchName, normalizeIndianMobile, type Customer } from '@hisaab/core';
import { useApp } from '../lib/use';
import { agoLabel, dayLabel } from '../lib/i18n';
import { ISearch } from '../ui/Icons';

export function BalanceCell({ c }: { c: Customer }) {
  const app = useApp();
  const L = app.tr;
  return (
    <span className="amt">
      <span className={`v ${c.balance > 0 ? 'gave' : c.balance < 0 ? 'got' : 'zero'}`}>{c.balance ? formatINR(Math.abs(c.balance)) : '—'}</span>
      <span className="k">{c.balance > 0 ? L('owes') : c.balance < 0 ? L('inAdvance') : L('settled')}</span>
    </span>
  );
}

function CustomerRow({ c }: { c: Customer }) {
  const app = useApp();
  return (
    <li>
      <a className="row" href={`#/c/${encodeURIComponent(c.cid)}`}>
        <span className="initial" aria-hidden="true" style={{ background: c.balance > 0 ? 'var(--gave)' : c.balance < 0 ? 'var(--got)' : 'var(--ink-3)' }}>{[...c.name][0]?.toUpperCase()}</span>
        <span className="name">{c.name}</span>
        <BalanceCell c={c} />
        <span className="meta">{c.lastAt ? `${app.tr('lastEntry')}: ${dayLabel(app.lang, c.lastAt)}` : c.phone}</span>
      </a>
    </li>
  );
}

/** The khata page: who owes what, newest activity first. */
export function Home() {
  const app = useApp();
  const L = app.tr;
  const st = app.ledger.state();
  const [q, setQ] = useState('');
  const [showOld, setShowOld] = useState(false);

  const live = st.customers.filter(c => !c.archived);
  const old = st.customers.filter(c => c.archived);
  const shown = useMemo(() => {
    const t = q.trim();
    if (!t) return live;
    const digits = t.replace(/\D/g, '');
    if (digits.length >= 4) return st.customers.filter(c => (normalizeIndianMobile(c.phone) ?? c.phone).includes(digits));
    return matchName(t, st.customers, c => c.name).map(m => m.item);
  }, [q, live, st.customers]);

  return (
    <main className="page" id="main">
      <section className="totals" aria-label={L('toCollect')}>
        <div className="label">{L('toCollect')}</div>
        <div className={`big${st.receivable ? '' : ' zero'}`} data-testid="receivable">{formatINR(st.receivable)}</div>
        {st.advance > 0 && <div className="adv">{L('advance')}: {formatINR(st.advance)}</div>}
        {!app.storage.durable && <p className="offline-note">{app.lang === 'hi' ? 'यह ब्राउज़र हिसाब सेव नहीं कर पा रहा। Chrome में खोलें।' : 'This browser cannot save your khata. Open it in Chrome.'}</p>}
        {app.meta.syncEnabled && app.meta.relay && !app.online && <p className="offline-note">{L('offline')}</p>}
        {app.meta.lastBackup === 0 && st.entryCount >= 10 && (
          <p className="offline-note">{L('safetyBody')} <a href="#/settings" style={{ color: 'var(--focus)', fontWeight: 600 }}>{L('backupNow')}</a></p>
        )}
      </section>

      {st.customers.length > 0 && (
        <label className="search">
          <ISearch />
          <span className="sr-only">{L('search')}</span>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={L('search')} enterKeyHint="search" />
        </label>
      )}

      {st.customers.length === 0 ? (
        <div className="empty">
          <h2>{L('noCustomersTitle')}</h2>
          <p>{L('noCustomersBody')}</p>
        </div>
      ) : (
        <>
          <ul className="ledger" aria-label={L('customers')}>
            {shown.map(c => <CustomerRow key={c.cid} c={c} />)}
          </ul>
          {q && shown.length === 0 && <p className="hint" style={{ padding: '16px 0' }}>{L('noMatches')}</p>}
          {!q && old.length > 0 && (
            <>
              <button className="link-btn section-title" onClick={() => setShowOld(!showOld)} aria-expanded={showOld}>
                {L('archivedHeading')} ({old.length})
              </button>
              {showOld && <ul className="ledger">{old.map(c => <CustomerRow key={c.cid} c={c} />)}</ul>}
            </>
          )}
          <p className="hint" style={{ marginTop: 18 }}>
            {L('stats', { c: live.length, e: st.entryCount })}
            {app.meta.lastSync ? ` · ${L('sync')}: ${agoLabel(app.lang, app.meta.lastSync)}` : ''}
          </p>
        </>
      )}
    </main>
  );
}
