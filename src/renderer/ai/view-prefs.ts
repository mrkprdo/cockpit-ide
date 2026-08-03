// Mutable, shared "don't move the camera on tool calls" preference. Toggled
// from the AI drawer settings panel (SettingsStore) and read by the cockpit
// tool bridge (App.ts __cockpit) so read_file / reveal_file / open_in_editor
// and friends stop dragging the canvas around when the toggle is on.

export const viewPrefs = {
  suppressViewMove: false,
};
