// Панель свойств gobpm:*: группы по типам элементов, запись и удаление атрибутов, таймер, условие перехода, отмена

import { open } from './harness.mjs';

const shapes = [
  ['Start', 'bpmn:startEvent', 100, 118, 36, 36, ''],
  ['Gw', 'bpmn:exclusiveGateway', 200, 111, 50, 50, ' default="F_no"'],
  ['Svc', 'bpmn:serviceTask', 320, 40, 100, 80, ''],
  ['Script', 'bpmn:scriptTask', 320, 180, 100, 80, ''],
  ['Rule', 'bpmn:businessRuleTask', 480, 40, 100, 80, ''],
  ['User', 'bpmn:userTask', 480, 180, 100, 80, ''],
  ['Recv', 'bpmn:receiveTask', 640, 40, 100, 80, ' messageRef="Msg"'],
  ['Call', 'bpmn:callActivity', 640, 180, 100, 80, ''],
  ['Timer', 'bpmn:intermediateCatchEvent', 800, 62, 36, 36, ''],
  ['Ai', 'bpmn:serviceTask', 800, 180, 100, 80, ''],
];
const bodies = {
  Svc: '<bpmn:extensionElements><gobpm:taskDefinition type="notify" retries="3" /></bpmn:extensionElements>',
  Timer: '<bpmn:timerEventDefinition id="TD"><bpmn:timeDuration xsi:type="bpmn:tFormalExpression">PT5M</bpmn:timeDuration></bpmn:timerEventDefinition>',
  Ai: '<bpmn:extensionElements><gobpm:taskDefinition type="ai" /><gobpm:aiTask model="m" prompt="=text" resultVariable="r" /></bpmn:extensionElements>',
};
export const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:gobpm="https://github.com/nicolas-vp/go-bpm/schema/1.0" id="D" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:message id="Msg" name="paid" />
  <bpmn:process id="Order" isExecutable="true">
${shapes.map(([id, tag, , , , , attrs]) => `    <${tag} id="${id}"${attrs}>${bodies[id] ?? ''}</${tag}>`).join('\n')}
    <bpmn:sequenceFlow id="F_yes" sourceRef="Gw" targetRef="Svc" />
    <bpmn:sequenceFlow id="F_no" sourceRef="Gw" targetRef="Script" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Di"><bpmndi:BPMNPlane id="P" bpmnElement="Order">
${shapes.map(([id, , x, y, w, hh]) => `    <bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"><dc:Bounds x="${x}" y="${y}" width="${w}" height="${hh}" /></bpmndi:BPMNShape>`).join('\n')}
    <bpmndi:BPMNEdge id="F_yes_di" bpmnElement="F_yes"><di:waypoint x="225" y="111" /><di:waypoint x="225" y="80" /><di:waypoint x="320" y="80" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="F_no_di" bpmnElement="F_no"><di:waypoint x="225" y="161" /><di:waypoint x="225" y="220" /><di:waypoint x="320" y="220" /></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

export const INDEX = {
  processes: [{ id: 'Refund', name: 'Возврат', path: 'refund.bpmn' }],
  decisions: [{ id: 'Offer', name: 'Скидка', path: 'pricing.dmn' }],
  problems: {},
};

