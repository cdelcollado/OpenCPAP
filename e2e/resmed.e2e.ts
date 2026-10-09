import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { failOnConsoleErrors, openLatestNight, resetApp, resmedZip } from './helpers';

test.describe('ResMed card (synthetic EDF+ data)', () => {
  test('imports a ResMed ZIP and shows nights, events, leak and settings', async ({ page }, info) => {
    const errors = failOnConsoleErrors(page);
    await resetApp(page);
    await page.getByRole('link', { name: 'Import', exact: true }).click();
    await page.getByTestId('zip-input').setInputFiles(await resmedZip(info.outputPath('resmed')));
    await expect(page.getByText('Imported 6 sessions.')).toBeVisible();

    await page.getByRole('link', { name: 'View dashboard' }).click();
    await expect(page.getByRole('heading', { name: /Last night/ })).toBeVisible();

    await openLatestNight(page);
    // 3 events in 40 minutes → AHI 4.5 for the night
    await expect(page.getByText('4.5').first()).toBeVisible();
    // settings come from STR.edf
    await expect(page.getByText('Auto CPAP').first()).toBeVisible();
    await expect(page.getByText('EPR (pressure relief)')).toBeVisible();
    // the 25 Hz flow and the unintentional-leak statistics are drawn
    await expect(page.getByRole('img', { name: /flow/i }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('is accessible and re-importing the card does not duplicate sessions', async ({ page }, info) => {
    await resetApp(page);
    const zip = await resmedZip(info.outputPath('resmed'));
    for (let i = 0; i < 2; i++) {
      await page.getByRole('link', { name: 'Import', exact: true }).click();
      await page.getByTestId('zip-input').setInputFiles(zip);
      await expect(page.getByText('Imported 6 sessions.')).toBeVisible();
    }
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page.getByText('6 sessions stored on this device')).toBeVisible();
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Last night/ })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
