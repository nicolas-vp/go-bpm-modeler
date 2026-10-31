// Панель инструментов: файлы, сохранение, правка, масштаб, цвет. Действия правки вызываются через editorActions
// активного представления, поэтому кнопки сами становятся недоступны там, где действия нет (таблица решений DMN)
import {
  BookOpen,
  ClipboardPaste,
  Copy,
  createElement,
  FilePlus,
  FolderOpen,
  Palette,
  Redo2,
  Save,
  Scissors,
  Undo2,
  ZoomIn,
  ZoomOut,
  type IconNode,
} from 'lucide';

import { openExternal, type Kind } from './backend';

const DOCS_URL = 'https://go-bpm.tech/docs/';
import type { Editor, Services } from './editor';

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

export interface ToolbarHandlers {
  chooseWorkspace(): Promise<void> | void;
  newFile(kind: Kind): Promise<void> | void;
  save(): Promise<void> | void;
  error(err: unknown): void;
}

interface Color {
  label: string;
  fill?: string;
  stroke?: string;
}

// Палитра bpmn-js-color-picker: светлая заливка и тёмная обводка того же тона
const COLORS: Color[] = [
  { label: 'По умолчанию' },
  { label: 'Синий', fill: '#bbdefb', stroke: '#0d4372' },
  { label: 'Оранжевый', fill: '#ffe0b2', stroke: '#6b3c00' },
  { label: 'Зелёный', fill: '#c8e6c9', stroke: '#205022' },
  { label: 'Красный', fill: '#ffcdd2', stroke: '#831311' },
  { label: 'Фиолетовый', fill: '#e1bee7', stroke: '#5b176d' },
];

// События, после которых меняется доступность кнопок правки
const STATE_EVENTS = ['commandStack.changed', 'selection.changed', 'copyPaste.elementsCopied', 'import.done'];

/** Действие правки: доступно ли в представлении, можно ли выполнить сейчас, как выполнить */
interface EditAction {
  available(s: Services): boolean;
  enabled(s: Services): boolean;
  run(s: Services): void;
}

const registered = (s: Services, action: string) => !!s.get('editorActions', false)?.isRegistered(action);
const selected = (s: Services): any[] => s.get('selection', false)?.get() ?? [];
const trigger = (action: string, opts?: unknown) => (s: Services) => s.get('editorActions').trigger(action, opts);
// copy/cut/paste diagram-js; у таблицы решений свои действия с теми же именами, но они требуют строку или колонку
const hasCopyPaste = (s: Services, action: string) => !!s.get('copyPaste', false) && registered(s, action);

const EDIT_ACTIONS: Record<string, EditAction> = {
  undo: {
    available: (s) => registered(s, 'undo'),
    enabled: (s) => s.get('commandStack').canUndo(),
    run: trigger('undo'),
  },
  redo: {
    available: (s) => registered(s, 'redo'),
    enabled: (s) => s.get('commandStack').canRedo(),
    run: trigger('redo'),
  },
  copy: {
    available: (s) => hasCopyPaste(s, 'copy'),
    enabled: (s) => selected(s).length > 0,
    run: trigger('copy'),
  },
  cut: {
    available: (s) => hasCopyPaste(s, 'cut'),
    enabled: (s) => selected(s).length > 0,
    run: trigger('cut'),
  },
  paste: {
    available: (s) => hasCopyPaste(s, 'paste'),
    enabled: (s) => !s.get('clipboard').isEmpty(),
    // Вставленные элементы следуют за курсором, щелчок по холсту ставит их
    run: trigger('paste'),
  },
  zoomIn: {
    available: (s) => registered(s, 'stepZoom'),
    enabled: () => true,
    run: trigger('stepZoom', { value: 1 }),
  },
  zoomOut: {
    available: (s) => registered(s, 'stepZoom'),
    enabled: () => true,
    run: trigger('stepZoom', { value: -1 }),
  },
  color: {
    available: (s) => typeof s.get('modeling', false)?.setColor === 'function',
    enabled: (s) => selected(s).length > 0,
    run: () => {},
  },
};

export class Toolbar {
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly colorMenu: HTMLElement;
  private editor?: Editor;
  private eventBus?: any;
  private readonly watchedEditors = new WeakSet<Editor>();
  private readonly refresh = () => this.update();

