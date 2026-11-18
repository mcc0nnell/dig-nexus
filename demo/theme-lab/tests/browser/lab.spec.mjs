import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { themes } from '../../themes.mjs';
for (const theme of themes) {
  test(`${theme}: accessibility, consent, keyboard, motion and mobile`, async ({page}) => {
    await page.goto('/');
    await page.locator('#theme').selectOption(theme);
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()).violations).toEqual([]);
    await page.getByRole('button', {name: 'Simulate registration'}).click();
    await expect(page.locator('#display-name')).toBeFocused();
    await expect(page.locator('#error')).toBeVisible();
    await expect(page.locator('#accessibility')).toBeDisabled();
    await page.locator('#display-name').fill('Test Visitor');
    await page.keyboard.press('Tab');
    await expect(page.locator('#consent')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.locator('#accessibility')).toBeEnabled();
    await page.locator('#accessibility').fill('Fictional quiet space');
    await page.locator('#consent').uncheck();
    await expect(page.locator('#accessibility')).toHaveValue('');
    await page.locator('#consent').check();
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()).violations).toEqual([]);
    await page.getByRole('button', {name: 'Simulate registration'}).click();
    await expect(page.locator('#status')).toContainText('Simulation complete');
    await page.emulateMedia({reducedMotion: 'reduce'});
    expect(await page.locator('button').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    await page.setViewportSize({width: 320, height: 800});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.reload();
    await expect(page.locator('#display-name')).toHaveValue('');
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip')).toBeFocused();
    expect(await page.locator('.skip').evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  });
}
test('same DOM and values; zero requests on switches or submit; distinctive geometry', async ({page}) => {
  await page.goto('/');
  await page.locator('#display-name').fill('Persistent fiction');
  await page.locator('#consent').check();
  await page.locator('#accessibility').fill('Fictional request');
  await page.evaluate(() => { window.originalForm = document.querySelector('form'); });
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  const geometry = [];
  for (const theme of themes) {
    await page.locator('#theme').selectOption(theme);
    expect(await page.evaluate(() => window.originalForm === document.querySelector('form'))).toBe(true);
    await expect(page.locator('#display-name')).toHaveValue('Persistent fiction');
    await expect(page.locator('#accessibility')).toHaveValue('Fictional request');
    geometry.push(await page.evaluate(() => {
      const windowStyle = getComputedStyle(document.querySelector('.atlas-retro-window'));
      const button = getComputedStyle(document.querySelector('button'));
      return {radius: windowStyle.borderRadius, shadow: windowStyle.boxShadow, button: button.borderRadius, material: windowStyle.backgroundImage};
    }));
    await page.locator('button').click();
  }
  expect(geometry[0].radius).toBe('0px'); expect(geometry[1].radius).toBe('18px'); expect(geometry[2].radius).toBe('0px');
  expect(new Set(geometry.map(g => g.button)).size).toBe(3);
  expect(geometry[1].material).toContain('gradient'); expect(geometry[2].shadow).toBe('none');
  expect(requests).toEqual([]);
});
test('server rejects traversal, unknown files, hostile hosts and writes', async ({request}) => {
  for (const url of ['/package.json', '/upstream/../server.mjs', '/%2e%2e%2fpackage.json', '/%ZZ']) expect((await request.get(url)).status()).toBeGreaterThanOrEqual(400);
  expect((await request.post('/')).status()).toBe(405);
  expect((await request.get('/', {headers: {host: 'attacker.example'}})).status()).toBe(403);
  expect((await request.get('/')).headers()['content-security-policy']).toContain("connect-src 'none'");
});
