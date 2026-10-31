import DmnModeler from 'dmn-js/lib/Modeler';

import { Editor, Services, warningMessages } from '../editor';

export class DmnEditor implements Editor {
  readonly element: HTMLElement;
  private modeler: any;
  private listeners: Array<() => void> = [];
  // Вьюеры (DRD, таблицы решений), на изменения которых уже подписались
  private watched = new WeakSet<object>();

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'editor editor-dmn';
    this.modeler = new DmnModeler({ container: this.element });

    // У dmn-js у каждого представления свой commandStack: подписываемся на каждое при первом показе
    this.modeler.on('views.changed', () => this.watchActiveViewer());
  }

  async open(xml: string): Promise<string[]> {
    const { warnings } = await this.modeler.importXML(xml);
    this.watchActiveViewer();
    return warningMessages(warnings);
  }

  async save(): Promise<string> {
    const { xml } = await this.modeler.saveXML({ format: true });
    return xml;
  }

  onChange(listener: () => void): void {
    this.listeners.push(listener);
  }

  services(): Services | undefined {
    return this.modeler.getActiveViewer();
  }

  onViewChange(listener: () => void): void {
    this.modeler.on('views.changed', listener);
  }

  destroy(): void {
    this.modeler.destroy();
  }

  private watchActiveViewer(): void {
    const viewer = this.modeler.getActiveViewer();
    if (!viewer || this.watched.has(viewer)) {
      return;
    }
    this.watched.add(viewer);
    viewer.on('elements.changed', () => this.listeners.forEach((listener) => listener()));
  }
}
