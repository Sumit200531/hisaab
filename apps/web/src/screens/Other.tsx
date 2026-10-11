import { useRef, useState } from 'react';
import { formatINR, isValidVpa, parseSyncCode, upiUri } from '@hisaab/core';
import { useApp } from '../lib/use';
import { t } from '../lib/i18n';
import { Qr } from '../ui/Qr';

/** First run: language, shop name, done. Or join an existing khata from another phone. */
export function Onboarding() {
  const app = useApp();
  const L = app.tr;
  const [name, setName] = useState('');
  return (
    <main className="welcome" id="main">
      <div className="mark" aria-hidden="true">{t(app.lang, 'appName')}</div>
      <p className="lead">{L('tagline')}. {L('worksOffline')}</p>

      <h2 style={{ font: '600 18px var(--body)', margin: '0 0 4px', color: 'var(--ink-2)' }}>{L('chooseLang')}</h2>
      <div className="lang-pick" role="group" aria-label={L('chooseLang')}>
        <button aria-pressed={app.lang === 'hi'} onClick={() => app.setLang('hi')} lang="hi">हिंदी</button>
        <button aria-pressed={app.lang === 'en'} onClick={() => app.setLang('en')} lang="en">English</button>
      </div>

      <form onSubmit={e => { e.preventDefault(); void app.finishOnboarding(name); }}>
        <label className="field">
          <span style={{ font: '400 24px var(--display)', color: 'var(--ink)' }}>{L('welcomeTitle')}</span>
          <input id="onb-shop" className="input" value={name} maxLength={80} placeholder={L('shopPlaceholder')} onChange={e => setName(e.target.value)} autoFocus />
          <div className="hint">{L('welcomeHint')}</div>
        </label>
        <button className="big-btn got" style={{ width: '100%', background: 'var(--ink)' }} type="submit">{L('start')}</button>
      </form>

      <p style={{ marginTop: 28, color: 'var(--ink-2)' }}>{L('haveAccount')}</p>
      <a className="btn block" href="#/link">{L('linkPhone')}</a>
    </main>
  );
}

/** Join the khata of another phone: type its secret code, then sync or open a backup file. */
export function LinkPhone() {
  const app = useApp();
  const L = app.tr;
  const [code, setCode] = useState('');
  const [tried, setTried] = useState(false);
  const [linked, setLinked] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const ok = !!parseSyncCode(code);
  return (
    <main className="page wide" id="main">
      <h2 style={{ font: '400 30px/1.2 var(--display)', margin: '20px 0 8px' }}>{L('linkPhone')}</h2>
      {!linked ? (
        <form className="panel" onSubmit={async e => { e.preventDefault(); setTried(true); if (ok && await app.linkTo(code)) setLinked(true); }}>
          <label className="field"><span>{L('enterCode')}</span>
            <input id="link-code" className={`input${tried && !ok ? ' bad' : ''}`} value={code} autoCapitalize="characters" autoComplete="off" spellCheck={false}
              style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '.05em' }} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" onChange={e => setCode(e.target.value)} />
            {tried && !ok && <div className="err">{L('codeInvalid')}</div>}
          </label>
          <p>{L('secretCodeBody')}</p>
          <button className="btn primary block" type="submit">{L('link')}</button>
        </form>
      ) : (
        <section className="panel">
          <h2>{L('linkDone')}</h2>
          <p>{L('linkNeedsData')}</p>
          <div className="stack">
            <button className="btn primary block" onClick={() => file.current?.click()}>{L('restore')}</button>
            <input ref={file} type="file" accept=".hisaab,application/json" hidden aria-label={L('restore')}
              onChange={async e => { const f = e.target.files?.[0]; if (f && await app.restore(f)) app.go('#/'); e.target.value = ''; }} />
            <a className="btn block" href="#/settings">{L('sync')}</a>
            <a className="btn block" href="#/">{L('close')}</a>
          </div>
        </section>
      )}
    </main>
  );
}

/**
 * The page a customer opens from a WhatsApp reminder. It uses only what is in
 * the link (no khata data), shows a QR and a button that opens any UPI app.
 */
export function PayPage({ params }: { params: URLSearchParams }) {
  const app = useApp();
  const L = app.tr;
  const vpa = params.get('pa') ?? '';
  const shop = (params.get('pn') ?? '').slice(0, 60);
  const amount = Number(params.get('am') ?? '0');
  const note = (params.get('tn') ?? '').slice(0, 50);
  const valid = isValidVpa(vpa) && Number.isInteger(amount) && amount > 0 && amount <= 100_000_000_00;
  if (!valid) return <main className="pay" id="main"><h2 style={{ font: '400 28px var(--display)' }}>{L('payInvalid')}</h2></main>;
  const uri = upiUri({ vpa, payee: shop, amount, note });
  return (
    <main className="pay" id="main">
      <h2 style={{ font: '400 26px/1.3 var(--display)', margin: 0, color: 'var(--ink-2)' }}>{L('payTitle', { shop: shop || vpa })}</h2>
      <div className="amount" style={{ color: 'var(--gave)' }}>{formatINR(amount)}</div>
      {note && <div className="hint">{note}</div>}
      <a className="big-btn got" style={{ margin: '18px auto 0', maxWidth: 420, textDecoration: 'none' }} href={uri}>{L('payButton', { amount: formatINR(amount) })}</a>
      <div className="qr"><Qr text={uri} label={L('scanToPay')} /></div>
      <div className="hint">{L('payQrHint')}</div>
      <div className="hint" style={{ marginTop: 6 }}>UPI ID: <strong>{vpa}</strong></div>
      <p className="note">{L('payNote')}</p>
    </main>
  );
}
