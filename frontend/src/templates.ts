// Содержимое новых файлов

/** Случайный суффикс id, как у bpmn-js: Process_0a1b2c3 */
function suffix(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function newBpmn(): string {
  const id = suffix();
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:gobpm="https://github.com/nicolas-vp/go-bpm/schema/1.0" id="Definitions_${id}" targetNamespace="http://bpmn.io/schema/bpmn" exporter="go-bpm-modeler" exporterVersion="0.1.0">
  <bpmn:process id="Process_${id}" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_${id}">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="180" y="160" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
}

export function newDmn(): string {
  const id = suffix();
  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/" xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/" id="Definitions_${id}" name="DRD" namespace="http://camunda.org/schema/1.0/dmn" exporter="go-bpm-modeler" exporterVersion="0.1.0">
  <decision id="Decision_${id}" name="Decision 1">
    <decisionTable id="DecisionTable_${id}">
      <input id="Input_1">
        <inputExpression id="InputExpression_1" typeRef="string">
          <text></text>
        </inputExpression>
      </input>
      <output id="Output_1" typeRef="string" />
    </decisionTable>
  </decision>
  <dmndi:DMNDI>
    <dmndi:DMNDiagram>
      <dmndi:DMNShape dmnElementRef="Decision_${id}">
        <dc:Bounds height="80" width="180" x="160" y="100" />
      </dmndi:DMNShape>
    </dmndi:DMNDiagram>
  </dmndi:DMNDI>
</definitions>
`;
}
