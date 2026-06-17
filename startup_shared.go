package main

import (
	"os"
	"path/filepath"
)

const (
	windowsStartupShortcutName = "TaalGem-companion.lnk"
	macLaunchAgentFilename     = "nl.taalgem.companion.plist"
	macLaunchAgentLabel        = "nl.taalgem.companion"
)

func executablePath() (string, error) {
	exePath, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.Abs(exePath)
}
