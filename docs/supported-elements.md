# Поддерживаемые элементы и свойства

Что моделер даёт рисовать и настраивать. Источник — go-bpm: `docs/bpmn.md`, `docs/dmn.md` и модели парсера
`internal/generator/models/{bpmn,dmn}`. Всё, чего нет в этом списке, генератор go-bpm отвергает — моделер это не
показывает в палитре, контекстном меню и меню замены.

## Формат файлов

- **BPMN 2.0** со своими расширениями `xmlns:gobpm="https://github.com/nicolas-vp/go-bpm/schema/1.0"`.
  Moddle-дескриптор — `frontend/src/bpmn/gobpm.json`.
- **Локальные имена элементов и атрибутов `gobpm:*` совпадают с `zeebe:*`** (`taskDefinition@type`, `script@expression`,
  …). Парсер go-bpm сопоставляет элементы по локальному имени без namespace, поэтому текущая версия go-bpm уже читает
  `gobpm:*`. В go-bpm остаётся сделать: проверять namespace явно и при наличии обоих вариантов брать `gobpm:*`
  (сейчас берётся первый в документе).
- `zeebe:*` и `camunda:*` моделер не пишет. Если они есть в открытом файле (нарисован в Camunda Modeler), moddle
  сохраняет их как есть; конвертация `zeebe:*` → `gobpm:*` при открытии — отдельная задача.
- **DMN 1.3** (`https://www.omg.org/spec/DMN/20191111/MODEL/`) — формат, который пишет `dmn-js`. Своих расширений нет.
- Расширения `.bpmn` и `.dmn`. Рабочая папка — `process/` сервиса, подпапки допустимы.

## BPMN

### Палитра

| Инструмент | Есть |
|---|---|
| Hand, lasso, space, global connect | ✓ |
| Start event (none) | ✓ |
| Intermediate event — только catch | ✓ |
| End event (none) | ✓ |
| Gateway — exclusive, parallel | ✓ |
| Task | ✓ |
| Expanded sub-process | ✓ |
| Participant (пул), lane | ✓ не исполняются |
| Text annotation, group | ✓ не исполняются |
| Data object, data store | ✗ |

### Элементы

| Элемент | XML | Ограничения |
|---|---|---|
| Start event | `startEvent` без event definition | ровно один в процессе и в подпроцессе |
| End event | `endEvent` без event definition | |
| Sequence flow | `sequenceFlow` | |
| Exclusive gateway | `exclusiveGateway` | |
| Parallel gateway | `parallelGateway` | |
| Task | `task` | |
| Service task | `serviceTask` | |
| Script task | `scriptTask` | |
| Business rule task | `businessRuleTask` | |
| User task | `userTask` | |
| Receive task | `receiveTask` | |
| Call activity | `callActivity` | |
| Sub-process | `subProcess` (embedded) | без вложенного подпроцесса |
| Intermediate catch | `intermediateCatchEvent` + timer или message | |
| Boundary event | `boundaryEvent` + timer или error, прерывающий | см. матрицу ниже |

**Меню замены (ReplaceMenu)** — только между элементами из этой таблицы: task ↔ service/script/business rule/user/
receive task, intermediate catch timer ↔ message, exclusive ↔ parallel gateway, boundary timer ↔ error.

**Скрыть:** inclusive, event-based, complex gateway; manual task, send task; все throw-события; signal, conditional,
escalation, compensation, link events; start event с определением; end event с terminate/error/message/escalation;
event sub-process, transaction, ad-hoc sub-process, collapsed sub-process; message flow; parallel multi-instance,
standard loop; переключатель non-interrupting у boundary.

### Граничные события: к чему можно прикрепить

| Цель | Timer | Error |
|---|---|---|
| Task, script task, service task | ✓ | ✓ |
| User task | ✓ | ✗ |
| Business rule task, receive task, call activity, sub-process | ✗ | ✗ |
| Элемент с multi-instance | ✗ | ✓ |

### Свойства

Общие у всех: **ID**, **Name**, **Documentation**.

| Элемент | Свойство | XML | Обяз. |
|---|---|---|---|
| Process | ID — имя процесса и Go-пакета | `process@id` | ✓ |
| | Name — название в консоли | `process@name` | |
| | isExecutable — всегда `true`, в панели не показываем | `process@isExecutable` | |
| Sequence flow | Condition — только если источник exclusive gateway | `conditionExpression` (`tFormalExpression`) | |
| Exclusive gateway | Default flow | `exclusiveGateway@default` | |
| Service task | Type (jobType) | `gobpm:taskDefinition@type` | ✓ |
| | Retries | `gobpm:taskDefinition@retries` | |
| Script task | Expression — FEEL или Go | `gobpm:script@expression` | ✓ |
| | Result variable | `gobpm:script@resultVariable` | |
| Business rule task | Decision ID — выбор из `*.dmn` рабочей папки | `gobpm:calledDecision@decisionId` | ✓ |
| | Result variable | `gobpm:calledDecision@resultVariable` | ✓ |
| User task | Assignee | `gobpm:assignmentDefinition@assignee` | |
| | Candidate users | `gobpm:assignmentDefinition@candidateUsers` | |
| | Candidate groups | `gobpm:assignmentDefinition@candidateGroups` | |
| | Form key | `gobpm:formDefinition@formKey` | |
| Receive task, message catch | Message — выбор или создание `bpmn:message` | `@messageRef` / `messageEventDefinition@messageRef` | ✓ |
| `bpmn:message` | Name — константа | `message@name` | ✓ |
| | Correlation key — `=переменная` | `gobpm:subscription@correlationKey` | |
| Timer (catch и boundary) | Тип: Duration или Date | `timeDuration` / `timeDate` | ✓ |
| | Значение | ISO 8601 без лет и месяцев; RFC 3339 с зоной или `=переменная` | ✓ |
| Boundary error | Error — выбор/создание `bpmn:error` или «любая» | `errorEventDefinition@errorRef` | |
| `bpmn:error` | Name, Error code | `error@name`, `error@errorCode` | code ✓ |
| Call activity | Process ID — выбор из `*.bpmn` рабочей папки | `gobpm:calledElement@processId` | ✓ |
| | Propagate all child variables, по умолчанию `true` | `gobpm:calledElement@propagateAllChildVariables` | |
| Multi-instance (задачи, sub-process, call activity) | только sequential | `multiInstanceLoopCharacteristics@isSequential="true"` | |
| | Loop cardinality — целое > 0 | `loopCardinality` | одно из |
| | Completion condition | `completionCondition` | двух |

