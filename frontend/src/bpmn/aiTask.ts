// AI task: service task с расширением-меткой gobpm:aiTask и gobpm:taskDefinition type="ai".
// Пункт в палитре и меню замены (за флагом experimental.aiTask), своя иконка на холсте. Формат -
// docs/supported-elements.md, раздел «AI task»

import { Sparkles, type IconNode } from 'lucide';
import BaseRenderer from 'diagram-js/lib/draw/BaseRenderer';
import { append as svgAppend, attr as svgAttr, create as svgCreate } from 'tiny-svg';
import { black, getStrokeColor } from 'bpmn-js/lib/draw/BpmnRenderUtil';
import { getBusinessObject, is } from 'bpmn-js/lib/util/ModelUtil';

import { experimental } from '../config';
import { getExtension } from './properties/extensions';

const AI_JOB_TYPE = 'ai';

// Пункты палитры с задачами: AI task встаёт после последнего из них
const TASK_PALETTE_ENTRIES = ['create.task', 'create.service-task', 'create.script-task', 'create.user-task'];

// Задачи, которые можно заменить на AI task
const REPLACEABLE = [
  'bpmn:Task',
  'bpmn:ServiceTask',
  'bpmn:ScriptTask',
  'bpmn:BusinessRuleTask',
  'bpmn:UserTask',
  'bpmn:ReceiveTask',
  'bpmn:CallActivity',
];

export function isAiTask(element: any): boolean {
  return is(element, 'bpmn:ServiceTask') && !!getExtension(getBusinessObject(element), 'gobpm:AiTask');
}

// --- иконка ---

function iconChildren(node: IconNode): string {
  return node
    .map(([tag, attrs]) => {
      const list = Object.entries(attrs)
        .filter(([name]) => name !== 'key')
        .map(([name, value]) => `${name}="${value}"`)
        .join(' ');
      return `<${tag} ${list}/>`;
    })
    .join('');
}

/** Иконка палитры и меню замены: задача со «звёздочками» внутри */
const ICON_URL =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">` +
      `<rect x="2" y="5" width="28" height="22" rx="4" fill="none" stroke="${black}" stroke-width="1.6"/>` +
      `<g transform="translate(9 9) scale(0.58)" fill="none" stroke="${black}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${iconChildren(Sparkles)}</g>` +
      `</svg>`,
  );

// --- команды ---

/**
 * Включает или выключает у service task признак AI task одной составной командой. Включение: gobpm:taskDefinition
 * type="ai" и пустой gobpm:aiTask. Выключение удаляет gobpm:aiTask, taskDefinition остаётся
 */
function setAiTask(injector: any, element: any, enabled: boolean): void {
  const bpmnFactory = injector.get('bpmnFactory');
  const bo = getBusinessObject(element);
  const update = (moddleElement: any, properties: Record<string, unknown>) => ({
    cmd: 'element.updateModdleProperties',
    context: { element, moddleElement, properties },
  });

  const commands = [];
  let extensionElements = bo.get('extensionElements');
  if (!extensionElements) {
    if (!enabled) {
      return;
    }
    extensionElements = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
    extensionElements.$parent = bo;
    commands.push(update(bo, { extensionElements }));
  }

  let values = [...extensionElements.get('values')];
  if (enabled) {
    const definition = getExtension(bo, 'gobpm:TaskDefinition');
    if (definition) {
      commands.push(update(definition, { type: AI_JOB_TYPE }));
    } else {
      const created = bpmnFactory.create('gobpm:TaskDefinition', { type: AI_JOB_TYPE });
      created.$parent = extensionElements;
      values.push(created);
    }
    if (!getExtension(bo, 'gobpm:AiTask')) {
      const marker = bpmnFactory.create('gobpm:AiTask');
      marker.$parent = extensionElements;
      values.push(marker);
    }
  } else {
    values = values.filter((value) => !is(value, 'gobpm:AiTask'));
  }
  commands.push(update(extensionElements, { values }));
  injector.get('commandStack').execute('properties-panel.multi-command-executor', commands);
}

/** Замена задачи на AI task: тип service task и метки - один шаг отмены */
class ReplaceWithAiTaskHandler {
  static $inject = ['bpmnReplace', 'injector'];

  constructor(
    private bpmnReplace: any,
    private injector: any,
  ) {}

  // Вложенные команды из preExecute входят в ту же запись истории
  preExecute(context: { element: any; newElement?: any }): void {
    let element = context.element;
    if (!is(element, 'bpmn:ServiceTask')) {
      element = this.bpmnReplace.replaceElement(element, { type: 'bpmn:ServiceTask' });
    }
    setAiTask(this.injector, element, true);
    context.newElement = element;
  }

  execute(): any[] {
    return [];
  }

  revert(): any[] {
    return [];
  }
}

class UnsetAiTaskHandler {
  static $inject = ['injector'];

  constructor(private injector: any) {}

  preExecute(context: { element: any }): void {
    setAiTask(this.injector, context.element, false);
  }

  execute(): any[] {
    return [];
  }

  revert(): any[] {
    return [];
  }
}

