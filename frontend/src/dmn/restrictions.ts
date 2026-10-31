// Ограничения dmn-js под go-bpm: решение - только таблица, без BKM, knowledge source, decision service и
// зависимостей между решениями. Input data остаётся для информации - какие данные нужны решению: генератор его
// не читает и связь «данные -> решение» (requiredInput) не отвергает; hit policy без PRIORITY и OUTPUT ORDER; типы - те, что переводятся в Go.
// Список - docs/supported-elements.md, раздел DMN

import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';
import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';

type Entries = Record<string, any>;

/** typeRef входов и выходов, которые генератор переводит в типы Go (kindFromTypeRef) */
export const DATA_TYPES = ['string', 'number', 'integer', 'long', 'double', 'boolean'];

/**
 * Hit policy, которых нет в go-bpm: им нужен порядок значений выхода. В выпадающем списке dmn-js они остаются (он
 * строится из константы HIT_POLICIES без настройки, а по ней же ищется подпись текущей политики), но подписаны
 * «не поддерживается go-bpm» (translate.ts), выбор отмечает линтер
 */
export const UNSUPPORTED_HIT_POLICIES = ['PRIORITY', 'OUTPUT ORDER'];

/** Элементы DRD, которые можно создавать: решение и данные для информации */
const ALLOWED_CREATE = new Set(['create.decision', 'create.input-data']);

/** Палитра DRD: инструменты, решение и input data */
class DrdPaletteRestrictions {
  static $inject = ['palette'];

  constructor(palette: any) {
    palette.registerProvider(500, this);
  }

  getPaletteEntries() {
    return (entries: Entries): Entries => {
      const result: Entries = {};
      for (const [id, entry] of Object.entries(entries)) {
        if (id.startsWith('create.') && !ALLOWED_CREATE.has(id)) {
          continue;
        }
        result[id] = entry;
      }
      return result;
    };
  }
}

/**
 * Меню элемента DRD: аннотация, замена, удаление; у input data - ещё «соединить» (связь с решением). «Добавить
 * решение» связало бы решения зависимостью
 */
const ALLOWED_CONTEXT_PAD = new Set(['append.text-annotation', 'replace', 'delete']);

class DrdContextPadRestrictions {
  static $inject = ['contextPad'];

  constructor(contextPad: any) {
    contextPad.registerProvider(500, this);
  }

  getContextPadEntries(element: any) {
    const inputData = element.type === 'dmn:InputData';
    return (entries: Entries): Entries =>
      Object.fromEntries(
        Object.entries(entries).filter(([id]) => ALLOWED_CONTEXT_PAD.has(id) || (inputData && id === 'connect')),
      );
  }
}

/** Меню замены решения: только таблица - пустое решение и literal expression генератор отвергнет */
class DrdReplaceRestrictions {
  static $inject = ['popupMenu'];

  constructor(popupMenu: any) {
    popupMenu.registerProvider('dmn-replace', 500, this);
  }

  getPopupMenuEntries() {
    return (entries: Entries): Entries =>
      Object.fromEntries(Object.entries(entries).filter(([id]) => id === 'replace-with-decision-table'));
  }
}

/**
 * Новое решение - сразу с таблицей: вход и выход строкового типа, как пункт «Decision table» меню замены dmn-js.
 * Без таблицы решение пустое, а его генератор отвергнет
 */
class NewDecisionTable extends CommandInterceptor {
  static $inject = ['eventBus', 'drdFactory'];

  constructor(eventBus: any, drdFactory: any) {
    super(eventBus);
    // unwrap: обработчик получает контекст команды, а не событие
    this.preExecute('shape.create', (context: any) => {
      const bo = context.shape.businessObject;
      if (bo.$type !== 'dmn:Decision' || bo.decisionLogic || context.hints?.createElementsBehavior === false) {
        return;
      }
      const table = drdFactory.create('dmn:DecisionTable');
      const input = drdFactory.create('dmn:InputClause');
      const inputExpression = drdFactory.create('dmn:LiteralExpression', { typeRef: 'string' });
      const output = drdFactory.create('dmn:OutputClause', { typeRef: 'string' });
      input.inputExpression = inputExpression;
      inputExpression.$parent = input;
      input.$parent = table;
      output.$parent = table;
      table.input = [input];
      table.output = [output];
      table.$parent = bo;
      bo.decisionLogic = table;
    }, true);
  }
}

/** Связь решение -> решение (requiredDecision) генератор отвергает: решения вызываются отдельными задачами */
class DrdConnectionRules extends RuleProvider {
  static $inject = ['eventBus'];

  init(): void {
    const decisionToDecision = ({ source, target }: any) =>
      source?.type === 'dmn:Decision' && target?.type === 'dmn:Decision' ? false : undefined;
    // Выше DrdRules (1000)
    this.addRule(['connection.create', 'connection.reconnect'], 1500, decisionToDecision);
  }
}

export const drdRestrictions = {
  __init__: ['goBpmDrdPalette', 'goBpmDrdContextPad', 'goBpmDrdReplace', 'goBpmNewDecisionTable', 'goBpmDrdRules'],
  goBpmDrdRules: ['type', DrdConnectionRules],
  goBpmDrdPalette: ['type', DrdPaletteRestrictions],
  goBpmDrdContextPad: ['type', DrdContextPadRestrictions],
  goBpmDrdReplace: ['type', DrdReplaceRestrictions],
  goBpmNewDecisionTable: ['type', NewDecisionTable],
};
