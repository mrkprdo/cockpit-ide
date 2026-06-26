---
name: Tutorial UI
parent: tutorial
---

# Tutorial UI

DOM structure, step navigation, tooltip positioning, and interaction states for the guided Tutorial overlay.

## DOM Structure

```
.tutorial-overlay | position: fixed; inset: 0; z-index: 3000
├── .tutorial-backdrop (semi-transparent dark overlay with cutout for target)
├── .tutorial-tooltip | position: absolute (near target element)
│   ├── .tutorial-step-indicator "Step 3 of 8"
│   ├── .tutorial-title (step title)
│   ├── .tutorial-description (step instructions)
│   ├── .tutorial-image (optional screenshot or icon)
│   └── .tutorial-nav
│       ├── button.tutorial-prev "← Previous"
│       ├── .tutorial-dots (○●○ progress dots)
│       ├── button.tutorial-next "Next →"
│       └── button.tutorial-skip "Skip Tutorial"
└── .tutorial-highlight (optional pulsing ring around target element)
```

## Interactions

### Step Navigation (Next)

- **trigger:** Click "Next →" button or press Right Arrow / Enter
- Advance to next step
- Reposition tooltip near new target element
- Update step indicator and progress dots
- If last step: "Next" becomes "Finish"
- **result:** Tutorial advances, tooltip moves to next UI element

### Step Navigation (Previous)

- **trigger:** Click "← Previous" button or press Left Arrow
- Return to previous step
- Reposition tooltip to previous target
- **result:** Tutorial rewinds to prior explanation

### Skip Tutorial

- **trigger:** Click "Skip Tutorial" button or press Escape
- Remove overlay from DOM
- Set `localStorage['cockpit-tutorial-complete'] = 'true'`
- **result:** Tutorial dismissed, won't auto-show again

### Finish Tutorial

- **trigger:** Click "Finish" on last step
- Same as Skip: remove overlay, persist completion flag
- Fire `onComplete()` callback
- **result:** Tutorial marked complete

### Tooltip Auto-Positioning

- **trigger:** Step change (any navigation)
- Get target element's bounding rect
- Position tooltip to the right, left, top, or bottom of target based on available viewport space
- Highlight target with pulsing ring (`.tutorial-highlight`) or backdrop cutout
- Smooth CSS transition on tooltip position changes
- **result:** Tooltip appears adjacent to target feature

## States

### Hidden

Overlay not in DOM, no tutorial active.

### Active (Step N of M)

Overlay visible, backdrop dimming non-target areas, tooltip positioned near step target, navigation buttons enabled.

### Last Step

"Next →" replaced by "Finish", completion imminent.

### First Step

"← Previous" button disabled or hidden.

### Completing

Brief "Great job!" message, then overlay fade-out and removal.

## Accessibility

- **Left/Right arrows:** Previous/next step
- **Escape:** Skip tutorial
- **Enter:** Next step / Finish
- **Tab:** Focus within tooltip navigation buttons only
