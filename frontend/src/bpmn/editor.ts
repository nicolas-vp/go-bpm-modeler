import BpmnModeler from 'bpmn-js/lib/Modeler';
import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule } from 'bpmn-js-properties-panel';

import { Editor, Problem, Services, warningMessages } from '../editor';
import { describeBpmn, describeElement } from './describe';
import aiTask from './aiTask';
import gobpm from './gobpm.json';
import linting, { lintOptions } from './lint';
import modelingRules from './modelingRules';
import properties from './properties';
import restrictions from './restrictions';
import translate from '../translate';

export class BpmnEditor implements Editor {
  readonly element: HTMLElement;
  private modeler: any;
  // Последний результат линтера: bpmn-js-bpmnlint проверяет схему после каждой правки
  private lintIssues: Problem[] = [];

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'editor editor-bpmn';

    const canvas = document.createElement('div');
    canvas.className = 'editor-canvas';
    const panel = document.createElement('div');
    panel.className = 'editor-properties';
    this.element.append(canvas, panel);

    const options: any = {
      container: canvas,
      propertiesPanel: { parent: panel },
      additionalModules: [
        BpmnPropertiesPanelModule,
        BpmnPropertiesProviderModule,
        properties,
        restrictions,
        modelingRules,
        aiTask,
        linting,
        translate,
      ],
      linting: lintOptions,
      moddleExtensions: { gobpm },
    };
    this.modeler = new BpmnModeler(options);
    this.modeler.on('linting.completed', ({ issues }: { issues: Record<string, Array<{ message: string; category: string }>> }) => {
      this.lintIssues = Object.entries(issues).flatMap(([id, list]) =>
        list.map((issue) => ({ id, level: issue.category === 'error' ? 'error' : 'warn', message: issue.message }) as Problem),
      );
    });
  }

  async open(xml: string): Promise<string[]> {
    const { warnings } = await this.modeler.importXML(xml);
    this.modeler.get('canvas').zoom('fit-viewport', 'auto');
    return warningMessages(warnings);
  }

  async save(): Promise<string> {
    const { xml } = await this.modeler.saveXML({ format: true });
    return xml;
  }

  onChange(listener: () => void): void {
    this.modeler.on('commandStack.changed', listener);
  }

  services(): Services {
    return this.modeler;
  }

  // У BPMN одно представление
  onViewChange(): void {}

  destroy(): void {
    this.modeler.destroy();
  }

  describe(): unknown {
    return describeBpmn(this.modeler);
  }

  problems(): Problem[] {
    return this.lintIssues;
  }

  selection(): unknown[] {
    return this.modeler.get('selection').get().map(describeElement);
  }

  async replace(xml: string): Promise<string[]> {
    // Сначала разбор отдельно: неудачный importXML очистил бы схему пользователя
    await this.modeler.get('moddle').fromXML(xml, 'bpmn:Definitions');
    const canvas = this.modeler.get('canvas');
    const viewbox = canvas.viewbox();
    const { warnings } = await this.modeler.importXML(xml);
    // Пользователь остаётся там, где смотрел
    canvas.viewbox({ x: viewbox.x, y: viewbox.y, width: viewbox.width, height: viewbox.height });
    return warningMessages(warnings);
  }
}
