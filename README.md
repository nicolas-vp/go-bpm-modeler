# go-bpm modeler

Десктопный редактор BPMN и DMN для [go-bpm](https://github.com/nicolas-vp/go-bpm): рисует только то, что
поддерживает генератор go-bpm, и сохраняет `*.bpmn`/`*.dmn` в рабочую папку (обычно `process/` сервиса).

Стек: [Wails v2](https://wails.io) (Go + системный WebView), Vite + TypeScript, bpmn-js, dmn-js. Что поддерживается —
[docs/supported-elements.md](docs/supported-elements.md).

## Окружение

- Go 1.26+
- Node.js 22 LTS+
- Wails CLI: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
- Linux (Ubuntu/Debian): `sudo apt install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev`
- macOS: Xcode Command Line Tools; Windows: WebView2 (есть в Windows 10/11)

Проверка: `wails doctor`.

## Команды

```sh
make dev        # приложение с горячей перезагрузкой фронтенда
make build      # бинарник в build/bin/
make e2e-setup  # один раз: Chromium для браузерных тестов
make test       # тесты Go и браузерные тесты фронтенда
make lint       # go vet и проверка типов TypeScript
```

Браузерные тесты (`frontend/e2e`) открывают собранный фронтенд в Chromium через Playwright; Go-бэкенд Wails
подменён заглушкой в памяти (`e2e/harness.mjs`). Один файл: `cd frontend && node e2e/run.mjs dist properties`.

На Linux Makefile добавляет тег `webkit2_41`: свежие дистрибутивы поставляют только webkit2gtk-4.1.

## CI

`.github/workflows/ci.yml`: тесты и линтеры, затем сборка под Linux amd64, Windows amd64, macOS Intel и Apple
Silicon (обе macOS - на arm64-раннере). Бинарники - артефакты прогона; тег `v*` создаёт релиз с ними. Бинарники
не подписаны: macOS и Windows предупредят при первом запуске.

Сборки публикуются на <https://go-bpm.tech/modeler/> (job `publish`): push в main — канал dev, тег `v*` — релиз,
канал latest. CI отправляет архивы по SSH в `deploy/publish.sh` на сервере (forced command ключа CI), скрипт
кладёт их в `/var/www/go-bpm-downloads/modeler` и обновляет `index.json`, который читает страница сайта.
Секреты: `DEPLOY_HOST`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`. После правки `deploy/publish.sh` — скопировать его на
сервер в `/opt/go-bpm-modeler/publish.sh`.

## AI-агент (MCP)

Моделер встраивает MCP-сервер: агент (Claude Code, Cursor и другие) консультирует и рисует схему вместе с
пользователем. Включается кнопкой «AI-агент» на панели инструментов, там же — команда подключения:

```sh
claude mcp add --transport http go-bpm-modeler http://127.0.0.1:39190/mcp --header "Authorization: Bearer <токен>"
```

| Инструмент | Что делает | Спрашивает пользователя |
|---|---|---|
| `get_modeling_guide` | что поддерживает go-bpm (`docs/supported-elements.md`) | нет |
| `list_files`, `read_file` | файлы рабочей папки, сохранённое содержимое | нет |
| `list_open_diagrams` | вкладки редактора, несохранённые изменения | нет |
| `get_diagram` | XML открытой схемы с несохранёнными изменениями | нет |
| `describe_diagram` | элементы, настройки go-bpm, переходы, таблицы DMN, проблемы линтера | нет |
| `get_selection` | что выделил пользователь | нет |
| `update_diagram` | заменить схему во вкладке (правка не сохраняется на диск) | да |
| `create_diagram` | создать файл и открыть | да |

- Транспорт — Streamable HTTP, без SSE и сессий (`internal/mcp`). Сервер выключен по умолчанию, слушает только
  `127.0.0.1`, требует токен (хранится в `settings.json` с правами 0600), отвергает чужие `Host` и `Origin`
  (DNS rebinding из браузера), не выходит за рабочую папку.
- Правка — системный диалог с описанием от агента. Отменить правку агента Ctrl+Z нельзя (схема загружается
  заново) — её можно не сохранять.
- Порт — 39190, другой — `mcpPort` в `settings.json`.

## Устройство

- `app.go` — методы для фронтенда: рабочая папка, список, чтение и запись файлов, индекс id процессов и решений;
  `mcp.go` — MCP-сервер в приложении: настройки, запуск, мост к редактору через события Wails.
- `internal/mcp` — протокол MCP, доступ и инструменты; `frontend/src/mcp.ts` — ответы редактора на запросы агента.
- `internal/workspace` — работа с файлами; пути не выходят за рабочую папку, запись атомарная.
- `frontend/src/bpmn` — редактор BPMN: moddle-дескриптор `gobpm:*`, ограничения палитры и меню замены, панель
  свойств (`properties/`), линтер (`lint/`), AI task.
- `frontend/src/dmn` — редактор DMN.
- Последняя рабочая папка хранится в `<UserConfigDir>/go-bpm-modeler/settings.json`.
- Иконка: исходник `build/appicon.svg`, PNG 1024×1024 — `build/appicon.png`. `wails build` делает из PNG иконки для
  Windows и macOS, в Linux PNG встраивается в бинарник как иконка окна. После правки SVG:
  `rsvg-convert -w 1024 -h 1024 build/appicon.svg -o build/appicon.png`.
