// Ограничения bpmn-js под go-bpm: палитра и меню замены показывают только то, что поддерживает генератор.
// Список - docs/supported-elements.md

type Entries = Record<string, any>;

/** Пункты палитры bpmn-js, которых нет в go-bpm */
const HIDDEN_PALETTE = new Set(['create.data-object', 'create.data-store']);

/** Пункты меню замены (replace-with-*) и переключатели (toggle-*), которые остаются */
const ALLOWED_REPLACE = new Set([
  'replace-with-none-start',
  'replace-with-none-end',
  'replace-with-timer-intermediate-catch',
  'replace-with-message-intermediate-catch',
  'replace-with-timer-boundary',
  'replace-with-error-boundary',
  'replace-with-exclusive-gateway',
  'replace-with-parallel-gateway',
  'replace-with-task',
  'replace-with-service-task',
  'replace-with-script-task',
  'replace-with-rule-task',
  'replace-with-user-task',
  'replace-with-receive-task',
  'replace-with-call-activity',
  'replace-with-expanded-subprocess',
  'replace-with-sequence-flow',
  'replace-with-default-flow',
  'replace-with-expanded-pool',
  'replace-with-collapsed-pool',
  'toggle-sequential-mi',
]);

function filterReplace(entries: Entries): Entries {
  const result: Entries = {};
  for (const [id, entry] of Object.entries(entries)) {
    const managed = id.startsWith('replace-with-') || id.startsWith('toggle-');
    if (!managed || ALLOWED_REPLACE.has(id)) {
      result[id] = entry;
    }
  }
  return result;
}

class PaletteRestrictions {
  static $inject = ['palette', 'create', 'elementFactory', 'translate'];

  constructor(
    palette: any,
    private create: any,
    private elementFactory: any,
    private translate: (text: string) => string,
  ) {
    palette.registerProvider(500, this);
  }

  getPaletteEntries() {
    return (entries: Entries): Entries => {
      const result: Entries = {};
      for (const [id, entry] of Object.entries(entries)) {
        if (HIDDEN_PALETTE.has(id)) {
          continue;
        }
        // Промежуточное событие bpmn-js - throw, в go-bpm есть только catch: таймер и сообщение
        if (id === 'create.intermediate-event') {
          result['create.timer-catch-event'] = this.catchEvent(
            'bpmn:TimerEventDefinition',
            'bpmn-icon-intermediate-event-catch-timer',
            'Создать промежуточное событие таймера',
          );
          result['create.message-catch-event'] = this.catchEvent(
            'bpmn:MessageEventDefinition',
            'bpmn-icon-intermediate-event-catch-message',
            'Создать промежуточное событие сообщения',
          );
          continue;
        }
        result[id] = entry;
      }
      return result;
    };
  }

  private catchEvent(eventDefinitionType: string, className: string, title: string) {
    const start = (event: Event) => {
      const shape = this.elementFactory.createShape({ type: 'bpmn:IntermediateCatchEvent', eventDefinitionType });
      this.create.start(event, shape);
    };
    return { group: 'event', className, title: this.translate(title), action: { dragstart: start, click: start } };
  }
}

class ReplaceMenuRestrictions {
  static $inject = ['popupMenu'];

  constructor(popupMenu: any) {
    popupMenu.registerProvider('bpmn-replace', 500, this);
  }

  getPopupMenuEntries() {
    return filterReplace;
  }

  getPopupMenuHeaderEntries() {
    return filterReplace;
  }
}

export default {
  __init__: ['goBpmPaletteRestrictions', 'goBpmReplaceMenuRestrictions'],
  goBpmPaletteRestrictions: ['type', PaletteRestrictions],
  goBpmReplaceMenuRestrictions: ['type', ReplaceMenuRestrictions],
};
