import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { failOnConsoleErrors, loadDemo, openLatestNight, resetApp, scrollToCenter } from './helpers';

test.describe('notes and the plain-language summary', () => {
  test('a night shows a summary with an icon per observation and a disclaimer', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    await openLatestNight(page);
    const box = page.locator('section[aria-labelledby="findings-title"]');
    await expect(box).toContainText(/You used the device for \d+(\.\d)? h/);
    await expect(box).toContainText(/Your AHI was/);
    expect(await box.locator('li svg').count()).toBeGreaterThanOrEqual(2);
    await expect(box).toContainText('not a diagnosis');
  });

  test('a note with a tag and a mood is saved automatically, survives a reload and shows in the nights table', async ({ page }) => {
    const errors = failOnConsoleErrors(page);
    await resetApp(page);
    await loadDemo(page);
    await openLatestNight(page);
    await page.getByLabel('Note about this night').fill('Woke up twice, nose a bit blocked.');
    await page.getByLabel('Tags', { exact: true }).fill('cold');
    await page.getByLabel('Tags', { exact: true }).press('Enter');
    await page.getByRole('radio', { name: /Good/ }).check({ force: true });
    await expect(page.getByText('Saved on this device')).toBeVisible();
    await expect(page.locator('.chip', { hasText: 'cold' })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('Note about this night')).toHaveValue('Woke up twice, nose a bit blocked.');
    await expect(page.getByRole('radio', { name: /Good/ })).toBeChecked();
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
    await expect(page.locator('.note-flag').first()).toBeVisible();

    await openLatestNight(page);
    await page.getByRole('button', { name: 'Delete note' }).click();
    await expect(page.getByLabel('Note about this night')).toHaveValue('');
    await page.reload();
    await expect(page.getByLabel('Note about this night')).toHaveValue('');
    expect(errors).toEqual([]);
  });
});

