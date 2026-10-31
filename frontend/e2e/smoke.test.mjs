// Смоук-тест: список файлов, палитра и меню замены, сохранение, создание файлов, панель инструментов,
// ширина боковой панели, ссылка на документацию

import { open } from './harness.mjs';

const order = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:gobpm="https://github.com/nicolas-vp/go-bpm/schema/1.0" id="D" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Order" isExecutable="true">
    <bpmn:startEvent id="Start"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:serviceTask id="Notify" name="Уведомить">
      <bpmn:extensionElements>
        <gobpm:taskDefinition type="notifyClient" retries="3" />
        <gobpm:aiTask model="m" prompt="=request.text" resultVariable="category" />
      </bpmn:extensionElements>
      <bpmn:incoming>F1</bpmn:incoming>
    </bpmn:serviceTask>
    <bpmn:sequenceFlow id="F1" sourceRef="Start" targetRef="Notify" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Di"><bpmndi:BPMNPlane id="P" bpmnElement="Order">
    <bpmndi:BPMNShape id="Start_di" bpmnElement="Start"><dc:Bounds x="100" y="100" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Notify_di" bpmnElement="Notify"><dc:Bounds x="200" y="78" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="F1_di" bpmnElement="F1"><di:waypoint x="136" y="118" /><di:waypoint x="200" y="118" /></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

