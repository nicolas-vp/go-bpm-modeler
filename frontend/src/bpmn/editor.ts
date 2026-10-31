import BpmnModeler from 'bpmn-js/lib/Modeler';
import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule } from 'bpmn-js-properties-panel';

import { Editor, Services, warningMessages } from '../editor';
import gobpm from './gobpm.json';
import restrictions from './restrictions';

export class BpmnEditor implements Editor {
  readonly element: HTMLElement;
  private modeler: any;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'editor editor-bpmn';

    const canvas = document.createElement('div');
    canvas.className = 'editor-canvas';
    const properties = document.createElement('div');
    properties.className = 'editor-properties';
    this.element.append(canvas, properties);

    const options: any = {
      container: canvas,
      propertiesPanel: { parent: properties },
      additionalModules: [BpmnPropertiesPanelModule, BpmnPropertiesProviderModule, restrictions],
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
