// Запуск браузерных тестов: node e2e/run.mjs [dist] [фильтр]. Каждый *.test.mjs - функция (dist) => results.
// Код выхода 1, если упала хоть одна проверка

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(process.argv[2] ?? path.join(here, '..', 'dist'));
const filter = process.argv[3] ?? '';

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error(`нет сборки фронтенда: ${dist}/index.html (npm run build)`);
  process.exit(1);
}

let failed = 0;
const files = fs.readdirSync(here).filter((f) => f.endsWith('.test.mjs') && f.includes(filter)).sort();
for (const file of files) {
  const { default: test } = await import(path.join(here, file));
  let results;
  try {
    results = await test(dist);
  } catch (err) {
    results = [{ name: 'тест упал', ok: false, detail: err.stack ?? String(err) }];
  }
  const bad = results.filter((r) => !r.ok);
  failed += bad.length;
  console.log(`${bad.length ? 'FAIL' : 'ok  '} ${file}: ${results.length - bad.length}/${results.length}`);
  for (const r of bad) {
    console.log(`     ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
}
process.exit(failed ? 1 : 0);
