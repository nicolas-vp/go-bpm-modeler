// Скриншоты моделера для страницы go-bpm.tech/modeler/: node e2e/screenshots.mjs <dist> <каталог>.
// Та же обвязка, что у тестов: собранный фронтенд в Chromium, рабочая папка - схемы ниже

import path from 'node:path';

import { open } from './harness.mjs';

const NS = `xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:gobpm="https://github.com/nicolas-vp/go-bpm/schema/1.0"`;

// Согласование заказа из «Быстрого старта» go-bpm, дополненное решением DMN, эскалацией и ожиданием оплаты.
// broken - черновик с ошибками для скриншота линтера
function orderApproval({ broken = false } = {}) {
  const jobType = broken ? '' : '<gobpm:taskDefinition type="notifyClient" retries="3" />';
  const timer = broken ? '3 дня' : 'P3D';
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions ${NS} id="Definitions_order" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:message id="Msg_paid" name="paymentReceived">
    <bpmn:extensionElements><gobpm:subscription correlationKey="=orderId" /></bpmn:extensionElements>
  </bpmn:message>
  <bpmn:process id="OrderApproval" name="Согласование заказа" isExecutable="true">
    <bpmn:startEvent id="Start" name="Заказ создан" />
    <bpmn:task id="CheckOrder" name="Проверить заказ" />
    <bpmn:businessRuleTask id="CalcDiscount" name="Рассчитать скидку">
      <bpmn:extensionElements><gobpm:calledDecision decisionId="Offer" resultVariable="offer" /></bpmn:extensionElements>
    </bpmn:businessRuleTask>
    <bpmn:exclusiveGateway id="IsBig" name="Крупный заказ?" default="Flow_small" />
    <bpmn:userTask id="Approve" name="Согласовать заказ">
      <bpmn:extensionElements>
        <gobpm:assignmentDefinition candidateGroups="managers" />
        <gobpm:formDefinition formKey="approve-order" />
      </bpmn:extensionElements>
    </bpmn:userTask>
    <bpmn:boundaryEvent id="Overdue" name="3 дня" attachedToRef="Approve">
      <bpmn:timerEventDefinition><bpmn:timeDuration xsi:type="bpmn:tFormalExpression">${timer}</bpmn:timeDuration></bpmn:timerEventDefinition>
    </bpmn:boundaryEvent>
    <bpmn:endEvent id="EndLate" name="Просрочено" />
    <bpmn:serviceTask id="Notify" name="Уведомить клиента">
      <bpmn:extensionElements>${jobType}</bpmn:extensionElements>
    </bpmn:serviceTask>
    <bpmn:receiveTask id="WaitPayment" name="Дождаться оплаты" messageRef="Msg_paid" />
    <bpmn:endEvent id="End" name="Оплачено" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start" targetRef="CheckOrder" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="CheckOrder" targetRef="CalcDiscount" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="CalcDiscount" targetRef="IsBig" />
    <bpmn:sequenceFlow id="Flow_big" name="да" sourceRef="IsBig" targetRef="Approve">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">amount &gt; 1000</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_small" name="нет" sourceRef="IsBig" targetRef="Notify" />
    <bpmn:sequenceFlow id="Flow_approved" sourceRef="Approve" targetRef="Notify" />
    <bpmn:sequenceFlow id="Flow_late" sourceRef="Overdue" targetRef="EndLate" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="Notify" targetRef="WaitPayment" />
    <bpmn:sequenceFlow id="Flow_5" sourceRef="WaitPayment" targetRef="End" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Di"><bpmndi:BPMNPlane id="P" bpmnElement="OrderApproval">
    <bpmndi:BPMNShape id="Start_di" bpmnElement="Start"><dc:Bounds x="152" y="262" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="CheckOrder_di" bpmnElement="CheckOrder"><dc:Bounds x="230" y="240" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="CalcDiscount_di" bpmnElement="CalcDiscount"><dc:Bounds x="380" y="240" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="IsBig_di" bpmnElement="IsBig" isMarkerVisible="true"><dc:Bounds x="530" y="255" width="50" height="50" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Approve_di" bpmnElement="Approve"><dc:Bounds x="640" y="120" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Overdue_di" bpmnElement="Overdue"><dc:Bounds x="702" y="102" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="EndLate_di" bpmnElement="EndLate"><dc:Bounds x="822" y="42" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Notify_di" bpmnElement="Notify"><dc:Bounds x="830" y="240" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="WaitPayment_di" bpmnElement="WaitPayment"><dc:Bounds x="990" y="240" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="End_di" bpmnElement="End"><dc:Bounds x="1142" y="262" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="188" y="280" /><di:waypoint x="230" y="280" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="330" y="280" /><di:waypoint x="380" y="280" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3"><di:waypoint x="480" y="280" /><di:waypoint x="530" y="280" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="Flow_big_di" bpmnElement="Flow_big"><di:waypoint x="555" y="255" /><di:waypoint x="555" y="160" /><di:waypoint x="640" y="160" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="Flow_small_di" bpmnElement="Flow_small"><di:waypoint x="580" y="280" /><di:waypoint x="830" y="280" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="Flow_approved_di" bpmnElement="Flow_approved"><di:waypoint x="740" y="160" /><di:waypoint x="880" y="160" /><di:waypoint x="880" y="240" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="Flow_late_di" bpmnElement="Flow_late"><di:waypoint x="720" y="102" /><di:waypoint x="720" y="60" /><di:waypoint x="822" y="60" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="Flow_4_di" bpmnElement="Flow_4"><di:waypoint x="930" y="280" /><di:waypoint x="990" y="280" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="Flow_5_di" bpmnElement="Flow_5"><di:waypoint x="1090" y="280" /><di:waypoint x="1142" y="280" /></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

// Таблица Offer из docs/dmn.md go-bpm
const offer = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/" xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/" id="Definitions_pricing" name="Цены" namespace="http://camunda.org/schema/1.0/dmn">
  <decision id="Offer" name="Скидка">
    <decisionTable id="OfferTable" hitPolicy="FIRST">
      <input id="InAmount" label="Сумма заказа"><inputExpression id="InAmountExpr" typeRef="number"><text>amount</text></inputExpression></input>
      <input id="InCategory" label="Категория клиента"><inputExpression id="InCategoryExpr" typeRef="string"><text>category</text></inputExpression></input>
      <output id="OutDiscount" label="Скидка, %" name="discount" typeRef="number" />
      <output id="OutReason" label="Причина" name="reason" typeRef="string" />
      <rule id="VipBig"><inputEntry id="e1"><text>&gt;= 10000</text></inputEntry><inputEntry id="e2"><text>"vip"</text></inputEntry><outputEntry id="e3"><text>15</text></outputEntry><outputEntry id="e4"><text>"vip, крупный заказ"</text></outputEntry></rule>
      <rule id="Big"><inputEntry id="e5"><text>&gt;= 10000</text></inputEntry><inputEntry id="e6"><text>-</text></inputEntry><outputEntry id="e7"><text>10</text></outputEntry><outputEntry id="e8"><text>"крупный заказ"</text></outputEntry></rule>
      <rule id="Status"><inputEntry id="e9"><text>[1000..10000[</text></inputEntry><inputEntry id="e10"><text>"vip","gold"</text></inputEntry><outputEntry id="e11"><text>5</text></outputEntry><outputEntry id="e12"><text>"статус клиента"</text></outputEntry></rule>
    </decisionTable>
  </decision>
  <dmndi:DMNDI><dmndi:DMNDiagram><dmndi:DMNShape dmnElementRef="Offer"><dc:Bounds height="80" width="180" x="160" y="100" /></dmndi:DMNShape></dmndi:DMNDiagram></dmndi:DMNDI>
</definitions>`;

const files = {
  'orders/order-approval.bpmn': orderApproval(),
  'orders/order-draft.bpmn': orderApproval({ broken: true }),
  'pricing/offer.dmn': offer,
};
const index = {
  processes: [
    { id: 'OrderApproval', name: 'Согласование заказа', path: 'orders/order-approval.bpmn' },
  ],
  decisions: [{ id: 'Offer', name: 'Скидка', path: 'pricing/offer.dmn' }],
  problems: {},
};

const [dist, out] = process.argv.slice(2);
if (!dist || !out) {
  console.error('node e2e/screenshots.mjs <dist> <каталог>');
  process.exit(2);
}

const h = await open({ dist, files, index, viewport: { width: 1600, height: 900 } });
const { page } = h;
const shot = async (name) => {
  await page.mouse.move(5, 5);
  await page.screenshot({ path: path.join(out, `modeler-${name}.png`) });
  console.log(`modeler-${name}.png`);
};
const openFile = async (name) => {
  await page.locator('.file', { hasText: name }).click();
  await page.waitForTimeout(600);
};
// Рамка всех фигур видимой вкладки на экране
const diagramBox = () =>
  page.evaluate(() => {
    const boxes = [...document.querySelectorAll('.editor:not([hidden]) .djs-element.djs-shape')].map((e) => e.getBoundingClientRect());
    const left = Math.min(...boxes.map((b) => b.left));
    const top = Math.min(...boxes.map((b) => b.top));
    return { left, top, width: Math.max(...boxes.map((b) => b.right)) - left, height: Math.max(...boxes.map((b) => b.bottom)) - top };
  });
// bpmn-js вписывает схему в холст без учёта палитры: мелкими шагами Ctrl+колесо уменьшаем схему до ширины width и
// сдвигаем холст, чтобы её левый верхний угол оказался в (x, y)
const placeDiagram = async (x, y, width) => {
  const { x: bx, y: by } = h.blank();
  await page.mouse.move(bx, by);
  for (let i = 0; i < 40 && (await diagramBox()).width > width; i++) {
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, 15);
    await page.keyboard.up('Control');
    await page.waitForTimeout(40);
  }
  const box = await diagramBox();
  await page.mouse.down();
  await page.mouse.move(bx + x - box.left, by + y - box.top, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);
};

// 1. Процесс и панель свойств user task
await openFile('order-approval.bpmn');
await placeDiagram(410, 230, 840);
await h.select('Approve');
await h.openGroup('Назначение');
await h.openGroup('Форма');
await shot('process');

// 2. Решение DMN из рабочей папки у business rule task
await h.select('CalcDiscount');
await h.openGroup('Решение DMN');
await shot('decision');

// 3. Меню замены задачи с AI task
await h.select('CheckOrder');
await page.locator('.djs-context-pad [data-action="replace"]').click();
await page.waitForSelector('.djs-popup');
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(out, 'modeler-replace.png') });
console.log('modeler-replace.png');
await page.keyboard.press('Escape');

// 4. Линтер на черновике: маркеры и сообщение таймера
await openFile('order-draft.bpmn');
await placeDiagram(410, 300, 840);
await page.mouse.click(h.blank().x, h.blank().y);
await page.locator('.editor:not([hidden]) .djs-overlays[data-container-id="Overdue"] .bjsl-overlay').first().hover();
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(out, 'modeler-lint.png') });
console.log('modeler-lint.png');

// 5. Таблица решений DMN
await openFile('offer.dmn');
await page.locator('.editor:not([hidden]) .drill-down-overlay').first().click();
await page.waitForSelector('.tjs-table');
await page.waitForTimeout(300);
await page.mouse.move(5, 5);
// Таблица короткая: ниже неё пусто
await page.screenshot({ path: path.join(out, 'modeler-dmn.png'), clip: { x: 0, y: 0, width: 1600, height: 480 } });
console.log('modeler-dmn.png');

const results = await h.close();
const bad = results.filter((r) => !r.ok);
if (bad.length) {
  console.error(bad);
  process.exit(1);
}