test.describe('setting changes and period comparison', () => {
  test('the dashboard lists the pressure change and links to a before/after comparison', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    const panel = page.locator('section[aria-labelledby="changes-title"]');
    await expect(panel).toContainText('Pressure');
    await expect(panel).toContainText('9.5 cmH₂O');
    await expect(panel).toContainText('10 cmH₂O');
    await expect(page.locator('.chart-card').first()).toContainText('Dashed markers show setting changes');
    await panel.getByRole('link', { name: 'Compare 30 nights before and after' }).first().click();
    await expect(page).toHaveURL(/#\/compare\?a=\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}&b=/);
    await expect(page.getByRole('heading', { level: 1, name: 'Compare periods' })).toBeVisible();
    const table = page.locator('table').first();
    await expect(table).toContainText('Average use');
    await expect(table).toContainText('AHI (all events / all hours)');
    // the settings table highlights the pressure difference
    const differs = page.locator('tr.differs');
    await expect(differs.first()).toContainText('Pressure');
    await expect(differs.first()).toContainText('9.5 cmH₂O');
    await expect(differs.first()).toContainText('10 cmH₂O');
    await expect(page.getByText('not proof that a change caused it', { exact: false })).toBeVisible();
  });

  test('presets, swap and an empty period', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    await page.getByRole('link', { name: 'Compare', exact: true }).click();
    await expect(page).toHaveURL(/#\/compare$/);
    await expect(page.locator('table').first()).toContainText('Nights with data');
    const urlBefore = page.url();
    await page.getByRole('button', { name: 'Last 90 nights vs the 90 before' }).click();
    await expect(page).toHaveURL(/#\/compare\?a=/);
    const withA = page.url();
    await page.getByRole('button', { name: 'Swap A and B' }).click();
    await expect(page).not.toHaveURL(withA);
    // a period with no nights
    await page.goto('/#/compare?a=2000-01-01..2000-01-31&b=2026-06-01..2026-06-30');
    await expect(page.getByText('One of the periods has no nights with data.')).toBeVisible();
    await page.goto(urlBefore);
  });
});

test.describe('equipment', () => {
  test('shows demo items, a reminder on the dashboard and the leak-versus-age reading', async ({ page }) => {
    const errors = failOnConsoleErrors(page);
    await resetApp(page);
    await loadDemo(page);
    const reminders = page.locator('section[aria-labelledby="rem-title"]');
    await expect(reminders).toContainText('Demo cushion');
    await expect(reminders).toContainText('Demo filter');
    await reminders.getByRole('link', { name: 'Manage equipment' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Equipment' })).toBeVisible();
    const cushion = page.getByTestId('equipment-item').filter({ hasText: 'Demo cushion' });
    await expect(cushion).toContainText('Replace soon');
    await cushion.getByRole('button', { name: 'Leak and age' }).click();
    await expect(cushion.locator('canvas').first()).toBeVisible();
    await expect(cushion).toContainText(/Leak is rising by about \d/);
    expect(errors).toEqual([]);
  });

  test('adds an item, replaces it and deletes it', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    await page.goto('/#/equipment');
    await page.getByLabel('Name or model').fill('My test mask');
    await page.getByRole('button', { name: 'Add item' }).click();
    const item = page.getByTestId('equipment-item').filter({ hasText: 'My test mask' });
    await expect(item).toBeVisible();
    await expect(item).toContainText('In good time');
    page.once('dialog', (d) => void d.accept());
    await item.getByRole('button', { name: 'Replace now' }).click();
    await expect(page.getByRole('heading', { name: 'Replaced', exact: true })).toBeVisible();
    expect(await page.getByTestId('equipment-item').filter({ hasText: 'My test mask' }).count()).toBe(2);
    page.once('dialog', (d) => void d.accept());
    await page.getByTestId('equipment-item').filter({ hasText: 'My test mask' }).first().getByRole('button', { name: 'Delete' }).click();
    await expect.poll(() => page.getByTestId('equipment-item').filter({ hasText: 'My test mask' }).count()).toBe(1);
  });
});

test.describe('doctor report (print / PDF)', () => {
  test('the preview has the clinical sections and no serial number', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    await page.getByRole('link', { name: 'Report', exact: true }).click();
    const doc = page.locator('article.report');
    await expect(doc.getByRole('heading', { level: 1, name: 'CPAP therapy report' })).toBeVisible();
    for (const h of ['Summary', 'Trends', 'Events', 'Therapy settings (latest night)', 'Equipment', 'Nights']) await expect(doc.getByRole('heading', { name: h })).toBeVisible();
    expect(await doc.locator('svg[role="img"]').count()).toBe(3);
    await expect(doc).not.toContainText('DEMO-0001');
    await expect(doc).toContainText('not a diagnosis');
  });

  test('printing produces a PDF with the report text, the chosen name and optional notes', async ({ page }, info) => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark' }); // the print stylesheet must still produce a light page
    await resetApp(page);
    await loadDemo(page);
    await openLatestNight(page);
    await page.getByLabel('Note about this night').fill('PRIVATE-NOTE-TEXT for the clinician');
    await expect(page.getByText('Saved on this device')).toBeVisible();
    await page.getByRole('link', { name: 'Report', exact: true }).click();
    await page.getByLabel('Name (optional)').fill('Test Patient');

    const dir = info.outputPath('pdf');
    mkdirSync(dir, { recursive: true });
    const render = async (name: string) => {
      const file = join(dir, name);
      await page.pdf({ path: file, format: 'A4', printBackground: true, preferCSSPageSize: true });
      return { file, text: execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' }), info: execFileSync('pdfinfo', [file], { encoding: 'utf8' }) };
    };

    const plain = await render('report.pdf');
    expect(plain.info).toMatch(/Pages:\s+[1-9]/);
    expect(plain.text).toContain('CPAP therapy report');
    expect(plain.text).toContain('Patient: Test Patient');
    expect(plain.text).toContain('Summary');
    expect(plain.text).toContain('Setting changes in the period');
    expect(plain.text).toContain('Pressure');
    expect(plain.text).not.toContain('PRIVATE-NOTE-TEXT'); // notes are opt-in
    expect(plain.text).not.toContain('Dashboard'); // navigation is hidden in print
    expect(plain.text).not.toContain('DEMO-0001');

    await page.getByLabel('Include my notes and tags').check();
    const withNotes = await render('report-notes.pdf');
    expect(withNotes.text).toContain('PRIVATE-NOTE-TEXT for the clinician');
    expect(existsSync(withNotes.file) && readFileSync(withNotes.file).subarray(0, 4).toString()).toBe('%PDF');
  });

  test('the period can be changed and an empty period says so', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    await page.goto('/#/report?range=2000-01-01..2000-01-31');
    await expect(page.locator('article.report')).toContainText('There is no data in this period.');
    await page.getByRole('radio', { name: 'All data' }).check({ force: true });
    await expect(page.locator('article.report')).toContainText(/Nights with data: \d+ of \d+/);
  });
});

