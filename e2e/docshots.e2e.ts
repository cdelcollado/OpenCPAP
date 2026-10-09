import { test } from '@playwright/test';
import { loadDemo, resetApp, scrollToCenter } from './helpers';

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

  await page.getByRole('row').nth(1).getByRole('link').click();
  await page.getByRole('group', { name: 'Event timeline' }).waitFor();
  await page.waitForTimeout(800);
  const over = page.locator('[data-track="leak"] .u-over');
  await over.waitFor();
  const b = (await over.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.55, b.y + b.height / 2, { steps: 4 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/img/night.png' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/img/night-dark.png' });
  await page.setViewportSize({ width: 390, height: 1700 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'docs/img/night-mobile.png' });
  void scrollToCenter;
});
