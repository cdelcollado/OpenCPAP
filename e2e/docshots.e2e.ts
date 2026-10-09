import { test } from '@playwright/test';
import { loadDemo, openLatestNight, resetApp } from './helpers';

// Regenerates the screenshots used in the documentation, from synthetic demo data only.
test.skip(!process.env.DOC_SHOTS, 'set DOC_SHOTS=1 to regenerate docs/img');

test('documentation screenshots (demo data)', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1500 });
  await page.emulateMedia({ colorScheme: 'light' });
  await resetApp(page);
  await loadDemo(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'docs/img/dashboard.png' });
  await page.getByRole('radio', { name: 'All' }).check({ force: true });
  await page.locator('.heat').first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'docs/img/calendar.png', clip: { x: 0, y: 0, width: 1200, height: 700 } });

  await openLatestNight(page);
  await page.getByLabel('Note about this night').fill('Woke up twice, nose a bit blocked.');
  await page.getByLabel('Tags', { exact: true }).fill('cold');
  await page.getByLabel('Tags', { exact: true }).press('Enter');
  await page.getByRole('radio', { name: /Good/ }).check({ force: true });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo(0, 0));
  const over = page.locator('[data-track="leak"] .u-over');
  await over.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const b = (await over.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.55, b.y + b.height / 2, { steps: 4 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/img/night.png' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/img/night-notes.png', clip: { x: 0, y: 0, width: 1200, height: 900 } });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(500);
  await over.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.mouse.move(b.x + b.width * 0.55, b.y + b.height / 2, { steps: 4 });
  await page.screenshot({ path: 'docs/img/night-dark.png' });
  await page.emulateMedia({ colorScheme: 'light' });

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByTestId('breathing').evaluate((e) => { e.scrollIntoView({ block: 'start' }); window.scrollBy(0, -90); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/img/breathing.png', clip: { x: 0, y: 0, width: 1200, height: 640 } });
  await page.goto('/#/');
  await page.locator('h2', { hasText: 'Distribution' }).evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/img/distribution.png', clip: { x: 0, y: 0, width: 1200, height: 900 } });
  await page.goto('/#/compare');
  await page.getByRole('button', { name: 'Last 30 nights vs the 30 before' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/img/compare.png', clip: { x: 0, y: 0, width: 1200, height: 1500 } });
  await page.goto('/#/equipment');
  await page.getByTestId('equipment-item').filter({ hasText: 'Demo cushion' }).getByRole('button', { name: 'Leak and age' }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'docs/img/equipment.png', fullPage: true });
  await page.goto('/#/report');
  await page.waitForTimeout(600);
  await page.locator('article.report').screenshot({ path: 'docs/img/report.png' });

  await page.setViewportSize({ width: 390, height: 1700 });
  await page.goto('/#/');
  await openLatestNight(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'docs/img/night-mobile.png' });
});
