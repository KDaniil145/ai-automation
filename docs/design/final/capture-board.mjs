/** Real ParcelBot screenshots only. Run: node docs/design/final/capture-board.mjs */
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const output = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(output, '../../..');
const frontend = path.join(repo, 'frontend');
const require = createRequire(path.join(frontend, 'package.json'));
const { chromium, expect } = require('@playwright/test');
const origin = 'http://localhost:15174';
const api = 'https://api.example.test/webhook';
const date = '2026-11-25';
const figma = 'https://www.figma.com/make/7z26BI2zEUfAOxPbj4LIDR/ParcelBot-Parcel-Planning-Interface?t=v91Hh0vUxpOwoAKm-1';
const parcels = [
  { id: 42, name: 'Документы', weight: 2.5, priority: true, category: 'express', shippingDate: date },
  { id: 43, name: 'Книги', weight: 12.4, priority: false, category: 'heavy', shippingDate: date },
  { id: 44, name: 'Одежда', weight: 3.2, priority: false, category: 'standard', shippingDate: date },
];
const frames = [
  { id: '01-form-dark', title: 'Новая посылка', subtitle: 'Тёмная тема · ввод параметров', theme: 'dark', state: 'form' },
  { id: '02-form-light', title: 'Новая посылка', subtitle: 'Светлая тема · те же параметры', theme: 'light', state: 'form' },
  { id: '03-list-dark', title: 'Отправки по дате', subtitle: 'Тёмная тема · ответ WF2', theme: 'dark', state: 'list' },
  { id: '04-list-light', title: 'Отправки по дате', subtitle: 'Светлая тема · ответ WF2', theme: 'light', state: 'list' },
  { id: '05-loading', title: 'Loading / сохранение', subtitle: 'WF1 ожидает ответа · повторная отправка заблокирована', theme: 'dark', state: 'loading' },
  { id: '06-success', title: 'Success / сохранено', subtitle: 'Подтверждение сохранения и категория express', theme: 'light', state: 'success' },
  { id: '07-empty', title: 'Empty / нет отправок', subtitle: 'WF2 вернул пустой массив за выбранную дату', theme: 'light', state: 'empty' },
  { id: '08-error', title: 'Error / ошибка загрузки', subtitle: 'HTTP 503 · доступна повторная попытка', theme: 'dark', state: 'error' },
  { id: '09-mobile-form', title: 'Форма', subtitle: 'Светлая тема · приоритет выключен', theme: 'light', state: 'form', mobile: true },
  { id: '10-mobile-list', title: 'Отправки', subtitle: 'Светлая тема · адаптивные карточки', theme: 'light', state: 'list', mobile: true },
  { id: '11-mobile-empty', title: 'Пустой результат', subtitle: 'Тёмная тема · смена даты', theme: 'dark', state: 'empty', mobile: true },
  { id: '12-mobile-error', title: 'Ошибка', subtitle: 'Тёмная тема · повтор загрузки', theme: 'dark', state: 'error', mobile: true },
];
const hash = data => createHash('sha256').update(data).digest('hex');
async function tree(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(e => e.isDirectory() ? tree(path.join(dir, e.name)) : path.join(dir, e.name)))).flat();
}
const originals = [...await tree(path.join(frontend, 'src')),
  path.join(frontend, 'vite.config.ts'), path.join(frontend, 'playwright.config.ts'),
  path.join(repo, 'README.md'), path.join(repo, 'docs/design/ParcelBot Parcel Planning Interface.zip'),
  ...await tree(path.join(repo, 'docs/screenshots'))];
