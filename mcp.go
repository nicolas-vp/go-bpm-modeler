package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/nicolas-vp/go-bpm-modeler/internal/mcp"
)

// defaultMCPPort - порт MCP-сервера по умолчанию; меняется в settings.json (mcpPort)
const defaultMCPPort = 39190

// frontendTimeout - сколько ждать ответа редактора на запрос агента
const frontendTimeout = 30 * time.Second

// MCPStatus - состояние MCP-сервера для окна моделера
type MCPStatus struct {
	Enabled bool   `json:"enabled"`
	Running bool   `json:"running"`
	URL     string `json:"url"`
	Token   string `json:"token"`
	Error   string `json:"error"`
}

type frontendReply struct {
	result json.RawMessage
	err    error
}

// mcpState - MCP-сервер приложения и запросы агента, которые ждут ответа редактора
type mcpState struct {
	mu      sync.Mutex
	server  *http.Server
	err     string
	nextID  atomic.Int64
	pending sync.Map // id -> chan frontendReply
}

// MCPStatus возвращает состояние MCP-сервера
func (a *App) MCPStatus() MCPStatus {
	s := a.settings()
	a.mcp.mu.Lock()
	defer a.mcp.mu.Unlock()
	return MCPStatus{
		Enabled: s.MCPEnabled,
		Running: a.mcp.server != nil,
		URL:     fmt.Sprintf("http://127.0.0.1:%d/mcp", mcpPort(s)),
		Token:   s.MCPToken,
		Error:   a.mcp.err,
	}
}

// SetMCPEnabled включает или выключает MCP-сервер и запоминает выбор
func (a *App) SetMCPEnabled(enabled bool) (MCPStatus, error) {
	s, err := a.updateSettings(func(s *settings) {
		s.MCPEnabled = enabled
		if s.MCPToken == "" {
			s.MCPToken = newToken()
		}
	})
	if err != nil {
		return a.MCPStatus(), err
	}
	a.stopMCP()
	if enabled {
		a.startMCP(s)
	}
	return a.MCPStatus(), nil
}

// RegenerateMCPToken выдаёт новый токен: старый перестаёт работать, агента нужно переподключить
func (a *App) RegenerateMCPToken() (MCPStatus, error) {
	s, err := a.updateSettings(func(s *settings) { s.MCPToken = newToken() })
	if err != nil {
		return a.MCPStatus(), err
	}
	a.stopMCP()
	if s.MCPEnabled {
		a.startMCP(s)
	}
	return a.MCPStatus(), nil
}

// MCPRespond - ответ редактора на запрос агента (событие mcp:request); errMsg - ошибка, result - JSON результата
func (a *App) MCPRespond(id string, result string, errMsg string) {
	ch, ok := a.mcp.pending.LoadAndDelete(id)
	if !ok {
		return
	}
	reply := frontendReply{result: json.RawMessage(result)}
	if errMsg != "" {
		reply.err = errors.New(errMsg)
	}
	ch.(chan frontendReply) <- reply
}

func (a *App) startMCP(s settings) {
	addr := net.JoinHostPort("127.0.0.1", strconv.Itoa(mcpPort(s)))
	listener, err := net.Listen("tcp", addr)
	a.mcp.mu.Lock()
	defer a.mcp.mu.Unlock()
	if err != nil {
		a.mcp.err = fmt.Sprintf("порт %d занят или недоступен: %v", mcpPort(s), err)
		return
	}
	server := &http.Server{
		Handler:           mcp.New(mcpHost{a}, s.MCPToken, appVersion).Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	a.mcp.server, a.mcp.err = server, ""
	go func() {
		if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			runtime.LogErrorf(a.ctx, "MCP-сервер: %v", err)
		}
	}()
}

func (a *App) stopMCP() {
	a.mcp.mu.Lock()
	server := a.mcp.server
	a.mcp.server, a.mcp.err = nil, ""
	a.mcp.mu.Unlock()
	if server != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}
}

func mcpPort(s settings) int {
	if s.MCPPort > 0 {
		return s.MCPPort
	}
	return defaultMCPPort
}

func newToken() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// mcpHost - приложение глазами MCP-сервера
type mcpHost struct{ app *App }

func (h mcpHost) Workspace() string { return h.app.Workspace() }

func (h mcpHost) Confirm(title, message string) (bool, error) {
	// Окно - на передний план: агент работает в другом окне, вопрос иначе можно не заметить
	runtime.WindowShow(h.app.ctx)
	return h.app.Confirm(title, message)
}

// Frontend отправляет редактору событие mcp:request и ждёт MCPRespond
func (h mcpHost) Frontend(ctx context.Context, method string, params any) (json.RawMessage, error) {
	a := h.app
	id := strconv.FormatInt(a.mcp.nextID.Add(1), 10)
	ch := make(chan frontendReply, 1)
	a.mcp.pending.Store(id, ch)
	defer a.mcp.pending.Delete(id)
	runtime.EventsEmit(a.ctx, "mcp:request", map[string]any{"id": id, "method": method, "params": params})
	select {
	case reply := <-ch:
		return reply.result, reply.err
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-time.After(frontendTimeout):
		return nil, errors.New("редактор не ответил - возможно, окно моделера закрыто или занято диалогом")
	}
}
