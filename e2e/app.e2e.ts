import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { failOnConsoleErrors, loadDemo, resetApp, scrollToCenter } from './helpers';

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
    await expect(page.getByRole('heading', { level: 1 })).toContainText('2026');
    await expect(page.getByRole('group', { name: 'Event timeline' })).toBeVisible();
    await expect(page.locator('[data-track="flow"] canvas').first()).toBeVisible();
    await expect(page.locator('[data-track="leak"] canvas').first()).toBeVisible();

    const reset = page.getByRole('button', { name: 'Reset zoom' });
    await expect(reset).toBeDisabled();
    const flow = page.locator('[data-track="flow"] .u-over');
    await scrollToCenter(flow); // mouse events only reach what is visible (not under the sticky headers)
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
    await page.locator('#hdr-lang').selectOption('ca');
    await page.getByRole('link', { name: 'Configuració', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Configuració' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ca');
    // the header button cycles system -> light -> dark
    const toggle = page.getByRole('button', { name: /^Tema:/ });
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Configuració' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // the settings page offers the same choices
    await page.getByRole('combobox', { name: 'Tema' }).selectOption('system');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
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

test.describe('dashboard interaction', () => {
  test('hover shows a tooltip with the values and clicking a bar opens that night', async ({ page }) => {
    const errors = failOnConsoleErrors(page);
    await resetApp(page);
    await loadDemo(page);
    const plot = page.locator('.chart-card').first().locator('.u-over');
    await scrollToCenter(plot);
    const box = (await plot.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
    const tip = page.locator('.chart-tip').first();
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(/\d+ h \d{2} min/); // value first
    await expect(tip).toContainText('2026');
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5);
    await expect(page).toHaveURL(/#\/night\/\d{4}-\d{2}-\d{2}$/);
    expect(errors).toEqual([]);
  });

  test('calendar cells link to nights and the measure can be switched', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    const cells = page.locator('.heat-cell.has');
    expect(await cells.count()).toBeGreaterThan(15);
    const before = await cells.first().getAttribute('style');
    await page.getByRole('radio', { name: 'AHI', exact: true }).check({ force: true });
    await expect.poll(async () => cells.first().getAttribute('style')).not.toBe(before);
    await cells.first().click();
    await expect(page).toHaveURL(/#\/night\//);
  });

  test('last night is the hero figure with a status chip and a comparison', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    await expect(page.getByTestId('hero-ahi')).toContainText(/\d/);
    await expect(page.locator('.hero .badge').first()).toContainText(/per hour/); // icon + text, not colour alone
    await expect(page.locator('.hero')).toContainText('30-night avg');
    await expect(page.getByText('Meets the common 4 h / 70 % rule').or(page.getByText('Below the common 4 h / 70 % rule'))).toBeVisible();
  });
});

test.describe('night view', () => {
  test('tracks share the same plot area as the event timeline', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await resetApp(page);
    await loadDemo(page);
    await page.getByRole('row').nth(1).getByRole('link').click();
    await expect(page.locator('[data-track="flow"] canvas').first()).toBeVisible();
    const edges = async (sel: string) => (await page.locator(sel).first().evaluate((e) => { const r = e.getBoundingClientRect(); return [r.left, r.right]; })) as [number, number];
    const timeline = await edges('.timeline-row .plot svg');
    for (const track of ['flow', 'leak', 'pressure', 'snore']) {
      const [l, r] = await edges(`[data-track="${track}"] .u-over`);
      expect(Math.abs(l - timeline[0]), `${track} left edge`).toBeLessThan(1.5);
      expect(Math.abs(r - timeline[1]), `${track} right edge`).toBeLessThan(1.5);
    }
  });

  test('hovering a chart shows one readout with the value of every track', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    await page.getByRole('row').nth(1).getByRole('link').click();
    const over = page.locator('[data-track="leak"] .u-over');
    await scrollToCenter(over);
    const box = (await over.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2, { steps: 4 });
    const readout = page.getByTestId('readout');
    await expect(readout).toContainText(/\d{2}:\d{2}:\d{2}/);
    await expect(readout).toContainText('Flow');
    await expect(readout).toContainText('Leak');
    await expect(readout).toContainText('Pressure');
    // the crosshair is synchronised: the flow chart shows a cursor line too
    await expect(page.locator('[data-track="flow"] .u-cursor-x')).toBeVisible();
  });

  test('shows the therapy settings and the event bars', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    await page.getByRole('row').nth(1).getByRole('link').click();
    await expect(page.getByRole('heading', { name: 'Therapy settings' })).toBeVisible();
    await expect(page.locator('.kv')).toContainText('Ramp time');
    await expect(page.locator('.event-bar').first()).toBeVisible();
  });

  test('jumping to a date with the date picker', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    await page.getByRole('row').nth(2).getByRole('link').click();
    const date = await page.locator('#jump').inputValue();
    await page.getByRole('link', { name: /Next night/ }).click();
    await expect(page.locator('#jump')).not.toHaveValue(date);
    await page.locator('#jump').fill(date);
    await expect(page).toHaveURL(new RegExp(`night/${date}$`));
  });
});