Не показываем: input/output mappings (`zeebe:ioMapping`), task headers, execution listeners, inputCollection — go-bpm
их игнорирует или отвергает.

### Проверки (линтер)

Показываются маркерами на диаграмме и не мешают сохранить файл.

- В процессе и в подпроцессе ровно один start event.
- У задачи и события не больше одного исходящего перехода.
- Условие на переходе — только из exclusive gateway; каждый выход exclusive gateway с условием или default.
- У exclusive gateway с несколькими выходами задан default flow (предупреждение).
- Матрица граничных событий соблюдена; `cancelActivity` не `false`.
- Нет подпроцесса внутри подпроцесса.
- Обязательные свойства из таблицы заполнены.
- Timer: duration в ISO 8601 без `Y` и `M` в дате; date — RFC 3339 с зоной или `=переменная`; нет `timeCycle`.
- `loopCardinality` — целое > 0; у multi-instance есть cardinality или condition.
- Id процесса не `handlers`, `model`, `services`; уникален в рабочей папке.
- `decisionId` и `processId` существуют в рабочей папке (предупреждение).
- Assignment и correlation key — литерал или `=переменная`, не выражение.

Чего моделер проверить не может: есть ли поля в `DataModel` и компилируется ли выражение. Это делает генератор.

## DMN

### DRD

| Элемент | Есть |
|---|---|
| Decision с decision table | ✓ |
| Text annotation | ✓ |
| Decision с literal expression | ✗ |
| Input data, business knowledge model, knowledge source | ✗ |
| Information/knowledge/authority requirement | ✗ |

### Таблица решений

| Свойство | Значения |
|---|---|
| Decision ID, Name | `decision@id` — уникален во всех `*.dmn` рабочей папки |
| Hit policy | `UNIQUE`, `FIRST`, `ANY`, `RULE ORDER`, `COLLECT` + агрегация `SUM`, `MIN`, `MAX`, `COUNT` |
| Input | Label, Expression (`inputExpression/text`), Type |
| Output | Label, **Name** (поле результата), Type |
| Rule | ячейки входов и выходов, Description |
| Type (`typeRef`) | `string`, `number`, `integer`, `long`, `double`, `boolean` |

**Скрыть:** hit policy `PRIORITY`, `OUTPUT ORDER`; типы `date`, `time`, `dateTime`, `dayTimeDuration`,
`yearMonthDuration`; input values / output values (списки допустимых значений).

**Проверки:** у выхода задано `name`, если выходов больше одного; ячейки — синтаксис из `docs/dmn.md` go-bpm
(`-`, литерал, сравнение, диапазон, список, `not(...)`, `? ...`, `null`); FEEL-функции — предупреждение.

## AI task (на будущее)

В go-bpm пока не поддерживается. Элемент заложен в моделер заранее и скрыт за флагом `experimental.aiTask`. Пока
флаг выключен, элемента нет в палитре и меню замены, а открытый файл с ним получает предупреждение линтера.

**Представление в XML** — service task с расширением `gobpm:aiTask`. `gobpm:taskDefinition type="ai"` пишется
тоже: текущий go-bpm, который AI task не знает, исполнит элемент как обычный service task с обработчиком `ai`.

```xml
<bpmn:serviceTask id="Classify" name="Классифицировать обращение">
  <bpmn:extensionElements>
    <gobpm:taskDefinition type="ai" retries="3" />
    <gobpm:aiTask model="claude-sonnet-5-5" resultVariable="category"
                  systemPrompt="Ты классифицируешь обращения клиентов..." prompt="=request.text" />
  </bpmn:extensionElements>
</bpmn:serviceTask>
```

- **Отрисовка:** своя иконка вместо шестерёнки service task — рендерер узнаёт элемент по `gobpm:aiTask`.
- **Палитра и меню замены:** отдельный пункт «AI task». Замена AI task → service task удаляет `gobpm:aiTask`.
- **Граничные события:** как у service task — timer и error.
- **Свойства (черновик, уточнить по реализации в go-bpm):** Model, System prompt, Prompt (литерал или
  `=переменная`), Result variable, Retries. `Type` фиксирован `ai`, в панели не показывается.
- **Проверки:** заполнены Prompt и Result variable.

Когда go-bpm начнёт поддерживать AI task, формат и список свойств сверяются с его парсером, а флаг включается
по умолчанию.

## Проверка через go-bpm

Парсер и проверки go-bpm лежат в `internal/` (`internal/generator/parser`, `internal/generator/codegen/validate.go`), их
нельзя импортировать из другого модуля. Поэтому проверки выше реализуются в моделере правилами `bpmnlint`. После
изменений в генераторе go-bpm правила линтера обновляются вручную по `docs/bpmn.md` и `docs/dmn.md` go-bpm.
