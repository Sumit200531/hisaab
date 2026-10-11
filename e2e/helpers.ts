import { expect, type Page } from '@playwright/test';

export const RELAY = 'http://127.0.0.1:8788';

export async function onboard(page: Page, shop = 'गुप्ता किराना') {
  await page.goto('/');
  await page.locator('#onb-shop').fill(shop);
  await page.getByRole('button', { name: 'शुरू करें' }).click();
  await expect(page.getByTestId('receivable')).toHaveText('₹0');
}

/** Record an entry through the sheet the way a shopkeeper would. */
export async function addEntry(page: Page, kind: 'gave' | 'got', name: string, rupees: number, note = '') {
  await page.locator(`.actionbar .big-btn.${kind}`).click();
  const sheet = page.getByRole('dialog');
  const chosen = sheet.locator('.chosen');
  if (!(await chosen.isVisible())) {
    await sheet.locator('#entry-name').fill(name);
    const existing = sheet.locator('.suggest button', { hasText: new RegExp(`^${name}`) }).first();
    if (await existing.count()) await existing.click(); else await sheet.locator('.suggest .new').click();
  }
  for (const d of String(rupees)) await sheet.getByRole('button', { name: d, exact: true }).click();
  if (note) await sheet.getByPlaceholder('क्या लिया? (ज़रूरी नहीं)').fill(note);
  await sheet.locator('.big-btn').click();
  await expect(sheet).toBeHidden();
}

export async function enableSync(page: Page) {
  await page.goto('/#/settings');
  await page.locator('#set-relay').fill(RELAY);
  await page.getByRole('button', { name: 'सिंक चालू करें' }).click();
  await expect(page.getByTestId('sync-status')).toContainText('चालू');
}

export async function syncCode(page: Page): Promise<string> {
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'कोड दिखाएँ' }).click();
  return (await page.getByTestId('sync-code').innerText()).trim();
}
