import { expect, type ConsoleMessage, type Page } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { syntheticCardFiles } from '@opencpap/loader-philips-ds2/testing';

/** Fails the test on uncaught errors and console errors (the app must be silent when healthy). */
export function failOnConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m: ConsoleMessage) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}

export function syntheticZip(dir: string): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'synthetic-card.zip');
  writeFileSync(path, zipSync(Object.fromEntries(syntheticCardFiles())));
  return path;
}

export const realCard = join(process.cwd(), 'fixtures', 'raw');
export const hasRealCard = existsSync(join(realCard, 'P-SERIES'));

/** Starts every test from an empty browser profile state. */
export async function resetApp(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    await Promise.all(dbs.map((d) => new Promise((r) => { const q = indexedDB.deleteDatabase(d.name!); q.onsuccess = q.onerror = q.onblocked = () => r(null); })));
    localStorage.clear();
  });
  await page.goto('/');
}

export async function loadDemo(page: Page) {
  await page.getByRole('link', { name: 'Import', exact: true }).click();
  await page.getByRole('button', { name: 'Load demo data' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
}

/** Scrolls an element to the middle of the viewport. `scrollIntoViewIfNeeded` can leave it under a sticky header, where mouse events never reach it. */
export async function scrollToCenter(locator: import('@playwright/test').Locator) {
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center' }));
}

export async function openLatestNight(page: Page) {
  await page.getByRole('row').nth(1).getByRole('link').first().click();
  await expect(page.getByRole('group', { name: 'Event timeline' })).toBeVisible();
}
