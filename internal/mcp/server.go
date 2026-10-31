// Package mcp - встроенный MCP-сервер моделера: AI-агент читает рабочую папку и открытые схемы (в том числе
// несохранённые изменения), консультирует и предлагает правки, которые применяются только после подтверждения
// пользователем.
//
// Транспорт - Streamable HTTP (спецификация MCP 2025-06-18) в минимальном виде: POST /mcp с одним сообщением
// JSON-RPC, ответ - application/json, без SSE и сессий: серверу нечего присылать агенту по своей инициативе.
//
// Защита: слушает только 127.0.0.1, обязателен токен (Authorization: Bearer), заголовки Host и Origin - только
// localhost (защита от DNS rebinding из браузера), пути - внутри рабочей папки, запись - через диалог пользователя.
package mcp

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"
)

// Версии протокола MCP, которые понимает сервер; первая - предпочтительная
var protocolVersions = []string{"2025-06-18", "2025-03-26", "2024-11-05"}

// Ограничение тела запроса: схема BPMN в несколько мегабайт - уже очень большая
const maxBody = 16 << 20

// Host - то, что серверу нужно от приложения
type Host interface {
	// Workspace - рабочая папка, "" - не выбрана
	Workspace() string
	// Frontend вызывает метод редактора (открытые вкладки, текущая схема, применение правки)
	Frontend(ctx context.Context, method string, params any) (json.RawMessage, error)
	// Confirm спрашивает пользователя; true - разрешил
	Confirm(title, message string) (bool, error)
}

// Server обрабатывает запросы MCP
type Server struct {
	host    Host
	token   string
	version string
	tools   []tool
}

// New создаёт сервер; token - секрет, который агент передаёт в Authorization: Bearer
func New(host Host, token, version string) *Server {
	s := &Server{host: host, token: token, version: version}
	s.tools = s.toolset()
	return s
}

// Handler - HTTP-обработчик эндпоинта /mcp
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/mcp", s.serveMCP)
	return mux
}

