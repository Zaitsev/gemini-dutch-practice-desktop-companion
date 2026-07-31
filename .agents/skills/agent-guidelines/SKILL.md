---
name: agent-guidelines
description: Guidelines and mandatory instructions for AI agents working within this repository, covering OpenWiki wiki-first workflows, skill discovery, Firebase document semantics, and coding session standards.
---

# Agent Guidelines & Usage

This skill provides mandatory instructions for AI agents operating in this repository to ensure efficient codebase navigation, proper OpenWiki utilization, and adherence to repository conventions during coding sessions.

## 1. Mandatory OpenWiki-First Workflow
- **Wiki Entrypoint**: Before exploring or searching raw source code for an unfamiliar feature, architecture, or workflow, agents **must** read `/openwiki/quickstart.md`.
- **Concept Traversal**: Use semantic links within `/openwiki/` pages to explore architectural overviews, domain logic, and operational details before examining raw code files.
- **Documentation Sync**: When modifying features, APIs, or business logic, ensure that corresponding OpenWiki pages are kept accurate.

## 2. Progressive Skill Disclosure & Activation
- **Inspect Available Skills**: Review the skills listed in your system prompt (e.g., `mermaid-diagrams`, `write-connector`, `agent-guidelines`).
- **Proactive Loading**: Whenever a user request matches a skill's domain (such as rendering architecture diagrams or writing connectors), the agent **must** proactively read the full skill instructions using `read_file` (e.g., `read_file(file_path="/skills/mermaid-diagrams/SKILL.md", limit=1000)`) before proceeding.

## 3. Domain Terminology: "Doc" / "Document"
- **Firebase / Firestore Context**: In this repository, references to **"doc"** or **"document"** (such as in `firestore.go` or backend syncing logic) explicitly refer to **Firebase / Firestore cloud documents** storing user dictionaries, word decks, and SRS state. Agents must interpret these terms within this cloud database context and leverage OpenWiki (`/openwiki/operations/authentication-and-sync.md`) when handling storage, retrieval, or synchronization questions.

## 4. Working with Code & Tools
- **Read Before Edit**: Always read source files using `read_file` before attempting any modifications with `edit_file`.
- **Preserve Conventions**: Match existing Wails, Go backend (`app.go`, `firestore.go`), and React frontend patterns.
- **Verification**: Verify implementation details and run tests (`go test ./...`) after making changes.


