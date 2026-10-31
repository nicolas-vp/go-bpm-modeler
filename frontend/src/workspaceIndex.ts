// Id процессов и решений рабочей папки - варианты для Process ID у call activity и Decision ID у business rule task.
// Обновляется при смене папки, создании и сохранении файлов

import { backend, type WorkspaceIndex } from './backend';

let current: WorkspaceIndex = { processes: [], decisions: [], problems: {} };

export function workspaceIndex(): WorkspaceIndex {
  return current;
}

export async function refreshWorkspaceIndex(): Promise<void> {
  current = await backend.index();
}