const before = Object.fromEntries(await Promise.all(originals.map(async p => [path.relative(repo, p), hash(await readFile(p))])));
await mkdir(path.join(output, 'screens'), { recursive: true });
const log = [];
const server = spawn(process.execPath, [path.join(frontend, 'node_modules/vite/bin/vite.js'), '--port', '15174'], {
  cwd: frontend, env: { ...process.env, VITE_API_BASE_URL: api }, detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', b => log.push(b.toString()));
server.stderr.on('data', b => log.push(b.toString()));
let browser;
const manifest = { generatedUTC: new Date().toISOString(), source: 'Current frontend/ rendered by Playwright Chromium; no UI CSS/DOM overrides',
  api: 'All responses mocked at api.example.test; external requests blocked', locale: 'ru-RU', language: 'ru_RU:ru',
  deviceScaleFactor: 2, sourceChecksums: before, frames: [] };
try {
  let ready = false;
  for (let n = 0; n < 100; n++) {
    if (server.exitCode !== null) throw new Error('Vite exited: ' + log.join(''));
    try { const response = await fetch(origin); if (response.ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  if (!ready) throw new Error('Vite readiness timeout');
  browser = await chromium.launch({ env: { ...process.env, LANGUAGE: 'ru_RU:ru' } });
  for (const frame of frames) {
    const context = await browser.newContext({ locale: 'ru-RU', deviceScaleFactor: 2,
      serviceWorkers: 'block', viewport: frame.mobile ? { width: 375, height: 812 } : { width: 1280, height: 900 } });
    const page = await context.newPage();
    const calls = []; const blocked = [];
    let release;
    const gate = new Promise(r => { release = r; });
    await page.route('**/*', async route => {
      const req = route.request(); const url = new URL(req.url());
      if (url.origin === origin) return route.continue();
      if (url.origin !== new URL(api).origin || !url.pathname.startsWith('/webhook/')) {
        blocked.push(url.origin); return route.abort();
      }
      calls.push({ method: req.method(), path: url.pathname });
      if (req.method() === 'GET' && url.pathname.endsWith('/parcelbot-parcels')) {
        expect(url.searchParams.get('date')).toBe(date);
        if (frame.state === 'error') return route.fulfill({ status: 503, json: {} });
        return route.fulfill({ json: { parcels: frame.state === 'empty' ? [] : parcels } });
      }
      const body = req.postDataJSON();
      if (body.action === 'calculate') return route.fulfill({ json: { category: 'express' } });
      expect(body.action).toBe('save');
      if (frame.state === 'loading') await gate;
      return route.fulfill({ status: 201, json: { parcel: { ...parcels[0], ...body, id: 42, category: 'express' } } });
    });
    await page.addInitScript(({ theme, date }) => {
      localStorage.setItem('parcelbot-theme', theme);
      localStorage.setItem('parcelbot-date', date);
    }, { theme: frame.theme, date });
    await page.goto(origin);
    await expect(page.locator('html')).toHaveAttribute('data-theme', frame.theme);
    // Wait for the real app's theme transition; do not override app styles.
    const themeText = frame.theme === 'light' ? 'rgb(17, 24, 39)' : 'rgb(243, 246, 251)';
    await expect(page.locator('body')).toHaveCSS('color', themeText);
    if (['list', 'empty', 'error'].includes(frame.state)) {
      await page.getByRole('button', { name: 'Отправки по дате' }).click();
      if (frame.state === 'list') await expect(page.getByText('Книги', { exact: true })).toBeVisible();
      if (frame.state === 'empty') await expect(page.getByText('На выбранную дату посылок нет')).toBeVisible();
      if (frame.state === 'error') await expect(page.getByRole('alert')).toContainText('HTTP 503');
    } else {
      await page.getByLabel('Название посылки', { exact: true }).fill('Документы');
      await page.getByLabel('Вес, кг', { exact: true }).fill('2.5');
      await page.getByLabel('Дата отправки', { exact: true }).fill(date);
      if (frame.mobile) {
        await page.getByRole('switch').focus(); await page.keyboard.press('Space');
        await expect(page.getByRole('switch')).not.toBeChecked();
      }
      if (frame.state === 'loading' || frame.state === 'success') {
        await page.getByRole('button', { name: 'Сохранить посылку' }).click();
        if (frame.state === 'loading') {
          await expect(page.getByText('Сохраняем посылку', { exact: true })).toBeVisible();
          await expect(page.getByRole('button', { name: 'Сохраняем…', exact: true })).toBeDisabled();
        } else await expect(page.getByText('Посылка успешно сохранена')).toBeVisible();
      }
    }
    // Remove only transient keyboard focus through a real pointer action on the heading.
    await page.getByRole('heading', { level: 2 }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const filename = `screens/${frame.id}.png`;
    const png = await page.screenshot({ path: path.join(output, filename), fullPage: true, animations: 'disabled' });
    manifest.frames.push({ ...frame, file: filename, width: png.readUInt32BE(16), height: png.readUInt32BE(20), sha256: hash(png), mockCalls: calls, blockedOrigins: [...new Set(blocked)] });
    release(); await context.close();
    console.log('Captured ' + frame.id, png.readUInt32BE(16) + 'x' + png.readUInt32BE(20));
  }
  const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  const figure = (f, i) => `<figure><figcaption><span class="number">${String(i + 1).padStart(2, '0')}</span><div><h3>${escape(f.title)}</h3><p>${escape(f.subtitle)}</p></div><span class="theme ${f.theme}">${f.theme === 'light' ? 'LIGHT' : 'DARK'}</span></figcaption><a href="screens/${f.id}.png" title="Открыть исходный скриншот"><img src="screens/${f.id}.png" alt="${escape(f.title + '. ' + f.subtitle)}" /></a></figure>`;
  const html = `<!doctype html>
<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ParcelBot — итоговый визуальный макет</title>
<style>
*{box-sizing:border-box}html{background:#e9edf3}body{margin:0;color:#172337;font:16px/1.5 system-ui,-apple-system,sans-serif}.board{max-width:1760px;margin:auto;padding:64px;background:#edf1f6}.eyebrow{color:#2563eb;font-size:13px;font-weight:750;letter-spacing:.16em;text-transform:uppercase}.hero{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #ced6e2;padding-bottom:28px;margin-bottom:30px}.hero h1{font-size:66px;line-height:1.05;letter-spacing:-.055em;margin:12px 0 18px}.hero h1 span{color:#2563eb}.hero p{max-width:800px;color:#526176;font-size:19px;margin:0}.stamp{text-align:right;color:#53657b;font-size:14px;padding-top:8px}.stamp strong{display:block;color:#172337;font-size:17px;margin-bottom:7px}.flow{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:24px 0 44px}.flow span{background:white;border:1px solid #d6dfeb;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:650}.flow b{color:#7587a1}.section-head{display:flex;justify-content:space-between;align-items:baseline;margin:34px 0 18px}.section-head h2{font-size:27px;letter-spacing:-.025em;margin:0}.section-head p{color:#63748b;margin:0;font-size:14px}.desktop{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.mobile{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px}figure{margin:0;padding:13px;background:#fff;border:1px solid #d8e0eb;border-radius:15px;box-shadow:0 8px 30px #182c4c08;overflow:hidden}figcaption{display:flex;gap:11px;align-items:center;padding:3px 4px 14px;min-height:70px}.number{color:#7890af;font-size:13px;font-variant-numeric:tabular-nums}h3{font-size:17px;line-height:1.25;margin:0 0 4px}figcaption p{font-size:12px;color:#6a7a90;margin:0}.theme{margin-left:auto;border:1px solid #dce3ed;font-size:10px;font-weight:750;letter-spacing:.08em;padding:4px 7px;border-radius:5px}.theme.dark{background:#162236;color:#d2def1;border-color:#162236}.theme.light{background:#f5f8ff;color:#31598e}img{display:block;width:100%;height:auto;border-radius:7px}a{color:inherit}.mobile figcaption{min-height:82px}.mobile .theme{display:none}.notes{display:grid;grid-template-columns:1fr 1fr;gap:40px;border-top:1px solid #ced6e2;margin-top:38px;padding-top:24px;font-size:14px;color:#5a6c83}.notes strong{display:block;color:#172337;margin-bottom:7px}.notes p{margin:0}.notes a{color:#2563eb}.footer{margin-top:25px;display:flex;justify-content:space-between;font-size:12px;color:#75859b}@media(max-width:900px){.board{padding:24px}.hero h1{font-size:44px}.stamp{display:none}.desktop{grid-template-columns:1fr}.mobile{grid-template-columns:repeat(2,minmax(0,1fr))}.section-head{display:block}.notes{grid-template-columns:1fr;gap:18px}}@media print{.board{max-width:none;padding:20px}figure{break-inside:avoid}}
</style>
<main class="board"><header class="hero"><div><div class="eyebrow">Практика 8 · срез реализованного интерфейса</div><h1>Parcel<span>Bot</span></h1><p>Классификация посылок и планирование отправок.<br>Актуальные экраны React-интерфейса, обе темы и состояния.</p></div><div class="stamp"><strong>Итоговый визуальный макет</strong>Статическая дизайн-доска<br>Playwright · Chromium · ru-RU<br>Скриншоты 2× · API подменён</div></header>
<div class="flow"><span>01 · Ввести параметры</span><b>→</b><span>02 · Рассчитать категорию / WF1</span><b>→</b><span>03 · Сохранить / WF1</span><b>→</b><span>04 · Посмотреть отправки / WF2</span></div>
<section><div class="section-head"><h2>Основные экраны · две темы</h2><p>Desktop · viewport 1280 × 900</p></div><div class="desktop">${frames.slice(0,4).map(figure).join('')}</div></section>
<section><div class="section-head"><h2>Обратная связь · состояния</h2><p>Loading / success / empty / error</p></div><div class="desktop">${frames.slice(4,8).map((f,i)=>figure(f,i+4)).join('')}</div></section>
<section><div class="section-head"><h2>Мобильный интерфейс</h2><p>Mobile · viewport 375 × 812 · полная высота страницы</p></div><div class="mobile">${frames.slice(8).map((f,i)=>figure(f,i+8)).join('')}</div></section>
<section class="notes"><div><strong>Источник и способ съёмки</strong><p>Все кадры сняты с текущего frontend/. Макет не перерисован: приложение не получало изменений CSS или DOM ради этой доски. Запросы WF1/WF2 перехвачены тестовыми ответами; настоящий n8n не вызывался. Внешний шрифт блокируется, используется системный fallback.</p></div><div><strong>Связь с исходным макетом</strong><p>Дополнение к <a href="${escape(figma)}">исходному Figma Make</a>: автоматическая загрузка по дате, Mantine, актуальные уведомления, переключатели и отсутствие демо-надписей. Это статический экспорт реализации, не редактируемый Figma-файл и не подтверждение обновления Figma Make.</p></div></section><footer class="footer"><span>ParcelBot / React + Mantine / визуальная спецификация</span><span>Каждый кадр открывается отдельно в HTML-версии</span></footer></main></html>`;
  await writeFile(path.join(output, 'index.html'), html);
  const boardContext = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1760, height: 1000 }, locale: 'ru-RU' });
  const board = await boardContext.newPage();
  await board.route(/^https?:/, route => route.abort());
  await board.goto(pathToFileURL(path.join(output, 'index.html')).href);
  await expect(board.locator('figure')).toHaveCount(12);
  await board.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0));
  expect(await board.evaluate(() => document.documentElement.scrollWidth)).toBe(1760);
  const png = await board.screenshot({ path: path.join(output, 'parcelbot-design-board.png'), fullPage: true, animations: 'disabled' });
  manifest.board = { file: 'parcelbot-design-board.png', width: png.readUInt32BE(16), height: png.readUInt32BE(20), sha256: hash(png) };
  await boardContext.close();
  for (const [relative, digest] of Object.entries(before)) {
    if (hash(await readFile(path.join(repo, relative))) !== digest) throw new Error('Source changed: ' + relative);
  }
  manifest.originalFilesUnchanged = true;
  await writeFile(path.join(output, 'capture-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('Board exported:', manifest.board.width + 'x' + manifest.board.height);
  console.log('Verified: all source files, source ZIP, README and original screenshots unchanged.');
} finally {
  if (browser) await browser.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
}
