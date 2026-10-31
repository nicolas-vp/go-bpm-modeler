// Чтение и запись расширений gobpm:* в extensionElements элемента BPMN через commandStack: каждая правка в панели
// свойств - одна команда, Ctrl+Z отменяет её целиком

import { is } from 'bpmn-js/lib/util/ModelUtil';

type Moddle = any;

export function extensionValues(target: Moddle): Moddle[] {
  return target.get('extensionElements')?.get('values') ?? [];
}

/** Первое расширение типа type ('gobpm:TaskDefinition') у target или undefined */
export function getExtension(target: Moddle, type: string): Moddle | undefined {
  return extensionValues(target).find((value) => is(value, type));
}

/** Значение атрибута расширения; undefined, если расширения или атрибута нет */
export function getExtensionAttr(target: Moddle, type: string, attr: string): any {
  const extension = getExtension(target, type);
  // Только явно заданные значения: у moddle get() возвращает default из дескриптора
  return extension && Object.prototype.hasOwnProperty.call(extension, attr) ? extension[attr] : undefined;
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/** Явно заданные атрибуты расширения */
export function ownAttrs(extension: Moddle): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  for (const property of extension.$descriptor.properties) {
    if (Object.prototype.hasOwnProperty.call(extension, property.name)) {
      attrs[property.name] = extension[property.name];
    }
  }
  return attrs;
}

/**
 * Меняет атрибуты расширения type у target (сам элемент или, например, его bpmn:Message). Пустое значение удаляет
 * атрибут; расширение без атрибутов удаляется, если не задан keepEmpty (расширение-метка, как gobpm:aiTask).
 * extensionElements создаются при необходимости
 */
export function updateExtension(
  injector: any,
  element: any,
  target: Moddle,
  type: string,
  attrs: Record<string, unknown>,
  keepEmpty = false,
): void {
  const bpmnFactory = injector.get('bpmnFactory');
  const commandStack = injector.get('commandStack');
  const update = (moddleElement: Moddle, properties: Record<string, unknown>) => ({
    cmd: 'element.updateModdleProperties',
    context: { element, moddleElement, properties },
  });

  const normalized: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(attrs)) {
    normalized[name] = isEmpty(value) ? undefined : value;
  }

  const commands = [];
  let extensionElements = target.get('extensionElements');
  const extension = getExtension(target, type);

  if (extension) {
    const merged = { ...ownAttrs(extension), ...normalized };
    if (!keepEmpty && Object.values(merged).every(isEmpty)) {
      const values = extensionElements.get('values').filter((value: Moddle) => value !== extension);
      commands.push(update(extensionElements, { values }));
    } else {
      commands.push(update(extension, normalized));
    }
  } else {
    const defined = Object.fromEntries(Object.entries(normalized).filter(([, value]) => !isEmpty(value)));
    if (!keepEmpty && Object.keys(defined).length === 0) {
      return;
    }
    if (!extensionElements) {
      extensionElements = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
      extensionElements.$parent = target;
      commands.push(update(target, { extensionElements }));
    }
    const created = bpmnFactory.create(type, defined);
    created.$parent = extensionElements;
    commands.push(update(extensionElements, { values: [...extensionElements.get('values'), created] }));
  }

  commandStack.execute('properties-panel.multi-command-executor', commands);
}
