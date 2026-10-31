// Русские строки bpmn-js и стандартной панели свойств. Чего нет в словаре - остаётся по-английски

const RU: Record<string, string> = {
  // панель свойств
  General: 'Общее',
  Name: 'Имя',
  Documentation: 'Документация',
  'Element documentation': 'Описание элемента',
  'Process documentation': 'Описание процесса',
  'Process ID': 'ID процесса',
  'Process name': 'Имя процесса',
  'Participant Name': 'Имя участника',
  Error: 'Ошибка',
  'Global error reference': 'Ошибка',
  Code: 'Код',
  Message: 'Сообщение',
  'Global message reference': 'Сообщение',
  'Multi-instance': 'Multi-instance',
  'Loop cardinality': 'Число выполнений',
  'Completion condition': 'Условие завершения',
  'Create new ...': 'Создать…',
  '<none>': '<нет>',
  'ID must be unique.': 'ID должен быть уникальным.',
  'ID must not be empty.': 'ID не может быть пустым.',
  'ID must not contain spaces.': 'ID не может содержать пробелы.',
  'ID must not contain prefix.': 'ID не может содержать префикс.',
  'ID must be a valid QName.': 'ID должен быть корректным QName.',
  'Select an element to edit its properties.': 'Выберите элемент, чтобы изменить его свойства.',
  'Multiple elements are selected. Select a single element to edit its properties.':
    'Выбрано несколько элементов. Выберите один, чтобы изменить свойства.',

  // линтер
  '{errors} Errors, {warnings} Warnings': 'Ошибок: {errors}, предупреждений: {warnings}',
  'No Issues': 'Проблем нет',
  'Issues for child elements': 'Проблемы вложенных элементов',
  'Toggle linting overlays': 'Показать или скрыть проблемы',

  // палитра
  'Activate hand tool': 'Перемещение холста',
  'Activate lasso tool': 'Выделение лассо',
  'Activate create/remove space tool': 'Добавить/убрать пространство',
  'Activate global connect tool': 'Соединить элементы',
  'Create start event': 'Начальное событие',
  'Create end event': 'Конечное событие',
  'Create gateway': 'Шлюз',
  'Create task': 'Задача',
  'Create expanded sub-process': 'Подпроцесс',
  'Create pool/participant': 'Пул',
  'Create group': 'Группа',

  // контекстное меню элемента
  'Append end event': 'Добавить конечное событие',
  'Append gateway': 'Добавить шлюз',
  'Append task': 'Добавить задачу',
  'Append intermediate/boundary event': 'Добавить промежуточное событие',
  'Add text annotation': 'Добавить аннотацию',
  'Change element': 'Заменить элемент',
  Delete: 'Удалить',
  'Connect to other element': 'Соединить',
  'Connect using association': 'Соединить ассоциацией',
  'Add lane above': 'Добавить дорожку сверху',
  'Add lane below': 'Добавить дорожку снизу',
  'Divide into two lanes': 'Разделить на две дорожки',
  'Divide into three lanes': 'Разделить на три дорожки',

  // меню замены
  Task: 'Задача',
  'User task': 'Пользовательская задача',
  'Service task': 'Сервисная задача',
  'Script task': 'Скрипт',
  'Business rule task': 'Решение DMN',
  'Receive task': 'Ожидание сообщения',
  'Call activity': 'Вызов процесса',
  'Sub-process (expanded)': 'Подпроцесс',
  'Exclusive gateway': 'Исключающий шлюз',
  'Parallel gateway': 'Параллельный шлюз',
  'Start event': 'Начальное событие',
  'End event': 'Конечное событие',
  'Timer intermediate catch event': 'Таймер',
  'Message intermediate catch event': 'Ожидание сообщения',
  'Timer boundary event': 'Граничный таймер',
  'Error boundary event': 'Граничная ошибка',
  'Sequence flow': 'Переход',
  'Default flow': 'Переход по умолчанию',
  'Sequential multi-instance': 'Последовательный multi-instance',
};

function translate(template: string, replacements: Record<string, string> = {}): string {
  return (RU[template] ?? template).replace(/{([^}]+)}/g, (_, key) => replacements[key] ?? `{${key}}`);
}

export default {
  translate: ['value', translate],
};
