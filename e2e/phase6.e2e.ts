import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { failOnConsoleErrors, loadDemo, openLatestNight, resetApp } from './helpers';

const SECRET = 'SECRET-NOTE-8271';

async function demoWithNote(page: Page) {
  await resetApp(page);
  await loadDemo(page);
  await openLatestNight(page);
  await page.getByLabel('Note about this night').fill(SECRET);
  await expect(page.getByText('Saved on this device')).toBeVisible();
}

async function createLink(page: Page, passphrase = ''): Promise<string> {
  await page.getByRole('link', { name: 'Report', exact: true }).click();
  await page.getByLabel('Include my notes').check().catch(() => undefined); // notes are on in the report, never in the link
  const panel = page.locator('section[aria-labelledby="share-title"]');
  if (passphrase) await panel.getByLabel(/Passphrase/).fill(passphrase);
  await panel.getByRole('button', { name: 'Create link' }).click();
  return panel.getByTestId('share-link').inputValue();
}

test.describe('share a snapshot (serverless link)', () => {
  test('a plain link opens in a fresh browser without any data, and carries no notes', async ({ page, browser }) => {
    const errors = failOnConsoleErrors(page);
    await demoWithNote(page);
    const link = await createLink(page);
    expect(link).toMatch(/#\/shared\/[A-Za-z0-9_-]+$/);
    expect(link.length).toBeLessThan(30_000);
    await expect(page.getByText('Anyone who gets this link can read these figures')).toBeVisible();

    const other = await (await browser.newContext()).newPage();
    const otherErrors = failOnConsoleErrors(other);
    await other.goto(link);
    await expect(other.getByText(/Read-only snapshot created on/)).toBeVisible();
    const report = other.getByRole('article');
    await expect(report.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(other.locator('body')).not.toContainText(SECRET);
    // nothing was stored by viewing it
    const stored = await other.evaluate(() => new Promise<number>((resolve) => {
      const open = indexedDB.open('opencpap');
      open.onsuccess = () => { const db = open.result; const q = db.transaction('sessions').objectStore('sessions').count(); q.onsuccess = () => { db.close(); resolve(q.result); }; };
      open.onerror = () => resolve(-1);
    }));
    expect(stored).toBe(0);
    expect((await new AxeBuilder({ page: other }).analyze()).violations).toEqual([]);
    expect(otherErrors).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('an encrypted link asks for the passphrase, refuses a wrong one and opens with the right one', async ({ page, browser }) => {
    await demoWithNote(page);
    const link = await createLink(page, 'correct horse battery');
    await expect(page.getByText('The link is encrypted.')).toBeVisible();

    const other = await (await browser.newContext()).newPage();
    await other.goto(link);
    await expect(other.getByLabel('Passphrase')).toBeVisible();
    await expect(other.getByRole('article')).toHaveCount(0);
    await other.getByLabel('Passphrase').fill('nope');
    await other.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(other.getByRole('alert')).toContainText('Wrong passphrase');
    expect((await new AxeBuilder({ page: other }).analyze()).violations).toEqual([]);
    await other.getByLabel('Passphrase').fill('correct horse battery');
    await other.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(other.getByText(/Read-only snapshot created on/)).toBeVisible();
    await expect(other.locator('body')).not.toContainText(SECRET);
  });

  test('a damaged link shows a clear message instead of crashing', async ({ page }) => {
    await resetApp(page);
    await page.goto('/#/shared/not-a-real-payload');
    await expect(page.getByRole('alert')).toContainText('damaged or incomplete');
    await page.goto('/#/shared/');
    await expect(page.getByRole('alert')).toContainText('damaged or incomplete');
  });

  test('the report page with the share panel is accessible in both themes', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    await page.getByRole('link', { name: 'Report', exact: true }).click();
    await page.locator('section[aria-labelledby="share-title"]').getByRole('button', { name: 'Create link' }).click();
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
  });
});

test.describe('written summary with a local language model (opt-in)', () => {
  test('is hidden until enabled, then calls only the local server with aggregate figures', async ({ page }) => {
    const errors = failOnConsoleErrors(page);
    await demoWithNote(page);
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Written summary (experimental)' })).toHaveCount(0);

    let body = '';
    let calls = 0;
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    await page.route('http://localhost:11434/api/generate', async (route) => {
      if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: cors }); return; }
      calls++;
      body = route.request().postData() ?? '';
      await route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ response: 'Your last month looked steady.' }) });
    });

    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page.getByLabel('Server address')).toHaveCount(0);
    await page.getByLabel('Enable written summaries').check();
    await expect(page.getByLabel('Server address')).toHaveValue('http://localhost:11434');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
    expect(calls).toBe(0); // nothing is sent until the button is pressed
    await page.getByRole('button', { name: 'Write a summary' }).click();
    await expect(page.getByText('Your last month looked steady.')).toBeVisible();
    expect(calls).toBe(1);
    const sent = JSON.parse(body) as { model: string; prompt: string; stream: boolean };
    expect(sent.stream).toBe(false);
    expect(sent.prompt).toContain('Last 30 days');
    expect(sent.prompt).not.toContain(SECRET);
    expect(sent.prompt).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    await expect(page.getByText(/not a diagnosis or advice/)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors.filter((e) => !/localhost:11434/.test(e))).toEqual([]);
  });

  test('a server that is not on this computer needs explicit consent and is never called without it', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    let calls = 0;
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    await page.route('https://llm.example.test/**', async (route) => {
      if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: cors }); return; }
      calls++;
      await route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ response: 'Remote text.' }) });
    });
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Enable written summaries').check();
    await page.getByLabel('Server address').fill('https://llm.example.test');
    await expect(page.getByText('This address is not on this computer.')).toBeVisible();
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Write a summary' })).toBeDisabled();
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.getByLabel(/I understand and allow/).check();
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
    await page.getByRole('button', { name: 'Write a summary' }).click();
    await expect(page.getByText('Remote text.')).toBeVisible();
    expect(calls).toBeGreaterThan(0);
  });

  test('shows a helpful message when the server is not reachable', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    await page.route('http://localhost:11434/**', (route) => route.abort('connectionrefused'));
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Enable written summaries').check();
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
    await page.getByRole('button', { name: 'Write a summary' }).click();
    await expect(page.getByRole('alert')).toContainText('Could not reach the model');
  });
});

test.describe('JSON summary export', () => {
  test('downloads the documented document', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export summary (JSON)' }).click()]);
    expect(dl.suggestedFilename()).toBe('opencpap-summary.json');
    const doc = JSON.parse(readFileSync((await dl.path())!, 'utf8'));
    expect(doc.schema).toBe('opencpap-summary/1');
    expect(doc.last_night.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(doc.last_30_days.nights_with_data).toBeGreaterThan(10);
  });
});
