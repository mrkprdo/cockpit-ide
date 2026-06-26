---
name: App Orchestrator
file: src/renderer/components/App.ts
type: logic
layer: core
singleton: true
exports: [App]
---

# App Orchestrator

Root application orchestrator. Creates CanvasArea for the infinite card surface, TopBar for the menu system, and modal/overlay singletons (Welcome, About, Theme, AiDrawer, Tutorial). Handles workspace selection via WelcomeModal, save/restore of plugin state to .cockpit/window.json, keyboard shortcuts (Ctrl+Shift+N for new window, Ctrl+W close tab, Ctrl+Tab cycle cards, Ctrl+P file search, Ctrl+J new terminal), theme persistence via prefs, and exposes the __cockpit global API consumed by the AI agent.

## Dependencies

- [[top-bar.spec.md|top-bar]] `src/renderer/components/TopBar.ts` — Creates TopBar menu bar with all plugin, zoom, and help callbacks
- [[canvas-area.spec.md|canvas-area]] `src/renderer/components/CanvasArea.ts` — Creates CanvasArea as the card surface; delegates addTerminal/addExplorer/addGit/addMarkdown/addSpecsmap, autoArrange, zoom/pan, and plugin list management
- [[welcome-modal.spec.md|welcome-modal]] `src/renderer/components/WelcomeModal.ts` — Opens WelcomeModal on initial startup to select or open a workspace
- [[about-modal.spec.md|about-modal]] `src/renderer/components/AboutModal.ts` — Opens AboutModal from Help > About menu
- [[theme-modal.spec.md|theme-modal]] `src/renderer/components/ThemeModal.ts` — Opens ThemeModal from Tools > Theme menu for base/mode selection
- [[ai-drawer.spec.md|ai-drawer]] `src/renderer/components/AiDrawer.ts` — Toggles AiDrawer slide-out panel from Tools > AI menu
- [[tutorial.spec.md|tutorial]] `src/renderer/components/Tutorial.ts` — Starts Tutorial overlay from Help > Tutorial or on first launch
- [[theme.spec.md|theme]] `src/renderer/theme.ts` — Loads/saves theme preferences via theme.setTheme/setDark and reads theme.themeName for persistence

## Referenced By

- [[renderer-entry.spec.md|renderer-entry]] `src/renderer/index.ts`

## Interface

### Methods

- **constructor** `()` — Loads theme pref, registers keyboard shortcuts, creates CanvasArea, TopBar, modals, then calls promptWorkspace()
- **loadWorkspace** `(path: string): Promise<void>` — Sets workspace path, registers __cockpit global, restores or creates default plugins, loads prefs and tutorial state
- **registerCockpitGlobal** `(): void` — Exposes __cockpit global API for agent tool calls (getCanvasState, addPlugin, focusCard, writeToTerminal, etc.)

## Lifecycle

- **created_by:** index.ts (new App())
- **destroyed_by:** Page unload

