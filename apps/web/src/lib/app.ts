import {
  Ledger, newDeviceId, newSyncCode, parseSyncCode, deriveKeys, makeBackup, readBackup, syncLedger, httpTransport,
  BackupError, SyncError, formatINR, transliterate, type EntryKind, type Lang, type ShopKeys, type VersionVector, type CustomerField, type SettingField
} from '@hisaab/core';
import { openStorage, type Meta, type Storage } from './storage';
import { t, restoreError } from './i18n';

export type Route =
  | { name: 'home' } | { name: 'customer'; cid: string } | { name: 'settings' } | { name: 'link' }
  | { name: 'pay'; params: URLSearchParams };

export interface Sheet { kind: EntryKind; cid?: string }
export interface Toast { text: string; tone: 'ok' | 'warn' | 'error'; undo?: () => void; id: number }

const DEFAULT_RELAY = (import.meta.env.VITE_RELAY_URL as string | undefined) ?? '';

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#/, '') || '/';
  const [path, query = ''] = h.split('?');
  if (path === '/pay') return { name: 'pay', params: new URLSearchParams(query) };
  const m = /^\/c\/(.+)$/.exec(path);
  if (m) return { name: 'customer', cid: decodeURIComponent(m[1]) };
  if (path === '/settings') return { name: 'settings' };
  if (path === '/link') return { name: 'link' };
  return { name: 'home' };
}

/**
 * All app state and actions. Components subscribe through useApp() and read
 * fields directly; every change goes through a method that calls emit().
 */
export class App {
  ready = false;
  storage!: Storage;
  meta: Meta = { dev: '', code: '', lang: 'hi', onboarded: false, relay: DEFAULT_RELAY, syncEnabled: !!DEFAULT_RELAY, lastSync: 0, lastBackup: 0 };
  ledger!: Ledger;
  keys: ShopKeys | null = null;
  route: Route = parseRoute(typeof location !== 'undefined' ? location.hash : '');
  sheet: Sheet | null = null;
  toast: Toast | null = null;
  syncing = false;
  syncError = '';
  online = typeof navigator === 'undefined' ? true : navigator.onLine;
  installPrompt: (Event & { prompt: () => Promise<void> }) | null = null;
  version = 0;

  private persisted: VersionVector = {};
  private listeners = new Set<() => void>();
  private syncTimer: ReturnType<typeof setTimeout> | undefined;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getVersion = () => this.version;
  emit() { this.version++; for (const l of this.listeners) l(); }

  get lang(): Lang { return this.meta.lang; }
  tr = (key: Parameters<typeof t>[1], params?: Record<string, string | number>) => t(this.meta.lang, key, params);

  /* ------------------------------------------------------------ startup */
  async boot() {
    this.storage = await openStorage();
    const saved = await this.storage.loadMeta();
    this.meta = { ...this.meta, ...saved };
    if (!this.meta.dev) this.meta.dev = newDeviceId();
    if (!this.meta.code) this.meta.code = newSyncCode();
    if (!saved.lang) this.meta.lang = navigator.language?.toLowerCase().startsWith('hi') ? 'hi' : (saved.lang ?? 'hi');
    await this.storage.saveMeta(this.meta);
    const ops = await this.storage.loadOps();
    this.ledger = new Ledger(this.meta.dev, ops);
    this.persisted = this.ledger.versionVector();
    this.keys = await deriveKeys(this.meta.code).catch(() => null);
    document.documentElement.lang = this.meta.lang;

    window.addEventListener('hashchange', () => { this.route = parseRoute(location.hash); this.sheet = null; this.emit(); window.scrollTo(0, 0); });
    window.addEventListener('online', () => { this.online = true; this.emit(); this.scheduleSync(500); });
    window.addEventListener('offline', () => { this.online = false; this.emit(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.scheduleSync(1000); });
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this.installPrompt = e as App['installPrompt']; this.emit(); });
    setInterval(() => this.scheduleSync(0), 5 * 60_000);

