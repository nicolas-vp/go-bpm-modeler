package main

import (
	"embed"
	"log"
	goruntime "runtime"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()

	// Без меню Edit на macOS не работают Cmd+C/Cmd+V в WebView
	appMenu := menu.NewMenu()
	if goruntime.GOOS == "darwin" {
		appMenu.Append(menu.AppMenu())
	}
	appMenu.Append(menu.EditMenu())

	err := wails.Run(&options.App{
		Title:         "go-bpm modeler",
		Width:         1440,
		Height:        900,
		MinWidth:      900,
		MinHeight:     600,
		Menu:          appMenu,
		AssetServer:   &assetserver.Options{Assets: assets},
		OnStartup:     app.startup,
		OnBeforeClose: app.beforeClose,
		Bind:          []any{app},
	})
	if err != nil {
		log.Fatal(err)
	}
}
