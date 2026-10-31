//go:build linux

package main

import "os"

// WebKitGTK по умолчанию выводит страницу через DMA-BUF. С проприетарным драйвером NVIDIA он не может выделить
// буфер (Failed to create GBM buffer) и окно остаётся пустым. Без DMA-BUF WebKit рисует через разделяемую память -
// работает везде. Переменная должна быть задана до инициализации WebKit; явно заданное значение не трогаем
func init() {
	if _, ok := os.LookupEnv("WEBKIT_DISABLE_DMABUF_RENDERER"); !ok {
		os.Setenv("WEBKIT_DISABLE_DMABUF_RENDERER", "1")
	}
}
