import DmnModeler from 'dmn-js/lib/Modeler';

import { Editor, Services, warningMessages } from '../editor';
import translate from '../translate';
import { Issue, lintDmn } from './lint';
import { DATA_TYPES, drdRestrictions } from './restrictions';

export class DmnEditor implements Editor {
  readonly element: HTMLElement;
  private modeler: any;
  private listeners: Array<() => void> = [];
  // Вьюеры (DRD, таблицы решений), на изменения которых уже подписались
  private watched = new WeakSet<object>();
  private issues: Issue[] = [];
  private lintButton: HTMLButtonElement;
  private lintList: HTMLElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'editor editor-dmn';
    // Модули - в каждое представление: additionalModules из common dmn-js затирает своим списком
    this.modeler = new DmnModeler({
      container: this.element,
      drd: { additionalModules: [translate, drdRestrictions] },
      decisionTable: { additionalModules: [translate], dataTypes: DATA_TYPES },
      literalExpression: { additionalModules: [translate] },
    });

    // Линтер: счётчик внизу, по щелчку - список проблем
    this.lintButton = document.createElement('button');
    this.lintButton.className = 'dmn-lint-button';
    this.lintList = document.createElement('ul');
    this.lintList.className = 'dmn-lint-list';
    this.lintList.hidden = true;
    this.lintButton.addEventListener('click', () => {
      this.lintList.hidden = !this.lintList.hidden || this.issues.length === 0;
    });
    this.element.append(this.lintList, this.lintButton);

    // У dmn-js у каждого представления свой commandStack: подписываемся на каждое при первом показе
    this.modeler.on('views.changed', () => {
      this.watchActiveViewer();
      this.lint();
    });
  }

  async open(xml: string): Promise<string[]> {
    const { warnings } = await this.modeler.importXML(xml);
    this.watchActiveViewer();
    this.lint();
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
    viewer.on('elements.changed', () => {
      this.listeners.forEach((listener) => listener());
      this.lint();
    });
  }

  private lint(): void {
    this.issues = lintDmn(this.modeler.getDefinitions());
    const errors = this.issues.filter((i) => i.level === 'error').length;
    const warnings = this.issues.length - errors;
    this.lintButton.textContent = this.issues.length ? `Ошибок: ${errors}, предупреждений: ${warnings}` : 'Проблем нет';
    this.lintButton.dataset.state = errors ? 'error' : warnings ? 'warn' : 'ok';
    this.renderList();
    // Таблица перерисовывается после изменения: маркеры ставим, когда она уже в DOM
    setTimeout(() => this.renderMarkers(), 0);
  }

  private renderList(): void {
    if (this.issues.length === 0) {
      this.lintList.hidden = true;
    }
    this.lintList.replaceChildren(
      ...this.issues.map((issue) => {
        const item = document.createElement('li');
        item.className = `dmn-lint-item dmn-lint-${issue.level}`;
        item.textContent = issue.message;
        item.addEventListener('click', () => this.reveal(issue));
        return item;
      }),
    );
  }

  /** Переход к проблеме: таблица её решения или схема DRD */
  private async reveal(issue: Issue): Promise<void> {
    const views: any[] = this.modeler.getViews();
    const view = issue.decisionId
      ? views.find((v) => v.type === 'decisionTable' && v.element.id === issue.decisionId)
      : views.find((v) => v.type === 'drd');
    if (view && view !== this.modeler.getActiveView()) {
      await this.modeler.open(view);
    }
    this.lintList.hidden = true;
    setTimeout(() => {
      this.renderMarkers();
      const node = this.element.querySelector(`[data-element-id="${CSS.escape(issue.id)}"]`);
      node?.scrollIntoView({ block: 'center', inline: 'nearest' });
    }, 0);
  }

  private renderMarkers(): void {
    for (const node of this.element.querySelectorAll('.gobpm-dmn-issue')) {
      node.classList.remove('gobpm-dmn-issue', 'gobpm-dmn-error', 'gobpm-dmn-warn');
      node.removeAttribute('title');
    }
    const view = this.modeler.getActiveView();
    const viewer = this.modeler.getActiveViewer();
    if (!view || !viewer) {
      return;
    }
    if (view.type === 'decisionTable') {
      for (const issue of this.issues.filter((i) => i.decisionId === view.element.id)) {
        const node = this.element.querySelector(`[data-element-id="${CSS.escape(issue.id)}"]`);
        if (node) {
          node.classList.add('gobpm-dmn-issue', `gobpm-dmn-${issue.level}`);
          node.setAttribute('title', issue.message);
        }
      }
    } else if (view.type === 'drd') {
      // Маркер у решения, все его проблемы - в подсказке
      const overlays = viewer.get('overlays');
      const registry = viewer.get('elementRegistry');
      overlays.remove({ type: 'gobpm-lint' });
      const byElement = new Map<string, Issue[]>();
      for (const issue of this.issues) {
        const id = issue.decisionId ?? issue.id;
        byElement.set(id, [...(byElement.get(id) ?? []), issue]);
      }
      for (const [id, list] of byElement) {
        if (!registry.get(id)) {
          continue;
        }
        const level = list.some((i) => i.level === 'error') ? 'error' : 'warn';
        const marker = document.createElement('div');
        marker.className = `gobpm-dmn-marker gobpm-dmn-marker-${level}`;
        marker.textContent = level === 'error' ? '✕' : '!';
        marker.title = list.map((i) => i.message).join('\n');
        overlays.add(id, 'gobpm-lint', { position: { top: -8, left: -8 }, html: marker });
      }
    }
  }
}
