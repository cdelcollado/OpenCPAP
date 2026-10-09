import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { generateDemoOximetry, generateDemoSessions } from '@opencpap/core';
import { failOnConsoleErrors, loadDemo, resetApp, scrollToCenter } from './helpers';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** The demo sessions the app generates (same seed, so the same nights). */
const demo = generateDemoSessions({ nights: 75, waveformNights: 21 });
const withFlowNoOximetry = demo.at(-6)!; // the last three nights already carry demo oximetry

function viHealthCsv(rec: ReturnType<typeof generateDemoOximetry>, shiftMin = 0, step = 4) {
  const rows = ['Time,Oxygen Level,Pulse Rate,Motion,SpO2 Reminder,PR Reminder'];
  for (let i = 0; i < rec.times.length; i += step) {
    const d = new Date(rec.times[i]! + shiftMin * 60_000);
    rows.push(`${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${MON[d.getUTCMonth()]} ${pad(d.getUTCDate())} ${d.getUTCFullYear()},${rec.spo2[i]},${rec.pulse[i]},0,0,0`);
  }
  return rows.join('\n');
}
const nightOfSession = (ms: number) => new Date(ms - 12 * 3600_000).toISOString().slice(0, 10);

async function openNight(page: Page, date: string) {
  await page.goto(`/#/night/${date}`);
  await expect(page.getByRole('group', { name: 'Event timeline' })).toBeVisible();
}
const latest = async (page: Page) => { await page.getByRole('row').nth(1).getByRole('link').first().click(); await expect(page.getByRole('group', { name: 'Event timeline' })).toBeVisible(); };

test.describe('breathing analysis (experimental)', () => {
  test('a night with flow shows breathing figures, two extra tracks and readout values', async ({ page }) => {
    const errors = failOnConsoleErrors(page);
    await resetApp(page);
    await loadDemo(page);
    await openNight(page, nightOfSession(withFlowNoOximetry.start));
    const card = page.getByTestId('breathing');
    await expect(card).toContainText('Breathing (experimental)');
    const rate = Number((await card.locator('.tile').first().locator('.value').textContent())!.replace(/[^\d.]/g, ''));
    expect(rate).toBeGreaterThan(10);
    expect(rate).toBeLessThan(24);
    await expect(page.getByTestId('flat-share')).toContainText('%');
    await expect(card).toContainText('cannot be compared with 25 Hz tools');
    for (const t of ['flat', 'rate']) await expect(page.locator(`[data-track="${t}"] canvas`).first()).toBeVisible();
    const over = page.locator('[data-track="flat"] .u-over');
    await scrollToCenter(over);
    const b = (await over.boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height / 2, { steps: 4 });
    await expect(page.getByTestId('readout')).toContainText('Flat breaths');
    await expect(page.getByTestId('readout')).toContainText('Breath rate');
    expect(errors).toEqual([]);
  });

  test('a night without flow says why there is no analysis', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    await openNight(page, nightOfSession(demo[10]!.start));
    await expect(page.getByTestId('breathing')).toContainText('needs the detailed flow data');
    await expect(page.locator('[data-track="flat"]')).toHaveCount(0);
  });

  test('the dashboard has breathing trends and distributions', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    const section = page.locator('h2', { hasText: 'Breathing (experimental)' }).locator('xpath=ancestor::div[contains(@class,"section-title")]/following-sibling::div[1]');
    await expect(section.locator('canvas').first()).toBeVisible();
    expect(await section.locator('canvas').count()).toBe(2);
    const hist = page.locator('svg.histogram');
    await expect(hist).toHaveCount(2);
    await expect(hist.first()).toHaveAttribute('aria-label', /Nights by hours of use/);
    await expect(hist.nth(1)).toHaveAttribute('aria-label', /Nights by AHI/);
  });
});

