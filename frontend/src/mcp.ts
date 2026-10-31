// Мост MCP-сервера (Go, internal/mcp) и редактора: Go шлёт событие mcp:request, редактор отвечает
// backend.mcpRespond. Чтение - состояние вкладок как есть, включая несохранённое; правки приходят сюда уже
// подтверждёнными пользователем (диалог - на стороне Go)

import { backend, onEvent } from './backend';
import type { Editor } from './editor';

export interface McpTab {
  path: string;
  editor: Editor;
  dirty: boolean;
}

export interface McpWorkspace {
  tabs(): McpTab[];
  active(): McpTab | undefined;
  /** Открывает файл во вкладке (или делает её активной) и возвращает вкладку */
  open(path: string): Promise<McpTab>;
  /** Отмечает вкладку изменённой: правка агента не сохранена на диск */
  markDirty(tab: McpTab): void;
  status(message: string): void;
}

interface Request {
  id: string;
  method: string;
  params?: { path?: string; xml?: string };
}

const kind = (path: string) => (path.toLowerCase().endsWith('.dmn') ? 'dmn' : 'bpmn');

export function initMcpBridge(ws: McpWorkspace): void {
  /** Вкладка по пути; без пути - активная */
  const tabFor = (path?: string): McpTab => {
    const tab = path ? ws.tabs().find((t) => t.path === path) : ws.active();
    if (!tab) {
      throw new Error(
        path
          ? `${path} не открыт в редакторе: сохранённый файл - read_file, открыть - попросите пользователя`
          : 'в редакторе нет открытых схем',
      );
    }
    return tab;
  };

  const handlers: Record<string, (params: Request['params']) => Promise<unknown>> = {
    async listOpen() {
      const active = ws.active();
      return ws.tabs().map((t) => ({ path: t.path, kind: kind(t.path), dirty: t.dirty, active: t === active }));
    },
    async getDiagram(params) {
      const tab = tabFor(params?.path);
      return { path: tab.path, dirty: tab.dirty, xml: await tab.editor.save() };
    },
    async describe(params) {
      const tab = tabFor(params?.path);
      return { path: tab.path, dirty: tab.dirty, ...(tab.editor.describe() as object), problems: tab.editor.problems() };
    },
    async selection() {
      const tab = tabFor();
      return { path: tab.path, selected: tab.editor.selection() };
    },
    async apply(params) {
      if (!params?.xml) {
        throw new Error('нет xml');
      }
      const tab = params.path ? await ws.open(params.path) : tabFor();
      const warnings = await tab.editor.replace(params.xml);
      ws.markDirty(tab);
      ws.status(`AI-агент изменил ${tab.path} - изменения не сохранены`);
      // Линтер bpmn-js проверяет схему асинхронно после импорта
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { path: tab.path, applied: true, saved: false, warnings, problems: tab.editor.problems() };
    },
    async open(params) {
      if (!params?.path) {
        throw new Error('нет path');
      }
      const tab = await ws.open(params.path);
      return { path: tab.path, opened: true };
    },
  };

  onEvent('mcp:request', async (request: Request) => {
    const handler = handlers[request.method];
    try {
      if (!handler) {
        throw new Error(`неизвестный запрос ${request.method}`);
      }
      const result = await handler(request.params);
      await backend.mcpRespond(request.id, JSON.stringify(result ?? null), '');
    } catch (err) {
      await backend.mcpRespond(request.id, '', err instanceof Error ? err.message : String(err));
    }
  });
}
