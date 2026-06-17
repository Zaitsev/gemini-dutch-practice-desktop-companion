//go:build !windows && !darwin

package main

import "fmt"

func SetLaunchAtLoginEnabled(enable bool) error {
	_ = enable
	return fmt.Errorf("launch-at-login is unsupported on this platform")
}

func IsLaunchAtLoginEnabled() (bool, error) {
	return false, fmt.Errorf("launch-at-login is unsupported on this platform")
}
