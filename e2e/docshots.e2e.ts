import { test } from '@playwright/test';
import { loadDemo, resetApp } from './helpers';

// Regenerates the screenshots used in the documentation, from synthetic demo data only.
test.skip(!process.env.DOC_SHOTS, 'set DOC_SHOTS=1 to regenerate docs/img');

test('documentation screenshots (demo data)', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1100 });
  await page.emulateMedia({ colorScheme: 'light' });
  await resetApp(page);
  await loadDemo(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/img/dashboard.png' });
  await page.getByRole('row').nth(1).getByRole('link').click();
  await page.getByRole('group', { name: 'Event timeline' }).waitFor();
  await page.waitForTimeout(800);
  await page.setViewportSize({ width: 1200, height: 1500 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/img/night.png' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/img/night-dark.png' });
});
