// DMN под go-bpm: палитра, меню элемента и замены DRD, связи данных и решений, новое решение с таблицей, подписи неподдерживаемых hit
// policy, линтер - счётчик, подсветка ячеек, переход к таблице, исправление

import { open } from './harness.mjs';

const table = (id, { policy = 'FIRST', inputType = 'number', outputs, rules }) => `
    <decisionTable id="${id}" hitPolicy="${policy}">
      <input id="${id}_in" label="Сумма"><inputExpression id="${id}_ie" typeRef="${inputType}"><text>amount</text></inputExpression></input>
      ${outputs}
      ${rules}
    </decisionTable>`;

// Ошибок: Lit, Dep (зависимость), Bad - PRIORITY, выход без имени, кириллическое имя, пустой тест = 6.
// Предупреждений: Bad - тип date у входа, date() в выходе = 2. Input data - для информации, без предупреждения
export const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/" xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/" xmlns:di="http://www.omg.org/spec/DMN/20180521/DI/" id="D" name="DRD" namespace="x">
  <decision id="Ok" name="Хорошее">${table('OkT', {
    outputs: '<output id="Ok_o1" name="discount" typeRef="number" /><output id="Ok_o2" name="reason" typeRef="string" />',
    rules: '<rule id="Ok_r1"><inputEntry id="Ok_c1"><text>&gt;= 1000</text></inputEntry><outputEntry id="Ok_c2"><text>5</text></outputEntry><outputEntry id="Ok_c3"><text>"big"</text></outputEntry></rule>',
  })}
  </decision>
  <decision id="Lit" name="Выражение"><literalExpression id="LitE"><text>1</text></literalExpression></decision>
  <decision id="Dep" name="Зависимое">
    <informationRequirement id="IR1"><requiredDecision href="#Ok" /></informationRequirement>${table('DepT', {
    outputs: '<output id="Dep_o" typeRef="string" />',
    rules: '',
  })}
  </decision>
  <decision id="Bad" name="Плохое">${table('BadT', {
    policy: 'PRIORITY',
    inputType: 'date',
    outputs: '<output id="Bad_o1" name="Скидка" typeRef="number" /><output id="Bad_o2" label="Без имени" typeRef="string" />',
    rules: '<rule id="Bad_r1"><inputEntry id="Bad_c1"><text>"a",,"b"</text></inputEntry><outputEntry id="Bad_c2"><text>1</text></outputEntry><outputEntry id="Bad_c3"><text>date("2026-01-01")</text></outputEntry></rule>',
  })}
  </decision>
  <inputData id="In1" name="Сумма заказа" />
  <dmndi:DMNDI><dmndi:DMNDiagram id="Dg">
    <dmndi:DMNShape id="Ok_di" dmnElementRef="Ok"><dc:Bounds height="80" width="180" x="100" y="100" /></dmndi:DMNShape>
    <dmndi:DMNShape id="Lit_di" dmnElementRef="Lit"><dc:Bounds height="80" width="180" x="350" y="100" /></dmndi:DMNShape>
    <dmndi:DMNShape id="Dep_di" dmnElementRef="Dep"><dc:Bounds height="80" width="180" x="100" y="300" /></dmndi:DMNShape>
    <dmndi:DMNShape id="Bad_di" dmnElementRef="Bad"><dc:Bounds height="80" width="180" x="350" y="300" /></dmndi:DMNShape>
    <dmndi:DMNShape id="In1_di" dmnElementRef="In1"><dc:Bounds height="45" width="125" x="620" y="117" /></dmndi:DMNShape>
    <dmndi:DMNEdge id="IR1_di" dmnElementRef="IR1"><di:waypoint x="190" y="180" /><di:waypoint x="190" y="300" /></dmndi:DMNEdge>
  </dmndi:DMNDiagram></dmndi:DMNDI>