test.describe('trends and alerts', () => {
  test('the 7-night average can be switched off and is named in the tooltip', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    const plot = page.locator('.chart-card').first().locator('.u-over');
    await scrollToCenter(plot);
    const b = (await plot.boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.8, b.y + b.height / 2, { steps: 3 });
    await expect(page.locator('.chart-tip').first()).toContainText('7-night average');
    await page.mouse.move(0, 0);
    await page.getByLabel('7-night average').uncheck();
    await scrollToCenter(plot);
    await page.mouse.move(b.x + b.width * 0.8, b.y + b.height / 2, { steps: 3 });
    await expect(page.locator('.chart-tip').first()).not.toContainText('7-night average');
  });

  test('a calm history raises no alert, a sudden leak rise does', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    await expect(page.getByTestId('anomalies')).toHaveCount(0);
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('opencpap'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const store = db.transaction('sessions', 'readwrite').objectStore('sessions');
      const rows: { start: number; session: { statistics: { channel: string; values: Float32Array }[] } }[] = await new Promise((res) => { const q = store.getAll(); q.onsuccess = () => res(q.result); });
      rows.sort((a, b) => a.start - b.start);
      for (const row of rows.slice(-3)) {
        for (const t of row.session.statistics) if (t.channel === 'leak-total') t.values = t.values.map((v) => v * 3);
        store.put(row);
      }
      await new Promise((res) => { db.transaction('sessions').oncomplete = res; });
      db.close();
    });
    await page.reload();
    const panel = page.getByTestId('anomalies');
    await expect(panel).toContainText(/Leak \(95 %\) over the last 3 nights \(\d+ L\/min\) is well above your usual \d+ L\/min/);
    await expect(panel).toContainText('not a diagnosis');
    await panel.getByRole('link').first().click();
    await expect(page).toHaveURL(/#\/night\//);
  });
});

test.describe('exports', () => {
  test('downloads the nights as CSV, and a night as events, statistics and EDF', async ({ page }, info) => {
    await resetApp(page);
    await loadDemo(page);
    const [csvDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export nights (CSV)' }).click()]);
    expect(csvDl.suggestedFilename()).toBe('opencpap-nights.csv');
    const csvPath = info.outputPath('nights.csv');
    await csvDl.saveAs(csvPath);
    const lines = readFileSync(csvPath, 'utf8').trimEnd().split('\r\n');
    expect(lines[0]).toContain('date,usage_hours,ahi');
    expect(lines.length).toBeGreaterThan(60);
    expect(lines[1]!.split(',')).toHaveLength(21);

    await latest(page);
    const kinds: [string, RegExp][] = [['Events (CSV)', /^opencpap-events-\d{4}-\d{2}-\d{2}\.csv$/], ['Statistics (CSV)', /^opencpap-statistics-/], ['Flow (EDF)', /^opencpap-flow-.*\.edf$/], ['Oximetry (CSV)', /^opencpap-oximetry-/]];
    for (const [name, filename] of kinds) {
      const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).click()]);
      expect(dl.suggestedFilename()).toMatch(filename);
      const p = info.outputPath(dl.suggestedFilename());
      await dl.saveAs(p);
      const data = readFileSync(p);
      if (name.startsWith('Flow')) {
        expect(data.subarray(0, 8).toString()).toBe('0       ');
        const records = Number(data.subarray(236, 244).toString().trim());
        expect(data.length).toBe(512 + records * 5 * 2);
        expect(records).toBeGreaterThan(20_000); // a whole night of 1 s records
      } else {
        const text = data.toString('utf8');
        expect(text.split('\r\n').length).toBeGreaterThan(2);
        expect(text.startsWith(name.startsWith('Events') ? 'session,start,type' : name.startsWith('Stat') ? 'session,time,channel' : 'time,spo2_pct,pulse_bpm')).toBe(true);
      }
    }
  });
});

