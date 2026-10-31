// Панель свойств под go-bpm: группы gobpm:*, свой таймер без timeCycle, условие перехода из exclusive gateway.
// Стандартные группы bpmn-js-properties-panel, которых нет в go-bpm, убираются. Список - docs/supported-elements.md

import { Group } from '@bpmn-io/properties-panel';
import { getBusinessObject, is } from 'bpmn-js/lib/util/ModelUtil';

import { workspaceIndex } from '../../workspaceIndex';
import { isAiTask } from '../aiTask';
import { getExtensionAttr, updateExtension } from './extensions';
import { Accessor, checkbox, Entry, integerField, select, textArea, textField, withCurrent } from './fields';

// Стандартные группы для элементов, которых нет в go-bpm; timer заменяется своим
const HIDDEN_GROUPS = new Set(['compensation', 'link', 'signal', 'escalation', 'adHocCompletion', 'timer']);
// isExecutable всегда true: генератор go-bpm берёт все процессы
const HIDDEN_ENTRIES = new Set(['isExecutable']);

interface PanelGroup {
  id: string;
  label: string;
  entries: Entry[];
  component?: unknown;
}

/** Атрибут расширения type у самого элемента; keepEmpty - не удалять расширение без атрибутов */
function ext(type: string, attr: string, keepEmpty = false): Accessor<any> {
  return {
    get: (element) => getExtensionAttr(getBusinessObject(element), type, attr),
    set: (element, injector, value) =>
      updateExtension(injector, element, getBusinessObject(element), type, { [attr]: value }, keepEmpty),
  };
}

/** Атрибут gobpm:aiTask: расширение - метка AI task, пустым оно остаётся */
const ai = (attr: string) => ext('gobpm:AiTask', attr, true);

function group(id: string, label: string, entries: Entry[]): PanelGroup {
  return { id, label, entries, component: Group };
}

// --- задачи ---

function serviceTaskGroup(): PanelGroup {
  return group('gobpm-task-definition', 'Обработчик', [
    textField({
      id: 'gobpm-job-type',
      label: 'Тип задачи (jobType)',
      description: 'Имя обработчика: handlers/<jobType>.go',
      accessor: ext('gobpm:TaskDefinition', 'type'),
    }),
    integerField({
      id: 'gobpm-retries',
      label: 'Попыток',
      description: 'Пусто или 0 - одна попытка',
      accessor: ext('gobpm:TaskDefinition', 'retries'),
    }),
  ]);
}

function aiTaskGroup(): PanelGroup {
  return group('gobpm-ai-task', 'AI task', [
    textField({ id: 'gobpm-ai-model', label: 'Модель', accessor: ai('model') }),
    textArea({ id: 'gobpm-ai-system-prompt', label: 'Системный промпт', accessor: ai('systemPrompt') }),
    textArea({
      id: 'gobpm-ai-prompt',
      label: 'Промпт',
      description: 'Текст или =переменная',
      accessor: ai('prompt'),
    }),
    textField({
      id: 'gobpm-ai-result-variable',
      label: 'Переменная результата',
      accessor: ai('resultVariable'),
    }),
    integerField({ id: 'gobpm-retries', label: 'Попыток', accessor: ext('gobpm:TaskDefinition', 'retries') }),
  ]);
}

function scriptTaskGroup(): PanelGroup {
  return group('gobpm-script', 'Скрипт', [
    textArea({
      id: 'gobpm-script-expression',
      label: 'Выражение',
      description: 'С переменной результата - выражение FEEL/Go, без неё - код Go в теле метода',
      monospace: true,
      rows: 4,
      accessor: ext('gobpm:Script', 'expression'),
    }),
    textField({
      id: 'gobpm-script-result-variable',
      label: 'Переменная результата',
      accessor: ext('gobpm:Script', 'resultVariable'),
    }),
  ]);
}

function businessRuleTaskGroup(): PanelGroup {
  const decisionId = ext('gobpm:CalledDecision', 'decisionId');
  return group('gobpm-called-decision', 'Решение DMN', [
    select({
      id: 'gobpm-decision-id',
      label: 'Решение',
      description: 'Из *.dmn рабочей папки',
      accessor: decisionId,
      options: (element) =>
        withCurrent(
          workspaceIndex().decisions.map((d) => ({ value: d.id, label: `${d.name || d.id} · ${d.path}` })),
          decisionId.get(element),
          'нет в рабочей папке',
        ),
    }),
    textField({
      id: 'gobpm-decision-result-variable',
      label: 'Переменная результата',
      accessor: ext('gobpm:CalledDecision', 'resultVariable'),
    }),
  ]);
}

