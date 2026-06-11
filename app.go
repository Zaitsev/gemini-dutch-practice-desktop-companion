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
	ctx         context.Context
	config      *Config
	configLock  sync.Mutex
	timerStop   chan struct{}
	reviewTimer *time.Timer
	timerLock   sync.Mutex
	words       []Word
	hasFetched  bool
	wordsLock   sync.Mutex
	// Track the state manually when hiding/showing
	isWindowOpen bool
}

type DndStatus struct {
	Active          bool  `json:"active"`
	EndTimestamp    int64 `json:"endTimestamp"`
	RemainingMs     int64 `json:"remainingMs"`
	DurationMinutes int   `json:"durationMinutes"`
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

	// Prime in-memory flashcard cache on startup when available.
	if words, err := a.FetchFlashcards(); err != nil {
		fmt.Printf("[Startup] Initial flashcard fetch skipped (Client offline or Auth expired): %v\n", err)
		fmt.Println("[Startup] Friendly note: The background checker will automatically attempt to fetch cards and self-heal in the background.")
	} else {
		a.setWords(words)
		fmt.Printf("[Startup] Initial flashcard fetch succeeded! Cached %d words.\n", len(words))
	}

	// Trigger background checker loop
	
	go a.startBackgroundChecker()
}

func (a *App) setWords(words []Word) {
	a.wordsLock.Lock()
	a.words = words
	a.hasFetched = true
	a.wordsLock.Unlock()
}

func (a *App) isCacheEmptyAndUnfetched() bool {
	a.wordsLock.Lock()
	defer a.wordsLock.Unlock()
	return len(a.words) == 0 && !a.hasFetched
}

func (a *App) newFirestoreClient() (*FirestoreClient, error) {
	a.configLock.Lock()
	uid := a.config.Uid
	token := a.config.IdToken
	refreshToken := a.config.RefreshToken
	useEmulator := a.config.UseEmulator
	a.configLock.Unlock()

	if uid == "" || token == "" {
		return nil, fmt.Errorf("user not authenticated")
	}

	client := NewFirestoreClient(token, refreshToken, uid, useEmulator, "127.0.0.1", func(newIdToken, newRefreshToken string) {
		a.configLock.Lock()
		a.config.IdToken = newIdToken
		if newRefreshToken != "" {
			a.config.RefreshToken = newRefreshToken
		}
		if err := a.config.Save(); err != nil {
			fmt.Printf("[Config] Error auto-saving refreshed token: %v\n", err)
		}
		a.configLock.Unlock()
	})

	return client, nil
}

func (a *App) wordsCount() int {
	a.wordsLock.Lock()
	defer a.wordsLock.Unlock()
	return len(a.words)
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
	a.config.IntervalMinutes = minutes
	if err := a.config.Save(); err != nil {
		fmt.Printf("[Config] Error saving interval: %v\n", err)
		a.configLock.Unlock()
		return false
	}
	a.configLock.Unlock()

	// Recalculate review timer with the new interval
	go a.ResetReviewTimer()
	return true
}

