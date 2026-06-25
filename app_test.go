package main

import (
	"testing"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func makeScreen(w, h int, primary bool) runtime.Screen {
	var s runtime.Screen
	s.IsPrimary = primary
	s.Size.Width = w
	s.Size.Height = h
	return s
}

func TestIsPositionOnScreen(t *testing.T) {
	tests := []struct {
		name    string
		x, y, w int
		screens []runtime.Screen
		want    bool
	}{
		{
			name:    "no screens – positive position accepted",
			x:       100, y: 100, w: 380,
			screens: []runtime.Screen{},
			want:    true,
		},
		{
			name:    "no screens – negative y rejected",
			x:       100, y: -1, w: 380,
			screens: []runtime.Screen{},
			want:    false,
		},
		{
			name:    "zero-dimension screens (Windows cold-start) – positive position accepted",
			x:       800, y: 400, w: 380,
			screens: []runtime.Screen{makeScreen(0, 0, true)},
			want:    true,
		},
		{
			name:    "zero-dimension screens (Windows cold-start) – negative x rejected",
			x:       -100, y: 400, w: 380,
			screens: []runtime.Screen{makeScreen(0, 0, true)},
			want:    false,
		},
		{
			name:    "valid single screen – window fully visible",
			x:       800, y: 400, w: 380,
			screens: []runtime.Screen{makeScreen(1920, 1080, true)},
			want:    true,
		},
		{
			name:    "valid single screen – window mostly off right edge",
			x:       1920, y: 400, w: 380,
			screens: []runtime.Screen{makeScreen(1920, 1080, true)},
			want:    false,
		},
		{
			name:    "valid single screen – window mostly off bottom edge",
			x:       800, y: 1080, w: 380,
			screens: []runtime.Screen{makeScreen(1920, 1080, true)},
			want:    false,
		},
		{
			name:    "valid dual screens – window on second screen",
			x:       2000, y: 400, w: 380,
			screens: []runtime.Screen{makeScreen(1920, 1080, true), makeScreen(1920, 1080, false)},
			want:    true,
		},
		{
			name:    "valid dual screens – window off both screens",
			x:       4000, y: 400, w: 380,
			screens: []runtime.Screen{makeScreen(1920, 1080, true), makeScreen(1920, 1080, false)},
			want:    false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := isPositionOnScreen(tc.x, tc.y, tc.w, tc.screens)
			if got != tc.want {
				t.Errorf("isPositionOnScreen(x=%d, y=%d, w=%d) = %v; want %v",
					tc.x, tc.y, tc.w, got, tc.want)
			}
		})
	}
}
