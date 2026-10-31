// MCP со стороны редактора: окно «AI-агент» и мост - запросы, которые Go-сервер шлёт событием mcp:request
// (internal/mcp, его протокол и доступ проверяют Go-тесты)

import { open } from './harness.mjs';
import { fixture, INDEX } from './properties.test.mjs';

export default async function (dist) {
  const h = await open({ dist, files: { 'order.bpmn': fixture, 'pricing.dmn': DMN }, index: INDEX, viewport: { width: 1500, height: 950 } });
  const { page, check, select } = h;

  try {
    // Окно «AI-агент»
    await page.click('[data-tool="agent"]');
    await page.waitForSelector('.mcp-panel:not([hidden])');
    check('окно: сервер выключен по умолчанию', !(await page.locator('[data-mcp="enabled"]').isChecked()));
    check('окно: без включения нет команды', (await page.locator('.mcp-copy').count()) === 0);
    await page.locator('[data-mcp="enabled"]').check();
    await page.waitForSelector('.mcp-copy');
    const command = await page.locator('.mcp-copy code').first().innerText();
    check('окно: команда для Claude Code с адресом и токеном', command === 'claude mcp add --transport http go-bpm-modeler http://127.0.0.1:39190/mcp --header "Authorization: Bearer tok1"', command);
    check('кнопка: точка «сервер работает»', await page.locator('[data-tool="agent"]').evaluate((b) => b.classList.contains('mcp-on')));
    await page.click('[data-copy="command"]');
    check('копирование команды', (await page.evaluate(() => window.__clipboard)).includes(command));
    await page.click('.mcp-regenerate');
    await page.waitForTimeout(100);
    check('новый токен в команде', (await page.locator('.mcp-copy code').first().innerText()).includes('Bearer tok2'));
    await page.keyboard.press('Escape');
    check('окно закрывается по Escape', await page.locator('.mcp-panel').isHidden());

    // Мост: пока ничего не открыто
    let reply = await h.mcp('describe', {});
    check('describe без вкладок - ошибка', reply.error?.includes('нет открытых схем'), JSON.stringify(reply));

    await page.locator('.file', { hasText: 'order.bpmn' }).click();
    await page.waitForSelector('.djs-palette .entry');
    await page.waitForTimeout(400);

    reply = await h.mcp('listOpen', {});
    check('listOpen: вкладка, активна, без изменений', JSON.stringify(reply.result) === '[{"path":"order.bpmn","kind":"bpmn","dirty":false,"active":true}]', JSON.stringify(reply));

    reply = await h.mcp('describe', {});
    const svc = reply.result?.elements?.find((e) => e.id === 'Svc');
    check('describe: процесс и элементы', reply.result?.processes?.[0]?.id === 'Order' && reply.result.elements.length > 10, JSON.stringify(reply.result?.processes));
    check('describe: настройки go-bpm у service task', svc?.extensions?.['gobpm:TaskDefinition']?.type === 'notify', JSON.stringify(svc));
    check('describe: AI task помечен', reply.result.elements.find((e) => e.id === 'Ai')?.type === 'ServiceTask (AI task)');
    check('describe: таймер и default flow', JSON.stringify(reply.result.elements.find((e) => e.id === 'Timer')?.eventDefinitions).includes('PT5M') && reply.result.elements.find((e) => e.id === 'F_no')?.default === true);
    check('describe: проблемы линтера', Array.isArray(reply.result.problems) && reply.result.problems.some((p) => p.id === 'Script' && p.level === 'error'), JSON.stringify(reply.result.problems?.slice(0, 3)));

    await select('Svc');
    reply = await h.mcp('selection', {});
    check('selection: выделенный элемент', reply.result?.selected?.length === 1 && reply.result.selected[0].id === 'Svc', JSON.stringify(reply));

    reply = await h.mcp('getDiagram', { path: 'order.bpmn' });
    const xml = reply.result?.xml ?? '';
    check('getDiagram: XML из редактора', xml.includes('<bpmn:serviceTask id="Svc"') && reply.result.dirty === false);

    // Правка агента (подтверждение - на стороне Go)
    const renamed = xml.replace('<bpmn:task id="Start"', '<bpmn:task id="Start"').replace('id="Svc">', 'id="Svc" name="Уведомить клиента">');
    reply = await h.mcp('apply', { path: 'order.bpmn', xml: renamed });
    check('apply: применено, не сохранено', reply.result?.applied === true && reply.result.saved === false, JSON.stringify(reply));
    check('apply: имя на холсте', (await page.locator('.djs-element[data-element-id="Svc"]').first().textContent()).includes('Уведомить клиента'));
    check('apply: вкладка изменена, файл на диске прежний', (await page.locator('.tab-dirty').count()) === 1 && !(await page.evaluate(() => window.__files['order.bpmn'])).includes('Уведомить клиента'));

    reply = await h.mcp('apply', { path: 'order.bpmn', xml: '<bpmn:definitions xmlns:bpmn="x"><broken' });
    check('apply с битым XML - ошибка', !!reply.error, JSON.stringify(reply));
    check('битый XML не стёр схему', (await page.locator('.djs-element[data-element-id="Svc"]').count()) === 1);

    // Открытие другого файла по запросу агента
    reply = await h.mcp('open', { path: 'pricing.dmn' });
    check('open: DMN открыт', reply.result?.opened === true && (await page.locator('.tab').count()) === 2, JSON.stringify(reply));
    await page.waitForTimeout(400);
    reply = await h.mcp('describe', { path: 'pricing.dmn' });
    const offer = reply.result?.elements?.find((e) => e.id === 'Offer');
    check('describe DMN: таблица решения', offer?.logic?.hitPolicy === 'FIRST' && offer.logic.rules.length === 1 && offer.logic.outputs[0].name === 'discount', JSON.stringify(offer));

    reply = await h.mcp('nope', {});
    check('неизвестный запрос - ошибка', reply.error?.includes('неизвестный'), JSON.stringify(reply));
  } catch (err) {
    check('исключение', false, err.message.split('\n')[0]);
  }
  return h.close();
}

const DMN = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/" xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/" id="P" name="Цены" namespace="x">
  <decision id="Offer" name="Скидка">
    <decisionTable id="T" hitPolicy="FIRST">
      <input id="I"><inputExpression id="IE" typeRef="number"><text>amount</text></inputExpression></input>
      <output id="O" name="discount" typeRef="number" />
      <rule id="R"><inputEntry id="C1"><text>&gt;= 1000</text></inputEntry><outputEntry id="C2"><text>5</text></outputEntry></rule>
    </decisionTable>
  </decision>
  <dmndi:DMNDI><dmndi:DMNDiagram><dmndi:DMNShape dmnElementRef="Offer"><dc:Bounds height="80" width="180" x="160" y="100" /></dmndi:DMNShape></dmndi:DMNDiagram></dmndi:DMNDI>
</definitions>`;
