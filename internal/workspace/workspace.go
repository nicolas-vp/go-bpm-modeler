// Package workspace - файлы BPMN и DMN рабочей папки: список, чтение, запись и индекс id процессов и решений
package workspace

import (
	"encoding/xml"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"
)

// Kind - тип файла рабочей папки
type Kind string

const (
	KindBPMN Kind = "bpmn"
	KindDMN  Kind = "dmn"
)

// ErrOutsideRoot - путь выходит за пределы рабочей папки
var ErrOutsideRoot = errors.New("путь вне рабочей папки")

// File - файл рабочей папки
type File struct {
	// Path - путь относительно корня рабочей папки, через "/"
	Path string `json:"path"`
	Kind Kind   `json:"kind"`
}

// Ref - процесс или решение, найденное в файле рабочей папки
type Ref struct {
	Id   string `json:"id"`
	Name string `json:"name"`
	Path string `json:"path"`
}

// Index - id процессов и решений рабочей папки: варианты для Process ID у call activity и Decision ID у business
// rule task
type Index struct {
	Processes []Ref `json:"processes"`
	Decisions []Ref `json:"decisions"`
	// Problems - файлы, которые не удалось разобрать: путь -> ошибка
	Problems map[string]string `json:"problems"`
}

// KindOf возвращает тип файла по расширению; false - файл не BPMN и не DMN
func KindOf(path string) (Kind, bool) {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".bpmn":
		return KindBPMN, true
	case ".dmn":
		return KindDMN, true
	}
	return "", false
}

// Dir проверяет, что путь - папка, и возвращает его без символических ссылок (/bin -> /usr/bin)
func Dir(path string) (string, error) {
	real, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(real)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", fmt.Errorf("не папка: %q", path)
	}
	return real, nil
}

// List возвращает файлы BPMN и DMN рабочей папки, отсортированные по пути. Скрытые папки, node_modules и папки без
// прав на чтение пропускаются
func List(root string) ([]File, error) {
	// WalkDir не заходит в корень, если он - символическая ссылка
	root, err := Dir(root)
	if err != nil {
		return nil, err
	}
	var files []File
	err = filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			if path != root && entry != nil && entry.IsDir() && errors.Is(err, fs.ErrPermission) {
				return filepath.SkipDir
			}
			return err
		}
		if entry.IsDir() {
			if path != root && (strings.HasPrefix(entry.Name(), ".") || entry.Name() == "node_modules") {
				return filepath.SkipDir
			}
			return nil
		}
		kind, ok := KindOf(path)
		if !ok {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		files = append(files, File{Path: filepath.ToSlash(rel), Kind: kind})
		return nil
	})
	if err != nil {
		return nil, err
	}
	slices.SortFunc(files, func(a, b File) int { return strings.Compare(a.Path, b.Path) })
	return files, nil
}

// Resolve переводит путь относительно рабочей папки в абсолютный и проверяет, что он не выходит за её пределы
func Resolve(root, rel string) (string, error) {
	if rel == "" || filepath.IsAbs(filepath.FromSlash(rel)) {
		return "", fmt.Errorf("%w: %q", ErrOutsideRoot, rel)
	}
	path := filepath.Join(root, filepath.FromSlash(rel))
	inside, err := filepath.Rel(root, path)
	if err != nil || inside == ".." || strings.HasPrefix(inside, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("%w: %q", ErrOutsideRoot, rel)
	}
	return path, nil
}

// Read читает файл рабочей папки
func Read(root, rel string) (string, error) {
	path, err := Resolve(root, rel)
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(path)
	return string(data), err
}

// Write записывает файл рабочей папки атомарно: во временный файл рядом, затем переименование. Папки создаются
func Write(root, rel, content string) error {
	path, err := Resolve(root, rel)
	if err != nil {
		return err
	}
	if _, ok := KindOf(path); !ok {
		return fmt.Errorf("файл должен быть .bpmn или .dmn: %q", rel)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.WriteString(content); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	// Права существующего файла сохраняются, новый файл - 0644
	mode := fs.FileMode(0o644)
	if info, err := os.Stat(path); err == nil {
		mode = info.Mode().Perm()
	}
	if err := os.Chmod(tmp.Name(), mode); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}

// Create создаёт новый файл рабочей папки; ошибка, если файл уже есть
func Create(root, rel, content string) error {
	path, err := Resolve(root, rel)
	if err != nil {
		return err
	}
	if _, err := os.Stat(path); err == nil {
		return fmt.Errorf("файл уже существует: %q", rel)
	} else if !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	return Write(root, rel, content)
}

// definitions - то из BPMN и DMN, что нужно индексу. Элементы сопоставляются по локальному имени
type definitions struct {
	Processes []struct {
		Id   string `xml:"id,attr"`
		Name string `xml:"name,attr"`
	} `xml:"process"`
	Decisions []struct {
		Id   string `xml:"id,attr"`
		Name string `xml:"name,attr"`
	} `xml:"decision"`
}

// BuildIndex собирает id процессов из *.bpmn и решений из *.dmn рабочей папки
func BuildIndex(root string) (Index, error) {
	files, err := List(root)
	if err != nil {
		return Index{}, err
	}
	index := Index{Processes: []Ref{}, Decisions: []Ref{}, Problems: map[string]string{}}
	for _, file := range files {
		content, err := Read(root, file.Path)
		if err != nil {
			index.Problems[file.Path] = err.Error()
			continue
		}
		var defs definitions
		if err := xml.Unmarshal([]byte(content), &defs); err != nil {
			index.Problems[file.Path] = err.Error()
			continue
		}
		switch file.Kind {
		case KindBPMN:
			for _, p := range defs.Processes {
				index.Processes = append(index.Processes, Ref{Id: p.Id, Name: p.Name, Path: file.Path})
			}
		case KindDMN:
			for _, d := range defs.Decisions {
				index.Decisions = append(index.Decisions, Ref{Id: d.Id, Name: d.Name, Path: file.Path})
			}
		}
	}
	return index, nil
}
