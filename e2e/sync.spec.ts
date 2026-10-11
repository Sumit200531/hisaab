import { test, expect, type Browser } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { onboard, addEntry, enableSync, syncCode, RELAY } from './helpers';

const phone = async (browser: Browser) => {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, locale: 'hi-IN' });
  return { ctx, page: await ctx.newPage() };
};

test('two phones share one khata through the encrypted relay, including offline edits', async ({ browser }) => {
  const a = await phone(browser), b = await phone(browser);
  await onboard(a.page, 'डेयरी');
  await enableSync(a.page);
  await a.page.goto('/');
  await addEntry(a.page, 'gave', 'सुनीता', 1250);
  const code = await syncCode(a.page);
  await a.page.getByRole('button', { name: 'अभी सिंक करें' }).click();
  await expect(a.page.locator('.toast')).toContainText('सिंक पूरा');

  // phone B joins with the secret code
  await b.page.goto('/#/link');
  await b.page.locator('#link-code').fill(code.toLowerCase().replace(/-/g, ' '));   // typed sloppily
  await b.page.getByRole('button', { name: 'जोड़ें' }).click();
  await enableSync(b.page);
  await b.page.goto('/');
  await expect(b.page.getByTestId('receivable')).toHaveText('₹1,250');
  await expect(b.page.locator('.binding h1')).toContainText('डेयरी');

  // B goes offline, records a payment; it is kept locally
  await b.ctx.setOffline(true);
  await addEntry(b.page, 'got', 'सुनीता', 500);
  await expect(b.page.getByTestId('receivable')).toHaveText('₹750');
  await b.ctx.setOffline(false);
  await b.page.goto('/#/settings');
  await b.page.getByRole('button', { name: 'अभी सिंक करें' }).click();
  await expect(b.page.locator('.toast')).toContainText('सिंक पूरा');

  // A syncs and sees B's payment
  await a.page.goto('/#/settings');
  await a.page.getByRole('button', { name: 'अभी सिंक करें' }).click();
  await a.page.goto('/');
  await expect(a.page.getByTestId('receivable')).toHaveText('₹750');
  await a.ctx.close(); await b.ctx.close();
});

test('the relay stores nothing readable', async ({ browser, request }) => {
  const a = await phone(browser);
  const bodies: string[] = [];
  a.page.on('request', r => { if (r.url().startsWith(RELAY)) bodies.push(r.postData() ?? ''); });
  await onboard(a.page, 'Secret Store');
  await enableSync(a.page);
  await a.page.goto('/');
  await addEntry(a.page, 'gave', 'Kamala Devi', 987);
  await a.page.goto('/#/settings');
  await a.page.getByRole('button', { name: 'अभी सिंक करें' }).click();
  await expect(a.page.locator('.toast')).toContainText('सिंक पूरा');
  const wire = bodies.join('\n');
  expect(wire.length).toBeGreaterThan(100);
  for (const secret of ['Kamala', 'Secret Store', '98700', '987']) expect(wire).not.toContain(secret);
  expect((await request.get(`${RELAY}/health`)).ok()).toBe(true);
  await a.ctx.close();
});

test('a backup file restores the khata on a new phone, and only with the right code', async ({ browser }, info) => {
  const a = await phone(browser), b = await phone(browser), c = await phone(browser);
  await onboard(a.page, 'बैकअप दुकान');
  await addEntry(a.page, 'gave', 'मोहन', 640);
  await addEntry(a.page, 'gave', 'राधा', 75);
  const code = await syncCode(a.page);
  const [dl] = await Promise.all([a.page.waitForEvent('download'), a.page.getByRole('button', { name: 'बैकअप भेजें' }).click()]);
  const file = info.outputPath(dl.suggestedFilename());
  await dl.saveAs(file);
  expect(dl.suggestedFilename()).toMatch(/^hisaab-.+\.hisaab$/);
  expect(readFileSync(file, 'utf8')).not.toContain('मोहन');

  // new phone with the right code
  await b.page.goto('/#/link');
  await b.page.locator('#link-code').fill(code);
  await b.page.getByRole('button', { name: 'जोड़ें' }).click();
  await b.page.locator('input[type=file]').setInputFiles(file);
  await expect(b.page.locator('.toast')).toContainText('5 नई एंट्री मिलीं')   // shop name + 2 customers + 2 entries;
  await expect(b.page.getByTestId('receivable')).toHaveText('₹715');

  // a phone with a different shop cannot open it
  await onboard(c.page, 'दूसरी दुकान');
  await c.page.goto('/#/settings');
  await c.page.locator('input[type=file]').setInputFiles(file);
  await expect(c.page.locator('.toast')).toContainText('यह फ़ाइल किसी दूसरी दुकान की है');
  await a.ctx.close(); await b.ctx.close(); await c.ctx.close();
});

test('the installed app opens with no internet at all (service worker)', async ({ browser }) => {
  const a = await phone(browser);
  await onboard(a.page, 'ऑफ़लाइन दुकान');
  await addEntry(a.page, 'gave', 'गीता', 210);
  await a.page.waitForFunction(() => navigator.serviceWorker?.controller != null || navigator.serviceWorker?.ready.then(() => true), null, { timeout: 15_000 });
  await a.page.reload();                              // let the worker take control
  await a.page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15_000 });
  await a.ctx.setOffline(true);
  await a.page.reload();
  await expect(a.page.getByTestId('receivable')).toHaveText('₹210');
  await addEntry(a.page, 'gave', 'गीता', 90);
  await expect(a.page.getByTestId('receivable')).toHaveText('₹300');
  await a.ctx.close();
});
