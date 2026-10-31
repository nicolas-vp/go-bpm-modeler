// Библиотеки bpmn.io без собственных типов

declare module 'dmn-js/lib/Modeler' {
  const DmnModeler: any;
  export default DmnModeler;
}

declare module 'bpmn-js-properties-panel' {
  export const BpmnPropertiesPanelModule: any;
  export const BpmnPropertiesProviderModule: any;
  export function useService(name: string, strict?: boolean): any;
}

declare module '@bpmn-io/properties-panel' {
  export const Group: any;
  export const TextFieldEntry: any;
  export const TextAreaEntry: any;
  export const SelectEntry: any;
  export const CheckboxEntry: any;
  export function isTextFieldEntryEdited(node: any): boolean;
  export function isTextAreaEntryEdited(node: any): boolean;
  export function isSelectEntryEdited(node: any): boolean;
  export function isCheckboxEntryEdited(node: any): boolean;
}

declare module 'bpmn-js-bpmnlint' {
  const LintingModule: any;
  export default LintingModule;
}