</definitions>`;

export default async function (dist) {
  const h = await open({ dist, files: { 'rules.dmn': fixture }, viewport: { width: 1500, height: 950 } });
  const { page, check } = h;
  const button = () => page.locator('.editor:not([hidden]) .dmn-lint-button').innerText();
  const clickShape = async (id) => {
    const { x, y } = h.blank();
    await page.mouse.click(x, y);
    // Нижний левый угол: через центр может проходить связь, щелчок выделил бы её
    const hit = page.locator(`.editor:not([hidden]) .djs-element[data-element-id="${id}"] .djs-hit`).first();
    const b = await hit.boundingBox();
    await hit.click({ force: true, position: { x: 12, y: b.height - 10 } });
    await page.waitForTimeout(150);
  };

  try {
    await page.locator('.file').click();
    await page.waitForSelector('.dmn-lint-button');
    await page.waitForTimeout(300);

    check('линтер: 6 ошибок и 2 предупреждения', (await button()) === 'Ошибок: 6, предупреждений: 2', await button());
    const markers = await page.$$eval('.gobpm-dmn-marker', (els) => els.map((e) => e.closest('[data-container-id]')?.dataset.containerId).sort());
    check('DRD: маркеры у Bad, Dep, Lit, но не у Ok и input data', JSON.stringify(markers) === '["Bad","Dep","Lit"]', markers.join(','));

    // Палитра и меню DRD
    const palette = await page.$$eval('.djs-palette [data-action]', (els) => els.map((e) => e.getAttribute('data-action')));
    check('палитра DRD: из создаваемого - решение и input data', palette.filter((a) => a.startsWith('create.')).sort().join(',') === 'create.decision,create.input-data', palette.join(','));
    await clickShape('Ok');
    const pad = await page.$$eval('.djs-context-pad [data-action]', (els) => els.map((e) => e.getAttribute('data-action')).sort());
    check('меню решения: аннотация и удаление, без «добавить решение» и связей', JSON.stringify(pad) === '["append.text-annotation","delete"]', pad.join(','));
    await clickShape('In1');
    const inputPad = await page.$$eval('.djs-context-pad [data-action]', (els) => els.map((e) => e.getAttribute('data-action')));
    check('меню input data: можно соединить', inputPad.includes('connect'), inputPad.join(','));

    // Связь данные -> решение - через «соединить» в меню input data. Решение с решением не соединить: у решения в
    // меню нет «соединить», в палитре DRD нет инструмента связей, а правило отвергает и такую связь
    const center = async (id) => {
      const b = await page.locator(`.editor:not([hidden]) .djs-element[data-element-id="${id}"]`).first().boundingBox();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    const handle = await page.locator('.djs-context-pad [data-action="connect"]').boundingBox();
    const target = await center('Ok');
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const linked = await h.save('rules.dmn');
    check('input data -> решение: связь создана', /<decision id="Ok"[\s\S]*?<requiredInput href="#In1"/.test(linked), linked.match(/<informationRequirement[\s\S]*?<\/informationRequirement>/g)?.join(' '));
    check('связь с данными не добавила проблем', (await button()) === 'Ошибок: 6, предупреждений: 2', await button());
    await clickShape('Lit');
    await page.locator('.djs-context-pad [data-action="replace"]').click();
    await page.waitForSelector('.djs-popup');
    const replace = await page.$$eval('.djs-popup [data-id]', (els) => els.map((e) => e.getAttribute('data-id')));
    check('замена решения-выражения: только на таблицу', JSON.stringify(replace) === '["replace-with-decision-table"]', replace.join(','));
    await page.keyboard.press('Escape');

    // Новое решение - с таблицей
    await page.click('.djs-palette [data-action="create.decision"]');
    await page.mouse.move(900, 600);
    await page.mouse.move(950, 650, { steps: 5 });
    await page.mouse.click(950, 650);
    await page.waitForTimeout(300);
    const xml = await h.save('rules.dmn');
    const created = xml.match(/<decision id="(Decision_[^"]+)"[\s\S]*?<\/decision>/)?.[0] ?? '';
    check('новое решение создаётся с таблицей', created.includes('<decisionTable') && created.includes('<input ') && created.includes('<output '), created.slice(0, 200));
    check('новое решение не добавило ошибок', (await button()) === 'Ошибок: 6, предупреждений: 2', await button());

    // Список проблем и переход к таблице
    await page.click('.editor:not([hidden]) .dmn-lint-button');
    const items = await page.$$eval('.dmn-lint-item', (els) => els.map((e) => e.textContent));
    check('список: 8 проблем', items.length === 8, items.join(' | '));
    await page.locator('.dmn-lint-item', { hasText: 'пустой тест' }).click();
    await page.waitForSelector('.tjs-table');
    await page.waitForTimeout(300);
    const cell = await page.locator('[data-element-id="Bad_c1"]').evaluate((n) => ({ cls: n.className, title: n.getAttribute('title') }));
    check('переход к таблице: ячейка с пустым тестом подсвечена', cell.cls.includes('gobpm-dmn-error') && cell.title?.includes('пустой тест'), JSON.stringify(cell));
    const warnCell = await page.locator('[data-element-id="Bad_c3"]').getAttribute('class');
    check('ячейка с date() - предупреждение', warnCell?.includes('gobpm-dmn-warn'), warnCell);

    // Hit policy без PRIORITY и OUTPUT ORDER
    await page.locator('.hit-policy .dms-input-select').click();
    const policies = await page.$$eval('.dms-select-options .option', (els) => els.map((e) => e.textContent.trim()));
    // Подписи в одну строку: высоты всех вариантов одинаковы
    const heights = await page.$$eval('.dms-select-options .option', (els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    check('hit policy: подписи не переносятся', new Set(heights).size === 1, heights.join(','));
    const marked = policies.filter((p) => /не поддерживается go-bpm/.test(p));
    check('hit policy: Priority и Output order подписаны как неподдерживаемые', marked.length === 2 && marked.every((p) => /^(Priority|Output order)/.test(p)), policies.join(','));
    await page.locator('.dms-select-options .option', { hasText: 'First' }).first().click();
    await page.waitForTimeout(300);
    check('смена hit policy снимает ошибку', (await button()) === 'Ошибок: 5, предупреждений: 2', await button());
  } catch (err) {
    check('исключение', false, err.message.split('\n')[0]);
  }
  return h.close();
}
