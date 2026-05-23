package main

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx        context.Context
	config     *Config
	configLock sync.Mutex
	timerStop  chan struct{}
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		timerStop: make(chan struct{}),
	}
}

// startup is called when the app starts.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	cfg, err := LoadConfig()
	if err != nil {
		fmt.Printf("[Startup] Error loading config: %v\n", err)
		a.config = &Config{IntervalMinutes: 60}
	} else {
		a.config = cfg
	}

	// Trigger background checker loop
	go a.startBackgroundChecker()
}

// GetConfig returns the current local config to the frontend
func (a *App) GetConfig() *Config {
	a.configLock.Lock()
	defer a.configLock.Unlock()
	return a.config
}

// SaveInterval updates and saves the check interval in minutes
func (a *App) SaveInterval(minutes int) bool {
	a.configLock.Lock()
	defer a.configLock.Unlock()
	a.config.IntervalMinutes = minutes
	if err := a.config.Save(); err != nil {
		fmt.Printf("[Config] Error saving interval: %v\n", err)
		return false
	}
	return true
}

// Login triggers the system browser loopback login
func (a *App) Login() (*Config, error) {
	a.configLock.Lock()
	useEmulator := a.config.UseEmulator
	a.configLock.Unlock()

	// Use standard emulator host for desktop (127.0.0.1)
	res, err := StartAuthServer(useEmulator, "127.0.0.1")
	if err != nil {
		return nil, err
	}

	if res.Error != "" {
		return nil, fmt.Errorf("authentication error: %s", res.Error)
	}

	a.configLock.Lock()
	a.config.IdToken = res.IdToken
	a.config.Uid = res.Uid
	a.config.DisplayName = res.DisplayName
	a.config.Email = res.Email
	a.config.PhotoURL = res.PhotoURL
	if err := a.config.Save(); err != nil {
		fmt.Printf("[Config] Error saving login config: %v\n", err)
	}
	currentConfig := a.config
	a.configLock.Unlock()

	// Emit login success event to frontend
	runtime.EventsEmit(a.ctx, "auth_state_changed", currentConfig)

	// Position and trigger initial review check
	go a.TriggerPopupCheck()

	return currentConfig, nil
}

// Logout clears credentials
func (a *App) Logout() bool {
	a.configLock.Lock()
	a.config.IdToken = ""
	a.config.Uid = ""
	a.config.DisplayName = ""
	a.config.Email = ""
	a.config.PhotoURL = ""
	if err := a.config.Save(); err != nil {
		fmt.Printf("[Config] Error saving logout config: %v\n", err)
	}
	a.configLock.Unlock()

	runtime.EventsEmit(a.ctx, "auth_state_changed", nil)
	return true
}

// GetFlashcards fetches and merges word definitions with user dictionary SRS levels
func (a *App) GetFlashcards() ([]Word, error) {
	a.configLock.Lock()
	uid := a.config.Uid
	token := a.config.IdToken
	useEmulator := a.config.UseEmulator
	a.configLock.Unlock()

	if uid == "" || token == "" {
		return nil, fmt.Errorf("user not authenticated")
	}

	client := NewFirestoreClient(token, uid, useEmulator, "127.0.0.1")

	// 1. Fetch SRS mappings from userDictionaries/{uid}
	srsMap, err := client.GetUserDictionary()
	if err != nil {
		return nil, fmt.Errorf("error fetching user srs dictionary: %v", err)
	}

	// 2. Fetch all words added by the user
	words, err := client.GetWordsByCreator()
	if err != nil {
		return nil, fmt.Errorf("error fetching word documents: %v", err)
	}

	// 3. Merge word structures with SRS stats
	for i := range words {
		if srsStats, exists := srsMap[words[i].Id]; exists {
			words[i].SrsLevel = int(srsStats["srsLevel"])
			words[i].NextReviewAt = srsStats["nextReviewAt"]
		} else {
			// Defaults if not mapped in dictionary yet
			words[i].SrsLevel = 0
			words[i].NextReviewAt = time.Now().UnixNano() / int64(time.Millisecond)
		}
	}

	return words, nil
}

// UpdateSRS saves review progress to Firestore REST API
func (a *App) UpdateSRS(wordId string, srsLevel int, nextReviewAt int64) (bool, error) {
	a.configLock.Lock()
	uid := a.config.Uid
	token := a.config.IdToken
	useEmulator := a.config.UseEmulator
	a.configLock.Unlock()

	if uid == "" || token == "" {
		return false, fmt.Errorf("user not authenticated")
	}

	client := NewFirestoreClient(token, uid, useEmulator, "127.0.0.1")
	if err := client.UpdateWordSRS(wordId, srsLevel, nextReviewAt); err != nil {
		return false, err
	}

	return true, nil
}

// TriggerPopupCheck forces a check of reviews, showing the window in the bottom-right if due
func (a *App) TriggerPopupCheck() int {
	words, err := a.GetFlashcards()
	if err != nil {
		return 0
	}

	nowMs := time.Now().UnixNano() / int64(time.Millisecond)
	dueCount := 0
	for _, word := range words {
		if word.NextReviewAt <= nowMs {
			dueCount++
		}
	}

	if dueCount > 0 {
		a.ShowBottomRightPopup()
	}

	return dueCount
}

// ShowBottomRightPopup slides the window up in the bottom-right corner above the taskbar
func (a *App) ShowBottomRightPopup() {
	// Standard compact card popup window sizes
	const winWidth = 380
	const winHeight = 440

	screens, err := runtime.ScreenGetAll(a.ctx)
	if err == nil && len(screens) > 0 {
		// Use primary screen or fall back to the first one
		primary := screens[0]
		for _, s := range screens {
			if s.IsPrimary {
				primary = s
				break
			}
		}
		
		// Position elegantly above taskbar (typically 40px height)
		x := primary.Width - winWidth - 20
		y := primary.Height - winHeight - 60
		
		// Guard bounds
		if x < 0 { x = 100 }
		if y < 0 { y = 100 }

		runtime.WindowSetSize(a.ctx, winWidth, winHeight)
		runtime.WindowSetPosition(a.ctx, x, y)
	} else {
		// Fallback size
		runtime.WindowSetSize(a.ctx, winWidth, winHeight)
	}

	runtime.WindowShow(a.ctx)
	runtime.WindowSetAlwaysOnTop(a.ctx, true)
	runtime.EventsEmit(a.ctx, "trigger_flashcard_review", nil)
}

// startBackgroundChecker loop runs periodically based on the user's config
func (a *App) startBackgroundChecker() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	var lastCheck time.Time

	for {
		select {
		case <-ticker.C:
			a.configLock.Lock()
			uid := a.config.Uid
			intervalMins := a.config.IntervalMinutes
			a.configLock.Unlock()

			if uid == "" {
				continue // Stay silent if not logged in
			}

			// Perform reviews check at specified interval
			if time.Since(lastCheck) >= time.Duration(intervalMins)*time.Minute {
				lastCheck = time.Now()
				a.TriggerPopupCheck()
			}
		case <-a.timerStop:
			return
		}
	}
}

// HideWindow hides the app back to system tray
func (a *App) HideWindow() {
	runtime.WindowHide(a.ctx)
}