func (s *Server) serveMCP(w http.ResponseWriter, r *http.Request) {
	if !localHost(r.Host) {
		http.Error(w, "host не localhost", http.StatusForbidden)
		return
	}
	if origin := r.Header.Get("Origin"); origin != "" && !localOrigin(origin) {
		http.Error(w, "origin не localhost", http.StatusForbidden)
		return
	}
	if !s.authorized(r) {
		w.Header().Set("WWW-Authenticate", `Bearer realm="go-bpm-modeler"`)
		http.Error(w, "нужен токен: Authorization: Bearer <токен из окна моделера>", http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodPost {
		// GET - поток SSE, DELETE - конец сессии: ни того, ни другого у сервера нет
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "только POST", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
	if err != nil {
		http.Error(w, "тело запроса слишком большое", http.StatusRequestEntityTooLarge)
		return
	}
	var msg message
	if err := json.Unmarshal(body, &msg); err != nil {
		writeJSON(w, response{JSONRPC: "2.0", ID: json.RawMessage("null"), Error: &rpcError{Code: -32700, Message: "не JSON: " + err.Error()}})
		return
	}
	// Уведомления (без id) и ответы клиента: принять и ничего не возвращать
	if msg.ID == nil || msg.Method == "" {
		w.WriteHeader(http.StatusAccepted)
		return
	}
	result, rpcErr := s.handle(r.Context(), msg)
	writeJSON(w, response{JSONRPC: "2.0", ID: msg.ID, Result: result, Error: rpcErr})
}

func (s *Server) authorized(r *http.Request) bool {
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	return ok && s.token != "" && subtle.ConstantTimeCompare([]byte(strings.TrimSpace(token)), []byte(s.token)) == 1
}

// localHost - заголовок Host указывает на эту машину: 127.0.0.1, ::1 или localhost с любым портом
func localHost(hostport string) bool {
	host, _, err := net.SplitHostPort(hostport)
	if err != nil {
		host = hostport
	}
	host = strings.Trim(host, "[]")
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

func localOrigin(origin string) bool {
	u, err := url.Parse(origin)
	return err == nil && localHost(u.Host)
}

type message struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method,omitempty"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

// instructions - что агент получает при подключении
const instructions = `Это go-bpm modeler: редактор схем BPMN и таблиц DMN для BPM-движка go-bpm, открытый у пользователя.
Ты консультируешь и рисуешь схему вместе с пользователем.

- Начни с get_modeling_guide: какие элементы и свойства поддерживает генератор go-bpm и в каком формате (gobpm:*).
- Что пользователь видит сейчас: list_open_diagrams, describe_diagram (элементы, свойства, проблемы линтера) и
  get_selection (что он выделил). get_diagram отдаёт XML с несохранёнными изменениями, read_file - сохранённый файл.
- Правки - update_diagram (вся схема целиком, BPMN 2.0 / DMN 1.3 с диаграммой DI) и create_diagram. Каждую правку
  пользователь подтверждает; в description коротко объясни, что меняется и зачем. Правка появляется в редакторе
  несохранённой - сохраняет пользователь.
- Сохраняй id существующих элементов и давай новым понятные id (CheckOrder, а не Activity_1): id станут именами
  Go-функций. После правки проверь describe_diagram: проблемы линтера - то же, что отвергнет генератор.`

func (s *Server) handle(ctx context.Context, msg message) (any, *rpcError) {
	switch msg.Method {
	case "initialize":
		var params struct {
			ProtocolVersion string `json:"protocolVersion"`
		}
		_ = json.Unmarshal(msg.Params, &params)
		version := protocolVersions[0]
		if slices.Contains(protocolVersions, params.ProtocolVersion) {
			version = params.ProtocolVersion
		}
		return map[string]any{
			"protocolVersion": version,
			"capabilities":    map[string]any{"tools": map[string]any{"listChanged": false}},
			"serverInfo":      map[string]any{"name": "go-bpm-modeler", "title": "go-bpm modeler", "version": s.version},
			"instructions":    instructions,
		}, nil
	case "ping":
		return map[string]any{}, nil
	case "tools/list":
		list := make([]map[string]any, 0, len(s.tools))
		for _, t := range s.tools {
			list = append(list, t.describe())
		}
		return map[string]any{"tools": list}, nil
	case "tools/call":
		var params struct {
			Name      string          `json:"name"`
			Arguments json.RawMessage `json:"arguments"`
		}
		if err := json.Unmarshal(msg.Params, &params); err != nil {
			return nil, &rpcError{Code: -32602, Message: "неверные параметры: " + err.Error()}
		}
		i := slices.IndexFunc(s.tools, func(t tool) bool { return t.name == params.Name })
		if i < 0 {
			return nil, &rpcError{Code: -32602, Message: "нет инструмента " + params.Name}
		}
		if len(params.Arguments) == 0 || string(params.Arguments) == "null" {
			params.Arguments = json.RawMessage("{}")
		}
		ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
		defer cancel()
		text, err := s.tools[i].run(ctx, params.Arguments)
		// Ошибка инструмента - результат с isError: агент видит её и может исправиться
		if err != nil {
			return toolResult(err.Error(), true), nil
		}
		return toolResult(text, false), nil
	}
	return nil, &rpcError{Code: -32601, Message: "нет метода " + msg.Method}
}

func toolResult(text string, isError bool) map[string]any {
	result := map[string]any{"content": []map[string]any{{"type": "text", "text": text}}}
	if isError {
		result["isError"] = true
	}
	return result
}

// errNoWorkspace - пользователь ещё не выбрал рабочую папку
var errNoWorkspace = errors.New("в моделере не выбрана рабочая папка: попросите пользователя нажать «Папка»")

func (s *Server) root() (string, error) {
	root := s.host.Workspace()
	if root == "" {
		return "", errNoWorkspace
	}
	return root, nil
}

// decode разбирает аргументы инструмента
func decode(args json.RawMessage, v any) error {
	if err := json.Unmarshal(args, v); err != nil {
		return fmt.Errorf("неверные аргументы: %w", err)
	}
	return nil
}