function callActivityGroup(): PanelGroup {
  const processId = ext('gobpm:CalledElement', 'processId');
  const propagate = ext('gobpm:CalledElement', 'propagateAllChildVariables');
  return group('gobpm-called-element', 'Вызываемый процесс', [
    select({
      id: 'gobpm-process-id',
      label: 'Процесс',
      description: 'Из *.bpmn рабочей папки',
      accessor: processId,
      options: (element) =>
        withCurrent(
          workspaceIndex().processes.map((p) => ({ value: p.id, label: `${p.name || p.id} · ${p.path}` })),
          processId.get(element),
          'нет в рабочей папке',
        ),
    }),
    checkbox({
      id: 'gobpm-propagate-variables',
      label: 'Вернуть переменные дочернего процесса',
      accessor: {
        // Без атрибута go-bpm возвращает переменные: по умолчанию true
        get: (element) => propagate.get(element) !== false,
        // true не пишем - это значение по умолчанию
        set: (element, injector, value) => propagate.set(element, injector, value ? undefined : false),
      },
    }),
  ]);
}

function userTaskGroups(): PanelGroup[] {
  const hint = 'Через запятую; переменная - =name';
  return [
    group('gobpm-assignment', 'Назначение', [
      textField({
        id: 'gobpm-assignee',
        label: 'Исполнитель',
        description: 'Логин или =переменная',
        accessor: ext('gobpm:AssignmentDefinition', 'assignee'),
      }),
      textField({
        id: 'gobpm-candidate-users',
        label: 'Кандидаты-пользователи',
        description: hint,
        accessor: ext('gobpm:AssignmentDefinition', 'candidateUsers'),
      }),
      textField({
        id: 'gobpm-candidate-groups',
        label: 'Кандидаты-группы',
        description: hint,
        accessor: ext('gobpm:AssignmentDefinition', 'candidateGroups'),
      }),
    ]),
    group('gobpm-form', 'Форма', [
      textField({
        id: 'gobpm-form-key',
        label: 'Ключ формы',
        description: 'Метка, по которой фронтенд выбирает форму',
        accessor: ext('gobpm:FormDefinition', 'formKey'),
      }),
    ]),
  ];
}

// --- сообщения ---

/** bpmn:Message, на который ссылается receive task или событие сообщения */
function messageOf(element: any): any {
  const bo = getBusinessObject(element);
  if (is(bo, 'bpmn:ReceiveTask')) {
    return bo.get('messageRef');
  }
  const definition = (bo.get('eventDefinitions') ?? []).find((d: any) => is(d, 'bpmn:MessageEventDefinition'));
  return definition?.get('messageRef');
}

function correlationKeyEntry(): Entry {
  return textField({
    id: 'gobpm-correlation-key',
    label: 'Ключ корреляции',
    description: '=переменная; пусто - бизнес-ключ экземпляра',
    accessor: {
      get: (element) => {
        const message = messageOf(element);
        return message && getExtensionAttr(message, 'gobpm:Subscription', 'correlationKey');
      },
      set: (element, injector, value) => {
        const message = messageOf(element);
        if (message) {
          updateExtension(injector, element, message, 'gobpm:Subscription', { correlationKey: value });
        }
      },
    },
  });
}

// --- таймер ---

type TimerKind = 'timeDuration' | 'timeDate';

function timerOf(element: any): any {
  const bo = getBusinessObject(element);
  return (bo.get('eventDefinitions') ?? []).find((d: any) => is(d, 'bpmn:TimerEventDefinition'));
}

function timerKind(timer: any): TimerKind {
  return timer.get('timeDate') !== undefined ? 'timeDate' : 'timeDuration';
}

function setTimer(injector: any, element: any, kind: TimerKind, value: string | undefined): void {
  const timer = timerOf(element);
  // Выражение остаётся и без значения: по нему видно выбранный тип (пустую дату покажет линтер)
  const expression = injector.get('bpmnFactory').create('bpmn:FormalExpression', { body: value });
  expression.$parent = timer;
  const other: TimerKind = kind === 'timeDate' ? 'timeDuration' : 'timeDate';
  injector.get('commandStack').execute('element.updateModdleProperties', {
    element,
    moddleElement: timer,
    // timeCycle go-bpm не поддерживает: при правке таймера он удаляется
    properties: { [kind]: expression, [other]: undefined, timeCycle: undefined },
  });
}

