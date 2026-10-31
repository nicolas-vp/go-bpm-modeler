package mcp

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// fakeHost - рабочая папка во временном каталоге, ответы редактора и пользователя - заданные
type fakeHost struct {
	root    string
	answer  bool
	asked   []string
	calls   []string
	respond func(method string, params any) (json.RawMessage, error)
}

func (h *fakeHost) Workspace() string { return h.root }

func (h *fakeHost) Frontend(_ context.Context, method string, params any) (json.RawMessage, error) {
	h.calls = append(h.calls, method)
	if h.respond != nil {
		return h.respond(method, params)
	}
	return json.RawMessage(`{"ok":true}`), nil
}

func (h *fakeHost) Confirm(title, message string) (bool, error) {
	h.asked = append(h.asked, title+": "+message)
	return h.answer, nil
}

const token = "secret-token"

func newTest(t *testing.T) (*fakeHost, *httptest.Server) {
	t.Helper()
	host := &fakeHost{root: t.TempDir()}
	os.MkdirAll(filepath.Join(host.root, "orders"), 0o755)
	os.WriteFile(filepath.Join(host.root, "orders", "order.bpmn"), []byte("<bpmn/>"), 0o644)
	server := httptest.NewServer(New(host, token, "test").Handler())
	t.Cleanup(server.Close)
	return host, server
}

