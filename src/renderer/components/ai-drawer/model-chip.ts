// Header model chip — the always-visible answer to "which model is about to run?".
//
// Kept out of AiDrawer.ts (which sits at the 700-line guardrail) and free of DOM
// assumptions beyond a root element, so the drawer can repaint it after any
// skeleton rebuild without duplicating the protocol logic.

import { protocolLabel, resolveProtocol } from '../../ai/llm-protocol';
import type { SettingsStore } from './settings';

/** Paint the chip from the current settings (text, tooltip, unconfigured state). */
export function paintModelChip(root: ParentNode, settings: SettingsStore): void {
  const chip = root.querySelector<HTMLElement>('.ai-model-chip');
  if (!chip) return;
  const model = settings.model || 'no model';
  const protocol = protocolLabel(resolveProtocol(settings.endpoint, model));
  chip.textContent = model;
  chip.setAttribute('title', `${model} · ${protocol} — click to change model`);
  chip.classList.toggle('is-unconfigured', !settings.apiKey);
}
