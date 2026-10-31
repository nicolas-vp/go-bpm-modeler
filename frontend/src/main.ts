import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import '@bpmn-io/properties-panel/dist/assets/properties-panel.css';
import 'bpmn-js-bpmnlint/dist/assets/css/bpmn-js-bpmnlint.css';
import 'dmn-js/dist/assets/diagram-js.css';
import 'dmn-js/dist/assets/dmn-js-shared.css';
import 'dmn-js/dist/assets/dmn-js-drd.css';
import 'dmn-js/dist/assets/dmn-js-decision-table.css';
import 'dmn-js/dist/assets/dmn-js-decision-table-controls.css';
import 'dmn-js/dist/assets/dmn-js-literal-expression.css';
import 'dmn-js/dist/assets/dmn-font/css/dmn-embedded.css';
import './style.css';

import { backend, Kind, WorkspaceFile } from './backend';
import { BpmnEditor } from './bpmn/editor';
import { DmnEditor } from './dmn/editor';
import { Editor } from './editor';
import { initSidebarResizer } from './resizer';
import { newBpmn, newDmn } from './templates';
import { initMcpBridge } from './mcp';
import { McpPanel } from './mcpPanel';
import { Toolbar } from './toolbar';
import { refreshWorkspaceIndex } from './workspaceIndex';

interface Tab {
  path: string;
  editor: Editor;
  dirty: boolean;
  button: HTMLElement;
}

const tabs = new Map<string, Tab>();
let active: Tab | undefined;

const el = {
  workspacePath: document.getElementById('workspace-path')!,
  fileList: document.getElementById('file-list') as HTMLUListElement,
  tabs: document.getElementById('tabs')!,
  editors: document.getElementById('editors')!,
  empty: document.getElementById('empty')!,
  status: document.getElementById('status')!,
};

