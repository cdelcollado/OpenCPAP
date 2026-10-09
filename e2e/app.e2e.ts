import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { failOnConsoleErrors, loadDemo, resetApp } from './helpers';

test.describe('app shell', () => {
  test('shows the empty state, then demo data on the dashboard', async ({ page }) => {
    const errors = failOnConsoleErrors(page);
    await resetApp(page);
    await expect(page.getByRole('heading', { name: 'No data yet' })).toBeVisible();
    await loadDemo(page);
    await expect(page.getByText('You are viewing synthetic demo data.')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Last night/ })).toBeVisible();
    // three trend charts are real canvases
    await expect(page.locator('.chart-box canvas').first()).toBeVisible();
    expect(await page.locator('.chart-box canvas').count()).toBeGreaterThanOrEqual(3);
    await expect(page.getByRole('row').nth(1)).toBeVisible(); // nights table has rows
    expect(errors).toEqual([]);
  });

  test('opens a night with timeline and charts, zoom reset works', async ({ page }) => {
    const errors = failOnConsoleErrors(page);
    await resetApp(page);
    await loadDemo(page);
    await page.getByRole('row').nth(1).getByRole('link').click(); // most recent night (has waveform in demo data)
    await expect(page.getByRole('heading', { level: 1, name: /Night of/ })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Event timeline' })).toBeVisible();
    await expect(page.locator('section[aria-label="Flow"] canvas').first()).toBeVisible();
    await expect(page.locator('section[aria-label="Total leak (L/min)"] canvas').first()).toBeVisible();

    const reset = page.getByRole('button', { name: 'Reset zoom' });
    await expect(reset).toBeDisabled();
    const flow = page.locator('section[aria-label="Flow"] .u-over');
    await flow.scrollIntoViewIfNeeded(); // mouse events only reach what is inside the viewport
    const box = (await flow.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(reset).toBeEnabled(); // dragging zoomed the shared range
    await reset.click();
    await expect(reset).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('previous/next night navigation', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    await page.getByRole('row').nth(1).getByRole('link').click();
    const title = await page.getByRole('heading', { level: 1 }).textContent();
    await page.getByRole('link', { name: /Previous night/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(title!);
    await expect(page.getByRole('link', { name: /Next night/ })).toBeVisible();
  });

  test('language and theme switches persist across reloads', async ({ page }) => {
    await resetApp(page);
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.getByRole('combobox', { name: 'Language' }).selectOption('ca');
    await expect(page.getByRole('heading', { level: 1, name: 'Configuració' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ca');
    await page.getByRole('combobox', { name: 'Tema' }).selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Configuració' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('data persists after a reload and can be deleted', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: /Last night/ })).toBeVisible();
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Delete all data' }).click();
    await expect(page.getByText('Data deleted.')).toBeVisible();
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'No data yet' })).toBeVisible();
  });

  test('is an installable PWA with a service worker', async ({ page, request }) => {
    await resetApp(page);
    const manifest = await (await request.get('/manifest.webmanifest')).json();
    expect(manifest).toMatchObject({ name: 'OpenCPAP', display: 'standalone' });
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    const active = await page.evaluate(async () => !!(await navigator.serviceWorker.ready).active);
    expect(active).toBe(true);
  });
});

test.describe('accessibility (axe, WCAG 2.1 A/AA)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`no violations on main screens, ${scheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await resetApp(page);
      await loadDemo(page);
      const check = async (label: string) => {
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(r.violations.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual([]);
      };
      await check('dashboard');
      await page.getByRole('row').nth(1).getByRole('link').click();
      await expect(page.getByRole('group', { name: 'Event timeline' })).toBeVisible();
      await check('night');
      await page.getByRole('link', { name: 'Import', exact: true }).click();
      await check('import');
      await page.getByRole('link', { name: 'Settings', exact: true }).click();
      await check('settings');
    });
  }
});
