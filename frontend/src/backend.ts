// Вызовы Go-методов App (app.go). Wails кладёт привязки в window.go.main.App; обёртка не зависит от
// сгенерированной папки wailsjs и даёт типы

export type Kind = 'bpmn' | 'dmn';

export interface WorkspaceFile {
  path: string;
  kind: Kind;
}

export interface Ref {
  id: string;
  name: string;
  path: string;
}

export interface WorkspaceIndex {
  processes: Ref[];
  decisions: Ref[];
  problems: Record<string, string>;
}

interface AppBindings {
  Workspace(): Promise<string>;
  ChooseWorkspace(): Promise<string>;
  ListFiles(): Promise<WorkspaceFile[] | null>;
  ReadFile(path: string): Promise<string>;
  WriteFile(path: string, content: string): Promise<void>;
  CreateFile(path: string, content: string): Promise<void>;
  Index(): Promise<WorkspaceIndex>;
  SetDirty(dirty: boolean): Promise<void>;
  Confirm(title: string, message: string): Promise<boolean>;
}

declare global {
  interface Window {
    go?: { main?: { App?: AppBindings } };
    // Рантайм Wails
    runtime?: { BrowserOpenURL(url: string): void };
  }
}

/** Открывает ссылку в системном браузере; вне Wails - в новой вкладке */
export function openExternal(url: string): void {
  if (window.runtime) {
    window.runtime.BrowserOpenURL(url);
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

function app(): AppBindings {
  const bindings = window.go?.main?.App;
  if (!bindings) {
    throw new Error('Go-бэкенд недоступен: приложение запущено не через Wails');
  }
  return bindings;
}

export const backend = {
  workspace: () => app().Workspace(),
  chooseWorkspace: () => app().ChooseWorkspace(),
  listFiles: async () => (await app().ListFiles()) ?? [],
  readFile: (path: string) => app().ReadFile(path),
  writeFile: (path: string, content: string) => app().WriteFile(path, content),
  createFile: (path: string, content: string) => app().CreateFile(path, content),
  index: () => app().Index(),
  setDirty: (dirty: boolean) => app().SetDirty(dirty),
  confirm: (title: string, message: string) => app().Confirm(title, message),
};
