import { test, expect } from '@playwright/test';
import { onboard, addEntry } from './helpers';

test('WhatsApp reminder carries the balance and a working UPI pay link', async ({ page, context }) => {
  await onboard(page, 'गुप्ता किराना');
  await page.goto('/#/settings');
  await page.locator('#set-upi').fill('gupta.kirana@okaxis');
  await page.getByRole('button', { name: 'सेव करें' }).click();
  await page.goto('/');
  await addEntry(page, 'gave', 'रमेश जी', 450);
  await page.locator('.row', { hasText: 'रमेश जी' }).click();

  // add a phone number, with Indian formatting
  await page.getByRole('button', { name: 'नंबर जोड़ें' }).click();
  await page.locator('#cust-phone').fill('+91 98765-43210');
  await page.getByRole('button', { name: 'सेव करें' }).click();
  await expect(page.getByRole('link', { name: 'फ़ोन करें' })).toHaveAttribute('href', 'tel:+919876543210');

  await context.route('https://wa.me/**', r => r.fulfill({ status: 200, body: 'whatsapp' }));
  const [wa] = await Promise.all([context.waitForEvent('page'), page.getByRole('button', { name: 'WhatsApp पर याद दिलाएँ' }).click()]);
  const url = new URL(wa.url());
  expect(url.host).toBe('wa.me');
  expect(url.pathname).toBe('/919876543210');
  const text = url.searchParams.get('text')!;
  expect(text).toContain('नमस्ते रमेश जी');
  expect(text).toContain('₹450 बाकी है');
  const payLink = /https?:\/\/\S+#\/pay\?\S+/.exec(text)![0];
  await wa.close();

  // the customer opens the pay link
  const customer = await context.newPage();
  await customer.goto(payLink);
  await expect(customer.locator('.pay .amount')).toHaveText('₹450');
  await expect(customer.getByRole('img', { name: 'स्कैन करके भुगतान करें' })).toBeVisible();
  const upi = await customer.getByRole('link', { name: /UPI ऐप से भेजें/ }).getAttribute('href');
  expect(upi).toBe('upi://pay?pa=gupta.kirana%40okaxis&pn=%E0%A4%97%E0%A5%81%E0%A4%AA%E0%A5%8D%E0%A4%A4%E0%A4%BE%20%E0%A4%95%E0%A4%BF%E0%A4%B0%E0%A4%BE%E0%A4%A8%E0%A4%BE&cu=INR&am=450.00&tn=%E0%A4%B0%E0%A4%AE%E0%A5%87%E0%A4%B6%20%E0%A4%9C%E0%A5%80');
});

test('a tampered pay link is refused instead of showing a wrong amount', async ({ page }) => {
  await page.goto('/#/pay?pa=not-a-vpa&pn=X&am=-5');
  await expect(page.getByText('यह भुगतान लिंक अधूरा है')).toBeVisible();
});

test('settings reject an invalid UPI ID', async ({ page }) => {
  await onboard(page);
  await page.goto('/#/settings');
  await page.locator('#set-upi').fill('ramesh');
  await expect(page.getByText('UPI ID सही नहीं लग रही')).toBeVisible();
  await expect(page.getByRole('button', { name: 'सेव करें' })).toBeDisabled();
});
