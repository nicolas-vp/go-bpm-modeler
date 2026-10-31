// Линтер BPMN: правила gobpm/* (rules.ts) в bpmn-js-bpmnlint. Маркеры на диаграмме и счётчик проблем в углу холста.
// Правила отдаются напрямую через resolver, без сборки конфигурации bpmnlint-loader

import lintingModule from 'bpmn-js-bpmnlint';

import { RULES } from './rules';

// gobpm/<правило> - для bpmnlint это пакет bpmnlint-plugin-gobpm
const PACKAGE = 'bpmnlint-plugin-gobpm';

export const lintConfig = {
  config: {
    rules: Object.fromEntries(Object.entries(RULES).map(([name, { level }]) => [`gobpm/${name}`, level])),
  },
  resolver: {
    resolveRule(pkg: string, ruleName: string) {
      const rule = pkg === PACKAGE ? RULES[ruleName]?.rule : undefined;
      if (!rule) {
        throw new Error(`неизвестное правило ${pkg}/${ruleName}`);
      }
      return rule;
    },
    resolveConfig(pkg: string, configName: string) {
      throw new Error(`неизвестная конфигурация ${pkg}/${configName}`);
    },
  },
};

export const lintOptions = { active: true, bpmnlint: lintConfig };

export default lintingModule;
