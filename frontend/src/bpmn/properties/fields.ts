// Поля панели свойств без JSX: компоненты @bpmn-io/properties-panel через h() из её же экземпляра preact

import {
  CheckboxEntry,
  isCheckboxEntryEdited,
  isSelectEntryEdited,
  isTextAreaEntryEdited,
  isTextFieldEntryEdited,
  SelectEntry,
  TextAreaEntry,
  TextFieldEntry,
} from '@bpmn-io/properties-panel';
import { h } from '@bpmn-io/properties-panel/preact';
import { useService } from 'bpmn-js-properties-panel';

export interface Accessor<T> {
  get(element: any): T | undefined;
  set(element: any, injector: any, value: T | undefined): void;
}

export interface Option {
  value: string;
  label: string;
}

interface Common {
  id: string;
  label: string;
  description?: string;
}

/** Запись группы: id, компонент и признак «поле заполнено» для точки у заголовка группы */
export interface Entry {
  id: string;
  component: (props: { element: any; id: string }) => any;
  isEdited: (node: any) => boolean;
}

export function textField(spec: Common & { accessor: Accessor<string> }): Entry {
  return {
    id: spec.id,
    isEdited: isTextFieldEntryEdited,
    component: ({ element }) => {
      const injector = useService('injector');
      const debounce = useService('debounceInput');
      return h(TextFieldEntry, {
        element,
        id: spec.id,
        label: spec.label,
        description: spec.description,
        debounce,
        getValue: () => spec.accessor.get(element) ?? '',
        setValue: (value: string) => spec.accessor.set(element, injector, value || undefined),
      });
    },
  };
}

export function textArea(spec: Common & { accessor: Accessor<string>; monospace?: boolean; rows?: number }): Entry {
  return {
    id: spec.id,
    isEdited: isTextAreaEntryEdited,
    component: ({ element }) => {
      const injector = useService('injector');
      const debounce = useService('debounceInput');
      return h(TextAreaEntry, {
        element,
        id: spec.id,
        label: spec.label,
        description: spec.description,
        debounce,
        monospace: spec.monospace,
        rows: spec.rows ?? 3,
        autoResize: true,
        getValue: () => spec.accessor.get(element) ?? '',
        setValue: (value: string) => spec.accessor.set(element, injector, value || undefined),
      });
    },
  };
}

/** Целое число; пустое поле - атрибута нет. Нечисловой ввод сохраняется как есть: его покажет линтер */
export function integerField(spec: Common & { accessor: Accessor<number | string> }): Entry {
  return textField({
    ...spec,
    accessor: {
      get: (element) => {
        const value = spec.accessor.get(element);
        return value === undefined ? undefined : String(value);
      },
      set: (element, injector, value) => {
        const number = value !== undefined && /^\d+$/.test(value) ? Number(value) : value;
        spec.accessor.set(element, injector, number);
      },
    },
  });
}

export function select(spec: Common & { accessor: Accessor<string>; options: (element: any) => Option[] }): Entry {
  return {
    id: spec.id,
    isEdited: isSelectEntryEdited,
    component: ({ element }) => {
      const injector = useService('injector');
      return h(SelectEntry, {
        element,
        id: spec.id,
        label: spec.label,
        description: spec.description,
        getValue: () => spec.accessor.get(element) ?? '',
        setValue: (value: string) => spec.accessor.set(element, injector, value || undefined),
        getOptions: () => spec.options(element),
      });
    },
  };
}

export function checkbox(spec: Common & { accessor: Accessor<boolean> }): Entry {
  return {
    id: spec.id,
    isEdited: isCheckboxEntryEdited,
    component: ({ element }) => {
      const injector = useService('injector');
      return h(CheckboxEntry, {
        element,
        id: spec.id,
        label: spec.label,
        description: spec.description,
        getValue: () => spec.accessor.get(element),
        setValue: (value: boolean) => spec.accessor.set(element, injector, value),
      });
    },
  };
}

/**
 * Варианты выбора: пустой вариант, известные значения и текущее значение, если его нет среди известных (например,
 * решение из файла вне рабочей папки) - иначе select показал бы пустоту
 */
export function withCurrent(options: Option[], current: string | undefined, missingLabel: string): Option[] {
  const result = [{ value: '', label: '<не выбрано>' }, ...options];
  if (current && !options.some((option) => option.value === current)) {
    result.push({ value: current, label: `${current} (${missingLabel})` });
  }
  return result;
}
