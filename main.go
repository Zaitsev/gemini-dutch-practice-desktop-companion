package main

import (
	"context"
	"embed"
	goruntime "runtime"

	"github.com/energye/systray"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var trayIconPng []byte

//go:embed build/windows/icon.ico
var trayIconIco []byte

var shouldExit bool = false

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Create application with custom options
	err := wails.Run(&options.App{
		Title:             "TaalGem Companion",
		Width:             380,
		Height:            440,
		StartHidden:       true, // Runs completely minimized to tray on start!
		MinWidth:          320,
		MinHeight:         400,
		MaxWidth:          600,
		MaxHeight:         700,
		Frameless:         true, // Premium frameless pop-up window!
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour:  &options.RGBA{R: 15, G: 23, B: 42, A: 1}, // Matches Slate-900 theme
		OnStartup: func(ctx context.Context) {
			app.startup(ctx)

			// Initialize native cross-platform system tray in separate goroutine
			go systray.Run(func() {
				if goruntime.GOOS == "windows" {
					systray.SetIcon(trayIconIco)
				} else {
					systray.SetIcon(trayIconPng)
				}
				systray.SetTitle("TaalGem")
				systray.SetTooltip("TaalGem.NL Companion")

				systray.SetOnClick(func(menu systray.IMenu) {
					runtime.WindowShow(app.ctx)
					runtime.WindowSetAlwaysOnTop(app.ctx, true)
				})

				mShow := systray.AddMenuItem("Show Companion", "Show the main window")
				mCheck := systray.AddMenuItem("Check Reviews", "Force check due cards")
				systray.AddSeparator()
				mExit := systray.AddMenuItem("Exit", "Exit application")

				mShow.Click(func() {
					runtime.WindowShow(app.ctx)
					runtime.WindowSetAlwaysOnTop(app.ctx, true)
				})

				mCheck.Click(func() {
					app.TriggerPopupCheck()
				})

				mExit.Click(func() {
					shouldExit = true
					systray.Quit()
					runtime.Quit(app.ctx)
				})
			}, func() {
				// Cleanup on exit
			})
		},
		OnBeforeClose: func(ctx context.Context) bool {
			// If exit menu triggered, close completely
			if shouldExit {
				return false
			}
			// Otherwise, clicking standard close action hides back to tray!
			runtime.WindowHide(ctx)
			return true
		},
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
