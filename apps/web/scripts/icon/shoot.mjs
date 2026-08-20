import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = process.env.ICON_DIR ?? path.dirname(new URL(import.meta.url).pathname.slice(1));
const EDGE = process.env.EDGE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--disable-dev-shm-usage',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[error]', e.message));

await page.goto(pathToFileURL(path.join(dir, 'render.html')).href, { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForFunction(() => typeof window.__png === 'object' && window.__png !== null, { timeout: 60000 });

const out = await page.evaluate(() => window.__png);
for (const [variant, sizes] of Object.entries(out)) {
  for (const [key, url] of Object.entries(sizes)) {
    const file = path.join(dir, `${variant}-${key}.png`);
    writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log('written', file);
  }
}

await browser.close();
