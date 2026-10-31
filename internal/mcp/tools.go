package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/nicolas-vp/go-bpm-modeler/internal/workspace"
)

// tool - инструмент MCP: схема аргументов и обработчик, который возвращает текст для агента
type tool struct {
	name        string
	title       string
	description string
	// properties - свойства JSON Schema аргументов, required - обязательные
	properties map[string]any
	required   []string
	readOnly   bool
	run        func(ctx context.Context, args json.RawMessage) (string, error)
}

func (t tool) describe() map[string]any {
	schema := map[string]any{"type": "object", "properties": t.properties}
	if t.properties == nil {
		schema["properties"] = map[string]any{}
	}
	if len(t.required) > 0 {
		schema["required"] = t.required
	}
	return map[string]any{
		"name":        t.name,
		"title":       t.title,
		"description": t.description,
		"inputSchema": schema,
		"annotations": map[string]any{
			"title":           t.title,
			"readOnlyHint":    t.readOnly,
			"destructiveHint": false,
			"openWorldHint":   false,
		},
	}
}

func str(description string) map[string]any {
	return map[string]any{"type": "string", "description": description}
}

// pathArg - путь файла относительно рабочей папки; для вкладок необязателен - тогда активная вкладка
var pathArg = str("путь файла относительно рабочей папки, например orders/approval.bpmn; не задан - активная вкладка")

// Guide - справочник для агента: поддерживаемые элементы и свойства (docs/supported-elements.md). Задаёт main
var Guide string

// maxDescription - сколько текста описания правки показать пользователю в диалоге
const maxDescription = 1500

