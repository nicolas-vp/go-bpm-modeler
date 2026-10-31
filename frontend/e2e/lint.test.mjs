// Линтер BPMN: каждое правило gobpm/* на намеренно ошибочном элементе, отсутствие маркера у корректного,
// снятие маркера после исправления

import { open } from './harness.mjs';

// [id, тег, x, y, атрибуты, содержимое]
const shapes = [
  ['S1', 'bpmn:startEvent', 100, 100, '', ''],
  ['S2', 'bpmn:startEvent', 100, 250, '', ''],
  ['T1', 'bpmn:task', 200, 80, '', ''],
  ['T2', 'bpmn:task', 360, 20, '', ''],
  ['T3', 'bpmn:task', 360, 140, '', ''],
  ['Svc', 'bpmn:serviceTask', 520, 20, '', ''],
  ['Tm', 'bpmn:intermediateCatchEvent', 540, 160, '',
    '<bpmn:timerEventDefinition><bpmn:timeDuration xsi:type="bpmn:tFormalExpression">P1M</bpmn:timeDuration></bpmn:timerEventDefinition>'],
  ['G', 'bpmn:exclusiveGateway', 200, 300, '', ''],
  ['A', 'bpmn:task', 360, 260, '', ''],
  ['B', 'bpmn:task', 360, 380, '', ''],
  ['U', 'bpmn:userTask', 520, 280, '',
    '<bpmn:extensionElements><gobpm:assignmentDefinition assignee="${a + b}" /></bpmn:extensionElements>'],
  ['Ig', 'bpmn:inclusiveGateway', 700, 30, '', ''],
  ['R', 'bpmn:businessRuleTask', 680, 140, '',
    '<bpmn:extensionElements><gobpm:calledDecision decisionId="Missing" resultVariable="x" /></bpmn:extensionElements>'],
  ['Ok', 'bpmn:scriptTask', 680, 280, '',
    '<bpmn:extensionElements><gobpm:script expression="1 + 1" resultVariable="x" /></bpmn:extensionElements>'],
];
const flows = [
  ['F1', 'T1', 'T2', ''],
  ['F2', 'T1', 'T3', ''],
  ['Fa', 'G', 'A', '<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">x &gt; 1</bpmn:conditionExpression>'],
  ['Fb', 'G', 'B', ''],
];
const size = (tag) => (tag.includes('Event') ? [36, 36] : tag.includes('Gateway') ? [50, 50] : [100, 80]);
const pos = Object.fromEntries(shapes.map(([id, tag, x, y]) => [id, { x, y, w: size(tag)[0], h: size(tag)[1] }]));

const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:gobpm="https://github.com/nicolas-vp/go-bpm/schema/1.0" id="D" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Lint" isExecutable="true">
${shapes.map(([id, tag, , , attrs, body]) => `    <${tag} id="${id}"${attrs}>${body}</${tag}>`).join('\n')}
    <bpmn:boundaryEvent id="Be" attachedToRef="U"><bpmn:errorEventDefinition /></bpmn:boundaryEvent>
${flows.map(([id, s, t, body]) => `    <bpmn:sequenceFlow id="${id}" sourceRef="${s}" targetRef="${t}">${body}</bpmn:sequenceFlow>`).join('\n')}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Di"><bpmndi:BPMNPlane id="P" bpmnElement="Lint">
${shapes.map(([id]) => `    <bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"><dc:Bounds x="${pos[id].x}" y="${pos[id].y}" width="${pos[id].w}" height="${pos[id].h}" /></bpmndi:BPMNShape>`).join('\n')}
    <bpmndi:BPMNShape id="Be_di" bpmnElement="Be"><dc:Bounds x="582" y="342" width="36" height="36" /></bpmndi:BPMNShape>
${flows.map(([id, s, t]) => `    <bpmndi:BPMNEdge id="${id}_di" bpmnElement="${id}"><di:waypoint x="${pos[s].x + pos[s].w}" y="${pos[s].y + pos[s].h / 2}" /><di:waypoint x="${pos[t].x}" y="${pos[t].y + pos[t].h / 2}" /></bpmndi:BPMNEdge>`).join('\n')}
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

export default async function (dist) {
  const h = await open({
    dist,
    files: { 'lint.bpmn': fixture },
    index: { processes: [{ id: 'Lint', name: '', path: 'lint.bpmn' }], decisions: [], problems: {} },
    viewport: { width: 1500, height: 950 },
  });
  const { page, check, select, openGroup, fill } = h;

  // Текст маркера элемента: сообщения bpmn-js-bpmnlint лежат в выпадающем списке внутри оверлея
  const issues = (id) =>
    page.evaluate((id) => {
      const container = document.querySelector(`.djs-overlays[data-container-id="${id}"]`);
      return [...(container?.querySelectorAll('.bjsl-overlay') ?? [])].map((o) => o.textContent.replace(/\s+/g, ' ').trim()).join(' | ');
    }, id);

  try {
    await page.locator('.file').click();
    await page.waitForSelector('.bjsl-button');
    await page.waitForTimeout(500);

    const expectations = [
      ['S1', 'несколько start event'],
      ['T1', 'несколько исходящих переходов'],
      ['Svc', 'не задан тип задачи'],
      ['Tm', 'годы и месяцы не поддерживаются'],
      ['Fb', 'нет условия, и он не default flow'],
      ['G', 'нет default flow'],
      ['U', 'выражение не поддерживается'],
      ['Be', 'у userTask U поддерживается только граничный таймер'],
      ['Ig', 'InclusiveGateway не поддерживается'],
      ['R', 'решение Missing не найдено'],
    ];
    for (const [id, text] of expectations) {
      const found = await issues(id);
      check(`линтер: ${id} - «${text}»`, found.includes(text), found || 'нет маркера');
    }
    check('линтер: у корректного элемента нет маркера', (await issues('Ok')) === '', await issues('Ok'));

    const button = await page.locator('.bjsl-button').innerText();
    check('линтер: счётчик по-русски', /Ошибок: \d+, предупреждений: \d+/.test(button), button);

    // Исправление снимает маркер
    await select('Svc');
    await openGroup('Обработчик');
    await fill('gobpm-job-type', 'notify');
    await page.waitForTimeout(500);
    check('линтер: исправление снимает маркер', (await issues('Svc')) === '', await issues('Svc'));
  } catch (err) {
    check('исключение', false, err.message.split('\n')[0]);
  }
  return h.close();
}
