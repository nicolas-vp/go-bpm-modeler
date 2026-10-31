# Ubuntu 24.04+ и свежие дистрибутивы поставляют только webkit2gtk-4.1 - Wails v2 нужен тег webkit2_41
TAGS := $(if $(filter Linux,$(shell uname -s)),-tags webkit2_41,)

.PHONY: dev build test lint

dev:
	wails dev $(TAGS)

build:
	wails build $(TAGS)

test:
	go test ./internal/...

lint:
	go vet ./...
	cd frontend && npm run typecheck