test.describe('backup and persistence', () => {
  test('downloads a backup, wipes everything and restores it, notes and equipment included', async ({ page }, info) => {
    const errors = failOnConsoleErrors(page);
    await resetApp(page);
    await loadDemo(page);
    await openLatestNight(page);
    await page.getByLabel('Note about this night').fill('Backed-up note');
    await expect(page.getByText('Saved on this device')).toBeVisible();

    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download backup' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^opencpap-backup-\d{4}-\d{2}-\d{2}\.opencpap$/);
    const file = info.outputPath('backup.opencpap');
    await download.saveAs(file);
    const head = readFileSync(file).subarray(0, 2);
    expect([head[0], head[1]]).toEqual([0x1f, 0x8b]); // gzip

    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Delete all data' }).click();
    await expect(page.getByText('Data deleted.')).toBeVisible();
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'No data yet' })).toBeVisible();

    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.getByTestId('backup-input').setInputFiles(file);
    await expect(page.getByText(/Restored \d+ sessions, 4?\d* notes? and \d+ equipment items/).or(page.getByText(/Restored \d+ sessions, \d+ notes and \d+ equipment items\./))).toBeVisible();
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
    await expect(page.getByTestId('hero-ahi')).toBeVisible();
    await openLatestNight(page);
    await expect(page.getByLabel('Note about this night')).toHaveValue('Backed-up note');
    await page.goto('/#/equipment');
    await expect(page.getByTestId('equipment-item').filter({ hasText: 'Demo cushion' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('refuses a file that is not a backup, without changing anything', async ({ page }, info) => {
    await resetApp(page);
    await loadDemo(page);
    const { writeFileSync } = await import('node:fs');
    const bad = info.outputPath('not-a-backup.opencpap');
    writeFileSync(bad, 'this is not a backup');
    await page.goto('/#/settings');
    await page.getByTestId('backup-input').setInputFiles(bad);
    await expect(page.getByText(/Could not restore: Not an OpenCPAP backup/)).toBeVisible();
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
    await expect(page.getByTestId('hero-ahi')).toBeVisible();
  });

  test('requests persistent storage and reports the outcome', async ({ page }) => {
    await resetApp(page);
    await page.goto('/#/settings');
    await page.getByRole('button', { name: 'Request persistent storage' }).click();
    await expect(page.locator('section[aria-labelledby="s-backup"] p[role="status"]').last()).toHaveText(/Storage is persistent|did not grant|does not support/);
  });
});

test.describe('new pages: accessibility and phone layout', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`axe finds no violations on compare, equipment, report and settings (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await resetApp(page);
      await loadDemo(page);
      for (const [name, hash] of [['compare', '#/compare'], ['equipment', '#/equipment'], ['report', '#/report'], ['settings', '#/settings']] as const) {
        await page.goto(`/${hash}`);
        await expect(page.locator('main h1').first()).toBeVisible();
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(r.violations.map((v) => `${name}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.html.slice(0, 140)}`)).toEqual([]);
      }
      await page.goto('/');
      await openLatestNight(page);
      const night = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(night.violations.map((v) => `night: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.html.slice(0, 140)}`)).toEqual([]);
    });
  }

  for (const [name, hash] of [['compare', '#/compare'], ['equipment', '#/equipment'], ['report', '#/report'], ['settings', '#/settings']] as const) {
    test(`${name} does not overflow horizontally on a 390 px phone`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 800 });
      await resetApp(page);
      await loadDemo(page);
      await page.goto(`/${hash}`);
      await expect(page.locator('main h1').first()).toBeVisible();
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
  void scrollToCenter;
});

test('every header link leads to a real page', async ({ page }) => {
  await resetApp(page);
  await loadDemo(page);
  for (const [name, h1] of [['Compare', 'Compare periods'], ['Equipment', 'Equipment'], ['Report', 'Therapy report'], ['Import', 'Import CPAP data'], ['Settings', 'Settings'], ['Dashboard', 'Dashboard']] as const) {
    const link = page.getByRole('link', { name, exact: true });
    await expect(link).toHaveAttribute('href', /^#\//);
    await link.click();
    await expect(page.locator('main h1').first()).toHaveText(h1);
    await expect(link).toHaveAttribute('aria-current', 'page');
  }
});
