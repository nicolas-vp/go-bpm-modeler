// Обвязка браузерных тестов: собранный фронтенд из dist в Chromium, Go-бэкенд Wails подменён заглушкой в памяти.
// Файлы рабочей папки - window.__files, ссылки, открытые через BrowserOpenURL, - window.__opened

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

/**
 * Открывает приложение. files - файлы рабочей папки (путь -> содержимое), index - ответ App.Index().
 * Возвращает страницу, check() и помощники для работы с bpmn-js и панелью свойств
 */
export async function open({ dist, files, index, viewport = { width: 1400, height: 900 } }) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  const results = [];
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));

  await page.route('http://app.local/**', (route) => {
    const rel = new URL(route.request().url()).pathname.replace(/^\//, '') || 'index.html';
    const file = path.join(dist, rel);
    route.fulfill({ body: fs.readFileSync(file), contentType: TYPES[path.extname(file)] ?? 'application/octet-stream' });
  });

  await page.addInitScript(
    ({ files, index }) => {
      window.__files = files;
      window.__opened = [];
      window.runtime = { BrowserOpenURL: (url) => window.__opened.push(url) };
      const list = () =>
        Object.keys(window.__files)
          .sort()
          .map((p) => ({ path: p, kind: p.endsWith('.dmn') ? 'dmn' : 'bpmn' }));
      window.go = {
        main: {
          App: {
            Workspace: async () => '/work/process',
            ChooseWorkspace: async () => '/work/process',
            ListFiles: async () => list(),
            ReadFile: async (p) => window.__files[p],
            WriteFile: async (p, c) => {
              window.__files[p] = c;
            },
            CreateFile: async (p, c) => {
              if (p in window.__files) throw new Error('exists');
              window.__files[p] = c;
            },
            Index: async () => index,
            SetDirty: async () => {},
            Confirm: async () => true,
          },
        },
      };
    },
    { files, index: index ?? { processes: [], decisions: [], problems: {} } },
  );

  const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: ok ? '' : String(detail ?? '') });

  // Пустое место холста: правый нижний угол, левее панели свойств
  const blank = () => ({ x: viewport.width - 500, y: viewport.height - 150 });

  const h = {
    page,
    check,
    errors,
    blank,

    async select(id) {
      const { x, y } = blank();
      await page.mouse.click(x, y);
      // Только видимая вкладка: в разных вкладках id элементов могут совпадать
      await page.locator(`.editor:not([hidden]) .djs-element[data-element-id="${id}"] .djs-hit`).first().click({ force: true });
      await page.waitForTimeout(150);
    },

    /** Выделяет переход щелчком по точке на линии: центр рамки ломаной - пустое место */
    async selectFlow(id) {
      const { x, y } = blank();
      await page.mouse.click(x, y);
      const point = await page.evaluate((id) => {
        const line = document.querySelector(`.editor:not([hidden]) .djs-element[data-element-id="${id}"] .djs-visual > path`);
        const p = line.getPointAtLength(line.getTotalLength() * 0.75);
        const m = line.getScreenCTM();
        return { x: p.x * m.a + m.e, y: p.y * m.d + m.f };
      }, id);
      await page.mouse.click(point.x, point.y);
      await page.waitForTimeout(150);
    },

    groups: () => page.$$eval('.bio-properties-panel-group-header-title', (els) => els.map((e) => e.textContent.trim())),
    field: (id) => page.locator(`#bio-properties-panel-${id}`),

    async fill(id, value) {
      await h.field(id).fill(value);
      await page.waitForTimeout(400); // debounce панели свойств
    },

    async openGroup(label) {
      const header = page.locator('.bio-properties-panel-group-header', { hasText: label }).first();
      if (!(await header.evaluate((el) => el.classList.contains('open')))) {
        await header.click();
      }
    },

    /** Ctrl+S в активной вкладке; возвращает сохранённое содержимое файла path */
    async save(file) {
      const { x, y } = blank();
      await page.mouse.click(x, y);
      await page.keyboard.press('Control+s');
      await page.waitForFunction(() => document.querySelector('#status')?.textContent?.startsWith('Сохранён'));
      await page.evaluate(() => (document.querySelector('#status').textContent = ''));
      return page.evaluate((f) => window.__files[f], file);
    },

    disabled: (tool) => page.locator(`[data-tool="${tool}"]`).isDisabled(),

    async close() {
      check('нет ошибок в консоли', errors.length === 0, errors.join(' | '));
      await browser.close();
      return results;
    },
  };

  await page.goto('http://app.local/index.html');
  // Панель инструментов есть всегда, список файлов - только в непустой рабочей папке
  await page.waitForSelector('[data-tool="save"]');
  if (Object.keys(files).length > 0) {
    await page.waitForSelector('.file');
  }
  return h;
}