export default async function (dist) {
  const h = await open({ dist, files: { 'order.bpmn': fixture }, index: INDEX, viewport: { width: 1500, height: 950 } });
  const { page, check, select, selectFlow, groups, field, fill, openGroup } = h;
  const save = () => h.save('order.bpmn');
  try {
  await page.locator('.file').click();
  await page.waitForSelector('.djs-palette .entry');

  // Процесс
  await page.mouse.click(1000, 800);
  await page.waitForTimeout(150);
  let g = await groups();
  check('процесс: «Общее» по-русски', g.includes('Общее'), g.join(','));
  await openGroup('Общее');
  check('процесс: нет флажка Executable', (await page.locator('#bio-properties-panel-isExecutable').count()) === 0);

  // Service task
  await select('Svc');
  g = await groups();
  check('service task: группа «Обработчик»', g.includes('Обработчик'), g.join(','));
  await openGroup('Обработчик');
  check('service task: тип из файла', (await field('gobpm-job-type').inputValue()) === 'notify');
  check('service task: попытки из файла', (await field('gobpm-retries').inputValue()) === '3');
  await fill('gobpm-job-type', 'notifyClient');
  await fill('gobpm-retries', '');
  let xml = await save();
  check('service task: сохранено', xml.includes('<gobpm:taskDefinition type="notifyClient" />'), xml.match(/<gobpm:taskDefinition[^>]*>/g)?.join(' '));

  // AI task
  await select('Ai');
  g = await groups();
  check('ai task: группа «AI task» вместо «Обработчик»', g.includes('AI task') && !g.includes('Обработчик'), g.join(','));

  // Script task
  await select('Script');
  await openGroup('Скрипт');
  await fill('gobpm-script-expression', 'name + "!"');
  await fill('gobpm-script-result-variable', 'greeting');
  xml = await save();
  check('script: сохранено', /<gobpm:script expression="name \+ &#34;!&#34;" resultVariable="greeting" \/>/.test(xml), xml.match(/<gobpm:script[^>]*>/)?.[0]);

  // Business rule task
  await select('Rule');
  await openGroup('Решение DMN');
  const options = await field('gobpm-decision-id').locator('option').allTextContents();
  check('решение: варианты из рабочей папки', options.some((o) => o.includes('Скидка')), options.join(','));
  await field('gobpm-decision-id').selectOption('Offer');
  await fill('gobpm-decision-result-variable', 'offer');
  xml = await save();
  check('решение: сохранено', xml.includes('<gobpm:calledDecision decisionId="Offer" resultVariable="offer" />'), xml.match(/<gobpm:calledDecision[^>]*>/)?.[0]);

  // Call activity
  await select('Call');
  await openGroup('Вызываемый процесс');
  await field('gobpm-process-id').selectOption('Refund');
  check('call activity: флажок по умолчанию включён', await field('gobpm-propagate-variables').isChecked());
  await field('gobpm-propagate-variables').click();
  await page.waitForTimeout(200);
  xml = await save();
  check('call activity: сохранено с false', xml.includes('<gobpm:calledElement processId="Refund" propagateAllChildVariables="false" />'), xml.match(/<gobpm:calledElement[^>]*>/)?.[0]);
  await select('Call');
  await openGroup('Вызываемый процесс');
  await field('gobpm-propagate-variables').click();
  await page.waitForTimeout(200);
  xml = await save();
  check('call activity: true не пишется', xml.includes('<gobpm:calledElement processId="Refund" />'), xml.match(/<gobpm:calledElement[^>]*>/)?.[0]);

  // User task
  await select('User');
  g = await groups();
  check('user task: «Назначение» и «Форма»', g.includes('Назначение') && g.includes('Форма'), g.join(','));
  await openGroup('Назначение');
  await fill('gobpm-assignee', '=initiator');
  await fill('gobpm-candidate-groups', 'managers, admins');
  await openGroup('Форма');
  await fill('gobpm-form-key', 'approve');
  xml = await save();
  check('user task: назначение сохранено', xml.includes('<gobpm:assignmentDefinition assignee="=initiator" candidateGroups="managers, admins" />'), xml.match(/<gobpm:assignmentDefinition[^>]*>/)?.[0]);
  check('user task: форма сохранена', xml.includes('<gobpm:formDefinition formKey="approve" />'));
  await select('User');
  await openGroup('Назначение');
  await fill('gobpm-assignee', '');
  await fill('gobpm-candidate-groups', '');
  xml = await save();
  check('user task: пустое назначение удалено', !xml.includes('gobpm:assignmentDefinition') && xml.includes('gobpm:formDefinition'));

  // Receive task: ключ корреляции у сообщения
  await select('Recv');
  await openGroup('Сообщение');
  check('receive task: поле ключа корреляции', (await field('gobpm-correlation-key').count()) === 1);
  await fill('gobpm-correlation-key', '=orderId');
  xml = await save();
  check('receive task: подписка у bpmn:message', /<bpmn:message id="Msg" name="paid">\s*<bpmn:extensionElements>\s*<gobpm:subscription correlationKey="=orderId" \/>/.test(xml), xml.match(/<bpmn:message[\s\S]*?<\/bpmn:message>/)?.[0]);

  // Таймер
  await select('Timer');
  g = await groups();
  check('таймер: одна группа «Таймер»', g.filter((x) => x === 'Таймер').length === 1 && !g.includes('Timer'), g.join(','));
  await openGroup('Таймер');
  check('таймер: длительность из файла', (await field('gobpm-timer-type').inputValue()) === 'timeDuration' && (await field('gobpm-timer-value').inputValue()) === 'PT5M');
  const kinds = await field('gobpm-timer-type').locator('option').allTextContents();
  check('таймер: нет цикла', kinds.length === 2, kinds.join(','));
  await field('gobpm-timer-type').selectOption('timeDate');
  check('таймер: значение перенесено', (await field('gobpm-timer-value').inputValue()) === 'PT5M');
  await fill('gobpm-timer-value', '=dueDate');
  xml = await save();
  const timer = xml.match(/<bpmn:timerEventDefinition[\s\S]*?<\/bpmn:timerEventDefinition>/)?.[0] ?? '';
  check('таймер: дата сохранена', timer.includes('<bpmn:timeDate xsi:type="bpmn:tFormalExpression">=dueDate</bpmn:timeDate>') && !timer.includes('timeDuration'), timer);
  await select('Timer');
  await openGroup('Таймер');
  await fill('gobpm-timer-value', '');
  check('таймер: пустая дата не меняет тип', (await field('gobpm-timer-type').inputValue()) === 'timeDate');

  // Условие перехода
  await selectFlow('F_yes');
  g = await groups();
  check('переход из шлюза: группа «Условие»', g.includes('Условие'), g.join(','));
  await openGroup('Условие');
  await fill('gobpm-condition-expression', 'amount > 1000');
  xml = await save();
  check('переход: условие сохранено', /<bpmn:sequenceFlow id="F_yes"[^>]*>\s*<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">amount &gt; 1000<\/bpmn:conditionExpression>/.test(xml), xml.match(/<bpmn:sequenceFlow id="F_yes"[\s\S]*?(\/>|<\/bpmn:sequenceFlow>)/)?.[0]);
  await selectFlow('F_no');
  check('default flow: без группы «Условие»', !(await groups()).includes('Условие'));

  // Отмена правки в панели - одним шагом
  await select('Script');
  await openGroup('Скрипт');
  await fill('gobpm-script-result-variable', 'other');
  await page.mouse.click(1000, 800);
  await page.click('[data-tool="undo"]');
  await select('Script');
  await openGroup('Скрипт');
  check('отмена правки панели', (await field('gobpm-script-result-variable').inputValue()) === 'greeting');

  await select('User');
  } catch (err) {
    check('исключение', false, err.message.split('\n')[0]);
  }
  return h.close();
}