func (s *Server) toolset() []tool {
	return []tool{
		{
			name:        "get_modeling_guide",
			title:       "Что поддерживает go-bpm",
			description: "Справочник: элементы BPMN и DMN, которые поддерживает генератор go-bpm, их свойства и формат XML (расширения gobpm:*), правила линтера. Прочитай перед тем, как предлагать правки.",
			readOnly:    true,
			run: func(context.Context, json.RawMessage) (string, error) {
				if Guide == "" {
					return "", errors.New("справочник не встроен в эту сборку")
				}
				return Guide, nil
			},
		},
		{
			name:        "list_files",
			title:       "Файлы рабочей папки",
			description: "Список *.bpmn и *.dmn рабочей папки (обычно process/ сервиса go-bpm) с путями относительно неё.",
			readOnly:    true,
			run: func(context.Context, json.RawMessage) (string, error) {
				root, err := s.root()
				if err != nil {
					return "", err
				}
				files, err := workspace.List(root)
				if err != nil {
					return "", err
				}
				return marshal(files)
			},
		},
		{
			name:        "read_file",
			title:       "Прочитать файл",
			description: "Содержимое сохранённого файла рабочей папки. Несохранённые изменения открытой схемы - в get_diagram.",
			properties:  map[string]any{"path": str("путь файла относительно рабочей папки")},
			required:    []string{"path"},
			readOnly:    true,
			run: func(_ context.Context, args json.RawMessage) (string, error) {
				var a struct{ Path string }
				if err := decode(args, &a); err != nil {
					return "", err
				}
				root, err := s.root()
				if err != nil {
					return "", err
				}
				return workspace.Read(root, a.Path)
			},
		},
		s.frontendTool("list_open_diagrams", "Открытые схемы",
			"Вкладки редактора: путь, тип (bpmn/dmn), есть ли несохранённые изменения, какая активна.", "listOpen", false),
		s.frontendTool("get_diagram", "XML открытой схемы",
			"Текущий XML схемы в редакторе, включая несохранённые изменения. Схема должна быть открыта во вкладке.", "getDiagram", true),
		s.frontendTool("describe_diagram", "Что на схеме",
			"Схема в редакторе в виде списка: элементы с типами, именами и настройками go-bpm, переходы, решения DMN с таблицами, проблемы линтера (ошибки - то, что отвергнет генератор). Включая несохранённые изменения.", "describe", true),
		s.frontendTool("get_selection", "Выделенное",
			"Элементы, которые пользователь выделил в активной вкладке, с их настройками: обычно вопрос относится к ним.", "selection", false),
		{
			name:  "update_diagram",
			title: "Изменить схему",
			description: "Заменить схему во вкладке редактора новым XML целиком (BPMN 2.0 или DMN 1.3, с диаграммой DI). " +
				"Пользователь увидит description и подтвердит правку; правка появится в редакторе несохранённой. " +
				"Если файл не открыт, он откроется.",
			properties: map[string]any{
				"path":        pathArg,
				"xml":         str("новый XML схемы целиком"),
				"description": str("что меняется и зачем - коротко, по-русски: это читает пользователь в диалоге подтверждения"),
			},
			required: []string{"xml", "description"},
			run: func(ctx context.Context, args json.RawMessage) (string, error) {
				var a struct{ Path, XML, Description string }
				if err := decode(args, &a); err != nil {
					return "", err
				}
				target := a.Path
				if target == "" {
					target = "активная вкладка"
				}
				if err := s.confirm("AI-агент предлагает изменить схему", target, a.Description,
					"Правка появится в редакторе несохранённой: сохранить её - Ctrl+S."); err != nil {
					return "", err
				}
				return s.callFrontend(ctx, "apply", map[string]any{"path": a.Path, "xml": a.XML})
			},
		},
		{
			name:  "create_diagram",
			title: "Создать схему",
			description: "Создать новый файл *.bpmn или *.dmn в рабочей папке и открыть его. Пользователь подтверждает " +
				"создание. Файл, который уже есть, не перезаписывается.",
			properties: map[string]any{
				"path":        str("путь нового файла относительно рабочей папки, например orders/refund.bpmn"),
				"xml":         str("XML схемы целиком"),
				"description": str("что за схема - коротко, по-русски: это читает пользователь в диалоге подтверждения"),
			},
			required: []string{"path", "xml", "description"},
			run: func(ctx context.Context, args json.RawMessage) (string, error) {
				var a struct{ Path, XML, Description string }
				if err := decode(args, &a); err != nil {
					return "", err
				}
				root, err := s.root()
				if err != nil {
					return "", err
				}
				if _, err := workspace.Resolve(root, a.Path); err != nil {
					return "", err
				}
				if _, ok := workspace.KindOf(a.Path); !ok {
					return "", fmt.Errorf("файл должен быть .bpmn или .dmn: %q", a.Path)
				}
				if err := s.confirm("AI-агент предлагает создать схему", a.Path, a.Description,
					"Файл будет создан в рабочей папке и открыт."); err != nil {
					return "", err
				}
				if err := workspace.Create(root, a.Path, a.XML); err != nil {
					return "", err
				}
				return s.callFrontend(ctx, "open", map[string]any{"path": a.Path})
			},
		},
	}
}

// frontendTool - инструмент, который читает состояние редактора; withPath - аргумент path (вкладка)
func (s *Server) frontendTool(name, title, description, method string, withPath bool) tool {
	t := tool{name: name, title: title, description: description, readOnly: true}
	if withPath {
		t.properties = map[string]any{"path": pathArg}
	}
	t.run = func(ctx context.Context, args json.RawMessage) (string, error) {
		var params map[string]any
		if err := decode(args, &params); err != nil {
			return "", err
		}
		return s.callFrontend(ctx, method, params)
	}
	return t
}

func (s *Server) callFrontend(ctx context.Context, method string, params any) (string, error) {
	raw, err := s.host.Frontend(ctx, method, params)
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

// confirm спрашивает пользователя о правке; ошибка - отказ, её текст увидит агент
func (s *Server) confirm(title, target, description, note string) error {
	description = strings.TrimSpace(description)
	if description == "" {
		return errors.New("нужно description: что меняется и зачем - его читает пользователь")
	}
	if runes := []rune(description); len(runes) > maxDescription {
		description = string(runes[:maxDescription]) + "…"
	}
	ok, err := s.host.Confirm(title, fmt.Sprintf("%s\n\n%s\n\n%s", target, description, note))
	if err != nil {
		return fmt.Errorf("не удалось спросить пользователя: %w", err)
	}
	if !ok {
		return errors.New("пользователь отклонил правку; спросите, что изменить")
	}
	return nil
}

func marshal(v any) (string, error) {
	data, err := json.MarshalIndent(v, "", "  ")
	return string(data), err
}