test.describe('app updates', () => {
  // The build's service worker is replaced by a copy with one extra comment line, which the browser sees as a new version.
  const swPath = join(process.cwd(), 'apps', 'web', 'dist', 'sw.js');
  const original = readFileSync(swPath, 'utf8');
  test.afterEach(() => writeFileSync(swPath, original));

  test('a downloaded new version shows the update banner and the button reloads the page', async ({ page }) => {
    await resetApp(page);
    await loadDemo(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    // a new worker only waits (instead of activating at once) when the page is already controlled by the current one
    await page.reload();
    await page.evaluate(() => navigator.serviceWorker.ready);
    writeFileSync(swPath, `${original}\n// e2e: new version\n`);
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
    const banner = page.getByRole('status').filter({ hasText: 'A new version of OpenCPAP is available.' });
    await expect(banner).toBeVisible({ timeout: 30_000 });
    await Promise.all([page.waitForEvent('load'), banner.getByRole('button', { name: 'Update now' }).click()]);
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  });
});

test.describe('responsive layout', () => {
  for (const [name, route] of [['dashboard', ''], ['night', 'night']] as const) {
    test(`${name} does not overflow horizontally on a 390 px phone`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 800 });
      await resetApp(page);
      await loadDemo(page);
      if (route === 'night') await page.getByRole('row').nth(1).getByRole('link').click();
      await expect(page.locator('main h1')).toBeVisible();
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test('segmented options never break a word and touch targets are at least 44 px high', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await resetApp(page);
    await loadDemo(page);
    // every option of every segmented control renders on one line (one client rect for its text)
    const broken = await page.evaluate(() => [...document.querySelectorAll('.seg label')].filter((label) => {
      // measure the text nodes only: the hidden radio input is absolutely positioned over the label
      const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
      const tops = new Set<number>();
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) tops.add(Math.round(r.top));
      }
      return tops.size > 1;
    }).map((l) => l.textContent));
    expect(broken).toEqual([]);
    const small = await page.locator('.icon-btn, .app-header nav a').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)).filter((h) => h < 44));
    expect(small).toEqual([]);
  });

  test('the nights table keeps dates and bar values on one line', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await resetApp(page);
    await loadDemo(page);
    // measure the visible text nodes only: the decorative mini bar and the screen-reader-only text are not part of the line
    const lines = await page.locator('.nights-wrap tbody th[scope="row"] a, .nights-wrap .bar-cell').evaluateAll((els) => els.map((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement?.closest('.sr-only') || !n.textContent?.trim() ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
      const tops = new Set<number>();
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) tops.add(Math.round(r.top));
      }
      return tops.size;
    }));
    expect(lines.length).toBeGreaterThan(0);
    expect(Math.max(...lines)).toBe(1);
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
