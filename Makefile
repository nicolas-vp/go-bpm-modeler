# Ubuntu 24.04+ и свежие дистрибутивы поставляют только webkit2gtk-4.1 - Wails v2 нужен тег webkit2_41
TAGS := $(if $(filter Linux,$(shell uname -s)),-tags webkit2_41,)

.PHONY: dev build test test-go test-e2e e2e-setup lint

dev:
	wails dev $(TAGS)

build:
	wails build $(TAGS)

test: test-go test-e2e

test-go:
	go test ./internal/...

# Браузерные тесты фронтенда: собранный dist в Chromium, Go-бэкенд подменён. Один раз - make e2e-setup
test-e2e:
	cd frontend && npm run build && npm run test:e2e

e2e-setup:
	cd frontend && npx playwright install chromium

lint:
	go vet $(TAGS) ./...
	cd frontend && npm run typecheck
