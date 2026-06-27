---
name: Tutorial UI
parent: tutorial
---

# Tutorial UI

Interactive guided tour with overlay, highlight ring, and tooltip.

## DOM Structure

```html
<div class="tutorial-overlay" style="display:flex"><!-- semi-transparent backdrop --></div>
<div class="tutorial-ring" style="display:block; left:X; top:Y; width:W; height:H"><!-- highlight border --></div>
<div class="tutorial-tooltip" style="display:block; left:X; top:Y; width:360px">
  <div class="tutorial-step-header">Step Title</div>
  <div class="tutorial-step-body">Description text</div>
  <div class="tutorial-extra"><!-- custom HTML --></div>
  <div class="tutorial-nav">
    <div class="tutorial-dots">
      <span class="tutorial-dot active"></span>
      <span class="tutorial-dot"></span>
    </div>
    <div class="tutorial-btn-row">
      <button class="tutorial-btn tutorial-btn-back">← Back</button>
      <button class="tutorial-btn tutorial-btn-next">Next →</button>
    </div>
  </div>
</div>
```

## Interactions

### Next Step
- **trigger:** `click` on `.tutorial-btn-next` or `ArrowRight` or `Enter`
- Advance `stepIdx`. Clear previous highlight. Apply new highlight. Position tooltip near target. Call `onLeave` of previous step and `onEnter` of new step.

### Previous Step
- **trigger:** `click` on `.tutorial-btn-back` or `ArrowLeft`
- Decrement `stepIdx`. Update highlight and tooltip.

### Close
- **trigger:** `click` Done button (last step), or `Escape`
- Close overlay. If checkbox unchecked, set `showOnLaunch = false`.

### Checkbox (Last Step)
- **trigger:** `change` on checkbox in final step
- Controls `showOnLaunch` preference.

## States

### Active
- Overlay visible (`display:flex`), tooltip and ring positioned.

### Closed
- All elements hidden. `onClose` callback fired.

### First Step
- Back button hidden, spacer shown instead.

### Last Step
- Next button replaced by Done button. Checkbox and links rendered.

### Target Not Found
- If `step.target` selector doesn't match any element, tooltip centers on screen without highlight ring.