export default async function (dist) {
  const h = await open({ dist, files: { 'orders/order.bpmn': order } });
  const { page, check, disabled } = h;
  try {
  check('список файлов', (await page.locator('.file').count()) === 1);

  // BPMN: открытие, палитра
  await page.locator('.file', { hasText: 'order.bpmn' }).click();
  await page.waitForSelector('.djs-palette .entry');
  const palette = await page.$$eval('.djs-palette .entry', (els) => els.map((e) => e.getAttribute('data-action')));
  check('палитра без data object/store', !palette.includes('create.data-object') && !palette.includes('create.data-store'), palette.join(','));
  check('палитра: timer и message catch', palette.includes('create.timer-catch-event') && palette.includes('create.message-catch-event'));
  check('палитра без throw-события', !palette.includes('create.intermediate-event'));

  // Меню замены у service task
  await page.locator('[data-element-id="Notify"]').click();
  await page.locator('.djs-context-pad [data-action="replace"]').click();
  await page.waitForSelector('.djs-popup');
  const replace = await page.$$eval('.djs-popup [data-id]', (els) => els.map((e) => e.getAttribute('data-id')));
  const forbidden = replace.filter((id) => /send-task|manual-task|parallel-mi|toggle-loop|adhoc|ad-hoc|transaction|event-subprocess/.test(id));
  check('меню замены без неподдерживаемого', forbidden.length === 0, replace.join(','));
  check('меню замены: user task и sequential MI', replace.includes('replace-with-user-task') && replace.includes('replace-with-rule-task') && replace.includes('toggle-sequential-mi'));
  await page.keyboard.press('Escape');

  // Сохранение: правка + Ctrl+S, gobpm-расширения сохраняются
  await page.mouse.click(700, 700);
  await page.locator('.djs-element[data-element-id="Notify"] .djs-hit').first().click();
  await page.keyboard.press('Delete');
  check('вкладка помечена изменённой', await page.locator('.tab-dirty').count() === 1);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+s');
  await page.waitForFunction(() => document.querySelector('#status')?.textContent?.startsWith('Сохранён'));
  const saved = await page.evaluate(() => window.__files['orders/order.bpmn']);
  check('сохранено: gobpm:taskDefinition', saved.includes('<gobpm:taskDefinition type="notifyClient" retries="3" />'));
  check('сохранено: gobpm:aiTask', saved.includes('<gobpm:aiTask model="m" prompt="=request.text" resultVariable="category" />'));
  check('сохранено: namespace gobpm', saved.includes('xmlns:gobpm="https://github.com/nicolas-vp/go-bpm/schema/1.0"'));
  check('после сохранения вкладка чистая', await page.locator('.tab-dirty').count() === 0);


  // Панель инструментов
  const select = async (id) => {
    await page.mouse.click(700, 700);
    await page.locator(`.djs-element[data-element-id="${id}"] .djs-hit`).first().click();
  };
  check('панель: сохранить неактивна без изменений', await disabled('save'));
  check('панель: отменить неактивна без изменений', await disabled('undo'));
  check('панель: копировать неактивна без выделения', await disabled('copy'));
  await select('Notify');
  check('панель: копировать и цвет активны при выделении', !(await disabled('copy')) && !(await disabled('color')));
  await page.keyboard.press('Delete');
  check('панель: после удаления активны отменить и сохранить', !(await disabled('undo')) && !(await disabled('save')));
  await page.click('[data-tool="undo"]');
  check('панель: отменить вернула элемент', (await page.locator('.djs-element[data-element-id="Notify"]').count()) === 1);
  check('панель: вернуть активна', !(await disabled('redo')));
  await page.click('[data-tool="redo"]');
  check('панель: вернуть удалила снова', (await page.locator('.djs-element[data-element-id="Notify"]').count()) === 0);
  await page.click('[data-tool="undo"]');

  await select('Notify');
  check('панель: вставить неактивна до копирования', await disabled('paste'));
  await page.click('[data-tool="copy"]');
  check('панель: вставить активна после копирования', !(await disabled('paste')));
  const shapes = await page.locator('.djs-shape').count();
  await page.click('[data-tool="paste"]');
  await page.mouse.move(600, 500);
  await page.mouse.move(650, 550);
  await page.mouse.click(650, 550);
  check('панель: вставка добавила элемент', (await page.locator('.djs-shape').count()) === shapes + 1);
  await page.click('[data-tool="undo"]');

  await select('Notify');
  await page.click('[data-tool="cut"]');
  check('панель: вырезать удалила элемент', (await page.locator('.djs-element[data-element-id="Notify"]').count()) === 0);
  await page.click('[data-tool="undo"]');

  const zoom = () => page.evaluate(() => document.querySelector('.editor:not([hidden]) .viewport').getAttribute('transform'));
  const z0 = await zoom();
  await page.click('[data-tool="zoomIn"]');
  const z1 = await zoom();
  await page.click('[data-tool="zoomOut"]');
  check('панель: масштаб меняется', z0 !== z1 && (await zoom()) !== z1, `${z0} -> ${z1}`);

  await select('Notify');
  await page.click('[data-tool="color"]');
  await page.click('.color-swatch[data-color="Синий"]');
  check('панель: меню цвета закрылось', await page.locator('.color-menu').isHidden());
  await page.keyboard.press('Control+s');
  await page.waitForFunction(() => document.querySelector('#status')?.textContent?.startsWith('Сохранён'));
  let colored = await page.evaluate(() => window.__files['orders/order.bpmn']);
  check('панель: цвет сохранён в XML', colored.includes('#bbdefb') && colored.includes('#0d4372'));
  await select('Notify');
  await page.click('[data-tool="color"]');
  await page.click('.color-swatch[data-color="По умолчанию"]');
  await page.keyboard.press('Control+s');
  await page.waitForFunction(() => document.querySelector('#status')?.textContent?.startsWith('Сохранён'));
  colored = await page.evaluate(() => window.__files['orders/order.bpmn']);
  check('панель: цвет сброшен', !colored.includes('#bbdefb'));


  // Ширина боковой панели
  const sidebarWidth = () => page.evaluate(() => Math.round(document.querySelector('.sidebar').getBoundingClientRect().width));
  const canvasWidth = () => page.evaluate(() => Math.round(document.querySelector('.editor:not([hidden]) .editor-canvas').getBoundingClientRect().width));
  const w0 = await sidebarWidth();
  const c0 = await canvasWidth();
  const r = await page.locator('#sidebar-resizer').boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + 300);
  await page.mouse.down();
  await page.mouse.move(r.x + 120, r.y + 300, { steps: 5 });
  await page.mouse.up();
  const w1 = await sidebarWidth();
  check('ширина панели: перетаскивание', Math.abs(w1 - (w0 + 120 - r.width / 2)) <= 3, `${w0} -> ${w1}`);
  check('ширина панели: холст сузился', (await canvasWidth()) < c0 - 100);
  const rMin = await page.locator('#sidebar-resizer').boundingBox();
  await page.mouse.move(rMin.x + rMin.width / 2, rMin.y + 300);
  await page.mouse.down();
  await page.mouse.move(0, rMin.y + 300, { steps: 5 });
  await page.mouse.up();
  check('ширина панели: не меньше минимума', (await sidebarWidth()) === 160);
  const r2 = await page.locator('#sidebar-resizer').boundingBox();
  await page.mouse.dblclick(r2.x + r2.width / 2, r2.y + 300);
  check('ширина панели: двойной щелчок сбрасывает', (await sidebarWidth()) === 260);
  const r3 = await page.locator('#sidebar-resizer').boundingBox();
  await page.mouse.move(r3.x + r3.width / 2, r3.y + 300);
  await page.mouse.down();
  await page.mouse.move(r3.x + 200, r3.y + 300, { steps: 5 });
  await page.mouse.up();
  const savedWidth = await sidebarWidth();
  check('ширина панели: изменена перед перезагрузкой', savedWidth !== 260, `${savedWidth}`);
  await page.reload();
  await page.waitForSelector('.file');
  check('ширина панели: запоминается', (await sidebarWidth()) === savedWidth, `${savedWidth}`);
  await page.locator('.file', { hasText: 'order.bpmn' }).click();
  await page.waitForSelector('.djs-palette .entry');

  // Документация
  const docs = await page.locator('[data-tool="docs"]').boundingBox();
  check('документация: кнопка справа', docs.x + docs.width > 1400 - 20, JSON.stringify(docs));
  await page.click('[data-tool="docs"]');
  check('документация: открыт сайт', JSON.stringify(await page.evaluate(() => window.__opened)) === '["https://go-bpm.tech/docs/"]');
  // Новый DMN
  await page.click('[data-tool="new-dmn"]');
  await page.fill('.file-new input', 'pricing/offer');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.editor-dmn .dmn-drd-container, .editor-dmn .tjs-container', { timeout: 10000 });
  check('новый DMN создан и открыт', await page.evaluate(() => 'pricing/offer.dmn' in window.__files));
  check('две вкладки', (await page.locator('.tab').count()) === 2);
  check('DMN: цвет и копирование недоступны', (await disabled('color')) && (await disabled('copy')));
  check('DMN: масштаб доступен в DRD', !(await disabled('zoomIn')));
  await page.locator('.tab', { hasText: 'order.bpmn' }).click();
  check('назад в BPMN: масштаб доступен', !(await disabled('zoomIn')));
  await page.locator('.tab', { hasText: 'offer.dmn' }).click();

  // Новый BPMN открывается без ошибок
  await page.click('[data-tool="new-bpmn"]');
  await page.fill('.file-new input', 'refund');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#status')?.textContent?.startsWith('Открыт refund.bpmn'));
  check('новый BPMN открыт без предупреждений', true);

  } catch (err) {
    check('исключение', false, err.message.split('\n')[0]);
  }
  return h.close();
}
