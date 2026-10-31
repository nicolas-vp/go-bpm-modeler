// Библиотеки bpmn.io без собственных типов

declare module 'dmn-js/lib/Modeler' {
  const DmnModeler: any;
  export default DmnModeler;
}

declare module 'bpmn-js-properties-panel' {
  export const BpmnPropertiesPanelModule: any;
  export const BpmnPropertiesProviderModule: any;
}
