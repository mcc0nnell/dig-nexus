import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { themes } from '../themes.mjs';
import { server } from '../server.mjs';

const dir = fileURLToPath(new URL('../previews/', import.meta.url));
let browser;
try {
  await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
  const port = server.address().port;
  browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1280,height:960},deviceScaleFactor:1,reducedMotion:'reduce'});
  await page.goto(`http://127.0.0.1:${port}/`, {waitUntil:'networkidle'});
  await mkdir(dir, {recursive:true});
  for (const theme of themes) {
    await page.locator('#theme').selectOption(theme);
    await page.screenshot({path: `${dir}${theme}.png`,fullPage:true,animations:'disabled'});
    console.log(`Captured ${theme}`);
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
