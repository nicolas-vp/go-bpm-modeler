package workspace

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestResolve(t *testing.T) {
	root := t.TempDir()
	for _, rel := range []string{"a.bpmn", "sub/a.bpmn", "sub/../a.bpmn"} {
		if _, err := Resolve(root, rel); err != nil {
			t.Errorf("Resolve(%q): %v", rel, err)
		}
	}
	for _, rel := range []string{"", "../a.bpmn", "sub/../../a.bpmn", "/etc/a.bpmn", ".."} {
		if _, err := Resolve(root, rel); !errors.Is(err, ErrOutsideRoot) {
			t.Errorf("Resolve(%q): ждали ErrOutsideRoot, получили %v", rel, err)
		}
	}
}

func TestWriteReadList(t *testing.T) {
	root := t.TempDir()
	if err := Write(root, "orders/order.bpmn", "<x/>"); err != nil {
		t.Fatal(err)
	}
	if err := Write(root, "pricing.dmn", "<y/>"); err != nil {
		t.Fatal(err)
	}
	if err := Write(root, "notes.txt", "z"); err == nil {
		t.Error("запись .txt: ждали ошибку")
	}
	os.WriteFile(filepath.Join(root, "readme.md"), []byte("-"), 0o644)
	os.MkdirAll(filepath.Join(root, ".git"), 0o755)
	os.WriteFile(filepath.Join(root, ".git", "hidden.bpmn"), []byte("-"), 0o644)

	files, err := List(root)
	if err != nil {
		t.Fatal(err)
	}
	want := []File{{Path: "orders/order.bpmn", Kind: KindBPMN}, {Path: "pricing.dmn", Kind: KindDMN}}
	if len(files) != len(want) || files[0] != want[0] || files[1] != want[1] {
		t.Errorf("List: %v, ждали %v", files, want)
	}

	content, err := Read(root, "orders/order.bpmn")
	if err != nil || content != "<x/>" {
		t.Errorf("Read: %q, %v", content, err)
	}
	if err := Create(root, "pricing.dmn", "<y/>"); err == nil {
		t.Error("Create существующего файла: ждали ошибку")
	}
}

func TestListSymlinkRoot(t *testing.T) {
	real := t.TempDir()
	if err := Write(real, "order.bpmn", "<x/>"); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(t.TempDir(), "link")
	if err := os.Symlink(real, link); err != nil {
		t.Skip("символические ссылки недоступны:", err)
	}
	files, err := List(link)
	if err != nil || len(files) != 1 || files[0].Path != "order.bpmn" {
		t.Errorf("List через ссылку: %v, %v", files, err)
	}
}

func TestListSkipsUnreadableDirs(t *testing.T) {
	root := t.TempDir()
	Write(root, "order.bpmn", "<x/>")
	Write(root, "locked/hidden.bpmn", "<x/>")
	locked := filepath.Join(root, "locked")
	if err := os.Chmod(locked, 0); err != nil {
		t.Fatal(err)
	}
	defer os.Chmod(locked, 0o755)
	if _, err := os.ReadDir(locked); err == nil {
		t.Skip("папка читается несмотря на права (root?)")
	}
	files, err := List(root)
	if err != nil || len(files) != 1 || files[0].Path != "order.bpmn" {
		t.Errorf("List с нечитаемой папкой: %v, %v", files, err)
	}
}

func TestDir(t *testing.T) {
	real := t.TempDir()
	link := filepath.Join(t.TempDir(), "link")
	if err := os.Symlink(real, link); err != nil {
		t.Skip("символические ссылки недоступны:", err)
	}
	if dir, err := Dir(link); err != nil || dir != real {
		t.Errorf("Dir(ссылка): %q, %v, ждали %q", dir, err, real)
	}
	if _, err := Dir(filepath.Join(real, "нет")); err == nil {
		t.Error("Dir несуществующей папки: ждали ошибку")
	}
	file := filepath.Join(real, "a.bpmn")
	os.WriteFile(file, nil, 0o644)
	if _, err := Dir(file); err == nil {
		t.Error("Dir файла: ждали ошибку")
	}
}

func TestBuildIndex(t *testing.T) {
	root := t.TempDir()
	Write(root, "order.bpmn", `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Order" name="Заказ" /><bpmn:process id="Refund" /></bpmn:definitions>`)
	Write(root, "pricing.dmn", `<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/">
  <decision id="Offer" name="Скидка" /></definitions>`)
	Write(root, "broken.bpmn", `<bpmn:definitions`)

	index, err := BuildIndex(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(index.Processes) != 2 || index.Processes[0] != (Ref{Id: "Order", Name: "Заказ", Path: "order.bpmn"}) {
		t.Errorf("Processes: %v", index.Processes)
	}
	if len(index.Decisions) != 1 || index.Decisions[0].Id != "Offer" {
		t.Errorf("Decisions: %v", index.Decisions)
	}
	if _, ok := index.Problems["broken.bpmn"]; !ok {
		t.Errorf("Problems: %v", index.Problems)
	}
}
