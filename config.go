package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type Config struct {
	IntervalMinutes     int    `json:"intervalMinutes"`
	IdToken             string `json:"idToken"`
	RefreshToken        string `json:"refreshToken"`
	Uid                 string `json:"uid"`
	DisplayName         string `json:"displayName"`
	Email               string `json:"email"`
	PhotoURL            string `json:"photoURL"`
	UseEmulator         bool   `json:"useEmulator"`
	WindowX             int    `json:"windowX"`
	WindowY             int    `json:"windowY"`
	WindowW             int    `json:"windowW"`
	WindowH             int    `json:"windowH"`
	WindowPositionSaved bool   `json:"windowPositionSaved"`
	DndEndTimestamp     int64  `json:"dndEndTimestamp"`
	DndDurationMinutes  int    `json:"dndDurationMinutes"`
	AutoHideAfterCards  int    `json:"autoHideAfterCards"`
	ChallengeMode       string `json:"challengeMode"` // "normal", "reverse", "mixed"
}

func normalizeAutoHideAfterCards(value int) int {
	if value < 0 {
		return 0
	}
	if value > 10 {
		return 10
	}
	return value
}

const configDirName = "taalgem-companion"
const configFileName = "config.json"

// GetConfigPath returns the absolute path to the config file in the user's config directory
func GetConfigPath() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		// Fallback to local directory if user config directory cannot be resolved
		return configFileName, nil
	}

	appConfigDir := filepath.Join(configDir, configDirName)
	if err := os.MkdirAll(appConfigDir, 0755); err != nil {
		return "", err
	}

	return filepath.Join(appConfigDir, configFileName), nil
}

// LoadConfig reads the config file from disk
func LoadConfig() (*Config, error) {
	path, err := GetConfigPath()
	if err != nil {
		return nil, err
	}

	// If file does not exist, return default config
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return &Config{
			IntervalMinutes:    60,
			ChallengeMode:      "normal",
			AutoHideAfterCards: 1,
			UseEmulator:        false,
		}, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	config := Config{
		IntervalMinutes:    60,
		ChallengeMode:      "normal",
		AutoHideAfterCards: 1,
	}
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, err
	}

	var legacyConfig struct {
		AutoHideAfterCards *int  `json:"autoHideAfterCards"`
		AutoHideOnAnswer   *bool `json:"autoHideOnAnswer"`
	}
	if err := json.Unmarshal(data, &legacyConfig); err == nil {
		if legacyConfig.AutoHideAfterCards == nil && legacyConfig.AutoHideOnAnswer != nil {
			if *legacyConfig.AutoHideOnAnswer {
				config.AutoHideAfterCards = 1
			} else {
				config.AutoHideAfterCards = 0
			}
		}
	}

	// Guard against default 0 interval
	if config.IntervalMinutes <= 0 {
		config.IntervalMinutes = 60
	}
	config.AutoHideAfterCards = normalizeAutoHideAfterCards(config.AutoHideAfterCards)

	return &config, nil
}

// SaveConfig writes the config file to disk
func (c *Config) Save() error {
	path, err := GetConfigPath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0644)
}
