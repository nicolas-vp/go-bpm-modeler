// Правила рисования: граничные события только там, где их поддерживает go-bpm, один исходящий переход у задачи,
// без подпроцесса в подпроцессе. Каждый запрет проверяется в паре с разрешённым действием - иначе «ничего не
// изменилось» могло бы значить, что тест промахнулся

import { open } from './harness.mjs';

const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="D" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Rules" isExecutable="true">
    <bpmn:startEvent id="S" />
    <bpmn:task id="T1" />
    <bpmn:task id="T2" />
    <bpmn:task id="T3" />
    <bpmn:userTask id="U" />
    <bpmn:boundaryEvent id="B" attachedToRef="U"><bpmn:timerEventDefinition /></bpmn:boundaryEvent>
    <bpmn:businessRuleTask id="BR" />
    <bpmn:task id="MI"><bpmn:multiInstanceLoopCharacteristics isSequential="true" /></bpmn:task>
    <bpmn:exclusiveGateway id="G" />
    <bpmn:subProcess id="SP"><bpmn:task id="In" /></bpmn:subProcess>
    <bpmn:sequenceFlow id="F0" sourceRef="S" targetRef="T1" />
    <bpmn:sequenceFlow id="F1" sourceRef="T1" targetRef="T2" />
    <bpmn:sequenceFlow id="F2" sourceRef="G" targetRef="T3" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Di"><bpmndi:BPMNPlane id="P" bpmnElement="Rules">
    <bpmndi:BPMNShape id="S_di" bpmnElement="S"><dc:Bounds x="100" y="122" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="T1_di" bpmnElement="T1"><dc:Bounds x="200" y="100" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="T2_di" bpmnElement="T2"><dc:Bounds x="380" y="100" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="T3_di" bpmnElement="T3"><dc:Bounds x="380" y="260" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="U_di" bpmnElement="U"><dc:Bounds x="560" y="100" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="B_di" bpmnElement="B"><dc:Bounds x="642" y="162" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="BR_di" bpmnElement="BR"><dc:Bounds x="740" y="100" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="MI_di" bpmnElement="MI"><dc:Bounds x="740" y="260" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="G_di" bpmnElement="G" isMarkerVisible="true"><dc:Bounds x="225" y="275" width="50" height="50" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="SP_di" bpmnElement="SP" isExpanded="true"><dc:Bounds x="100" y="400" width="420" height="200" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="In_di" bpmnElement="In"><dc:Bounds x="140" y="460" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="F0_di" bpmnElement="F0"><di:waypoint x="136" y="140" /><di:waypoint x="200" y="140" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="F1_di" bpmnElement="F1"><di:waypoint x="300" y="140" /><di:waypoint x="380" y="140" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="F2_di" bpmnElement="F2"><di:waypoint x="275" y="300" /><di:waypoint x="380" y="300" /></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