// SaveAutoHideOnAnswer updates and saves the autoHideOnAnswer setting
func (a *App) SaveAutoHideOnAnswer(autoHide bool) bool {
	a.configLock.Lock()
	a.config.AutoHideOnAnswer = autoHide
	if err := a.config.Save(); err != nil {
		runtime.LogErrorf(a.ctx, "[Config] Error saving autoHideOnAnswer: %v", err)
		a.configLock.Unlock()
		return false
	}
	a.configLock.Unlock()
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
	a.config.RefreshToken = res.RefreshToken
	a.config.Uid = res.Uid
	a.config.DisplayName = res.DisplayName
	a.config.Email = res.Email
	a.config.PhotoURL = res.PhotoURL
	if err := a.config.Save(); err != nil {
		runtime.LogErrorf(a.ctx, "[Config] Error saving login config: %v", err)
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
	a.config.RefreshToken = ""
	a.config.Uid = ""
	a.config.DisplayName = ""
	a.config.Email = ""
	a.config.PhotoURL = ""
	if err := a.config.Save(); err != nil {
		runtime.LogErrorf(a.ctx, "[Config] Error saving logout config: %v", err)
	}
	a.configLock.Unlock()

	runtime.EventsEmit(a.ctx, "auth_state_changed", nil)
	return true
}
// GetWords returns the current in-memory flashcard list
func (a *App) GetWords() []Word {
	a.wordsLock.Lock()
	defer a.wordsLock.Unlock()
	return a.words
}
// Forse re-fetch words from Firestore and update in-memory cache
func (a *App) ForseRefreshWords() {
	// Prime in-memory flashcard cache on startup when available.
	if words, err := a.FetchFlashcards(); err != nil {
		fmt.Printf("[Startup] Initial flashcard fetch skipped: %v\n", err)

	} else {
		a.setWords(words)
	}
}

// FetchFlashcards fetches and merges word definitions with user dictionary SRS levels
func (a *App) FetchFlashcards() ([]Word, error) {
	runtime.LogInfo(a.ctx, "Fetching flashcards from Firestore...")
	client, err := a.newFirestoreClient()
	if err != nil {
		return nil, err
	}

	// 1. Fetch SRS mappings from userDictionaries/{uid}
	dictionaryState, err := client.GetUserDictionary()
	if err != nil {
		return nil, fmt.Errorf("error fetching user srs dictionary: %v", err)
	}

	return a.mergeWordsWithDictionary(client, dictionaryState)
}

type WordsAndDecks struct {
	Words []Word `json:"words"`
	Decks []Deck `json:"decks"`
}

// GetWordsAndDecks fetches words and decks in a single Firestore read.
func (a *App) GetWordsAndDecks() (*WordsAndDecks, error) {
	client, err := a.newFirestoreClient()
	if err != nil {
		return nil, err
	}

	dictionaryState, err := client.GetUserDictionary()
	if err != nil {
		return nil, fmt.Errorf("error fetching user dictionary: %v", err)
	}

	words, err := a.mergeWordsWithDictionary(client, dictionaryState)
	if err != nil {
		return nil, err
	}

	return &WordsAndDecks{
		Words: words,
		Decks: append([]Deck(nil), dictionaryState.Decks...),
	}, nil
}

func (a *App) mergeWordsWithDictionary(client *FirestoreClient, dictionaryState DictionaryState) ([]Word, error) {
	wordIds := make([]string, 0, len(dictionaryState.Words))
	for id := range dictionaryState.Words {
		wordIds = append(wordIds, id)
	}

	words, err := client.GetWordsByIds(wordIds)
	if err != nil {
		return nil, fmt.Errorf("error fetching word documents: %v", err)
	}

	for i := range words {
		if srsStats, exists := dictionaryState.Words[words[i].Id]; exists {
			words[i].SrsLevel = int(srsStats.SrsLevel)
			words[i].NextReviewAt = srsStats.NextReviewAt
			words[i].DeckIds = append([]string(nil), srsStats.DeckIds...)
		} else {
			words[i].SrsLevel = 0
			words[i].NextReviewAt = time.Now().UnixNano() / int64(time.Millisecond)
			words[i].DeckIds = []string{defaultDeckID}
		}
	}
	runtime.LogInfof(a.ctx, "[GetFlashcards] fetched %d words", len(words))
	return words, nil
}

func (a *App) GetDecks() ([]Deck, error) {
	client, err := a.newFirestoreClient()
	if err != nil {
		return nil, err
	}
	return client.GetDecks()
}

func (a *App) CreateDeck(name string) (bool, error) {
	client, err := a.newFirestoreClient()
	if err != nil {
		return false, err
	}
	if _, err := client.CreateDeck(name); err != nil {
		return false, err
	}
	go a.ForseRefreshWords()
	return true, nil
}

func (a *App) RenameDeck(deckID, name string) (bool, error) {
	client, err := a.newFirestoreClient()
	if err != nil {
		return false, err
	}
	if _, err := client.RenameDeck(deckID, name); err != nil {
		return false, err
	}
	go a.ForseRefreshWords()
	return true, nil
}

func (a *App) DeleteDeck(deckID string) (bool, error) {
	client, err := a.newFirestoreClient()
	if err != nil {
		return false, err
	}
	if _, err := client.DeleteDeck(deckID); err != nil {
		return false, err
	}
	go a.ForseRefreshWords()
	return true, nil
}

func (a *App) SetWordDeckIds(wordID string, deckIds []string) (bool, error) {
	client, err := a.newFirestoreClient()
	if err != nil {
		return false, err
	}
	if err := client.SetWordDeckIds(wordID, deckIds); err != nil {
		return false, err
	}
	go a.ForseRefreshWords()
	return true, nil
}

// UpdateSRS saves review progress to Firestore REST API
func (a *App) UpdateSRS(wordId string, srsLevel int, nextReviewAt int64) (bool, error) {
	client, err := a.newFirestoreClient()
	if err != nil {
		return false, err
	}
	if err := client.UpdateWordSRS(wordId, srsLevel, nextReviewAt); err != nil {
		return false, err
	}

	// Schedule next review check dynamically
	go a.ResetReviewTimer()

	return true, nil
}

func (a *App) getDndStatusLocked(nowMs int64) DndStatus {
	if a.config.DndEndTimestamp <= 0 {
		return DndStatus{}
	}

	if a.config.DndEndTimestamp <= nowMs {
		a.config.DndEndTimestamp = 0
		a.config.DndDurationMinutes = 0
		if err := a.config.Save(); err != nil {
			fmt.Printf("[DND] Error clearing expired DND state: %v\n", err)
		}
		return DndStatus{}
	}

	remainingMs := a.config.DndEndTimestamp - nowMs
	return DndStatus{
		Active:          true,
		EndTimestamp:    a.config.DndEndTimestamp,
		RemainingMs:     remainingMs,
		DurationMinutes: a.config.DndDurationMinutes,
	}
}

func (a *App) emitDndStateChanged(status DndStatus) {
	runtime.EventsEmit(a.ctx, "dnd_state_changed", status)
}

// GetDndStatus returns active DND state and remaining duration.
func (a *App) GetDndStatus() DndStatus {
	a.configLock.Lock()
	status := a.getDndStatusLocked(time.Now().UnixNano() / int64(time.Millisecond))
	a.configLock.Unlock()
	return status
}

// SetDndMinutes enables DND for the requested duration.
func (a *App) SetDndMinutes(minutes int) bool {
	if minutes <= 0 {
		return a.ClearDnd()
	}

	nowMs := time.Now().UnixNano() / int64(time.Millisecond)
	endMs := nowMs + int64(minutes)*60*1000

	a.configLock.Lock()
	a.config.DndEndTimestamp = endMs
	a.config.DndDurationMinutes = minutes
	if err := a.config.Save(); err != nil {
		fmt.Printf("[DND] Error saving DND state: %v\n", err)
		a.configLock.Unlock()
		return false
	}
	status := a.getDndStatusLocked(nowMs)
	a.configLock.Unlock()

	a.emitDndStateChanged(status)
	go a.ResetReviewTimer()
	return true
}

// ClearDnd disables DND immediately.
func (a *App) ClearDnd() bool {
	nowMs := time.Now().UnixNano() / int64(time.Millisecond)

	a.configLock.Lock()
	if a.config.DndEndTimestamp == 0 {
		a.configLock.Unlock()
		a.emitDndStateChanged(DndStatus{})
		return true
	}

	a.config.DndEndTimestamp = 0
	a.config.DndDurationMinutes = 0
	if err := a.config.Save(); err != nil {
		fmt.Printf("[DND] Error clearing DND state: %v\n", err)
		a.configLock.Unlock()
		return false
	}
	status := a.getDndStatusLocked(nowMs)
	a.configLock.Unlock()

	a.emitDndStateChanged(status)
	go a.ResetReviewTimer()
	return true
}

func (a *App) triggerPopupCheck(force bool) int {
	a.wordsLock.Lock()
	words := make([]Word, len(a.words))
	copy(words, a.words)
	a.wordsLock.Unlock()

	if len(words) == 0 {
		return 0
	}

	nowMs := time.Now().UnixNano() / int64(time.Millisecond)
	if !force {
		a.configLock.Lock()
		dndStatus := a.getDndStatusLocked(nowMs)
		a.configLock.Unlock()
		if dndStatus.Active {
			return 0
		}
	}

	dueCount := 0
	for _, word := range words {
		if word.NextReviewAt <= nowMs {
			dueCount++
		}
	}

	if dueCount > 0 {
		fmt.Printf("[PopupCheck] %d cards are due. Triggering popup.\n", dueCount)
		a.ShowAppCardWindow()
	}

	return dueCount
}

// TriggerPopupCheck forces a manual check and bypasses DND suppression.
func (a *App) TriggerPopupCheck() int {
	return a.triggerPopupCheck(true)
}

// SaveWindowState captures the current window position and size and persists it to config.
// Call this before hiding or closing the window so the position survives app restarts.
func (a *App) SaveWindowState() {
	x, y := runtime.WindowGetPosition(a.ctx)
	w, h := runtime.WindowGetSize(a.ctx)
	runtime.LogDebugf(a.ctx, "Saving window state: x=%d, y=%d, w=%d, h=%d", x, y, w, h)
	a.configLock.Lock()
	a.config.WindowX = x
	a.config.WindowY = y
	a.config.WindowW = w
	a.config.WindowH = h
	a.config.WindowPositionSaved = true
	if err := a.config.Save(); err != nil {
		runtime.LogErrorf(a.ctx, "[Config] Error saving window state: %v", err)
	}
	a.configLock.Unlock()
}

// restoreOrDefaultPosition sets the window to the last saved position/size, or falls back to
// positioning it elegantly above the taskbar in the bottom-right corner when no saved state exists.
// It validates the saved position against current screens so a disconnected monitor never leaves the window off-screen.
func (a *App) restoreOrDefaultPosition(defaultW, defaultH int) {
	a.configLock.Lock()
	positionSaved := a.config.WindowPositionSaved
	savedX := a.config.WindowX
	savedY := a.config.WindowY
	savedW := a.config.WindowW
	savedH := a.config.WindowH
	a.configLock.Unlock()

	screens, _ := runtime.ScreenGetAll(a.ctx)

	if positionSaved && savedW > 0 && savedH > 0 && isPositionOnScreen(savedX, savedY, savedW, screens) {
		runtime.WindowSetSize(a.ctx, savedW, savedH)
		runtime.WindowSetPosition(a.ctx, savedX, savedY)
		return
	}

	// Default: position elegantly above taskbar (typically 40px height) in the bottom-right corner
	if len(screens) > 0 {
		primary := screens[0]
		for _, s := range screens {
			if s.IsPrimary {
				primary = s
				break
			}
		}
		x := primary.Size.Width - defaultW - 20
		y := primary.Size.Height - defaultH - 60
		if x < 0 {
			x = 100
		}
		if y < 0 {
			y = 100
		}
		runtime.WindowSetSize(a.ctx, defaultW, defaultH)
		runtime.WindowSetPosition(a.ctx, x, y)
	} else {
		runtime.WindowSetSize(a.ctx, defaultW, defaultH)
	}
}

// isPositionOnScreen returns true if the window's top-left area is within the reachable desktop.
// Wails v2 does not expose per-screen origin coordinates, so we approximate the total desktop
// footprint by summing widths (horizontal arrangement) and taking the max height.
// This reliably catches the most common problem: a monitor being disconnected.
func isPositionOnScreen(x, y, w int, screens []runtime.Screen) bool {
	const minVisible = 50
	if len(screens) == 0 {
		return x >= 0 && y >= 0
	}

	totalW := 0
	maxH := 0
	for _, s := range screens {
		totalW += s.Size.Width
		if s.Size.Height > maxH {
			maxH = s.Size.Height
		}
	}

	// At least minVisible pixels of the window must be within the combined desktop
	return x+minVisible <= totalW && x+w > 0 && y >= 0 && y+minVisible <= maxH
}


func (a *App) SetMChallengeMode(mode string) bool {
	a.configLock.Lock()
	//check mode in normal, reverse, mixed
	if mode != "normal" && mode != "reverse" && mode != "mixed" {
		fmt.Printf("[Config] Invalid challenge mode: %s\n", mode)
		a.configLock.Unlock()
		return false
	}
	a.config.ChallengeMode = mode
	if err := a.config.Save(); err != nil {
		fmt.Printf("[Config] Error saving challenge mode: %v\n", err)
		a.configLock.Unlock()
		return false
	}
	a.configLock.Unlock()
	return true
}


// ShowAppCardWindow slides the window up from the system tray and brings it to the front, 
// then triggers a flashcard review data refresh in the frontend.
func (a *App) ShowAppCardWindow() {
	// Standard compact card popup window sizes
	if  a.isWindowOpen {
		fmt.Printf("[ShowWindow] Window is shown,do nothing.\n")
		return
	}
	const winWidth = 380
	const winHeight = 540

	a.restoreOrDefaultPosition(winWidth, winHeight)

	runtime.WindowShow(a.ctx)
	a.isWindowOpen = true
	runtime.WindowSetAlwaysOnTop(a.ctx, true)
	runtime.EventsEmit(a.ctx, "trigger_flashcard_review", nil)
}

// ResetReviewTimer calculates when the next review is due and schedules a single, energy-efficient timer to fire exactly then.
func (a *App) ResetReviewTimer() {
	a.configLock.Lock()
	uid := a.config.Uid
	intervalMins := a.config.IntervalMinutes
	nowMs := time.Now().UnixNano() / int64(time.Millisecond)
	dndStatus := a.getDndStatusLocked(nowMs)
	a.configLock.Unlock()

	if uid == "" {
		// Stay silent and stop timer if not logged in
		a.timerLock.Lock()
		if a.reviewTimer != nil {
			a.reviewTimer.Stop()
		}
		a.timerLock.Unlock()
		return
	}
	
	// If the in-memory flashcard list is empty and has never been successfully fetched, trigger an automatic background fetch.
	if a.isCacheEmptyAndUnfetched() {
		fmt.Println("[Timer] In-memory flashcard cache is empty. Attempting self-healing background fetch...")
		go func() {
			words, err := a.FetchFlashcards()
			if err != nil {
				// Provide highly user-friendly diagnostic logs showing cause and mitigation
				fmt.Printf("[Timer] Background flashcard fetch failed: %v\n", err)
				fmt.Println("[Timer] Reason: Local companion client is offline, Firestore authentication is expired, or Firestore rules are denying permission.")
				fmt.Println("[Timer] Mitigation: Will automatically retry in 5 minutes (self-healing cooldown). Check internet connection or log out and log back in if problem persists.")
				
				// Schedule retry in 5 minutes
				a.timerLock.Lock()
				if a.reviewTimer != nil {
					a.reviewTimer.Stop()
				}
				a.reviewTimer = time.AfterFunc(5*time.Minute, func() {
					a.ResetReviewTimer()
				})
				a.timerLock.Unlock()
				return
			}
			
			// Success! Cache the words & reset the review timer to instantly schedule the first due check dynamically.
			a.setWords(words)
			fmt.Printf("[Timer] Self-healing background flashcard fetch successful! Retrieved %d words. Dynamic review schedules will now compute.\n", len(words))
			go a.ResetReviewTimer()
		}()
		return
	}

	var nextDueMs int64 = 0
	dueCount := 0

	a.wordsLock.Lock()
	for _, word := range a.words {
		if word.NextReviewAt <= nowMs {
			dueCount++
		} else {
			if nextDueMs == 0 || word.NextReviewAt < nextDueMs {
				nextDueMs = word.NextReviewAt
			}
		}
	}
	a.wordsLock.Unlock()

	// Lock to protect timer updates
	a.timerLock.Lock()
	defer a.timerLock.Unlock()

	// Stop any currently running timer
	if a.reviewTimer != nil {
		a.reviewTimer.Stop()
	}

	// Guard against default or invalid IntervalMinutes
	if intervalMins <= 0 {
		intervalMins = 60
	}
	coarseSyncDuration := time.Duration(intervalMins) * time.Minute
	// coarseSyncDuration := time.Duration(intervalMins) * time.Second // For testing, use seconds instead of minutes

	// Case 1: Cards are already due right now
	if dueCount > 0 {
		if dndStatus.Active {
			fmt.Printf("[Timer] %d cards are due but DND is active for %s. Auto-popup suppressed.\n", dueCount, time.Duration(dndStatus.RemainingMs)*time.Millisecond)
		} else {
			fmt.Printf("[Timer] %d cards are already due. Checking triggering popup.\n", dueCount)
			go a.triggerPopupCheck(false)
		}

		// Schedule next sync based on coarse interval or next future card
		nextTimerDuration := coarseSyncDuration
		if nextDueMs > 0 {
			futureDueDuration := time.Duration(nextDueMs-nowMs) * time.Millisecond
			if futureDueDuration < nextTimerDuration {
				nextTimerDuration = futureDueDuration
			}
		}
		if dndStatus.Active {
			dndRemaining := time.Duration(dndStatus.RemainingMs) * time.Millisecond
			if dndRemaining > 0 && dndRemaining < nextTimerDuration {
				nextTimerDuration = dndRemaining
			}
		}

		fmt.Printf("[Timer] Scheduling next check in %s.\n", nextTimerDuration)
		a.reviewTimer = time.AfterFunc(nextTimerDuration, func() {
			a.ResetReviewTimer()
		})
		return
	}

	// Case 2: No cards are due now, but there are cards scheduled in the future
	if nextDueMs > 0 {
		futureDueDuration := time.Duration(nextDueMs-nowMs) * time.Millisecond
		// Protect against extremely short durations or clock drifts
		if futureDueDuration < 10*time.Second {
			futureDueDuration = 10 * time.Second
		}

		// Schedule whichever comes first: next due card, or coarse sync interval
		nextTimerDuration := coarseSyncDuration
		if futureDueDuration < nextTimerDuration {
			nextTimerDuration = futureDueDuration
			fmt.Printf("[Timer] No reviews due now. Next review is due in %s. Scheduling timer.\n", nextTimerDuration)
		} else {
			fmt.Printf("[Timer] No reviews due now. Next review is in %s, but scheduling coarse sync in %s first.\n", futureDueDuration, nextTimerDuration)
		}
		if dndStatus.Active {
			dndRemaining := time.Duration(dndStatus.RemainingMs) * time.Millisecond
			if dndRemaining > 0 && dndRemaining < nextTimerDuration {
				nextTimerDuration = dndRemaining
				fmt.Printf("[Timer] DND active. Clamping next check to DND expiry in %s.\n", nextTimerDuration)
			}
		}

		a.reviewTimer = time.AfterFunc(nextTimerDuration, func() {
			a.ResetReviewTimer()
		})
		return
	}

	// Case 3: No cards scheduled for review, schedule coarse sync backup timer
	nextTimerDuration := coarseSyncDuration
	if dndStatus.Active {
		dndRemaining := time.Duration(dndStatus.RemainingMs) * time.Millisecond
		if dndRemaining > 0 && dndRemaining < nextTimerDuration {
			nextTimerDuration = dndRemaining
		}
	}
	fmt.Printf("[Timer] No reviews scheduled. Scheduling next check in %s.\n", nextTimerDuration)
	a.reviewTimer = time.AfterFunc(nextTimerDuration, func() {
		a.ResetReviewTimer()
	})
}

// startBackgroundChecker loop manages the dynamic absolute-time timer and detects system wake/time-jump events
func (a *App) startBackgroundChecker() {


	// Schedule the first review timer run
	a.ResetReviewTimer()

	// Launch a lightweight, energy-efficient background goroutine to detect OS suspend/resume (wake-from-sleep) or time jumps
	go func() {
		lastCheck := time.Now()
		for {
			select {
			case <-a.timerStop:
				return
			case <-time.After(10 * time.Second):
				now := time.Now()
				elapsed := now.Sub(lastCheck)
				if elapsed > 25*time.Second {
					fmt.Printf("[WakeDetector] System wake-from-sleep or time jump detected: elapsed %s\n", elapsed)
					if a.wordsCount() == 0 {
						words, err := a.FetchFlashcards()
						if err != nil {
							fmt.Printf("[WakeDetector] Error getting flashcards: %v\n", err)
						} else {
							a.setWords(words)
						}
					}
					// Trigger an immediate non-blocking check and reset the review timer
					go a.ResetReviewTimer()
				}
				lastCheck = now
			}
		}
	}()

	// Wait for application shutdown signal
	<-a.timerStop
	
	a.timerLock.Lock()
	if a.reviewTimer != nil {
		a.reviewTimer.Stop()
	}
	a.timerLock.Unlock()
}

// HideWindow saves window state and hides the app back to system tray
func (a *App) HideWindow() {
	a.SaveWindowState()
	runtime.WindowHide(a.ctx)
	a.isWindowOpen = false
}

// ShowWindow restores and brings the window to the front, and refreshes cards
func (a *App) ShowWindow() {
	a.restoreOrDefaultPosition(380, 540)
	runtime.WindowShow(a.ctx)
	a.isWindowOpen = true
	runtime.WindowSetAlwaysOnTop(a.ctx, true)
	
	// Refresh the frontend data
	runtime.EventsEmit(a.ctx, "trigger_flashcard_review", nil)
	
	// Recalculate timer and check if anything became due
	go a.ResetReviewTimer()
}
