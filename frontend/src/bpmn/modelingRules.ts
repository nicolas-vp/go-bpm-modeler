// Правила рисования под go-bpm: редактор не даёт сделать то, что генератор отвергнет. Линтер (lint/rules.ts)
// проверяет то же в файлах, нарисованных в других редакторах. Правила возвращают false - запрет, undefined - решает
// bpmn-js

import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';
import { getBoundaryAttachment } from 'bpmn-js/lib/features/snapping/BpmnSnappingUtil';
import { getBusinessObject, is } from 'bpmn-js/lib/util/ModelUtil';

import { ERROR_TARGETS, exactly, FORKS, TIMER_TARGETS } from './lint/rules';

// Выше BpmnRules (1000)
const PRIORITY = 1500;

type Shape = any;

/** Определение события, которое станет граничным: timer, error или прочее */
function boundaryKind(shape: Shape): 'timer' | 'error' | 'other' {
  const definitions = getBusinessObject(shape).get('eventDefinitions') ?? [];
  if (definitions.length !== 1) {
    return 'other';
  }
  if (is(definitions[0], 'bpmn:TimerEventDefinition')) {
    return 'timer';
  }
  return is(definitions[0], 'bpmn:ErrorEventDefinition') ? 'error' : 'other';
}

const isEvent = (shape: Shape) =>
  is(shape, 'bpmn:BoundaryEvent') || is(shape, 'bpmn:IntermediateCatchEvent') || is(shape, 'bpmn:IntermediateThrowEvent');

/**
 * Прикрепление события к краю элемента: false - go-bpm такое граничное событие не поддерживает, undefined - это не
 * прикрепление или оно допустимо
 */
export function attachVerdict(shape: Shape, target: Shape, position?: { x: number; y: number }): false | undefined {
  if (!shape || !target || !isEvent(shape) || !is(target, 'bpmn:Activity')) {
    return undefined;
  }
  // Внутрь подпроцесса, а не на его край - не прикрепление
  if (position && !getBoundaryAttachment(position, target)) {
    return undefined;
  }
  return boundaryAllowed(boundaryKind(shape), target) ? undefined : false;
}

/** Поддерживает ли go-bpm граничное событие вида kind у элемента host */
export function boundaryAllowed(kind: 'timer' | 'error' | 'other', host: Shape): boolean {
  const bo = getBusinessObject(host);
  switch (kind) {
    case 'timer':
      // Таймер у элемента с циклом ограничивал бы весь цикл, а не одно выполнение
      return exactly(bo, TIMER_TARGETS) && !bo.get('loopCharacteristics');
    case 'error':
      return exactly(bo, ERROR_TARGETS);
    default:
      return false;
  }
}

/** Задача или событие уже имеет исходящий переход: разветвление в go-bpm - только шлюзом */
export function hasSingleOutgoing(source: Shape, except?: Shape): boolean {
  if (!is(source, 'bpmn:FlowNode') || is(source, 'bpmn:Gateway') || FORKS.some((type) => is(source, type))) {
    return false;
  }
  return (source.outgoing ?? []).some((c: Shape) => c !== except && is(c, 'bpmn:SequenceFlow'));
}

/** Подпроцесс внутри подпроцесса: go-bpm предлагает вынести вложенный в call activity */
function isNestedSubProcess(shapes: Shape[], target: Shape): boolean {
  if (!shapes.some((s) => is(s, 'bpmn:SubProcess'))) {
    return false;
  }
  for (let parent = target; parent; parent = parent.parent) {
    if (is(parent, 'bpmn:SubProcess')) {
      return true;
    }
  }
  return false;
}

class GoBpmModelingRules extends RuleProvider {
  static $inject = ['eventBus'];

  init(): void {
    this.addRule('shape.attach', PRIORITY, ({ shape, target, position }: any) => attachVerdict(shape, target, position));

    this.addRule('elements.move', PRIORITY, ({ shapes, target, position }: any) => {
      if (shapes.length === 1 && attachVerdict(shapes[0], target, position) === false) {
        return false;
      }
      return isNestedSubProcess(shapes, target) ? false : undefined;
    });

    this.addRule(['shape.create', 'elements.create'], PRIORITY, ({ shape, elements, target }: any) =>
      isNestedSubProcess(elements ?? [shape], target) ? false : undefined,
    );

    // Второй исходящий переход у задачи или события. Ассоциация к аннотации - не переход, её не трогаем
    this.addRule('connection.create', PRIORITY, ({ source, target }: any) =>
      is(target, 'bpmn:FlowNode') && hasSingleOutgoing(source) ? false : undefined,
    );
    this.addRule('connection.reconnect', PRIORITY, ({ connection, source }: any) =>
      is(connection, 'bpmn:SequenceFlow') && source !== connection.source && hasSingleOutgoing(source, connection)
        ? false
        : undefined,
    );
  }
}

/** Контекстное меню: у задачи и события с исходящим переходом нет пунктов «добавить следующий» */
class ContextPadRestrictions {
  static $inject = ['contextPad'];

  constructor(contextPad: any) {
    contextPad.registerProvider(500, this);
  }

  getContextPadEntries(element: Shape) {
    return (entries: Record<string, any>) => {
      if (!hasSingleOutgoing(element)) {
        return entries;
      }
      const result: Record<string, any> = {};
      for (const [id, entry] of Object.entries(entries)) {
        if (!id.startsWith('append.') || id === 'append.text-annotation') {
          result[id] = entry;
        }
      }
      return result;
    };
  }
}

export default {
  __init__: ['goBpmModelingRules', 'goBpmContextPadRestrictions'],
  goBpmModelingRules: ['type', GoBpmModelingRules],
  goBpmContextPadRestrictions: ['type', ContextPadRestrictions],
};
