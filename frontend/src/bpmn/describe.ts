// Схема BPMN в виде списка для AI-агента (MCP describe_diagram, get_selection): элементы с типами, именами,
// настройками go-bpm, событиями и переходами. Компактнее XML и без координат

import { getBusinessObject, is } from 'bpmn-js/lib/util/ModelUtil';

import { isAiTask } from './aiTask';
import { ownAttrs } from './properties/extensions';

type Shape = any;

const short = (type: string) => type.replace(/^bpmn:|^gobpm:/, '');
const body = (expression: any) => expression?.get('body');

function eventDefinition(definition: any): Record<string, unknown> {
  const result: Record<string, unknown> = { type: short(definition.$type) };
  if (is(definition, 'bpmn:TimerEventDefinition')) {
    result.timeDuration = body(definition.get('timeDuration'));
    result.timeDate = body(definition.get('timeDate'));
    result.timeCycle = body(definition.get('timeCycle'));
  }
  if (is(definition, 'bpmn:MessageEventDefinition')) {
    result.message = definition.get('messageRef')?.get('name');
  }
  if (is(definition, 'bpmn:ErrorEventDefinition')) {
    const error = definition.get('errorRef');
    result.error = error ? { name: error.get('name'), errorCode: error.get('errorCode') } : 'любая';
  }
  return result;
}

/** Расширения gobpm:* (и чужие, например zeebe:*) элемента: тип -> явно заданные атрибуты */
function extensions(target: any): Record<string, unknown> | undefined {
  const values: any[] = target?.get('extensionElements')?.get('values') ?? [];
  if (values.length === 0) {
    return undefined;
  }
  return Object.fromEntries(values.map((v) => [v.$type, v.$descriptor ? ownAttrs(v) : {}]));
}

export function describeElement(element: Shape): Record<string, unknown> {
  const bo = getBusinessObject(element);
  const result: Record<string, unknown> = { id: bo.id, type: short(bo.$type) };
  if (bo.name) {
    result.name = bo.name;
  }
  if (isAiTask(element)) {
    result.type = 'ServiceTask (AI task)';
  }
  if (element.parent && is(element.parent, 'bpmn:SubProcess')) {
    result.parent = element.parent.id;
  }
  if (element.waypoints) {
    result.source = element.source?.id;
    result.target = element.target?.id;
    const condition = body(bo.get('conditionExpression'));
    if (condition) {
      result.condition = condition;
    }
    if (element.source?.businessObject?.get('default') === bo) {
      result.default = true;
    }
    return result;
  }
  if (element.host) {
    result.attachedTo = element.host.id;
    if (bo.get('cancelActivity') === false) {
      result.interrupting = false;
    }
  }
  const definitions: any[] = bo.get('eventDefinitions') ?? [];
  if (definitions.length) {
    result.eventDefinitions = definitions.map(eventDefinition);
  }
  if (is(bo, 'bpmn:ReceiveTask') && bo.get('messageRef')) {
    result.message = bo.get('messageRef').get('name');
  }
  const message = is(bo, 'bpmn:ReceiveTask') ? bo.get('messageRef') : definitions.find((d) => is(d, 'bpmn:MessageEventDefinition'))?.get('messageRef');
  const subscription = extensions(message);
  if (subscription) {
    result.messageExtensions = subscription;
  }
  const ext = extensions(bo);
  if (ext) {
    result.extensions = ext;
  }
  const loop = bo.get('loopCharacteristics');
  if (loop) {
    result.loop = is(loop, 'bpmn:MultiInstanceLoopCharacteristics')
      ? {
          type: 'multiInstance',
          sequential: !!loop.get('isSequential'),
          loopCardinality: body(loop.get('loopCardinality')),
          completionCondition: body(loop.get('completionCondition')),
        }
      : { type: short(loop.$type) };
  }
  if (is(bo, 'bpmn:Gateway') && bo.get('default')) {
    result.defaultFlow = bo.get('default').id;
  }
  return result;
}

export function describeBpmn(modeler: any): Record<string, unknown> {
  const registry = modeler.get('elementRegistry');
  const root = modeler.get('canvas').getRootElement();
  const definitions = modeler.getDefinitions();
  const processes = (definitions?.get('rootElements') ?? [])
    .filter((e: any) => is(e, 'bpmn:Process'))
    .map((p: any) => ({ id: p.id, name: p.name }));
  const elements = registry
    .getAll()
    .filter((e: Shape) => e !== root && !e.labelTarget && !is(e, 'bpmn:Process') && !is(e, 'bpmn:Collaboration'))
    .map(describeElement);
  return { kind: 'bpmn', processes, elements };
}
