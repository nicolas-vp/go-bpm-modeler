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
make dev     # приложение с горячей перезагрузкой фронтенда
make build   # бинарник в build/bin/
make test    # тесты Go
make lint    # go vet и проверка типов TypeScript
```

На Linux Makefile добавляет тег `webkit2_41`: свежие дистрибутивы поставляют только webkit2gtk-4.1.

## Устройство

- `app.go` — методы для фронтенда: рабочая папка, список, чтение и запись файлов, индекс id процессов и решений.
- `internal/workspace` — работа с файлами; пути не выходят за рабочую папку, запись атомарная.
- `frontend/src/bpmn` — редактор BPMN: moddle-дескриптор `gobpm:*`, ограничения палитры и меню замены.
- `frontend/src/dmn` — редактор DMN.
- Последняя рабочая папка хранится в `<UserConfigDir>/go-bpm-modeler/settings.json`.
