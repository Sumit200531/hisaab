import { test, expect } from '@playwright/test';
import { onboard, addEntry } from './helpers';

test('a shopkeeper records udhaar and payments and the balances add up', async ({ page }) => {
  await onboard(page);
  await addEntry(page, 'gave', 'रमेश जी', 450, 'आटा, दाल');
  await addEntry(page, 'gave', 'सुनीता दीदी', 1250);
  await addEntry(page, 'gave', 'रमेश जी', 120);
  await addEntry(page, 'got', 'रमेश जी', 200);
  await expect(page.getByTestId('receivable')).toHaveText('₹1,620');
  const ramesh = page.locator('.row', { hasText: 'रमेश जी' });
  await expect(ramesh).toContainText('₹370');
  await ramesh.click();
  await expect(page.getByTestId('balance')).toHaveText('₹370');
  await expect(page.locator('.khata')).toContainText('आटा, दाल');
  await expect(page.locator('tr.entry')).toHaveCount(3);
});

test('a wrong entry can be undone from the toast or removed later, and stays visible as crossed out', async ({ page }) => {
  await onboard(page);
  await addEntry(page, 'gave', 'पप्पू', 500);
  await page.locator('.toast').getByRole('button', { name: 'वापस लें' }).click();
  await expect(page.getByTestId('receivable')).toHaveText('₹0');
  await addEntry(page, 'gave', 'पप्पू', 300);
  await page.locator('.row', { hasText: 'पप्पू' }).click();
  await page.locator('tr.entry').filter({ hasText: '₹300' }).click();
  await page.getByRole('button', { name: 'ग़लत एंट्री हटाएँ' }).click();
  await expect(page.getByTestId('balance')).toHaveText('₹0');
  await expect(page.locator('tr.voided')).toHaveCount(2);
});

test('one typed line fills name and amount: "रमेश साढ़े चार सौ"', async ({ page }) => {
  await onboard(page);
  await addEntry(page, 'gave', 'रमेश', 100);
  await page.locator('.actionbar .big-btn.gave').click();
  await page.locator('#entry-name').fill('रमेश साढ़े चार सौ');
  await expect(page.locator('.amount-display')).toHaveText('₹450');
  await page.locator('.suggest button', { hasText: 'रमेश' }).first().click();
  await page.getByRole('dialog').locator('.big-btn').click();
  await expect(page.locator('.row', { hasText: 'रमेश' })).toContainText('₹550');
});

test('entries survive closing the app (IndexedDB)', async ({ page }) => {
  await onboard(page);
  await addEntry(page, 'gave', 'शर्मा अंकल', 2780);
  await page.reload();
  await expect(page.getByTestId('receivable')).toHaveText('₹2,780');
  await expect(page.locator('.binding h1')).toContainText('गुप्ता किराना');
});

test('the whole app works in English', async ({ page }) => {
  await onboard(page);
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'English' }).click();
  await page.goto('/');
  await expect(page.getByText('To collect')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gave credit' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Got payment' })).toBeVisible();
});

test('the layout fits a small phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await onboard(page);
  await addEntry(page, 'gave', 'बहुत लंबे नाम वाले ग्राहक श्री रामप्रसाद', 123456);
  for (const path of ['/', '/#/settings']) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }
});