    this.ready = true;
    this.emit();
    this.scheduleSync(1500);
  }

  go(hash: string) { if (location.hash !== hash) location.hash = hash; else { this.route = parseRoute(hash); this.emit(); } }

  /* ------------------------------------------------------------ persistence */
  private async persist() {
    const fresh = this.ledger.since(this.persisted);
    try { await this.storage.putOps(fresh); this.persisted = this.ledger.versionVector(); }
    catch { this.notify(this.lang === 'hi' ? 'फ़ोन में सेव नहीं हो पाया — जगह भर गई है?' : 'Could not save on this phone — storage full?', 'error'); }
    this.scheduleSync(4000);
  }

  private async saveMeta(m: Partial<Meta>) { this.meta = { ...this.meta, ...m }; await this.storage.saveMeta(m); this.emit(); }

  notify(text: string, tone: Toast['tone'] = 'ok', undo?: () => void) {
    this.toast = { text, tone, undo, id: Date.now() };
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toast = null; this.emit(); }, undo ? 6000 : 3200);
    this.emit();
  }

  /* ------------------------------------------------------------ onboarding & settings */
  async setLang(lang: Lang) { document.documentElement.lang = lang; await this.saveMeta({ lang }); }

  async finishOnboarding(shopName: string) {
    if (shopName.trim()) this.ledger.setSetting('shopName', shopName.trim().slice(0, 80));
    await this.persist();
    await this.saveMeta({ onboarded: true });
  }

  async setSetting(f: SettingField, v: string) {
    if (this.ledger.state().settings[f] === v) return;
    this.ledger.setSetting(f, v); await this.persist(); this.emit();
  }

  /* ------------------------------------------------------------ khata actions */
  openSheet(kind: EntryKind, cid?: string) { this.sheet = { kind, cid }; this.toast = null; this.emit(); }
  closeSheet() { this.sheet = null; this.emit(); }

  addCustomer(name: string, phone = ''): string {
    const cid = this.ledger.addCustomer(name.slice(0, 60), phone);
    void this.persist();
    this.emit();
    return cid;
  }

  async addEntry(cid: string, kind: EntryKind, amount: number, note: string, at?: number) {
    const eid = this.ledger.addEntry(cid, kind, amount, note.slice(0, 140), at);
    await this.persist();
    this.sheet = null;
    const c = this.ledger.state().byId[cid];
    this.notify(this.tr('saved', { amount: formatINR(amount), kind: this.tr(kind === 'gave' ? 'gaveShort' : 'gotShort'), name: c.name }), 'ok',
      () => { void this.voidEntry(eid, true); });
  }

  async voidEntry(eid: string, silent = false) {
    this.ledger.voidEntry(eid);
    await this.persist();
    if (!silent) this.notify(this.tr('removed')); else { this.toast = null; this.emit(); }
  }

  async updateCustomer(cid: string, f: CustomerField, v: string | boolean) {
    const c = this.ledger.state().byId[cid];
    if (!c || c[f] === v) return;
    this.ledger.updateCustomer(cid, f, v); await this.persist(); this.emit();
  }

  /* ------------------------------------------------------------ backups */
  async backupFile(): Promise<File> {
    if (!this.keys) throw new Error('no keys');
    const b = await makeBackup(this.keys, this.ledger.all());
    const shop = transliterate(this.ledger.state().settings.shopName || 'khata').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'khata';
    const d = new Date();
    const name = `hisaab-${shop}-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.hisaab`;
    return new File([JSON.stringify(b)], name, { type: 'application/json' });
  }

  /** Share the backup (WhatsApp, Drive, email…) where supported, otherwise download it. */
  async shareBackup(): Promise<'shared' | 'downloaded' | 'cancelled'> {
    const file = await this.backupFile();
    let how: 'shared' | 'downloaded' | 'cancelled';
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      try { await nav.share({ files: [file], title: 'Hisaab backup', text: this.lang === 'hi' ? 'हिसाब का बैकअप — इसे संभाल कर रखें' : 'Hisaab backup — keep it safe' }); how = 'shared'; }
      catch (e) { how = (e as Error).name === 'AbortError' ? 'cancelled' : 'downloaded'; if (how === 'downloaded') this.download(file); }
    } else { this.download(file); how = 'downloaded'; }
    if (how !== 'cancelled') { await this.saveMeta({ lastBackup: Date.now() }); this.notify(this.tr('backupSaved')); }
    return how;
  }

  private download(file: File) {
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async restore(file: File): Promise<boolean> {
    if (!this.keys) return false;
    try {
      if (file.size > 20 * 1024 * 1024) throw new BackupError('not-a-backup');
      const json = JSON.parse(await file.text());
      const ops = await readBackup(this.keys, json);
      const r = this.ledger.merge(ops);
      await this.persist();
      this.notify(this.tr('restored', { n: r.added }));
      return true;
    } catch (e) {
      const reason = e instanceof BackupError ? e.reason : 'not-a-backup';
      this.notify(restoreError(this.lang, reason), 'error');
      return false;
    }
  }

  /* ------------------------------------------------------------ linking & sync */
  /** Adopt another phone's sync code: this phone joins that shop. Local entries are kept and merged. */
  async linkTo(codeInput: string): Promise<boolean> {
    const code = parseSyncCode(codeInput);
    if (!code) { this.notify(this.tr('codeInvalid'), 'error'); return false; }
    this.keys = await deriveKeys(code);
    await this.saveMeta({ code, onboarded: true, lastSync: 0 });
    this.notify(this.tr('linkDone'));
    if (this.meta.relay && this.meta.syncEnabled) await this.sync();
    return true;
  }

  async setRelay(relay: string, enabled: boolean) {
    await this.saveMeta({ relay: relay.trim().replace(/\/+$/, ''), syncEnabled: enabled });
    if (enabled) await this.sync();
  }

  scheduleSync(delay: number) {
    clearTimeout(this.syncTimer);
    if (!this.meta.relay || !this.meta.syncEnabled) return;
    this.syncTimer = setTimeout(() => { void this.sync(true); }, delay);
  }

  async sync(background = false): Promise<void> {
    if (this.syncing || !this.keys || !this.meta.relay || !this.meta.syncEnabled) return;
    if (!navigator.onLine) { this.online = false; if (!background) this.notify(this.tr('offline'), 'warn'); this.emit(); return; }
    this.syncing = true; this.emit();
    try {
      const r = await syncLedger(this.ledger, this.keys, httpTransport(this.meta.relay));
      await this.persist().catch(() => {});
      clearTimeout(this.syncTimer);
      this.syncError = r.full ? this.tr('syncFull') : '';
      await this.saveMeta({ lastSync: Date.now() });
      if (!background || r.pulled) this.notify(this.tr('syncDone', { pulled: r.pulled, pushed: r.pushed }), r.full ? 'warn' : 'ok');
    } catch (e) {
      const msg = e instanceof SyncError ? e.message : (e as Error).name === 'AbortError' ? (this.lang === 'hi' ? 'समय ख़त्म' : 'timed out') : (this.lang === 'hi' ? 'सर्वर तक नहीं पहुँचे' : 'could not reach the server');
      this.syncError = msg;
      if (!background) this.notify(this.tr('syncFailed', { msg }), 'error');
    } finally { this.syncing = false; this.emit(); }
  }

  async install() {
    if (!this.installPrompt) return;
    await this.installPrompt.prompt();
    this.installPrompt = null; this.emit();
  }
}

export const app = new App();
