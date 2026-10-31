package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/nicolas-vp/go-bpm-modeler/internal/workspace"
)

// errNoWorkspace - рабочая папка не выбрана
var errNoWorkspace = errors.New("рабочая папка не выбрана")

// appVersion - версия моделера в ответе MCP initialize
const appVersion = "0.1.0"

// settings - настройки, которые переживают перезапуск
type settings struct {
	Workspace string `json:"workspace"`
	// MCPEnabled - встроенный MCP-сервер включён; выключен по умолчанию
	MCPEnabled bool `json:"mcpEnabled,omitempty"`
	// MCPPort - порт MCP-сервера на 127.0.0.1; 0 - defaultMCPPort
	MCPPort int `json:"mcpPort,omitempty"`
	// MCPToken - секрет, который агент передаёт в Authorization: Bearer
	MCPToken string `json:"mcpToken,omitempty"`
}

// App - методы, которые вызывает фронтенд. Все пути файлов - относительно рабочей папки
type App struct {
	ctx context.Context

	mu   sync.RWMutex
	root string
	// dirty - во вкладках есть несохранённые изменения; сообщает фронтенд
	dirty bool
	// cfg - настройки из settings.json
	cfg settings

	mcp mcpState
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	s, _ := loadSettings()
	a.mu.Lock()
	a.cfg = s
	if s.Workspace != "" {
		if _, err := workspace.Dir(s.Workspace); err == nil {
			a.root = s.Workspace
		}
	}
	a.mu.Unlock()
	if s.MCPEnabled && s.MCPToken != "" {
		a.startMCP(s)
	}
}

func (a *App) shutdown(context.Context) {
	a.stopMCP()
}

func (a *App) settings() settings {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.cfg
}

// updateSettings меняет настройки и записывает settings.json целиком
func (a *App) updateSettings(change func(*settings)) (settings, error) {
	a.mu.Lock()
	change(&a.cfg)
	s := a.cfg
	a.mu.Unlock()
	return s, saveSettings(s)
}

// Workspace возвращает текущую рабочую папку, "" - не выбрана
func (a *App) Workspace() string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.root
}

// ChooseWorkspace открывает диалог выбора рабочей папки. "" - пользователь отменил выбор
func (a *App) ChooseWorkspace() (string, error) {
	// Wails проверяет начальную папку через os.Lstat и отвергает символические ссылки (/bin -> /usr/bin), а
	// удалённую папку - тоже: без начальной папки диалог откроется всегда
	start, err := workspace.Dir(a.Workspace())
	if err != nil {
		start = ""
	}
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            "Рабочая папка с BPMN и DMN",
		DefaultDirectory: start,
	})
	if err != nil || dir == "" {
		return "", err
	}
	a.mu.Lock()
	a.root = dir
	a.mu.Unlock()
	if _, err := a.updateSettings(func(s *settings) { s.Workspace = dir }); err != nil {
		runtime.LogWarningf(a.ctx, "настройки не сохранены: %v", err)
	}
	return dir, nil
}

// ListFiles возвращает файлы BPMN и DMN рабочей папки
func (a *App) ListFiles() ([]workspace.File, error) {
	root, err := a.requireRoot()
	if err != nil {
		return nil, err
	}
	return workspace.List(root)
}

// ReadFile читает файл рабочей папки
func (a *App) ReadFile(path string) (string, error) {
	root, err := a.requireRoot()
	if err != nil {
		return "", err
	}
	return workspace.Read(root, path)
}

// WriteFile сохраняет файл рабочей папки
func (a *App) WriteFile(path, content string) error {
	root, err := a.requireRoot()
	if err != nil {
		return err
	}
	return workspace.Write(root, path, content)
}

// CreateFile создаёт новый файл рабочей папки; ошибка, если он уже есть
func (a *App) CreateFile(path, content string) error {
	root, err := a.requireRoot()
	if err != nil {
		return err
	}
	return workspace.Create(root, path, content)
}

// Index возвращает id процессов и решений рабочей папки
func (a *App) Index() (workspace.Index, error) {
	root, err := a.requireRoot()
	if err != nil {
		return workspace.Index{}, err
	}
	return workspace.BuildIndex(root)
}

// SetDirty сообщает, есть ли несохранённые изменения: от этого зависит вопрос при закрытии окна
func (a *App) SetDirty(dirty bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.dirty = dirty
}

// Confirm задаёт вопрос системным диалогом; true - пользователь ответил «Да»
func (a *App) Confirm(title, message string) (bool, error) {
	answer, err := runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:    runtime.QuestionDialog,
		Title:   title,
		Message: message,
		// Свои кнопки учитывает только macOS; Windows и Linux показывают системные «Да»/«Нет» и возвращают "Yes"/"No"
		Buttons:       []string{"Да", "Нет"},
		DefaultButton: "Нет",
	})
	if err != nil {
		return false, err
	}
	return answer == "Да" || answer == "Yes", nil
}

// beforeClose спрашивает, закрывать ли окно с несохранёнными изменениями; true - не закрывать
func (a *App) beforeClose(ctx context.Context) bool {
	a.mu.RLock()
	dirty := a.dirty
	a.mu.RUnlock()
	if !dirty {
		return false
	}
	ok, err := a.Confirm("Несохранённые изменения", "Закрыть без сохранения?")
	return err != nil || !ok
}

func (a *App) requireRoot() (string, error) {
	root := a.Workspace()
	if root == "" {
		return "", errNoWorkspace
	}
	return root, nil
}

func settingsPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "go-bpm-modeler", "settings.json"), nil
}

func loadSettings() (settings, error) {
	var s settings
	path, err := settingsPath()
	if err != nil {
		return s, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return s, err
	}
	return s, json.Unmarshal(data, &s)
}

func saveSettings(s settings) error {
	path, err := settingsPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	// В настройках токен MCP: читать их может только владелец
	return os.WriteFile(path, data, 0o600)
}