test.describe('oximetry', () => {
  const date = nightOfSession(withFlowNoOximetry.start);
  const rec = generateDemoOximetry(withFlowNoOximetry, 99);

  async function chooseFile(page: Page, csv: string, name = 'ring.csv') {
    await page.goto('/#/import');
    await page.getByTestId('oximetry-input').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(csv) });
  }

  test('imports an oximeter CSV, lines it up with the night and shows curves, figures and findings', async ({ page }) => {
    const errors = failOnConsoleErrors(page);
    await resetApp(page);
    await loadDemo(page);
    await chooseFile(page, viHealthCsv(rec));
    const box = page.getByTestId('oximetry-import');
    await expect(box).toContainText('Detected: time-month-day-year');
    await expect(box).toContainText(/\d+ readings over 1 night/);
    await expect(box.getByRole('row').nth(1)).toContainText('OK');
    await box.getByRole('button', { name: /Import 1 night/ }).click();
    await expect(box).toContainText('Oximetry imported for 1 night(s).');

    await openNight(page, date);
    const card = page.getByTestId('oximetry');
    await expect(card).toContainText('Lowest SpO₂');
    await expect(card).toContainText('ring.csv');
    for (const t of ['spo2', 'pulse']) await expect(page.locator(`[data-track="${t}"] canvas`).first()).toBeVisible();
    await expect(page.locator('section[aria-labelledby="findings-title"]')).toContainText(/oximeter/i);
    const over = page.locator('[data-track="spo2"] .u-over');
    await scrollToCenter(over);
    const b = (await over.boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height / 2, { steps: 4 });
    await expect(page.getByTestId('readout')).toContainText(/SpO₂\s*\d+\s*%/);

    await card.getByRole('button', { name: 'Remove oximetry for this night' }).click();
    await expect(page.getByTestId('oximetry')).toHaveCount(0);
    await expect(page.locator('[data-track="spo2"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('warns when the oximeter clock is off and accepts a correction', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    await chooseFile(page, viHealthCsv(rec, 150)); // the oximeter is 2.5 h ahead
    const box = page.getByTestId('oximetry-import');
    await expect(box.getByRole('row').nth(1)).toContainText(/covered by this recording|No overlap/);
    await box.getByLabel('Clock correction (minutes)').fill('-150');
    await expect(box.getByRole('row').nth(1)).toContainText('OK');
    await box.getByRole('button', { name: /Import/ }).click();
    await expect(box).toContainText('Oximetry imported');
    await openNight(page, date);
    await expect(page.getByTestId('oximetry')).toBeVisible();
  });

  test('asks about the day/month order when a date is ambiguous', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    // a demo night whose day of the month is 12 or less, so 05/06/2026 could be 5 June or 6 May
    const night = demo.slice(-21).find((s) => new Date(s.start).getUTCDate() <= 12)!;
    const r = generateDemoOximetry(night, 3);
    const csv = ['Time,SpO2,Pulse', ...Array.from({ length: 400 }, (_, i) => { const t = new Date(r.times[i * 60]!); return `${pad(t.getUTCDate())}/${pad(t.getUTCMonth() + 1)}/${t.getUTCFullYear()} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())},96,60`; })].join('\n');
    await chooseFile(page, csv);
    const box = page.getByTestId('oximetry-import');
    await expect(box.getByLabel('Read dates as month/day')).toBeVisible();
    const month = MON[new Date(night.start).getUTCMonth()]!;
    await expect(box.getByRole('row').nth(1)).toContainText(month);
    await box.getByLabel('Read dates as month/day').check();
    await expect(box.getByRole('row').nth(1)).not.toContainText(month); // read the other way round it is a different date
  });

  test('explains unreadable files', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    await chooseFile(page, 'hello\nthere\nworld');
    await expect(page.getByTestId('oximetry-import').getByRole('alert')).toContainText(/Could not read the file/);
  });

  test('demo oximetry survives a backup and restore', async ({ page }, info) => {
    await resetApp(page);
    await loadDemo(page);
    await page.goto('/#/settings');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download backup' }).click()]);
    const file = info.outputPath('b.opencpap');
    await dl.saveAs(file);
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Delete all data' }).click();
    await expect(page.getByText('Data deleted.')).toBeVisible();
    await page.getByTestId('backup-input').setInputFiles(file);
    await expect(page.getByText(/Restored \d+ sessions/)).toBeVisible();
    await openNight(page, nightOfSession(demo.at(-1)!.start));
    await expect(page.getByTestId('oximetry')).toBeVisible();
    await expect(page.locator('[data-track="spo2"] canvas').first()).toBeVisible();
  });
});

test.describe('Phase 4 accessibility and phone layout', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`axe: night with breathing and oximetry, dashboard and import with a preview (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await resetApp(page);
      await loadDemo(page);
      const check = async (label: string) => {
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(r.violations.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.html.slice(0, 140)}`)).toEqual([]);
      };
      await check('dashboard');
      await latest(page);
      await expect(page.getByTestId('oximetry')).toBeVisible();
      await check('night');
      await page.goto('/#/import');
      await page.getByTestId('oximetry-input').setInputFiles({ name: 'ring.csv', mimeType: 'text/csv', buffer: Buffer.from(viHealthCsv(generateDemoOximetry(withFlowNoOximetry, 5), 0, 30)) });
      await expect(page.getByTestId('oximetry-import').getByRole('row').nth(1)).toBeVisible();
      await check('import preview');
    });
  }

  for (const [name, hash] of [['night with oximetry', 'night'], ['import with a preview', 'import']] as const) {
    test(`${name} does not overflow on a 390 px phone`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 800 });
      await resetApp(page);
      await loadDemo(page);
      if (hash === 'night') await latest(page);
      else {
        await page.goto('/#/import');
        await page.getByTestId('oximetry-input').setInputFiles({ name: 'ring.csv', mimeType: 'text/csv', buffer: Buffer.from(viHealthCsv(generateDemoOximetry(withFlowNoOximetry, 5), 0, 30)) });
        await expect(page.getByTestId('oximetry-import').getByRole('row').nth(1)).toBeVisible();
      }
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    });
  }
});
