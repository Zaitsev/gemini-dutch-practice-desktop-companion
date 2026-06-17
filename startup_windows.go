//go:build windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func SetLaunchAtLoginEnabled(enable bool) error {
	if enable {
		return createWindowsStartupShortcut()
	}
	return removeWindowsStartupShortcut()
}

func IsLaunchAtLoginEnabled() (bool, error) {
	shortcutPath, err := windowsStartupShortcutPath()
	if err != nil {
		return false, err
	}

	_, err = os.Stat(shortcutPath)
	if err == nil {
		return true, nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return false, err
}

func windowsStartupShortcutPath() (string, error) {
	appDataDir := os.Getenv("APPDATA")
	if strings.TrimSpace(appDataDir) == "" {
		return "", fmt.Errorf("APPDATA environment variable is empty")
	}
	startupDir := filepath.Join(appDataDir, "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
	return filepath.Join(startupDir, windowsStartupShortcutName), nil
}

func createWindowsStartupShortcut() error {
	exePath, err := executablePath()
	if err != nil {
		return fmt.Errorf("resolve executable path: %w", err)
	}

	shortcutPath, err := windowsStartupShortcutPath()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(shortcutPath), 0755); err != nil {
		return fmt.Errorf("create startup directory: %w", err)
	}

	psScript := fmt.Sprintf("$ws=New-Object -ComObject WScript.Shell; $s=$ws.CreateShortcut('%s'); $s.TargetPath='%s'; $s.WorkingDirectory='%s'; $s.Save()",
		escapePowerShellSingleQuoted(shortcutPath),
		escapePowerShellSingleQuoted(exePath),
		escapePowerShellSingleQuoted(filepath.Dir(exePath)),
	)

	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", psScript)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("create startup shortcut failed: %w (output: %s)", err, strings.TrimSpace(string(output)))
	}

	return nil
}

func removeWindowsStartupShortcut() error {
	shortcutPath, err := windowsStartupShortcutPath()
	if err != nil {
		return err
	}

	if err := os.Remove(shortcutPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove startup shortcut: %w", err)
	}

	return nil
}

func escapePowerShellSingleQuoted(value string) string {
	return strings.ReplaceAll(value, "'", "''")
}