// call отправляет JSON-RPC запрос; возвращает HTTP-статус и разобранный ответ
func call(t *testing.T, server *httptest.Server, body string, mutate ...func(*http.Request)) (int, map[string]any) {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, server.URL+"/mcp", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	req.Header.Set("Authorization", "Bearer "+token)
	for _, m := range mutate {
		m(req)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	var out map[string]any
	_ = json.Unmarshal(data, &out)
	return resp.StatusCode, out
}

func toolCall(t *testing.T, server *httptest.Server, name, args string) (text string, isError bool) {
	t.Helper()
	status, out := call(t, server, `{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"`+name+`","arguments":`+args+`}}`)
	if status != http.StatusOK || out["result"] == nil {
		t.Fatalf("%s: статус %d, ответ %v", name, status, out)
	}
	result := out["result"].(map[string]any)
	text = result["content"].([]any)[0].(map[string]any)["text"].(string)
	isError, _ = result["isError"].(bool)
	return text, isError
}

func TestInitializeAndList(t *testing.T) {
	_, server := newTest(t)
	status, out := call(t, server, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}`)
	if status != http.StatusOK {
		t.Fatalf("initialize: %d", status)
	}
	result := out["result"].(map[string]any)
	if result["protocolVersion"] != "2025-03-26" {
		t.Errorf("версия протокола не согласована: %v", result["protocolVersion"])
	}
	if _, ok := result["capabilities"].(map[string]any)["tools"]; !ok {
		t.Error("нет capabilities.tools")
	}

	status, _ = call(t, server, `{"jsonrpc":"2.0","method":"notifications/initialized"}`)
	if status != http.StatusAccepted {
		t.Errorf("уведомление: ждали 202, получили %d", status)
	}

	_, out = call(t, server, `{"jsonrpc":"2.0","id":2,"method":"tools/list"}`)
	var names []string
	for _, item := range out["result"].(map[string]any)["tools"].([]any) {
		tool := item.(map[string]any)
		names = append(names, tool["name"].(string))
		if tool["inputSchema"].(map[string]any)["type"] != "object" {
			t.Errorf("%s: inputSchema не object", tool["name"])
		}
	}
	for _, want := range []string{"get_modeling_guide", "list_files", "read_file", "list_open_diagrams", "get_diagram", "describe_diagram", "get_selection", "update_diagram", "create_diagram"} {
		if !strings.Contains(strings.Join(names, ","), want) {
			t.Errorf("нет инструмента %s: %v", want, names)
		}
	}

	_, out = call(t, server, `{"jsonrpc":"2.0","id":3,"method":"nope"}`)
	if out["error"].(map[string]any)["code"].(float64) != -32601 {
		t.Errorf("неизвестный метод: %v", out)
	}
}

func TestAccess(t *testing.T) {
	_, server := newTest(t)
	ping := `{"jsonrpc":"2.0","id":1,"method":"ping"}`
	cases := []struct {
		name   string
		mutate func(*http.Request)
		want   int
	}{
		{"без токена", func(r *http.Request) { r.Header.Del("Authorization") }, http.StatusUnauthorized},
		{"чужой токен", func(r *http.Request) { r.Header.Set("Authorization", "Bearer x") }, http.StatusUnauthorized},
		{"чужой Host", func(r *http.Request) { r.Host = "evil.example:80" }, http.StatusForbidden},
		{"чужой Origin", func(r *http.Request) { r.Header.Set("Origin", "https://evil.example") }, http.StatusForbidden},
		{"Origin localhost", func(r *http.Request) { r.Header.Set("Origin", "http://localhost:3000") }, http.StatusOK},
		{"всё верно", nil, http.StatusOK},
	}
	for _, c := range cases {
		var mutate []func(*http.Request)
		if c.mutate != nil {
			mutate = append(mutate, c.mutate)
		}
		if status, _ := call(t, server, ping, mutate...); status != c.want {
			t.Errorf("%s: ждали %d, получили %d", c.name, c.want, status)
		}
	}

	req, _ := http.NewRequest(http.MethodGet, server.URL+"/mcp", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, _ := http.DefaultClient.Do(req)
	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("GET: ждали 405, получили %d", resp.StatusCode)
	}
}

func TestFiles(t *testing.T) {
	host, server := newTest(t)
	text, isError := toolCall(t, server, "list_files", `{}`)
	if isError || !strings.Contains(text, `"orders/order.bpmn"`) {
		t.Errorf("list_files: %s", text)
	}
	text, isError = toolCall(t, server, "read_file", `{"path":"orders/order.bpmn"}`)
	if isError || text != "<bpmn/>" {
		t.Errorf("read_file: %s", text)
	}
	if text, isError = toolCall(t, server, "read_file", `{"path":"../../etc/passwd"}`); !isError {
		t.Errorf("read_file вне папки: ждали ошибку, получили %s", text)
	}
	host.root = ""
	if text, isError = toolCall(t, server, "list_files", `{}`); !isError || !strings.Contains(text, "рабочая папка") {
		t.Errorf("без папки: %s", text)
	}
}

func TestFrontendTools(t *testing.T) {
	host, server := newTest(t)
	host.respond = func(method string, params any) (json.RawMessage, error) {
		p, _ := json.Marshal(params)
		return json.RawMessage(`{"method":"` + method + `","params":` + string(p) + `}`), nil
	}
	text, _ := toolCall(t, server, "describe_diagram", `{"path":"orders/order.bpmn"}`)
	if !strings.Contains(text, `"method":"describe"`) || !strings.Contains(text, `"path":"orders/order.bpmn"`) {
		t.Errorf("describe_diagram: %s", text)
	}
	if len(host.asked) != 0 {
		t.Error("чтение не должно спрашивать пользователя")
	}
}

func TestWritesNeedConsent(t *testing.T) {
	host, server := newTest(t)
	update := `{"path":"orders/order.bpmn","xml":"<new/>","description":"Добавить задачу «Проверить оплату»"}`

	host.answer = false
	text, isError := toolCall(t, server, "update_diagram", update)
	if !isError || !strings.Contains(text, "отклонил") || len(host.calls) != 0 {
		t.Errorf("отказ: %s, вызовы редактора %v", text, host.calls)
	}
	if !strings.Contains(host.asked[0], "Проверить оплату") {
		t.Errorf("пользователь не увидел описание: %v", host.asked)
	}

	if text, isError = toolCall(t, server, "update_diagram", `{"xml":"<new/>","description":"  "}`); !isError || !strings.Contains(text, "description") {
		t.Errorf("без описания: %s", text)
	}

	host.answer = true
	if _, isError = toolCall(t, server, "update_diagram", update); isError || strings.Join(host.calls, ",") != "apply" {
		t.Errorf("согласие: вызовы %v", host.calls)
	}

	create := `{"path":"orders/refund.bpmn","xml":"<refund/>","description":"Возврат заказа"}`
	if text, isError = toolCall(t, server, "create_diagram", create); isError {
		t.Fatalf("create_diagram: %s", text)
	}
	if data, _ := os.ReadFile(filepath.Join(host.root, "orders", "refund.bpmn")); string(data) != "<refund/>" {
		t.Errorf("файл не создан: %q", data)
	}
	if text, isError = toolCall(t, server, "create_diagram", create); !isError {
		t.Errorf("повторное создание: ждали ошибку, получили %s", text)
	}
	if text, isError = toolCall(t, server, "create_diagram", `{"path":"../x.bpmn","xml":"<x/>","description":"x"}`); !isError {
		t.Errorf("создание вне папки: %s", text)
	}
	if text, isError = toolCall(t, server, "create_diagram", `{"path":"notes.txt","xml":"x","description":"x"}`); !isError {
		t.Errorf("создание .txt: %s", text)
	}
}