class AiTaskCommands {
  static $inject = ['commandStack'];

  constructor(commandStack: any) {
    commandStack.registerHandler('gobpm.ai-task.replace', ReplaceWithAiTaskHandler);
    commandStack.registerHandler('gobpm.ai-task.unset', UnsetAiTaskHandler);
  }
}

// --- палитра и меню замены ---

class AiTaskPalette {
  static $inject = ['palette', 'create', 'elementFactory', 'bpmnFactory'];

  constructor(
    palette: any,
    private create: any,
    private elementFactory: any,
    private bpmnFactory: any,
  ) {
    // После ограничений палитры (500): добавляем пункт в уже отфильтрованный список
    palette.registerProvider(400, this);
  }

  getPaletteEntries() {
    return (entries: Record<string, any>) => {
      if (!experimental.aiTask) {
        return entries;
      }
      const start = (event: Event) => this.create.start(event, this.createShape());
      const entry = {
        group: 'activity',
        imageUrl: ICON_URL,
        title: 'AI task',
        action: { dragstart: start, click: start },
      };
      // После последнего пункта задач (обычная, сервисная, скриптовая, пользовательская)
      const ids = Object.keys(entries);
      const after = ids.filter((id) => TASK_PALETTE_ENTRIES.includes(id)).pop();
      const result: Record<string, any> = {};
      for (const id of ids) {
        result[id] = entries[id];
        if (id === after) {
          result['create.ai-task'] = entry;
        }
      }
      if (!after) {
        result['create.ai-task'] = entry;
      }
      return result;
    };
  }

  private createShape(): any {
    const bo = this.bpmnFactory.create('bpmn:ServiceTask');
    const extensionElements = this.bpmnFactory.create('bpmn:ExtensionElements');
    const definition = this.bpmnFactory.create('gobpm:TaskDefinition', { type: AI_JOB_TYPE });
    const marker = this.bpmnFactory.create('gobpm:AiTask');
    definition.$parent = extensionElements;
    marker.$parent = extensionElements;
    extensionElements.set('values', [definition, marker]);
    extensionElements.$parent = bo;
    bo.set('extensionElements', extensionElements);
    return this.elementFactory.createShape({ type: 'bpmn:ServiceTask', businessObject: bo });
  }
}

class AiTaskReplaceMenu {
  static $inject = ['popupMenu', 'commandStack'];

  constructor(
    popupMenu: any,
    private commandStack: any,
  ) {
    // После ограничений меню замены (500)
    popupMenu.registerProvider('bpmn-replace', 400, this);
  }

  getPopupMenuEntries(target: any) {
    return (entries: Record<string, any>) => {
      if (!REPLACEABLE.some((type) => is(target, type))) {
        return entries;
      }
      if (isAiTask(target)) {
        // У AI task тип уже service task, и bpmn-js не предлагает замену на него
        return {
          'replace-with-plain-service-task': {
            label: 'Сервисная задача',
            className: 'bpmn-icon-service-task',
            action: () => this.commandStack.execute('gobpm.ai-task.unset', { element: target }),
          },
          ...entries,
        };
      }
      if (!experimental.aiTask) {
        return entries;
      }
      return {
        ...entries,
        'replace-with-ai-task': {
          label: 'AI task',
          imageUrl: ICON_URL,
          action: () => this.commandStack.execute('gobpm.ai-task.replace', { element: target }),
        },
      };
    };
  }
}

// --- отрисовка ---

class AiTaskRenderer extends BaseRenderer {
  static $inject = ['eventBus', 'bpmnRenderer'];

  constructor(
    eventBus: any,
    private bpmnRenderer: any,
  ) {
    // Выше BpmnRenderer (1000)
    super(eventBus, 1500);
  }

  canRender(element: any): boolean {
    return !element.labelTarget && isAiTask(element);
  }

  drawShape(parentGfx: SVGElement, element: any, attrs?: any): SVGElement {
    // Обычная задача без шестерёнки service task, иконка - на её месте
    const shape = this.bpmnRenderer.handlers['bpmn:Task'](parentGfx, element, attrs);
    const icon = svgCreate('g');
    svgAttr(icon, {
      transform: 'translate(6 6) scale(0.75)',
      fill: 'none',
      stroke: getStrokeColor(element, black),
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    for (const [tag, nodeAttrs] of Sparkles) {
      const child = svgCreate(tag);
      svgAttr(child, nodeAttrs as Record<string, any>);
      svgAppend(icon, child);
    }
    svgAppend(parentGfx, icon);
    return shape;
  }

  getShapePath(shape: any): string {
    return this.bpmnRenderer.getShapePath(shape);
  }
}

export default {
  __init__: ['goBpmAiTaskCommands', 'goBpmAiTaskPalette', 'goBpmAiTaskReplaceMenu', 'goBpmAiTaskRenderer'],
  goBpmAiTaskCommands: ['type', AiTaskCommands],
  goBpmAiTaskPalette: ['type', AiTaskPalette],
  goBpmAiTaskReplaceMenu: ['type', AiTaskReplaceMenu],
  goBpmAiTaskRenderer: ['type', AiTaskRenderer],
};
