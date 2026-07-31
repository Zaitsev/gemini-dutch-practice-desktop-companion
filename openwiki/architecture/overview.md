---
type: Architecture
title: Architecture Overview
description: Overview of the Wails desktop architecture, Go backend services, and React frontend communication bridge.
tags: [architecture, wails, go, frontend, ipc]
---

# Architecture Overview

The TaalGem Desktop Companion is structured as a cross-platform desktop application using [Wails v2](https://wails.io). It bridges a robust Go backend with a modern React and TypeScript frontend.

```mermaid
sequenceDiagram
    participant FE as React Frontend
    participant W as Wails Bridge (IPC)
    participant BE as Go Backend (app.go / firestore.go)
    participant FB as Firebase Backend

    FE->>W: Call Bound Go Method (e.g., GetFlashcards)
    W->>BE: Invoke Go Function
    BE->>FB: Authenticated API Request / Firestore Query
    FB-->>BE: Return Data / Auth Token
    BE-->>W: Return Result / Struct
    W-->>FE: Resolve Promise in TypeScript
```

## Backend Modules

The Go backend (`/` directory) is split into focused functional concerns:
- **`app.go`**: Core Wails application struct (`App`), lifecycle hooks (`startup`, `domReady`, `shutdown`), and primary frontend-exposed methods.
- **`auth.go`**: Manages Google/Firebase authentication state, token refresh, and secure image proxying with SSRF protection (`isAllowedPhotoURL`).
- **`config.go`**: Handles local configuration persistence and app settings.
- **`firestore.go`**: Implements direct interaction with Firestore and backend APIs for user dictionaries, flashcards, and word decks.
- **`startup_*.go`**: Platform-specific startup routines (macOS, Windows, unsupported).

## Frontend Structure

The React application under `/frontend/src` is organized into:
- **State & Providers (`provider.tsx`, `App.tsx`)**: Global authentication and user state management.
- **Pages (`LoginPage.tsx`, `WordPage.tsx`, `settingsPage.tsx`)**: Core views for authentication, vocabulary management, and settings.
- **Components (`/components`)**: Modular UI elements including [Flashcards and Word Decks](/openwiki/domain/flashcards-and-decks.md) (`AnswerControls.tsx`, `WordDeckAssignments.tsx`), audio playback (`PlayAudioUrl.tsx`), and card state handling.

This architecture depends heavily on [Authentication and Sync](/openwiki/operations/authentication-and-sync.md) for secure cloud connectivity.
