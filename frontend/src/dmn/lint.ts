// Линтер DMN под генератор go-bpm (internal/generator/codegen/decisions.go). Проверяет структуру: решение - таблица,
// без зависимостей, hit policy, выходы, синтаксис списков в ячейках, FEEL-функции. Выражения над полями модели не
// проверяет: для этого нужна модель данных сервиса, их проверит генератор

import { DATA_TYPES, UNSUPPORTED_HIT_POLICIES } from './restrictions';

export interface Issue {
  /** Элемент с проблемой: решение, вход, выход или ячейка */
  id: string;
  /** Решение, к которому относится проблема: в его таблице подсвечивается ячейка */
  decisionId?: string;
  level: 'error' | 'warn';
  message: string;
}

type Node = any;

/** Имя выхода -> поле Go: utils.ToPascalCase генератора - слова по пробелам, _ и -, каждое с заглавной */
function pascalCase(name: string): string {
  return name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join('');
}

const GO_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

// FEEL-функции, которых нет в Go: генератор переносит вызов как есть, и сборка падает. Встроенные функции Go
// (len, min, max, append) остаются вызовами - их в списке нет
const FEEL_FUNCTIONS = [
  'date and time', 'date', 'time', 'duration', 'years and months duration', 'now', 'today',
  'day of week', 'day of year', 'month of year', 'week of year',
  'string length', 'substring before', 'substring after', 'substring', 'upper case', 'lower case', 'contains',
  'starts with', 'ends with', 'matches', 'replace', 'split', 'string join',
  'count', 'sum', 'mean', 'median', 'stddev', 'mode', 'product', 'all', 'any', 'sublist', 'concatenate',
  'insert before', 'remove', 'reverse', 'index of', 'union', 'distinct values', 'flatten',
  'decimal', 'floor', 'ceiling', 'abs', 'modulo', 'sqrt', 'log', 'exp', 'odd', 'even', 'number',
  'is defined', 'get value', 'get entries', 'context',
];
const FEEL_CALL = new RegExp(`(?:^|[^A-Za-z0-9_."])(${FEEL_FUNCTIONS.map((f) => f.replace(/ /g, '\\s+')).join('|')})\\s*\\(`);

/** Текст без строковых литералов: функции и запятые внутри строк не считаются */
function stripStrings(text: string): string {
  return text.replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

/** Ячейка входа "not(тесты)" целиком - тесты внутри; undefined - не not(...) */
function notCall(text: string): string | undefined {
  const match = /^not\s*\((.*)\)$/s.exec(text);
  if (!match) {
    return undefined;
  }
  // Скобка в конце должна закрывать первую, иначе это not(a), not(b)
  let depth = 0;
  const inner = stripStrings(match[1]);
  for (const ch of inner) {
    if (ch === '(') depth++;
    if (ch === ')' && --depth < 0) return undefined;
  }
  return depth === 0 ? match[1] : undefined;
}

/** Деление по запятым верхнего уровня - вне строк и скобок вызовов, как splitTests генератора */
function splitTests(text: string): string[] {
  const tests: string[] = [];
  let depth = 0;
  let quote = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === '"') quote = false;
    } else if (ch === '"') quote = true;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      tests.push(text.slice(start, i));
      start = i + 1;
    }
  }
  tests.push(text.slice(start));
  return tests;
}

/** Ячейка входа: сообщение об ошибке или undefined */
function inputCellError(text: string): string | undefined {
  const value = text.trim();
  if (value === '' || value === '-') {
    return undefined;
  }
  const inner = notCall(value);
  if (inner !== undefined) {
    return inner.trim() === '' || inner.trim() === '-' ? `not(${inner}) не подходит ни к одному значению` : inputCellError(inner);
  }
  if (splitTests(value).some((test) => test.trim() === '')) {
    return 'пустой тест в списке через запятую';
  }
  return undefined;
}

function feelWarning(text: string): string | undefined {
  const match = FEEL_CALL.exec(stripStrings(text ?? ''));
  return match ? `FEEL-функция «${match[1].replace(/\s+/g, ' ')}» не переводится в Go: подготовьте значение методом перед задачей` : undefined;
}

