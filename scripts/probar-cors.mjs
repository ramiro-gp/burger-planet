import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../public/catalog-source.json', import.meta.url), 'utf8'));
const urls = process.argv.slice(2);
if (!urls.length && config.mode === 'sheets') urls.push(...Object.values(config.urls));
if (!urls.length) throw new Error('Configurá las URLs de Sheets o pasá una URL de CSV público.');

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
try {
  const page = await browser.newPage();
  await page.route('http://127.0.0.1:4182/', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Prueba CORS</title>' }));
  await page.goto('http://127.0.0.1:4182/');
  const result = await page.evaluate(async (sources) => Promise.all(sources.map(async (url) => {
    try {
      const response = await fetch(url, {
        credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15000),
      });
      const type = response.headers.get('content-type');
      const csv = Boolean(response.ok && type?.includes('text/csv'));
      await response.body?.cancel();
      return { ok: csv, status: response.status, type, redirected: response.redirected, finalHost: new URL(response.url).hostname };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  })), urls);
  console.log(JSON.stringify(result, null, 2));
  if (result.some((entry) => !entry.ok)) process.exitCode = 1;
} finally {
  await browser.close();
}
