import { useEffect } from 'react';
import { useApp } from './lib/use';
import { t } from './lib/i18n';
import { Home } from './screens/Home';
import { CustomerPage } from './screens/CustomerPage';
import { EntrySheet } from './screens/EntrySheet';
import { Settings } from './screens/Settings';
import { Onboarding, LinkPhone, PayPage } from './screens/Other';
import { IBack, IMinus, IPlus, ISettings } from './ui/Icons';

export function App() {
  const app = useApp();
  useEffect(() => { void app.boot(); }, [app]);
  if (!app.ready) return <div className="book" aria-busy="true" />;

  const r = app.route;
  const L = app.tr;
  const st = app.ledger.state();
  const shop = st.settings.shopName || t(app.lang, 'appName');

  // the pay page is for customers: no khata chrome, no onboarding
  if (r.name === 'pay') return <div className="book plain"><header className="binding"><h1>{t(app.lang, 'appName')}</h1></header><PayPage params={r.params} /></div>;
  if (!app.meta.onboarded && r.name !== 'link') return <div className="book"><header className="binding"><h1>{t(app.lang, 'appName')}<span className="sub">{L('tagline')}</span></h1></header><Onboarding /></div>;

  const home = r.name === 'home';
  const cid = r.name === 'customer' ? r.cid : undefined;
  const syncOn = app.meta.syncEnabled && !!app.meta.relay;

  return (
    <div className={`book${r.name === 'settings' || r.name === 'link' ? ' plain' : ''}`}>
      <a className="sr-only" href="#main">Skip</a>
      <header className="binding">
        {!home && <button className="icon-btn" onClick={() => history.length > 1 ? history.back() : app.go('#/')} aria-label={app.lang === 'hi' ? 'पीछे' : 'Back'}><IBack /></button>}
        <h1>
          {shop}
          <span className="sub">
            {syncOn && <span className={`sync-dot${app.syncing ? ' busy' : app.online ? '' : ' off'}`} aria-hidden="true" />}
            {home ? L('tagline') : r.name === 'customer' ? L('entries') : r.name === 'settings' ? L('settings') : L('linkPhone')}
          </span>
        </h1>
        {r.name !== 'settings' && <button className="ribbon" onClick={() => app.go('#/settings')} aria-label={L('settings')}><ISettings /></button>}
      </header>

      {r.name === 'home' && <Home />}
      {r.name === 'customer' && <CustomerPage cid={r.cid} />}
      {r.name === 'settings' && <Settings />}
      {r.name === 'link' && <LinkPhone />}

      {(home || (cid && st.byId[cid])) && (
        <nav className="actionbar" aria-label={L('entries')}>
          <div className="inner">
            <button className="big-btn gave" onClick={() => app.openSheet('gave', cid)}><IMinus />{L('gave')}</button>
            <button className="big-btn got" onClick={() => app.openSheet('got', cid)}><IPlus />{L('got')}</button>
          </div>
        </nav>
      )}

      {app.sheet && <EntrySheet key={`${app.sheet.kind}-${app.sheet.cid ?? ''}`} />}
      {app.toast && (
        <div className={`toast ${app.toast.tone}`} role="status" key={app.toast.id}>
          <span>{app.toast.text}</span>
          {app.toast.undo && <button onClick={app.toast.undo}>{app.lang === 'hi' ? 'वापस लें' : 'Undo'}</button>}
        </div>
      )}
    </div>
  );
}
