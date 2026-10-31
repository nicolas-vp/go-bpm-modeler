// Общий интерфейс редакторов BPMN и DMN для вкладок

/** Сервисы diagram-js активного представления: commandStack, selection, editorActions, modeling, ... */
export interface Services {
  get<T = any>(name: string, strict?: boolean): T;
}

export interface Editor {
  /** Корневой элемент редактора: вкладка показывает и прячет его */
  readonly element: HTMLElement;
  /** Загружает XML; возвращает предупреждения импорта */
  open(xml: string): Promise<string[]>;
  /** Возвращает текущий XML */
  save(): Promise<string>;
  /** Вызывается при каждом изменении диаграммы */
  onChange(listener: () => void): void;
  /** Сервисы представления, которое сейчас на экране; у DMN представление меняется (DRD, таблица решения) */
  services(): Services | undefined;
  /** Вызывается, когда сменилось активное представление и services() возвращает другие сервисы */
  onViewChange(listener: () => void): void;
  destroy(): void;

  // Для AI-агента (MCP, см. mcp.ts)

  /** Схема в виде списка: элементы, их настройки go-bpm, переходы, таблицы решений */
  describe(): unknown;
  /** Проблемы линтера */
  problems(): Problem[];
  /** То, что выделил пользователь, - в том же виде, что describe */
  selection(): unknown[];
  /** Заменяет схему новым XML с проверкой: при ошибке разбора схема в редакторе не меняется */
  replace(xml: string): Promise<string[]>;
}

export interface Problem {
  id: string;
  level: 'error' | 'warn';
  message: string;
}

export function warningMessages(warnings: Array<{ message?: string }> | undefined): string[] {
  return (warnings ?? []).map((warning) => warning.message ?? String(warning));
}
