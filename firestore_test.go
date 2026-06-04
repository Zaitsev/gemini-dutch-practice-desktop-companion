package main

import "testing"

func TestEscapeFieldPathSegment(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "alphanumeric starting with letter",
			input:    "abc123",
			expected: "`abc123`",
		},
		{
			name:     "starting with number",
			input:    "0STb0pRKWpWKNdEB9uZf",
			expected: "`0STb0pRKWpWKNdEB9uZf`",
		},
		{
			name:     "contains backtick",
			input:    "my`field",
			expected: "`my\\`field`",
		},
		{
			name:     "contains backslash",
			input:    "my\\field",
			expected: "`my\\\\field`",
		},
		{
			name:     "contains both backtick and backslash",
			input:    "my`\\field",
			expected: "`my\\`\\\\field`",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			actual := escapeFieldPathSegment(tc.input)
			if actual != tc.expected {
				t.Errorf("escapeFieldPathSegment(%q) = %q; want %q", tc.input, actual, tc.expected)
			}
		})
	}
}
