// Правила bpmnlint под генератор go-bpm (internal/generator/codegen: validate.go, expressions.go, loops.go,
// messages.go, user_tasks.go). Сообщения - как у генератора, чтобы ошибку в моделере было легко сопоставить с ошибкой
// генерации. Список - docs/supported-elements.md, раздел «Проверки»

import { is } from 'bpmn-js/lib/util/ModelUtil';

import { workspaceIndex } from '../../workspaceIndex';
import { getExtension, getExtensionAttr } from '../properties/extensions';

type Node = any;

interface Reporter {
  report(id: string, message: string, path?: Array<string | number>): void;
}

export type Rule = () => { check(node: Node, reporter: Reporter): void };

// --- общие проверки значений ---

/** Длительность ISO 8601 без лет и месяцев - utils.ParseISODuration */
const ISO_DURATION = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/;

export function isDuration(value: string): boolean {
  const v = value.trim();
  const match = ISO_DURATION.exec(v);
  if (!match || v === 'P' || v.endsWith('T')) {
    return false;
  }
  // Больше нуля
  return match.slice(1).some((part) => part !== undefined && Number(part.replace(',', '.')) > 0);
}

/** Путь к переменной: client.address.city */
const VARIABLE_PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

/** Переменная =path, ${path} или #{path}: undefined - не переменная, false - выражение сложнее переменной */
export function variableOf(value: string): string | false | undefined {
  const v = value.trim();
  let expression: string;
  if ((v.startsWith('${') || v.startsWith('#{')) && v.endsWith('}')) {
    expression = v.slice(2, -1);
  } else if (v.startsWith('=')) {
    expression = v.slice(1);
  } else if (/[${}#]/.test(v)) {
    return false;
  } else {
    return undefined;
  }
  return VARIABLE_PATH.test(expression.trim()) ? expression.trim() : false;
}

/** Дата RFC 3339 с зоной: 2026-12-01T09:00:00+03:00, 2026-12-01T06:00:00Z */
const RFC3339 = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;

export function isTimeDate(value: string): boolean {
  const v = value.trim();
  if (v.startsWith('=') || v.startsWith('${') || v.startsWith('#{')) {
    return !!variableOf(v);
  }
  return RFC3339.test(v) && !Number.isNaN(Date.parse(v));
}

const blank = (value: unknown) => value === undefined || value === null || String(value).trim() === '';

function eventDefinitions(node: Node): Node[] {
  return node.get('eventDefinitions') ?? [];
}

function typeName(node: Node): string {
  return node.$type.replace(/^bpmn:/, '');
}

// --- поддерживаемые элементы ---

const SUPPORTED_FLOW_ELEMENTS = new Set([
  'bpmn:StartEvent',
  'bpmn:EndEvent',
  'bpmn:IntermediateCatchEvent',
  'bpmn:BoundaryEvent',
  'bpmn:ExclusiveGateway',
  'bpmn:ParallelGateway',
  'bpmn:Task',
  'bpmn:ServiceTask',
  'bpmn:ScriptTask',
  'bpmn:BusinessRuleTask',
  'bpmn:UserTask',
  'bpmn:ReceiveTask',
  'bpmn:CallActivity',
  'bpmn:SubProcess',
  'bpmn:SequenceFlow',
  // Не исполняются и генерации не мешают
  'bpmn:DataObject',
  'bpmn:DataObjectReference',
  'bpmn:DataStoreReference',
]);

/** Элементы, которые генератор не поддерживает: тип, определения событий, циклы, вложенность */
export const supportedElements: Rule = () => ({
  check(node, reporter) {
    if (!is(node, 'bpmn:FlowElement')) {
      return;
    }
    // Точный тип: Transaction и AdHocSubProcess - подтипы SubProcess
    if (!SUPPORTED_FLOW_ELEMENTS.has(node.$type)) {
      reporter.report(node.id, `${typeName(node)} не поддерживается go-bpm`);
      return;
    }
    const definitions = eventDefinitions(node);
    if (is(node, 'bpmn:StartEvent') && definitions.length > 0) {
      reporter.report(node.id, `start event: ${typeName(definitions[0])} не поддерживается, только обычный старт`);
    }
    if (is(node, 'bpmn:EndEvent') && definitions.length > 0) {
      reporter.report(node.id, `end event: ${typeName(definitions[0])} не поддерживается, только обычный конец`);
    }
    if (is(node, 'bpmn:IntermediateCatchEvent')) {
      if (definitions.length !== 1) {
        reporter.report(node.id, 'нужно одно определение события, таймер или сообщение');
      } else if (!is(definitions[0], 'bpmn:TimerEventDefinition') && !is(definitions[0], 'bpmn:MessageEventDefinition')) {
        reporter.report(node.id, `${typeName(definitions[0])} не поддерживается, только таймер и сообщение`);
      }
    }
    if (is(node, 'bpmn:BoundaryEvent')) {
      if (definitions.length !== 1) {
        reporter.report(node.id, 'нужно одно определение события, таймер или ошибка');
      } else if (!is(definitions[0], 'bpmn:TimerEventDefinition') && !is(definitions[0], 'bpmn:ErrorEventDefinition')) {
        reporter.report(node.id, `${typeName(definitions[0])} не поддерживается, только таймер и ошибка`);
      }
      if (node.get('cancelActivity') === false) {
        reporter.report(node.id, 'непрерывающие события (cancelActivity=false) не поддерживаются');
      }
    }
    if (is(node, 'bpmn:SubProcess')) {
      if (node.get('triggeredByEvent')) {
        reporter.report(node.id, 'event sub-process не поддерживается');
      } else if (is(node.$parent, 'bpmn:SubProcess')) {
        reporter.report(node.id, 'вложенный подпроцесс не поддерживается, вынесите его в call activity');
      }
    }
    if (is(node, 'bpmn:Activity')) {
      const loop = node.get('loopCharacteristics');
      if (is(loop, 'bpmn:StandardLoopCharacteristics')) {
        reporter.report(node.id, 'циклы (standardLoop) не поддерживаются, только последовательный multi-instance');
      }
    }
  },
});

/** Один start event в процессе и в подпроцессе */
export const singleStartEvent: Rule = () => ({
  check(node, reporter) {
    if (!is(node, 'bpmn:Process') && !(is(node, 'bpmn:SubProcess') && !node.get('triggeredByEvent'))) {
      return;
    }
    const elements: Node[] = node.get('flowElements') ?? [];
    // Пустой пул - участник без процесса внутри
    if (elements.length === 0) {
      return;
    }
    const starts = elements.filter((e) => is(e, 'bpmn:StartEvent'));
    if (starts.length === 0) {
      reporter.report(node.id, 'нет start event');
    } else if (starts.length > 1) {
      for (const start of starts) {
        reporter.report(start.id, `несколько start event (${starts.map((s) => s.id).join(', ')}) не поддерживаются, нужен один`);
      }
    }
  },
});

// --- граничные события ---

// Куда go-bpm разрешает граничные события; их же проверяют правила рисования (../modelingRules.ts)
export const TIMER_TARGETS = ['bpmn:Task', 'bpmn:ScriptTask', 'bpmn:ServiceTask', 'bpmn:UserTask'];
export const ERROR_TARGETS = ['bpmn:Task', 'bpmn:ScriptTask', 'bpmn:ServiceTask'];

/** Точный тип элемента: is() считает ServiceTask и UserTask подтипами Task */
export const exactly = (node: Node, types: string[]) => types.includes(node?.$type);

export const boundaryEvents: Rule = () => ({
  check(node, reporter) {
    if (!is(node, 'bpmn:BoundaryEvent')) {
      return;
    }
    const target = node.get('attachedToRef');
    const definition = eventDefinitions(node)[0];
    if (!target || !definition) {
      return;
    }
    if (!exactly(target, TIMER_TARGETS)) {
      reporter.report(node.id, `граничные события поддерживаются только у task, scriptTask, serviceTask и userTask, а ${typeName(target)} - нет`);
      return;
    }
    if (is(definition, 'bpmn:ErrorEventDefinition') && !exactly(target, ERROR_TARGETS)) {
      reporter.report(node.id, `у userTask ${target.id} поддерживается только граничный таймер`);
    }
    if (is(definition, 'bpmn:TimerEventDefinition') && target.get('loopCharacteristics')) {
      reporter.report(node.id, `граничный таймер у элемента ${target.id} с multi-instance не поддерживается, только событие ошибки`);
    }
  },
});

// --- переходы и ветвления ---

// Несколько исходящих без условий - разветвление во все ветки
export const FORKS = ['bpmn:ParallelGateway', 'bpmn:SubProcess', 'bpmn:CallActivity'];

/**
 * Исходящие переходы по sourceRef. <bpmn:outgoing> у узла необязательны (BPMN, написанный руками), генератор тоже
 * восстанавливает переходы по sequence flow
 */
function outgoingOf(node: Node): Node[] {
  const siblings: Node[] = node.$parent?.get('flowElements') ?? [];
  return siblings.filter((element) => is(element, 'bpmn:SequenceFlow') && element.get('sourceRef') === node);
}

function hasCondition(flow: Node): boolean {
  return !blank(flow.get('conditionExpression')?.get('body'));
}

export const branches: Rule = () => ({
  check(node, reporter) {
    if (!is(node, 'bpmn:FlowNode')) {
      return;
    }
    const outgoing = outgoingOf(node);
    if (is(node, 'bpmn:ExclusiveGateway')) {
      const defaultFlow = node.get('default');
      if (outgoing.length < 2) {
        return;
      }
      for (const flow of outgoing) {
        if (!hasCondition(flow) && flow !== defaultFlow) {
          reporter.report(flow.id, `у перехода ${flow.id} нет условия, и он не default flow - по нему токен не пойдёт никогда`);
        }
      }
      return;
    }
    for (const flow of outgoing) {
      if (hasCondition(flow)) {
        reporter.report(flow.id, 'условие на переходе проверяет только exclusive gateway, поставьте его перед ветками');
      }
    }
    if (outgoing.length > 1 && !FORKS.some((type) => is(node, type))) {
      reporter.report(node.id, 'несколько исходящих переходов: разветвление делается шлюзом - exclusive по условию, parallel во все');
    }
  },
});

/** Exclusive gateway с ветвлением без default flow: если ни одно условие не подойдёт, экземпляр упадёт */
export const exclusiveDefault: Rule = () => ({
  check(node, reporter) {
    if (is(node, 'bpmn:ExclusiveGateway') && outgoingOf(node).length > 1 && !node.get('default')) {
      reporter.report(node.id, 'нет default flow: если ни одно условие не подойдёт, экземпляр упадёт');
    }
  },
});

// --- обязательные свойства ---

function messageOf(node: Node): Node | undefined {
  if (is(node, 'bpmn:ReceiveTask')) {
    return node.get('messageRef');
  }
  return eventDefinitions(node).find((d) => is(d, 'bpmn:MessageEventDefinition'))?.get('messageRef');
}

const isMessageWaiter = (node: Node) =>
  is(node, 'bpmn:ReceiveTask') ||
  (is(node, 'bpmn:IntermediateCatchEvent') && eventDefinitions(node).some((d) => is(d, 'bpmn:MessageEventDefinition')));

export const requiredProperties: Rule = () => ({
  check(node, reporter) {
    const attr = (type: string, name: string) => getExtensionAttr(node, type, name);
    if (is(node, 'bpmn:ServiceTask')) {
      if (getExtension(node, 'gobpm:AiTask')) {
        if (blank(attr('gobpm:AiTask', 'prompt'))) {
          reporter.report(node.id, 'AI task: не задан промпт');
        }
        if (blank(attr('gobpm:AiTask', 'resultVariable'))) {
          reporter.report(node.id, 'AI task: не задана переменная результата');
        }
      } else if (blank(attr('gobpm:TaskDefinition', 'type'))) {
        reporter.report(node.id, 'не задан тип задачи (jobType) - имя обработчика');
      }
    }
    if (is(node, 'bpmn:ScriptTask') && blank(attr('gobpm:Script', 'expression'))) {
      reporter.report(node.id, 'не задано выражение скрипта');
    }
    if (is(node, 'bpmn:BusinessRuleTask')) {
      if (blank(attr('gobpm:CalledDecision', 'decisionId')) || blank(attr('gobpm:CalledDecision', 'resultVariable'))) {
        reporter.report(node.id, 'нужно решение DMN: decisionId и переменная результата');
      }
      if (getExtension(node, 'gobpm:TaskDefinition') || getExtension(node, 'zeebe:TaskDefinition')) {
        reporter.report(node.id, 'business rule task с job worker (taskDefinition) не поддерживается');
      }
    }
    if (is(node, 'bpmn:CallActivity') && blank(attr('gobpm:CalledElement', 'processId'))) {
      reporter.report(node.id, 'не задан вызываемый процесс (processId)');
    }
    if (isMessageWaiter(node)) {
      const message = messageOf(node);
      if (!message) {
        reporter.report(node.id, 'не задано сообщение (messageRef)');
      } else if (blank(message.get('name'))) {
        reporter.report(node.id, `у сообщения ${message.id} нужно имя`);
      } else if (variableOf(message.get('name')) !== undefined) {
        reporter.report(node.id, `у сообщения ${message.id} нужно имя-константа, выражения не поддерживаются`);
      }
    }
  },
});

// --- значения ---

export const timers: Rule = () => ({
  check(node, reporter) {
    if (!is(node, 'bpmn:TimerEventDefinition')) {
      return;
    }
    const event = node.$parent;
    const body = (name: string) => node.get(name)?.get('body');
    if (node.get('timeCycle')) {
      reporter.report(event.id, 'поддерживается таймер с длительностью или датой, без цикла (timeCycle)');
      return;
    }
    const duration = body('timeDuration');
    const date = body('timeDate');
    if (node.get('timeDate')) {
      if (blank(date)) {
        reporter.report(event.id, 'не задана дата таймера');
      } else if (!isTimeDate(date)) {
        reporter.report(event.id, `timeDate "${date}": нужна дата и время RFC 3339 с зоной, например 2026-12-01T09:00:00+03:00, или переменная =name`);
      }
      return;
    }
    if (blank(duration)) {
      reporter.report(event.id, 'не задана длительность таймера');
    } else if (!isDuration(duration)) {
      reporter.report(event.id, `длительность "${duration}" не в формате ISO 8601 (например PT30S, PT5M, P1DT2H), годы и месяцы не поддерживаются`);
    }
  },
});

export const multiInstance: Rule = () => ({
  check(node, reporter) {
    if (!is(node, 'bpmn:MultiInstanceLoopCharacteristics')) {
      return;
    }
    const id = node.$parent.id;
    if (!node.get('isSequential')) {
      reporter.report(id, 'параллельный multi-instance не поддерживается, только последовательный');
    }
    if (node.$attrs?.['camunda:collection'] || getExtension(node, 'zeebe:LoopCharacteristics') || node.get('loopDataInputRef')) {
      reporter.report(id, 'multi-instance по коллекции не поддерживается, только число выполнений и условие завершения');
    }
    const cardinality = node.get('loopCardinality')?.get('body');
    const condition = node.get('completionCondition')?.get('body');
    if (!blank(cardinality) && !/^\s*[1-9]\d*\s*$/.test(cardinality)) {
      reporter.report(id, `loopCardinality "${cardinality}" - нужно целое число больше нуля, выражения не поддерживаются`);
    }
    if (blank(cardinality) && blank(condition)) {
      reporter.report(id, 'у multi-instance нужно число выполнений (loopCardinality) или условие завершения');
    }
  },
});

export const assignments: Rule = () => ({
  check(node, reporter) {
    if (is(node, 'bpmn:UserTask')) {
      const values: Array<[string, string, boolean]> = [
        ['assignee', getExtensionAttr(node, 'gobpm:AssignmentDefinition', 'assignee'), false],
        ['candidateUsers', getExtensionAttr(node, 'gobpm:AssignmentDefinition', 'candidateUsers'), true],
        ['candidateGroups', getExtensionAttr(node, 'gobpm:AssignmentDefinition', 'candidateGroups'), true],
      ];
      for (const [attr, value, list] of values) {
        if (blank(value)) {
          continue;
        }
        // Список через запятую, если это не одна переменная
        const parts = list && variableOf(value) === undefined ? value.split(',') : [value];
        if (parts.some((part) => variableOf(part) === false)) {
          reporter.report(node.id, `${attr} "${value}": выражение не поддерживается, только переменная =name, \${name}, #{name} или значение`);
        }
      }
    }
    if (isMessageWaiter(node)) {
      const message = messageOf(node);
      const key = message && getExtensionAttr(message, 'gobpm:Subscription', 'correlationKey');
      if (!blank(key) && variableOf(key) === false) {
        reporter.report(node.id, `correlationKey "${key}" сообщения ${message.id}: только переменная =name, \${name} или константа`);
      }
    }
  },
});

// --- рабочая папка ---

// Имена пакетов, занятые сгенерированным кодом
const RESERVED_PROCESS_IDS = new Set(['handlers', 'model', 'services']);

export const processIds: Rule = () => ({
  check(node, reporter) {
    if (!is(node, 'bpmn:Process')) {
      return;
    }
    const id: string = node.id ?? '';
    // Id процесса становится именем Go-пакета: OrderApproval -> order_approval
    const pkg = id.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    if (RESERVED_PROCESS_IDS.has(pkg)) {
      reporter.report(id, `процесс не может называться ${id}: папка ${pkg} занята сгенерированным кодом`);
    }
    // По сохранённым файлам: этот же процесс в другом файле или в двух местах
    const files = new Set(workspaceIndex().processes.filter((p) => p.id === id).map((p) => p.path));
    if (files.size > 1) {
      reporter.report(id, `процесс ${id} есть в нескольких файлах (${[...files].join(', ')}), id процессов должны быть уникальны`);
    }
  },
});

export const references: Rule = () => ({
  check(node, reporter) {
    const index = workspaceIndex();
    if (is(node, 'bpmn:BusinessRuleTask')) {
      const decisionId = getExtensionAttr(node, 'gobpm:CalledDecision', 'decisionId');
      if (!blank(decisionId) && !index.decisions.some((d) => d.id === decisionId)) {
        reporter.report(node.id, `решение ${decisionId} не найдено в *.dmn рабочей папки`);
      }
    }
    if (is(node, 'bpmn:CallActivity')) {
      const processId = getExtensionAttr(node, 'gobpm:CalledElement', 'processId');
      if (!blank(processId) && !index.processes.some((p) => p.id === processId)) {
        reporter.report(node.id, `процесс ${processId} не найден в *.bpmn рабочей папки`);
      }
    }
  },
});

/** Правила и их уровень: error - генератор go-bpm откажется, warn - сработает, но вероятна ошибка */
export const RULES: Record<string, { rule: Rule; level: 'error' | 'warn' }> = {
  'supported-elements': { rule: supportedElements, level: 'error' },
  'single-start-event': { rule: singleStartEvent, level: 'error' },
  'boundary-events': { rule: boundaryEvents, level: 'error' },
  branches: { rule: branches, level: 'error' },
  'exclusive-default': { rule: exclusiveDefault, level: 'warn' },
  'required-properties': { rule: requiredProperties, level: 'error' },
  timers: { rule: timers, level: 'error' },
  'multi-instance': { rule: multiInstance, level: 'error' },
  assignments: { rule: assignments, level: 'error' },
  'process-ids': { rule: processIds, level: 'error' },
  references: { rule: references, level: 'warn' },
};