export default async function (dist) {
  const h = await open({ dist, files: { 'rules.bpmn': fixture }, viewport: { width: 1500, height: 950 } });
  const { page, check, select } = h;
  const save = () => h.save('rules.bpmn');
  const count = (xml, re) => (xml.match(re) ?? []).length;
  const box = (id) => page.locator(`.editor:not([hidden]) .djs-element[data-element-id="${id}"]`).first().boundingBox();

  // Пункт палитры «приклеен» к курсору: ведём его к точке и щёлкаем
  async function drop(paletteAction, x, y) {
    await page.click(`.djs-palette [data-action="${paletteAction}"]`);
    await page.mouse.move(x - 40, y - 40);
    await page.mouse.move(x, y, { steps: 8 });
    await page.mouse.click(x, y);
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
  }
  async function dropOnBottomEdge(paletteAction, id) {
    const b = await box(id);
    await drop(paletteAction, b.x + b.width / 3, b.y + b.height);
  }
  async function connect(from, to) {
    await select(from);
    const handle = await page.locator('.djs-context-pad [data-action="connect"]').boundingBox();
    const t = await box(to);
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);
  }
  async function padActions(id) {
    await select(id);
    return page.$$eval('.djs-context-pad [data-action]', (els) => els.map((e) => e.getAttribute('data-action')));
  }
  async function replaceIds(id) {
    await select(id);
    await page.locator('.djs-context-pad [data-action="replace"]').click();
    await page.waitForSelector('.djs-popup');
    const ids = await page.$$eval('.djs-popup [data-id]', (els) => els.map((e) => e.getAttribute('data-id')));
    await page.keyboard.press('Escape');
    return ids;
  }

  try {
    await page.locator('.file').click();
    await page.waitForSelector('.djs-palette .entry');
    let xml = await save();
    const boundaries = count(xml, /<bpmn:boundaryEvent /g);
    const catches = count(xml, /<bpmn:intermediateCatchEvent /g);

    // Граничные события
    await dropOnBottomEdge('create.timer-catch-event', 'BR');
    xml = await save();
    check('таймер на business rule task не прикрепляется', !/attachedToRef="BR"/.test(xml) && count(xml, /<bpmn:intermediateCatchEvent /g) === catches, xml.match(/<bpmn:boundaryEvent [^>]*>/g)?.join(' '));
    await dropOnBottomEdge('create.timer-catch-event', 'MI');
    xml = await save();
    check('таймер на задаче с multi-instance не прикрепляется', !/attachedToRef="MI"/.test(xml));
    await dropOnBottomEdge('create.message-catch-event', 'T2');
    xml = await save();
    check('сообщение на задаче не прикрепляется', !/attachedToRef="T2"/.test(xml));
    await dropOnBottomEdge('create.timer-catch-event', 'T2');
    xml = await save();
    check('таймер на задаче прикрепляется', /attachedToRef="T2"/.test(xml) && count(xml, /<bpmn:boundaryEvent /g) === boundaries + 1, `${count(xml, /<bpmn:boundaryEvent /g)} граничных`);

    // Меню замены граничного события на user task: ошибки нет, таймер есть
    // Граничный таймер на user task заменить не на что: ошибка там не поддерживается - нет и гаечного ключа.
    // На обычной задаче таймер можно заменить на ошибку
    await select('B');
    const bPad = await page.$$eval('.djs-context-pad [data-action]', (els) => els.map((e) => e.getAttribute('data-action')));
    check('граничный таймер user task: замены нет', !bPad.includes('replace'), bPad.join(','));
    const onT2 = xml.match(/<bpmn:boundaryEvent id="([^"]+)"[^>]*attachedToRef="T2"/)?.[1];
    const t2Menu = await replaceIds(onT2);
    check('граничный таймер задачи: можно заменить на ошибку', t2Menu.includes('replace-with-error-boundary'), t2Menu.join(','));

    // Один исходящий переход
    const t1 = await padActions('T1');
    const t2 = await padActions('T2');
    const g = await padActions('G');
    check('у задачи с переходом нет «добавить следующий»', !t1.some((a) => a.startsWith('append.') && a !== 'append.text-annotation'), t1.join(','));
    check('у задачи без перехода «добавить следующий» есть', t2.includes('append.append-task'), t2.join(','));
    check('у шлюза с переходом «добавить следующий» есть', g.includes('append.append-task'), g.join(','));
    // Запрещённое прямое соединение diagram-js пробует развернуть (canConnectReverse): T3 -> T1 допустим - у T3
    // исходящих нет. Проверяем конкретные переходы, а не их число
    const flow = (from, to) => new RegExp(`<bpmn:sequenceFlow id="[^"]+" sourceRef="${from}" targetRef="${to}"`);
    await connect('T1', 'T3');
    xml = await save();
    check('второй переход из задачи не создаётся', !flow('T1', 'T3').test(xml), xml.match(/<bpmn:sequenceFlow [^>]*>/g)?.join(' '));
    await connect('T2', 'T3');
    xml = await save();
    check('первый переход из задачи создаётся', flow('T2', 'T3').test(xml), xml.match(/<bpmn:sequenceFlow [^>]*>/g)?.join(' '));

    // Подпроцесс в подпроцессе
    const subs = count(xml, /<bpmn:subProcess /g);
    const sp = await box('SP');
    await drop('create.subprocess-expanded', sp.x + sp.width - 120, sp.y + sp.height - 60);
    xml = await save();
    check('подпроцесс внутри подпроцесса не создаётся', count(xml, /<bpmn:subProcess /g) === subs, `${count(xml, /<bpmn:subProcess /g)} подпроцессов`);
    const blank = h.blank();
    await drop('create.subprocess-expanded', blank.x - 150, blank.y - 120);
    xml = await save();
    check('подпроцесс на холсте создаётся', count(xml, /<bpmn:subProcess /g) === subs + 1);
    const inner = await replaceIds('In');
    const outer = await replaceIds('T3');
    check('задачу в подпроцессе нельзя заменить на подпроцесс', !inner.includes('replace-with-expanded-subprocess'), inner.join(','));
    check('задачу на холсте можно заменить на подпроцесс', outer.includes('replace-with-expanded-subprocess'), outer.join(','));
  } catch (err) {
    check('исключение', false, err.message.split('\n')[0]);
  }
  return h.close();
}