function status(message: string, error = false): void {
  el.status.textContent = message;
  el.status.classList.toggle('status-error', error);
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function kindOf(path: string): Kind {
  return path.toLowerCase().endsWith('.dmn') ? 'dmn' : 'bpmn';
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

// --- рабочая папка ---

async function showWorkspace(): Promise<void> {
  const root = await backend.workspace();
  // Путь обрезается слева (direction: rtl); метка LRM не даёт rtl перенести ведущий "/" в конец
  el.workspacePath.textContent = root ? `‎${root}` : 'Папка не выбрана';
  el.workspacePath.title = root;
  if (root) {
    await refreshFiles();
  }
}

async function refreshFiles(): Promise<void> {
  const [files] = await Promise.all([backend.listFiles(), refreshWorkspaceIndex()]);
  el.fileList.replaceChildren(...files.map(fileItem));
}

function fileItem(file: WorkspaceFile): HTMLLIElement {
  const item = document.createElement('li');
  item.className = `file file-${file.kind}`;
  item.textContent = file.path;
  item.title = file.path;
  item.classList.toggle('file-active', active?.path === file.path);
  item.addEventListener('click', () => openFile(file.path).catch((err) => status(errorText(err), true)));
  return item;
}

async function chooseWorkspace(): Promise<void> {
  if (dirtyTabs().length > 0 && !(await backend.confirm('Несохранённые изменения', 'Сменить папку без сохранения?'))) {
    return;
  }
  const root = await backend.chooseWorkspace();
  if (!root) {
    return;
  }
  for (const tab of [...tabs.values()]) {
    closeTab(tab);
  }
  await showWorkspace();
}

/** Поле ввода имени нового файла вверху списка; Enter - создать, Escape - отмена */
function askNewFile(kind: Kind): void {
  el.fileList.querySelector('.file-new')?.remove();
  const item = document.createElement('li');
  item.className = 'file-new';
  const input = document.createElement('input');
  input.placeholder = `имя или папка/имя.${kind}`;
  item.append(input);
  el.fileList.prepend(item);
  input.focus();

  // Удаление поля снимает с него фокус, а blur снова удалил бы его: отписываемся до удаления
  const dismiss = () => {
    input.removeEventListener('blur', dismiss);
    item.remove();
  };
  input.addEventListener('blur', dismiss);

  input.addEventListener('keydown', async (event) => {
    if (event.key === 'Escape') {
      dismiss();
      return;
    }
    if (event.key !== 'Enter') {
      return;
    }
    let path = input.value.trim().replace(/\\/g, '/');
    if (!path) {
      return;
    }
    if (!path.toLowerCase().endsWith(`.${kind}`)) {
      path += `.${kind}`;
    }
    try {
      await backend.createFile(path, kind === 'bpmn' ? newBpmn() : newDmn());
      dismiss();
      await refreshFiles();
      await openFile(path);
    } catch (err) {
      status(errorText(err), true);
    }
  });
}

// --- вкладки ---

async function openFile(path: string): Promise<Tab> {
  const opened = tabs.get(path);
  if (opened) {
    activate(opened);
    return opened;
  }

  const xml = await backend.readFile(path);
  const editor = kindOf(path) === 'dmn' ? new DmnEditor() : new BpmnEditor();
  el.editors.append(editor.element);

  const button = document.createElement('div');
  button.className = 'tab';
  const title = document.createElement('span');
  title.className = 'tab-title';
  title.textContent = baseName(path);
  title.title = path;
  const close = document.createElement('button');
  close.className = 'tab-close';
  close.textContent = '×';
  close.title = 'Закрыть';
  button.append(title, close);
  el.tabs.append(button);

  const tab: Tab = { path, editor, dirty: false, button };
  tabs.set(path, tab);
  button.addEventListener('click', () => activate(tab));
  close.addEventListener('click', (event) => {
    event.stopPropagation();
    requestClose(tab).catch((err) => status(errorText(err), true));
  });

  // Контейнер должен быть видим до импорта: иначе bpmn-js не посчитает размеры для fit-viewport
  activate(tab);
  try {
    const warnings = await editor.open(xml);
    status(warnings.length ? `Открыт с предупреждениями: ${warnings.join('; ')}` : `Открыт ${path}`, warnings.length > 0);
  } catch (err) {
    closeTab(tab);
    throw new Error(`Не удалось открыть ${path}: ${errorText(err)}`);
  }
  editor.onChange(() => setDirty(tab, true));
  return tab;
}

function activate(tab: Tab): void {
  active = tab;
  toolbar.setEditor(tab.editor);
  toolbar.setSaveEnabled(tab.dirty);
  for (const other of tabs.values()) {
    const current = other === tab;
    other.editor.element.hidden = !current;
    other.button.classList.toggle('tab-active', current);
  }
  el.empty.hidden = true;
  // Пока вкладка была скрыта, ширину боковой панели могли изменить
  tab.editor.services()?.get('canvas', false)?.resized();
  for (const item of el.fileList.querySelectorAll<HTMLElement>('.file')) {
    item.classList.toggle('file-active', item.title === tab.path);
  }
}

function setDirty(tab: Tab, dirty: boolean): void {
  tab.dirty = dirty;
  tab.button.classList.toggle('tab-dirty', dirty);
  if (tab === active) {
    toolbar.setSaveEnabled(dirty);
  }
  backend.setDirty(dirtyTabs().length > 0).catch(() => {});
}

function dirtyTabs(): Tab[] {
  return [...tabs.values()].filter((tab) => tab.dirty);
}

async function requestClose(tab: Tab): Promise<void> {
  if (tab.dirty && !(await backend.confirm('Несохранённые изменения', `Закрыть ${baseName(tab.path)} без сохранения?`))) {
    return;
  }
  closeTab(tab);
}

function closeTab(tab: Tab): void {
  tab.editor.destroy();
  tab.editor.element.remove();
  tab.button.remove();
  tabs.delete(tab.path);
  backend.setDirty(dirtyTabs().length > 0).catch(() => {});
  if (active === tab) {
    active = undefined;
    const next = [...tabs.values()].pop();
    if (next) {
      activate(next);
    } else {
      el.empty.hidden = false;
      toolbar.setEditor(undefined);
      toolbar.setSaveEnabled(false);
    }
  }
}

async function saveActive(): Promise<void> {
  const tab = active;
  if (!tab) {
    return;
  }
  const xml = await tab.editor.save();
  await backend.writeFile(tab.path, xml);
  setDirty(tab, false);
  status(`Сохранён ${tab.path}`);
  // Могли измениться id процессов и решений - варианты для call activity и business rule task
  await refreshWorkspaceIndex();
}

// --- запуск ---

const mcpPanel = new McpPanel((err) => status(errorText(err), true));

const toolbar = new Toolbar(document.getElementById('toolbar')!, {
  chooseWorkspace,
  newFile: askNewFile,
  save: saveActive,
  agent: () => mcpPanel.toggle(),
  error: (err) => status(errorText(err), true),
});
mcpPanel.attach(toolbar.tool('agent')).catch(() => {});

initSidebarResizer(document.querySelector<HTMLElement>('.sidebar')!, document.getElementById('sidebar-resizer')!, () => {
  // Холст diagram-js кэширует размеры контейнера
  active?.editor.services()?.get('canvas', false)?.resized();
});

window.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    saveActive().catch((err) => status(`Не сохранено: ${errorText(err)}`, true));
  }
});

// Файлы могли добавить или удалить снаружи (git pull, другой редактор): перечитываем список при возврате в окно.
// Поле ввода нового файла не трогаем - иначе оно пропадёт посреди ввода
window.addEventListener('focus', () => {
  if (!el.fileList.querySelector('.file-new')) {
    showWorkspace().catch((err) => status(errorText(err), true));
  }
});

initMcpBridge({
  tabs: () => [...tabs.values()],
  active: () => active,
  open: async (path) => {
    const tab = await openFile(path);
    // Агент мог создать файл: обновить список
    await refreshFiles();
    return tab;
  },
  markDirty: (tab) => setDirty(tab as Tab, true),
  status: (message) => status(message),
});

showWorkspace().catch((err) => status(errorText(err), true));
