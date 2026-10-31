import BpmnModeler from 'bpmn-js/lib/Modeler';
import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule } from 'bpmn-js-properties-panel';

import { Editor, Services, warningMessages } from '../editor';
import aiTask from './aiTask';
import gobpm from './gobpm.json';
import properties from './properties';
import restrictions from './restrictions';
import translate from './translate';

export class BpmnEditor implements Editor {
  readonly element: HTMLElement;
  private modeler: any;

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
        aiTask,
        translate,
      ],
      moddleExtensions: { gobpm },
    };
    this.modeler = new BpmnModeler(options);
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
}
