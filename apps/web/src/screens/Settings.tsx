import { useRef, useState } from 'react';
import { isValidVpa } from '@hisaab/core';
import { useApp } from '../lib/use';
import { agoLabel, t } from '../lib/i18n';
import { IShare, ISync } from '../ui/Icons';

export function Settings() {
  const app = useApp();
  const L = app.tr;
  const s = app.ledger.state().settings;
  const [shop, setShop] = useState(s.shopName);
  const [owner, setOwner] = useState(s.owner);
  const [upi, setUpi] = useState(s.upi);
  const [showCode, setShowCode] = useState(false);
  const [relay, setRelay] = useState(app.meta.relay);
  const file = useRef<HTMLInputElement>(null);
  const upiOk = !upi.trim() || isValidVpa(upi);
  const st = app.ledger.state();

  const saveShop = async () => {
    await app.setSetting('shopName', shop.trim().slice(0, 80));
    await app.setSetting('owner', owner.trim().slice(0, 80));
    if (upiOk) await app.setSetting('upi', upi.trim());
    app.notify(app.lang === 'hi' ? 'सेव हो गया' : 'Saved');
  };

  return (
    <main className="page wide" id="main">
      <h2 style={{ font: '400 32px/1.2 var(--display)', margin: '20px 0 0' }}>{L('settings')}</h2>

      <form className="panel" onSubmit={e => { e.preventDefault(); void saveShop(); }}>
        <label className="field"><span>{L('shopName')}</span>
          <input id="set-shop" className="input" value={shop} maxLength={80} onChange={e => setShop(e.target.value)} placeholder={L('shopPlaceholder')} />
        </label>
        <label className="field"><span>{L('owner')}</span>
          <input id="set-owner" className="input" value={owner} maxLength={80} onChange={e => setOwner(e.target.value)} />
        </label>
        <label className="field"><span>{L('upi')}</span>
          <input id="set-upi" className={`input${upiOk ? '' : ' bad'}`} value={upi} maxLength={80} inputMode="email" autoCapitalize="off" autoComplete="off" onChange={e => setUpi(e.target.value)} placeholder="9876543210@ybl" />
          {upiOk ? <div className="hint">{L('upiHint')}</div> : <div className="err">{L('upiInvalid')}</div>}
        </label>
        <button className="btn primary block" type="submit" disabled={!upiOk}>{L('save')}</button>
      </form>

      <section className="panel">
        <h2>{L('language')}</h2>
        <div className="seg" role="group" aria-label={L('language')}>
          <button aria-pressed={app.lang === 'hi'} onClick={() => app.setLang('hi')} lang="hi">हिंदी</button>
          <button aria-pressed={app.lang === 'en'} onClick={() => app.setLang('en')} lang="en">English</button>
        </div>
      </section>

      <section className="panel">
        <h2>{L('safety')}</h2>
        <p>{L('safetyBody')}</p>
        <div className="stack">
          <button className="btn primary block" onClick={() => app.shareBackup()}><IShare />{L('backupNow')}</button>
          <div className="hint">{L('lastBackup', { when: app.meta.lastBackup ? agoLabel(app.lang, app.meta.lastBackup) : L('never') })}</div>
          <button className="btn block" onClick={() => file.current?.click()}>{L('restore')}</button>
          <input ref={file} type="file" accept=".hisaab,application/json" hidden aria-label={L('restore')}
            onChange={async e => { const f = e.target.files?.[0]; if (f) await app.restore(f); e.target.value = ''; }} />
        </div>
      </section>

      <section className="panel">
        <h2>{L('secretCode')}</h2>
        <p>{L('secretCodeBody')}</p>
        {showCode ? (
          <div className="stack">
            <div className="code-box" data-testid="sync-code">{app.meta.code}</div>
            <button className="btn block" onClick={async () => {
              try { await navigator.clipboard.writeText(app.meta.code); app.notify(L('copied')); } catch { /* select instead */ }
            }}>{L('copy')}</button>
          </div>
        ) : <button className="btn block" onClick={() => setShowCode(true)}>{L('showCode')}</button>}
        <a className="link-btn" href="#/link" style={{ display: 'inline-block', marginTop: 8 }}>{L('haveAccount')}</a>
      </section>

      <section className="panel">
        <h2>{L('sync')}</h2>
        <p>{L('syncBody')}</p>
        <div className="hint" style={{ marginBottom: 10 }} data-testid="sync-status">
          {app.meta.syncEnabled && app.meta.relay
            ? L('syncOn', { when: app.meta.lastSync ? agoLabel(app.lang, app.meta.lastSync) : L('never') })
            : L('syncOff')}
          {app.syncError && <div className="err">{app.syncError}</div>}
        </div>
        <label className="field"><span>{L('relayUrl')}</span>
          <input id="set-relay" className="input" value={relay} inputMode="url" autoCapitalize="off" placeholder="https://hisaab-relay.example.com" onChange={e => setRelay(e.target.value)} />
        </label>
        <div className="stack">
          {app.meta.syncEnabled && app.meta.relay ? (
            <>
              <button className="btn primary block" disabled={app.syncing} onClick={() => app.sync()}><ISync />{app.syncing ? L('syncing') : L('syncNow')}</button>
              <button className="btn block" onClick={() => app.setRelay(relay, false)}>{app.lang === 'hi' ? 'सिंक बंद करें' : 'Turn sync off'}</button>
            </>
          ) : (
            <button className="btn primary block" disabled={!/^https?:\/\/\S+$/.test(relay.trim())} onClick={() => app.setRelay(relay, true)}>
              <ISync />{app.lang === 'hi' ? 'सिंक चालू करें' : 'Turn sync on'}
            </button>
          )}
        </div>
      </section>

      {app.installPrompt && (
        <section className="panel">
          <h2>{L('install')}</h2>
          <p>{L('installBody')}</p>
          <button className="btn primary block" onClick={() => app.install()}>{L('install')}</button>
        </section>
      )}

      <p className="hint" style={{ margin: '20px 0 40px' }}>
        {L('stats', { c: st.customers.length, e: st.entryCount })} · {t(app.lang, 'about')}{' '}
        <a href="https://github.com/Sumit200531/hisaab" target="_blank" rel="noopener" style={{ color: 'var(--focus)' }}>GitHub</a>
      </p>
    </main>
  );
}
