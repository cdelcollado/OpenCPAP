import { expect, test } from '@playwright/test';
import { failOnConsoleErrors, hasRealCard, realCard, resetApp, syntheticZip } from './helpers';

test.describe('import in a real browser (Web Worker, IndexedDB)', () => {
  test('imports a synthetic ZIP card', async ({ page }, info) => {
    const errors = failOnConsoleErrors(page);
    await resetApp(page);
    await page.getByRole('link', { name: 'Import', exact: true }).click();
    await page.getByTestId('zip-input').setInputFiles(syntheticZip(info.outputPath('zip')));
    await expect(page.getByText('Imported 1 sessions.')).toBeVisible();
    await page.getByRole('link', { name: 'View dashboard' }).click();
    await expect(page.getByRole('heading', { name: /Last night/ })).toBeVisible();
    await expect(page.getByText('You are viewing synthetic demo data.')).toHaveCount(0); // it is a real (non-demo) device
    // re-importing the same card is idempotent
    await page.getByRole('link', { name: 'Import', exact: true }).click();
    await page.getByTestId('zip-input').setInputFiles(syntheticZip(info.outputPath('zip')));
    await expect(page.getByText('Imported 1 sessions.')).toBeVisible();
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page.getByText('1 sessions stored on this device')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('reports a clear error for a ZIP without CPAP data', async ({ page }, info) => {
    await resetApp(page);
    await page.getByRole('link', { name: 'Import', exact: true }).click();
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { zipSync } = await import('fflate');
    mkdirSync(info.outputPath('bad'), { recursive: true });
    const bad = info.outputPath('bad', 'bad.zip');
    writeFileSync(bad, zipSync({ 'hello.txt': new Uint8Array([104, 105]) }));
    await page.getByTestId('zip-input').setInputFiles(bad);
    await expect(page.getByRole('alert')).toContainText('No supported CPAP data was found');
  });

  test('reports corrupt data without hanging', async ({ page }, info) => {
    await resetApp(page);
    await page.getByRole('link', { name: 'Import', exact: true }).click();
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { zipSync } = await import('fflate');
    mkdirSync(info.outputPath('corrupt'), { recursive: true });
    const f = info.outputPath('corrupt', 'corrupt.zip');
    writeFileSync(f, zipSync({ 'P-SERIES/DEV/PROP.BIN': new Uint8Array(300), 'P-SERIES/DEV/P0/00000001.B01': new Uint8Array(300) }));
    await page.getByTestId('zip-input').setInputFiles(f);
    await expect(page.getByRole('alert')).toContainText('The import failed');
  });

  test('imports the real card folder through the folder input', async ({ page }) => {
    test.skip(!hasRealCard, 'fixtures/raw is not present');
    test.setTimeout(240_000);
    const errors = failOnConsoleErrors(page);
    await resetApp(page);
    await page.getByRole('link', { name: 'Import', exact: true }).click();
    await page.getByTestId('folder-input').setInputFiles(realCard);
    await expect(page.getByText(/Imported \d+ sessions\./)).toBeVisible({ timeout: 180_000 });
    const imported = Number((await page.getByText(/Imported \d+ sessions\./).textContent())!.match(/\d+/)![0]);
    expect(imported).toBeGreaterThan(500);
    await page.getByRole('link', { name: 'View dashboard' }).click();
    await expect(page.getByRole('heading', { name: /Last night/ })).toBeVisible();
    await expect(page.getByText('You are viewing synthetic demo data.')).toHaveCount(0);
    expect(await page.getByRole('row').count()).toBeGreaterThan(10);
    await page.getByRole('radio', { name: 'All' }).check({ force: true });
    expect(await page.getByRole('row').count()).toBeGreaterThan(100);
    // open the most recent night: real waveform data must render
    await page.getByRole('row').nth(1).getByRole('link').click();
    await expect(page.getByRole('group', { name: 'Event timeline' })).toBeVisible();
    await expect(page.locator('section[aria-label="Flow"] canvas').first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
