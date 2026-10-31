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
  MCPStatus(): Promise<McpStatus>;
  SetMCPEnabled(enabled: boolean): Promise<McpStatus>;
  RegenerateMCPToken(): Promise<McpStatus>;
  MCPRespond(id: string, result: string, error: string): Promise<void>;
}

/** Состояние встроенного MCP-сервера (mcp.go) */
export interface McpStatus {
  enabled: boolean;
  running: boolean;
  url: string;
  token: string;
  error: string;
}

declare global {
  interface Window {
    go?: { main?: { App?: AppBindings } };
    // Рантайм Wails
    runtime?: {
      BrowserOpenURL(url: string): void;
      EventsOn(name: string, callback: (...data: any[]) => void): () => void;
      ClipboardSetText(text: string): Promise<boolean>;
    };
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

/** Подписка на событие из Go (runtime.EventsEmit); вне Wails - ничего */
export function onEvent(name: string, callback: (...data: any[]) => void): void {
  window.runtime?.EventsOn(name, callback);
}

/** Текст в буфер обмена: через Wails - в WebKitGTK navigator.clipboard без разрешения не работает */
export async function copyText(text: string): Promise<void> {
  if (window.runtime?.ClipboardSetText) {
    await window.runtime.ClipboardSetText(text);
  } else {
    await navigator.clipboard.writeText(text);
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
  mcpStatus: () => app().MCPStatus(),
  setMcpEnabled: (enabled: boolean) => app().SetMCPEnabled(enabled),
  regenerateMcpToken: () => app().RegenerateMCPToken(),
  mcpRespond: (id: string, result: string, error: string) => app().MCPRespond(id, result, error),
};