function lintTable(decision: Node, table: Node, issues: Issue[]): void {
  const report = (id: string, level: Issue['level'], message: string) =>
    issues.push({ id, decisionId: decision.id, level, message });
  const inputs: Node[] = table.get('input') ?? [];
  const outputs: Node[] = table.get('output') ?? [];
  const rules: Node[] = table.get('rule') ?? [];
  const policy = (table.get('hitPolicy') ?? 'UNIQUE').toUpperCase();
  const aggregation = table.get('aggregation');

  if (UNSUPPORTED_HIT_POLICIES.includes(policy)) {
    report(decision.id, 'error', `hit policy ${policy} не поддерживается: нужен порядок значений выхода`);
  }
  if (policy === 'COLLECT' && aggregation && outputs.length > 1) {
    report(decision.id, 'error', `COLLECT ${aggregation} работает только с одним выходом`);
  }
  if (outputs.length === 0) {
    report(decision.id, 'error', 'у таблицы нет выходов');
  }

  inputs.forEach((input, i) => {
    const expression = input.get('inputExpression');
    const typeRef = expression?.get('typeRef');
    if (typeRef && typeRef !== 'Any' && !DATA_TYPES.includes(typeRef)) {
      report(input.id, 'warn', `тип ${typeRef} входа «${input.label || input.id}» go-bpm не поддерживает: даты и длительности не переводятся`);
    }
    // Вход без выражения, который проверяют правила, генератору нечем вычислить
    const tested = rules.some((rule) => !['', '-'].includes((rule.get('inputEntry')[i]?.text ?? '').trim()));
    if (tested && !(expression?.text ?? '').trim()) {
      report(input.id, 'error', `у входа «${input.label || i + 1}» нет выражения, а правила его проверяют`);
    }
  });

  const fields = new Map<string, string>();
  for (const output of outputs) {
    const typeRef = output.get('typeRef');
    if (typeRef && typeRef !== 'Any' && !DATA_TYPES.includes(typeRef)) {
      report(output.id, 'warn', `тип ${typeRef} выхода «${output.label || output.name || output.id}» go-bpm не поддерживает`);
    }
    if (outputs.length < 2) {
      continue;
    }
    const name: string = output.get('name') ?? '';
    if (!name) {
      report(output.id, 'error', `у таблицы несколько выходов, у выхода «${output.label || output.id}» нужно имя (name)`);
      continue;
    }
    const field = pascalCase(name);
    if (!GO_IDENTIFIER.test(field)) {
      report(output.id, 'error', `выход «${name}»: имя не переводится в поле Go - нужны латинские буквы, цифры и _`);
    } else if (fields.has(field)) {
      report(output.id, 'error', `выходы «${fields.get(field)}» и «${name}» дают одно поле ${field}`);
    } else {
      fields.set(field, name);
    }
  }

  for (const rule of rules) {
    for (const entry of rule.get('inputEntry') ?? []) {
      const error = inputCellError(entry.text ?? '');
      if (error) {
        report(entry.id, 'error', error);
      } else if (feelWarning(entry.text)) {
        report(entry.id, 'warn', feelWarning(entry.text)!);
      }
    }
    for (const entry of rule.get('outputEntry') ?? []) {
      const warning = feelWarning(entry.text);
      if (warning) {
        report(entry.id, 'warn', warning);
      }
    }
  }
}

/** Проблемы DMN-документа: definitions - корень модели dmn-js (getDefinitions) */
export function lintDmn(definitions: Node): Issue[] {
  const issues: Issue[] = [];
  for (const element of definitions?.get('drgElement') ?? []) {
    if (element.$type === 'dmn:Decision') {
      const logic = element.get('decisionLogic');
      if (!logic) {
        issues.push({ id: element.id, level: 'error', message: 'у решения нет таблицы правил' });
      } else if (logic.$type === 'dmn:LiteralExpression') {
        issues.push({ id: element.id, level: 'error', message: 'решение выражением (literal expression) не поддерживается, только таблица' });
      } else if (logic.$type === 'dmn:DecisionTable') {
        lintTable(element, logic, issues);
      }
      for (const requirement of element.get('informationRequirement') ?? []) {
        const required = requirement.get('requiredDecision');
        if (required) {
          const href = (required.href ?? '').replace(/^#/, '');
          issues.push({ id: element.id, level: 'error', message: `зависимость от другого решения (${href}) не поддерживается: вызывайте решения отдельными задачами` });
        }
      }
    } else if (['dmn:BusinessKnowledgeModel', 'dmn:KnowledgeSource', 'dmn:DecisionService'].includes(element.$type)) {
      // Input data не здесь: он для информации - какие данные нужны решению, генератор его просто не читает
      issues.push({
        id: element.id,
        level: 'warn',
        message: `${element.$type.replace('dmn:', '')} go-bpm не использует: входы таблиц - переменные процесса`,
      });
    }
  }
  return issues;
}