  constructor(
    root: HTMLElement,
    private readonly handlers: ToolbarHandlers,
  ) {
    const call = (fn: () => Promise<void> | void) => async () => {
      try {
        await fn();
      } catch (err) {
        handlers.error(err);
      }
    };

    this.colorMenu = this.createColorMenu();
    root.append(
      this.group(
        this.button('workspace', FolderOpen, 'Рабочая папка', call(handlers.chooseWorkspace), 'Папка'),
        this.button('new-bpmn', FilePlus, 'Новый BPMN', call(() => handlers.newFile('bpmn')), 'BPMN'),
        this.button('new-dmn', FilePlus, 'Новый DMN', call(() => handlers.newFile('dmn')), 'DMN'),
      ),
      this.group(this.button('save', Save, `Сохранить (${MOD}S)`, call(handlers.save))),
      this.group(
        this.editButton('undo', Undo2, `Отменить (${MOD}Z)`),
        this.editButton('redo', Redo2, `Вернуть (${MOD}Shift+Z)`),
        this.editButton('copy', Copy, `Копировать (${MOD}C)`),
        this.editButton('cut', Scissors, `Вырезать (${MOD}X)`),
        this.editButton('paste', ClipboardPaste, `Вставить (${MOD}V)`),
      ),
      this.group(
        this.editButton('zoomIn', ZoomIn, `Увеличить (${MOD}+)`),
        this.editButton('zoomOut', ZoomOut, `Уменьшить (${MOD}-)`),
      ),
      this.group(this.button('color', Palette, 'Цвет элемента', () => this.toggleColorMenu())),
      this.colorMenu,
      this.group(this.button('docs', BookOpen, DOCS_URL, () => openExternal(DOCS_URL), 'Документация')),
    );
    // Последняя группа - справа
    root.lastElementChild!.classList.add('tool-group-end');
    this.setEditor(undefined);
    this.setSaveEnabled(false);
  }

  /** Подключает панель к редактору активной вкладки; undefined - вкладок нет */
  setEditor(editor: Editor | undefined): void {
    this.editor = editor;
    if (editor && !this.watchedEditors.has(editor)) {
      this.watchedEditors.add(editor);
      editor.onViewChange(() => {
        if (this.editor === editor) {
          this.attach();
        }
      });
    }
    this.attach();
  }

  setSaveEnabled(enabled: boolean): void {
    this.buttons.get('save')!.disabled = !enabled;
  }

  private attach(): void {
    this.eventBus?.off(STATE_EVENTS, this.refresh);
    this.eventBus = this.editor?.services()?.get('eventBus', false);
    this.eventBus?.on(STATE_EVENTS, this.refresh);
    this.update();
  }

  private update(): void {
    const services = this.editor?.services();
    for (const [id, action] of Object.entries(EDIT_ACTIONS)) {
      const ok = !!services && action.available(services) && action.enabled(services);
      this.buttons.get(id)!.disabled = !ok;
    }
    if (this.buttons.get('color')!.disabled) {
      this.colorMenu.hidden = true;
    }
  }

  private editButton(id: string, icon: IconNode, title: string): HTMLButtonElement {
    return this.button(id, icon, title, () => {
      const services = this.editor?.services();
      if (!services) {
        return;
      }
      try {
        EDIT_ACTIONS[id].run(services);
      } catch (err) {
        this.handlers.error(err);
      }
      this.update();
    });
  }

  private button(id: string, icon: IconNode, title: string, onClick: () => void, label?: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'tool';
    button.dataset.tool = id;
    button.title = title;
    button.append(createElement(icon, { width: 16, height: 16 }));
    if (label) {
      const text = document.createElement('span');
      text.textContent = label;
      button.append(text);
    }
    // Кнопка не забирает фокус у холста: после щелчка продолжают работать клавиши редактора
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', onClick);
    this.buttons.set(id, button);
    return button;
  }

  private group(...buttons: HTMLElement[]): HTMLElement {
    const group = document.createElement('div');
    group.className = 'tool-group';
    group.append(...buttons);
    return group;
  }

  private createColorMenu(): HTMLElement {
    const menu = document.createElement('div');
    menu.className = 'color-menu';
    menu.hidden = true;
    for (const color of COLORS) {
      const swatch = document.createElement('button');
      swatch.className = 'color-swatch';
      swatch.dataset.color = color.label;
      swatch.title = color.label;
      swatch.style.background = color.fill ?? 'var(--bg)';
      swatch.style.borderColor = color.stroke ?? 'var(--text)';
      if (!color.fill) {
        swatch.classList.add('color-swatch-default');
      }
      swatch.addEventListener('mousedown', (event) => event.preventDefault());
      swatch.addEventListener('click', () => this.applyColor(color));
      menu.append(swatch);
    }
    document.addEventListener('mousedown', (event) => {
      const target = event.target as Node;
      if (!menu.contains(target) && !this.buttons.get('color')!.contains(target)) {
        menu.hidden = true;
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        menu.hidden = true;
      }
    });
    return menu;
  }

  private toggleColorMenu(): void {
    if (!this.colorMenu.hidden) {
      this.colorMenu.hidden = true;
      return;
    }
    const button = this.buttons.get('color')!;
    this.colorMenu.style.left = `${button.offsetLeft}px`;
    this.colorMenu.hidden = false;
  }

  private applyColor(color: Color): void {
    this.colorMenu.hidden = true;
    const services = this.editor?.services();
    if (!services) {
      return;
    }
    const elements = selected(services);
    if (elements.length === 0) {
      return;
    }
    // Без цветов setColor сбрасывает заливку и обводку к стандартным
    const colors = color.fill ? { fill: color.fill, stroke: color.stroke } : undefined;
    try {
      services.get('modeling').setColor(elements, colors);
    } catch (err) {
      this.handlers.error(err);
    }
  }
}
