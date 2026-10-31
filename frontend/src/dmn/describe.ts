// DMN в виде списка для AI-агента (MCP describe_diagram, get_selection): решения с таблицами - входы, выходы,
// правила по строкам - и input data

type Node = any;

const text = (node: Node) => node?.text ?? '';

function describeTable(table: Node): Record<string, unknown> {
  return {
    hitPolicy: table.get('hitPolicy') ?? 'UNIQUE',
    aggregation: table.get('aggregation'),
    inputs: (table.get('input') ?? []).map((input: Node) => ({
      id: input.id,
      label: input.label,
      expression: text(input.get('inputExpression')),
      typeRef: input.get('inputExpression')?.get('typeRef'),
    })),
    outputs: (table.get('output') ?? []).map((output: Node) => ({
      id: output.id,
      label: output.label,
      name: output.name,
      typeRef: output.get('typeRef'),
    })),
    rules: (table.get('rule') ?? []).map((rule: Node) => ({
      id: rule.id,
      description: text(rule.get('description')) || undefined,
      inputs: (rule.get('inputEntry') ?? []).map(text),
      outputs: (rule.get('outputEntry') ?? []).map(text),
    })),
  };
}

export function describeDmn(definitions: Node): { kind: 'dmn'; elements: Array<Record<string, unknown>> } {
  const elements = (definitions?.get('drgElement') ?? []).map((element: Node) => {
    const result: Record<string, unknown> = { id: element.id, type: element.$type.replace(/^dmn:/, ''), name: element.name };
    if (element.$type === 'dmn:Decision') {
      const logic = element.get('decisionLogic');
      result.logic = logic?.$type === 'dmn:DecisionTable' ? describeTable(logic) : logic ? logic.$type.replace(/^dmn:/, '') : null;
      const requirements = (element.get('informationRequirement') ?? []).map((r: Node) => ({
        requiredDecision: r.get('requiredDecision')?.href?.replace(/^#/, ''),
        requiredInput: r.get('requiredInput')?.href?.replace(/^#/, ''),
      }));
      if (requirements.length) {
        result.requirements = requirements;
      }
    }
    if (element.$type === 'dmn:InputData') {
      result.typeRef = element.get('variable')?.get('typeRef');
    }
    return result;
  });
  return { kind: 'dmn', elements };
}
