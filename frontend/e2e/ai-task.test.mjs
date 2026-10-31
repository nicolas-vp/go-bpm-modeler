// AI task: палитра, отрисовка, создание, замена туда и обратно, отмена; задачи в палитре

import { open } from './harness.mjs';
import { fixture, INDEX } from './properties.test.mjs';

export default async function (dist) {
  const h = await open({ dist, files: { 'order.bpmn': fixture }, index: INDEX, viewport: { width: 1500, height: 950 } });
  const { page, check, select, groups, fill, openGroup } = h;
  const save = () => h.save('order.bpmn');
  const aiPalette = 'create.ai-task';
const shapeCount = (type) => page.evaluate((t) => [...document.querySelectorAll('.djs-element.djs-shape')].length, type);
  try {
  await page.locator('.file').click();
  await page.waitForSelector('.djs-palette .entry');

  // Палитра
  const palette = await page.$$eval('.djs-palette .entry', (els) => els.map((e) => e.getAttribute('data-action')));
  const tasks = ['create.task', 'create.service-task', 'create.script-task', 'create.user-task', aiPalette];
  const at = tasks.map((id) => palette.indexOf(id));
  check('палитра: задача, сервисная, скриптовая, пользовательская, AI подряд', at.every((i, n) => i >= 0 && (n === 0 || i === at[n - 1] + 1)), palette.join(','));
  const tip = await page.getAttribute('.djs-palette [data-action="create.user-task"]', 'aria-label');
  check('палитра: подсказки по-русски', tip === 'Создать пользовательскую задачу', String(tip));

  // Создание задач из палитры
  for (const [action, tag, x] of [['create.service-task', 'serviceTask', 400], ['create.script-task', 'scriptTask', 530], ['create.user-task', 'userTask', 660]]) {
    await page.click(`.djs-palette [data-action="${action}"]`);
    await page.mouse.move(x, 760);
    await page.mouse.move(x + 10, 770);
    await page.mouse.click(x + 10, 770);
    await page.waitForTimeout(200);
    const id = await page.$eval('.djs-element.selected', (el) => el.dataset.elementId);
    const xmlNow = await save();
    check(`палитра: ${action} создаёт bpmn:${tag}`, new RegExp(`<bpmn:${tag} id="${id}"`).test(xmlNow), id);
  }
  check('палитра: у AI task картинка', (await page.locator(`.djs-palette [data-action="${aiPalette}"] img`).count()) === 1);

  // Отрисовка существующего AI task: своя иконка, без шестерёнки service task
  const aiIcon = (id) => page.evaluate((id) => {
    const visual = document.querySelector(`.djs-element[data-element-id="${id}"] .djs-visual`);
    return { sparkles: visual.querySelectorAll('g[transform^="translate(6 6)"] path').length, gear: [...visual.querySelectorAll('circle')].filter((c) => !c.closest('g[transform^="translate(6 6)"]')).length };
  }, id);
  let icon = await aiIcon('Ai');
  check('холст: у AI task иконка и нет шестерёнки', icon.sparkles > 0 && icon.gear === 0, JSON.stringify(icon));
  icon = await aiIcon('Svc');
  check('холст: у service task шестерёнка', icon.sparkles === 0 && icon.gear > 0, JSON.stringify(icon));

  // Создание из палитры
  const before = await shapeCount();
  await page.click(`.djs-palette [data-action="${aiPalette}"]`);
  await page.mouse.move(600, 650);
  await page.mouse.move(620, 660);
  await page.mouse.click(620, 660);
  await page.waitForTimeout(200);
  check('палитра: AI task создан', (await shapeCount()) === before + 1);
  let g = await groups();
  check('новый AI task: группа «AI task»', g.includes('AI task'), g.join(','));
  const newId = await page.$eval('.djs-element.selected', (el) => el.dataset.elementId);
  icon = await aiIcon(newId);
  check('новый AI task: своя иконка', icon.sparkles > 0 && icon.gear === 0, JSON.stringify(icon));
  let xml = await save();
  const created = xml.match(new RegExp(`<bpmn:serviceTask id="${newId}"[\\s\\S]*?</bpmn:serviceTask>`))?.[0] ?? '';
  check('новый AI task: XML', created.includes('<gobpm:taskDefinition type="ai" />') && created.includes('<gobpm:aiTask />'), created);

  // Пустой gobpm:aiTask не удаляется
  await select(newId);
  await openGroup('AI task');
  await fill('gobpm-ai-model', 'claude-sonnet-5-5');
  await fill('gobpm-ai-model', '');
  xml = await save();
  const cleared = xml.match(new RegExp(`<bpmn:serviceTask id="${newId}"[\\s\\S]*?</bpmn:serviceTask>`))?.[0] ?? '';
  check('AI task: метка остаётся после очистки полей', cleared.includes('<gobpm:aiTask />'), cleared);

  // Замена user task -> AI task
  await select('User');
  await page.locator('.djs-context-pad [data-action="replace"]').click();
  await page.waitForSelector('.djs-popup');
  const userMenu = await page.$$eval('.djs-popup [data-id]', (els) => els.map((e) => e.getAttribute('data-id')));
  check('меню user task: пункт AI task', userMenu.includes('replace-with-ai-task'), userMenu.join(','));
  await page.click('.djs-popup [data-id="replace-with-ai-task"]');
  await page.waitForTimeout(200);
  g = await groups();
  check('замена на AI task: группа «AI task»', g.includes('AI task'), g.join(','));
  const replacedId = await page.$eval('.djs-element.selected', (el) => el.dataset.elementId);
  await page.mouse.click(1000, 800);
  await page.click('[data-tool="undo"]');
  await page.waitForTimeout(200);
  xml = await save();
  check('замена на AI task: id не меняется', replacedId === 'User', replacedId);
  check('замена на AI task: одна отмена возвращает user task', /<bpmn:userTask id="User"/.test(xml) && !/<bpmn:serviceTask id="User"/.test(xml), xml.match(/<bpmn:(userTask|serviceTask) id="User"/)?.[0]);

  // Замена AI task -> service task
  await select('Ai');
  await page.locator('.djs-context-pad [data-action="replace"]').click();
  await page.waitForSelector('.djs-popup');
  const aiMenu = await page.$$eval('.djs-popup [data-id]', (els) => els.map((e) => e.getAttribute('data-id')));
  check('меню AI task: есть «Сервисная задача», нет AI task', aiMenu.includes('replace-with-plain-service-task') && !aiMenu.includes('replace-with-ai-task'), aiMenu.join(','));
  await page.click('.djs-popup [data-id="replace-with-plain-service-task"]');
  await page.waitForTimeout(200);
  g = await groups();
  check('AI -> service task: группа «Обработчик»', g.includes('Обработчик') && !g.includes('AI task'), g.join(','));
  icon = await aiIcon('Ai');
  check('AI -> service task: шестерёнка вернулась', icon.sparkles === 0 && icon.gear > 0, JSON.stringify(icon));
  xml = await save();
  const plain = xml.match(/<bpmn:serviceTask id="Ai"[\s\S]*?<\/bpmn:serviceTask>/)?.[0] ?? '';
  check('AI -> service task: XML без gobpm:aiTask', !plain.includes('gobpm:aiTask') && plain.includes('gobpm:taskDefinition'), plain);

  // Service task -> AI task: тип тот же, меняются метки
  await select('Svc');
  await page.locator('.djs-context-pad [data-action="replace"]').click();
  await page.waitForSelector('.djs-popup');
  await page.click('.djs-popup [data-id="replace-with-ai-task"]');
  await page.waitForTimeout(200);
  xml = await save();
  const svc = xml.match(/<bpmn:serviceTask id="Svc"[\s\S]*?<\/bpmn:serviceTask>/)?.[0] ?? '';
  check('service -> AI task: id сохранён, jobType ai', svc.includes('type="ai"') && svc.includes('<gobpm:aiTask />'), svc);

  await select('Svc');
  } catch (err) {
    check('исключение', false, err.message.split('\n')[0]);
  }
  return h.close();
}
