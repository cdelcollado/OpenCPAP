import { expect, test } from '@playwright/test';
import { failOnConsoleErrors, loadDemo, openLatestNight, resetApp, resmedZip } from './helpers';

test.describe('reference ranges (orientative, sources being confirmed)', () => {
  test('demo data: the AHI and usage references show, and leak has no status for an unknown device', async ({ page }) => {
    const errors = failOnConsoleErrors(page);
    await resetApp(page);
    await loadDemo(page);
    await expect(page.getByText('Reference: under 5 per hour').first()).toBeVisible();
    await expect(page.getByText('Reference: at least 4 h per night').first()).toBeVisible();
    // the demo device has no verified leak reference, so the tile says so instead of showing a status
    await expect(page.getByText('No verified reference for this metric').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the report has a reference column, a footnote and the same references', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    await page.goto('/#/report');
    await expect(page.getByRole('columnheader', { name: 'Reference' })).toBeVisible();
    await expect(page.getByText('orientative reading aids', { exact: false })).toBeVisible();
    await expect(page.getByText('Reference: under 5 per hour').first()).toBeVisible();
  });

  test('a night with oximetry shows the ODI4 status with an icon and text', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    await openLatestNight(page);
    const oximetry = page.getByTestId('oximetry');
    await expect(oximetry.getByTestId('ref-badge')).toBeVisible();
    await expect(oximetry.getByText('Reference: under 5 per hour (adult sleep-lab bands)')).toBeVisible();
    await expect(oximetry.getByText('No verified reference for this metric').first()).toBeVisible();
  });

  test('a ResMed card shows the leak status against the 24 L/min reference', async ({ page }, info) => {
    await resetApp(page);
    await page.getByRole('link', { name: 'Import', exact: true }).click();
    await page.getByTestId('zip-input').setInputFiles(await resmedZip(info.outputPath('resmed-ref')));
    await expect(page.getByText('Imported 6 sessions.')).toBeVisible();
    await page.getByRole('link', { name: 'View dashboard' }).click();
    await expect(page.getByText('Reference (ResMed): 70th percentile of the night under 24 L/min')).toBeVisible();
    await expect(page.getByTestId('ref-badge').first()).toBeVisible();
  });
});