function timerGroup(): PanelGroup {
  return group('gobpm-timer', 'Таймер', [
    select({
      id: 'gobpm-timer-type',
      label: 'Тип',
      accessor: {
        get: (element) => timerKind(timerOf(element)),
        set: (element, injector, kind) => {
          const timer = timerOf(element);
          const value = timer.get(timerKind(timer))?.get('body');
          setTimer(injector, element, (kind as TimerKind) ?? 'timeDuration', value);
        },
      },
      options: () => [
        { value: 'timeDuration', label: 'Длительность' },
        { value: 'timeDate', label: 'Дата' },
      ],
    }),
    textField({
      id: 'gobpm-timer-value',
      label: 'Значение',
      description: 'Длительность ISO 8601: PT30S, PT1H30M, P1D (без лет и месяцев). Дата RFC 3339 с зоной: 2026-12-01T09:00:00+03:00 или =переменная',
      accessor: {
        get: (element) => {
          const timer = timerOf(element);
          return timer.get(timerKind(timer))?.get('body');
        },
        set: (element, injector, value) => setTimer(injector, element, timerKind(timerOf(element)), value),
      },
    }),
  ]);
}

// --- условие перехода ---

function isGatewayFlow(element: any): boolean {
  return is(element, 'bpmn:SequenceFlow') && is(getBusinessObject(element).get('sourceRef'), 'bpmn:ExclusiveGateway');
}

function isDefaultFlow(element: any): boolean {
  const bo = getBusinessObject(element);
  return bo.get('sourceRef')?.get('default') === bo;
}

function conditionGroup(): PanelGroup {
  return group('gobpm-condition', 'Условие', [
    textArea({
      id: 'gobpm-condition-expression',
      label: 'Выражение',
      description: 'FEEL или Go над переменными: amount > 1000, status == "new", approved and not(blocked)',
      monospace: true,
      rows: 2,
      accessor: {
        get: (element) => getBusinessObject(element).get('conditionExpression')?.get('body'),
        set: (element, injector, value) => {
          const expression =
            value === undefined ? undefined : injector.get('bpmnFactory').create('bpmn:FormalExpression', { body: value });
          if (expression) {
            expression.$parent = getBusinessObject(element);
          }
          injector.get('modeling').updateProperties(element, { conditionExpression: expression });
        },
      },
    }),
  ]);
}

// --- провайдер ---

// Группы и поля создаются один раз: компоненты полей должны быть одними и теми же функциями между отрисовками.
// Новая функция - для preact новый компонент: поле перемонтируется и теряет ещё не записанный ввод
const GROUPS = {
  serviceTask: serviceTaskGroup(),
  aiTask: aiTaskGroup(),
  scriptTask: scriptTaskGroup(),
  businessRuleTask: businessRuleTaskGroup(),
  callActivity: callActivityGroup(),
  userTask: userTaskGroups(),
  timer: timerGroup(),
  condition: conditionGroup(),
};
const CORRELATION_KEY = correlationKeyEntry();

function goBpmGroups(element: any): PanelGroup[] {
  if (is(element, 'bpmn:ServiceTask')) {
    return [isAiTask(element) ? GROUPS.aiTask : GROUPS.serviceTask];
  }
  if (is(element, 'bpmn:ScriptTask')) {
    return [GROUPS.scriptTask];
  }
  if (is(element, 'bpmn:BusinessRuleTask')) {
    return [GROUPS.businessRuleTask];
  }
  if (is(element, 'bpmn:CallActivity')) {
    return [GROUPS.callActivity];
  }
  if (is(element, 'bpmn:UserTask')) {
    return GROUPS.userTask;
  }
  if (timerOf(element)) {
    return [GROUPS.timer];
  }
  if (isGatewayFlow(element) && !isDefaultFlow(element)) {
    return [GROUPS.condition];
  }
  return [];
}

export class GoBpmPropertiesProvider {
  static $inject = ['propertiesPanel'];

  constructor(propertiesPanel: any) {
    // Ниже стандартного провайдера (1000): получаем уже собранные им группы
    propertiesPanel.registerProvider(500, this);
  }

  getGroups(element: any) {
    return (groups: PanelGroup[]): PanelGroup[] => {
      const result = groups.filter((g) => !HIDDEN_GROUPS.has(g.id));
      for (const g of result) {
        g.entries = g.entries.filter((entry) => !HIDDEN_ENTRIES.has(entry.id));
        if (g.id === 'message' && messageOf(element)) {
          g.entries.push(CORRELATION_KEY);
        }
      }
      // Свои группы - сразу после «Общее»
      const general = result.findIndex((g) => g.id === 'general');
      result.splice(general + 1, 0, ...goBpmGroups(element));
      return result;
    };
  }
}
