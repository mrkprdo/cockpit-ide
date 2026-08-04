# Product

## Register

product

## Users

Developers who think spatially — programmers who find traditional tab/panel IDEs cognitively rigid. They hold mental models of their codebase as a landscape, not a list. Primary task on any given session: writing and navigating code while maintaining spatial context across multiple files, terminals, and tools simultaneously.

## Product Purpose

Cockpit IDE replaces the fixed-panel IDE layout with a floating canvas where each tool (editor, terminal, file explorer, git) is a draggable, resizable card. Success means the developer's workspace matches their mental model of the project, arranged in space rather than stacked in tabs.

## Brand Personality

Precise · Atmospheric · Restrained

The tool should feel like a well-calibrated instrument — capable, quiet, and purposeful. The monospace typeface, dark palette, and dashed card borders signal expertise without performing it. It is an IDE for people who have outgrown the defaults.

## Anti-references

- **Figma / Miro / Excalidraw**: Collaborative whiteboard tools. Cockpit is for code, not diagrams. No canvas gestures that feel creative-tool playful.
- **JetBrains**: Heavy chrome, too many panels, too many settings. The IDE as bureaucracy. Cockpit should have less chrome, not more.
- **Generic Electron IDE** (VS Code aesthetic): The activity bar + file tree + tab row monoculture. If it looks like VS Code with a dark theme, it has failed.

## Design Principles

1. **The canvas disappears into the work.** UI chrome recedes at rest; cards, panels, and controls reveal themselves only on focus or hover. Idle state is dark and quiet.
2. **State over decoration.** Accent color communicates selection, active state, and focus — never decorative fill. Semantic colors (green/amber/red) mean something specific.
3. **Precision without austerity.** The dashed borders and Space Mono typeface add character. These are intentional, not default. Don't smooth them away.
4. **Spatial over sequential.** Layout is information. A card's position on the canvas is meaningful. Avoid flows that force the user back into sequential tabs or modal-heavy sequences.
5. **Consistent vocabulary.** Same button shapes, same interaction patterns across every window. A developer switching between the editor card and the git card should never pause to re-learn the chrome.

## Accessibility & Inclusion

WCAG AA minimum. `:focus-visible` indicators on all interactive elements. `prefers-reduced-motion` respected on all transitions and animations.
