//go:build darwin

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func SetLaunchAtLoginEnabled(enable bool) error {
	if enable {
		return createMacLaunchAgent()
	}
	return removeMacLaunchAgent()
}

func IsLaunchAtLoginEnabled() (bool, error) {
	plistPath, err := macLaunchAgentPath()
	if err != nil {
		return false, err
	}

	_, err = os.Stat(plistPath)
	if err == nil {
		return true, nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return false, err
}

func macLaunchAgentPath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home directory: %w", err)
	}
	return filepath.Join(homeDir, "Library", "LaunchAgents", macLaunchAgentFilename), nil
}

func createMacLaunchAgent() error {
	exePath, err := executablePath()
	if err != nil {
		return fmt.Errorf("resolve executable path: %w", err)
	}

	plistPath, err := macLaunchAgentPath()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(plistPath), 0755); err != nil {
		return fmt.Errorf("create LaunchAgents directory: %w", err)
	}

	plist := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>%s</string>
  <key>ProgramArguments</key>
  <array>
    <string>%s</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`, xmlEscape(macLaunchAgentLabel), xmlEscape(exePath))

	if err := os.WriteFile(plistPath, []byte(plist), 0644); err != nil {
		return fmt.Errorf("write LaunchAgent plist: %w", err)
	}

	return nil
}

func removeMacLaunchAgent() error {
	plistPath, err := macLaunchAgentPath()
	if err != nil {
		return err
	}

	if err := os.Remove(plistPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove LaunchAgent plist: %w", err)
	}

	return nil
}

func xmlEscape(value string) string {
	replacer := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		"\"", "&quot;",
		"'", "&apos;",
	)
	return replacer.Replace(value)
}
