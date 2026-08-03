// AI drawer settings — model/endpoint/key/stream prefs, backed by the prefs
// store via window.electronAPI. Owns the model preset list (ZEN_MODELS), the
// active config snapshot, and the settings-panel DOM bindings.

import { getAgentExecutor } from '../../agents/executor';
import { LLMClient } from '../../ai/llm-client';
import { resolveModelLimit } from '../../ai/model-metadata';
import { viewPrefs } from '../../ai/view-prefs';
import type { AiDrawerDom } from './types';

export interface ZenModel {
  id: string;
  label: string;
  group: 'free' | 'paid';
  maxContext: number;
  maxOutput: number;
}

/** Preset models — context/output limits from models.dev. */
export const ZEN_MODELS: ZenModel[] = [
  // Free (Zen endpoint) — context/output from models.dev
  { id: 'deepseek-v4-flash-free', label: 'DeepSeek V4 Flash (Free)', group: 'free', maxContext: 200000, maxOutput: 128000 },
  { id: 'north-mini-code-free', label: 'North Mini Code (Free)', group: 'free', maxContext: 256000, maxOutput: 64000 },
  { id: 'nemotron-3-ultra-free', label: 'Nemotron 3 Ultra (Free)', group: 'free', maxContext: 1000000, maxOutput: 128000 },
  { id: 'mimo-v2.5-free', label: 'MiMo V2.5 (Free)', group: 'free', maxContext: 200000, maxOutput: 32000 },
  { id: 'big-pickle', label: 'Big Pickle (Free)', group: 'free', maxContext: 200000, maxOutput: 32000 },
  // Paid (Go endpoint)
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', group: 'paid', maxContext: 1000000, maxOutput: 384000 },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', group: 'paid', maxContext: 1000000, maxOutput: 384000 },
  { id: 'minimax-m2.7', label: 'MiniMax M2.7', group: 'paid', maxContext: 204800, maxOutput: 131072 },
  { id: 'grok-build-0.1', label: 'Grok Build 0.1', group: 'paid', maxContext: 256000, maxOutput: 256000 },
  { id: 'kimi-k2.5', label: 'Kimi K2.5', group: 'paid', maxContext: 262144, maxOutput: 65536 },
];

export interface SettingsSnapshot {
  endpoint: string;
  apiKey: string;
  model: string;
  streamResponses: boolean;
  contextTokenLimit: number;
  suppressViewMove: boolean;
}

export class SettingsStore {
  apiKey = '';
  model = 'deepseek-v4-flash';
  endpoint = 'https://opencode.ai/zen/go/v1';
  streamResponses = true;
  contextTokenLimit = 8192;
  /** Keep the camera still when tool calls open/reveal files or specs. */
  suppressViewMove = false;
  /** Official max output tokens for the active model — seeded from presets, refreshed from models.dev. */
  modelMaxOutput = 65536;

  constructor(private dom: AiDrawerDom) {}

  snapshot(): SettingsSnapshot {
    return {
      endpoint: this.endpoint,
      apiKey: this.apiKey,
      model: this.model,
      streamResponses: this.streamResponses,
      contextTokenLimit: this.contextTokenLimit,
      suppressViewMove: this.suppressViewMove,
    };
  }

  async loadSettings(): Promise<void> {
    try {
      const prefs = await window.electronAPI?.prefs.load();
      if (prefs) {
        if (prefs.aiApiKey) this.apiKey = prefs.aiApiKey;
        if (prefs.aiModel) {
          this.model = prefs.aiModel.replace(/^opencode(?:-go)?\//, '');
        }
        if (prefs.aiEndpoint) {
          this.endpoint = prefs.aiEndpoint;
        }
        if (typeof prefs.aiStreamResponses === 'boolean') {
          this.streamResponses = prefs.aiStreamResponses;
        }
        if (typeof prefs.aiContextLimit === 'number' && prefs.aiContextLimit >= 1024) {
          this.contextTokenLimit = prefs.aiContextLimit;
        }
        if (typeof prefs.aiSuppressViewMove === 'boolean') {
          this.suppressViewMove = prefs.aiSuppressViewMove;
          viewPrefs.suppressViewMove = this.suppressViewMove;
        }
      }
      getAgentExecutor().setConfigProvider(() => ({ endpoint: this.endpoint, apiKey: this.apiKey, model: this.model }));
      this.seedMaxOutput();
      const settingsEl = this.dom.settingsEl;
      const endpointInput = settingsEl?.querySelector<HTMLInputElement>('.ai-settings-input[data-key="endpoint"]');
      const apiKeyInput = settingsEl?.querySelector<HTMLInputElement>('.ai-settings-input[data-key="apiKey"]');
      const modelSelect = settingsEl?.querySelector<HTMLSelectElement>('.ai-settings-select[data-key="model-select"]');
      const modelCustomInput = settingsEl?.querySelector<HTMLInputElement>('.ai-settings-input[data-key="model-custom"]');
      const streamInput = settingsEl?.querySelector<HTMLInputElement>('.ai-settings-input[data-key="stream"]');
      const contextLimitInput = settingsEl?.querySelector<HTMLInputElement>('.ai-settings-input[data-key="contextLimit"]');
      if (endpointInput) endpointInput.value = this.endpoint;
      if (apiKeyInput) apiKeyInput.value = this.apiKey;
      if (modelSelect) {
        const known = ZEN_MODELS.find(m => m.id === this.model);
        if (known) {
          modelSelect.value = this.model;
          if (modelCustomInput) { modelCustomInput.style.display = 'none'; modelCustomInput.value = ''; }
          if (contextLimitInput) contextLimitInput.max = String(known.maxContext);
        } else {
          modelSelect.value = '__custom__';
          if (modelCustomInput) { modelCustomInput.style.display = 'block'; modelCustomInput.value = this.model; }
          if (contextLimitInput) contextLimitInput.removeAttribute('max');
        }
      }
      if (streamInput) streamInput.checked = this.streamResponses;
      if (contextLimitInput) contextLimitInput.value = String(this.contextTokenLimit);
      if (prefs && (prefs.aiModel !== this.model || prefs.aiEndpoint !== this.endpoint)) {
        this.saveSettings();
      }
    } catch {}
  }

  async saveSettings(): Promise<void> {
    try {
      const prefs = (await window.electronAPI?.prefs.load()) || {};
      prefs.aiApiKey = this.apiKey;
      prefs.aiModel = this.model;
      prefs.aiEndpoint = this.endpoint;
      prefs.aiStreamResponses = this.streamResponses;
      prefs.aiContextLimit = this.contextTokenLimit;
      prefs.aiSuppressViewMove = this.suppressViewMove;
      window.electronAPI?.prefs.save(prefs);
    } catch {}
  }

  /** Seed max output from the preset list (sync, covers the built-in models). */
  seedMaxOutput(): void {
    this.modelMaxOutput = ZEN_MODELS.find(m => m.id === this.model)?.maxOutput ?? 65536;
  }

  /** Auto-refresh the active model's official limits from models.dev (async, cached). */
  async refreshModelMetadata(): Promise<void> {
    const info = await resolveModelLimit(this.model, this.endpoint);
    if (info) this.modelMaxOutput = info.maxOutput;
  }

  getMaxOutputTokens(): number {
    return this.modelMaxOutput;
  }

  createClient(): LLMClient {
    return new LLMClient({ endpoint: this.endpoint, apiKey: this.apiKey, model: this.model });
  }

  /** Wire settings-panel interactions (model select + save). Called once by the facade after the skeleton is built. */
  bindPanel(): void {
    const settingsEl = this.dom.settingsEl;
    if (!settingsEl) return;

    const modelSelect = settingsEl.querySelector<HTMLSelectElement>('.ai-settings-select[data-key="model-select"]')!;
    const modelCustomInput = settingsEl.querySelector<HTMLInputElement>('.ai-settings-input[data-key="model-custom"]')!;
    modelSelect.addEventListener('change', () => {
      const isCustom = modelSelect.value === '__custom__';
      modelCustomInput.style.display = isCustom ? 'block' : 'none';
      if (!isCustom) {
        const entry = ZEN_MODELS.find(m => m.id === modelSelect.value);
        this.endpoint = entry?.group === 'free'
          ? 'https://opencode.ai/zen/v1'
          : 'https://opencode.ai/zen/go/v1';
        const epInput = settingsEl.querySelector<HTMLInputElement>('.ai-settings-input[data-key="endpoint"]');
        if (epInput) epInput.value = this.endpoint;
        this.model = modelSelect.value;
        this.seedMaxOutput();
        this.refreshModelMetadata();
        if (entry) {
          const ctxInput = settingsEl.querySelector<HTMLInputElement>('.ai-settings-input[data-key="contextLimit"]');
          if (ctxInput) {
            this.contextTokenLimit = entry.maxContext;
            ctxInput.value = String(entry.maxContext);
            ctxInput.max = String(entry.maxContext);
          }
        }
      }
    });

    const saveBtn = settingsEl.querySelector('.ai-settings-save')!;
    saveBtn.addEventListener('click', () => {
      const modelSelect2 = settingsEl.querySelector<HTMLSelectElement>('.ai-settings-select[data-key="model-select"]');
      const modelCustomInput2 = settingsEl.querySelector<HTMLInputElement>('.ai-settings-input[data-key="model-custom"]');
      const inputs = settingsEl.querySelectorAll<HTMLInputElement>('.ai-settings-input');
      inputs.forEach((input) => {
        const key = input.dataset.key;
        if (key === 'endpoint') this.endpoint = input.value;
        else if (key === 'apiKey') this.apiKey = input.value;
        else if (key === 'stream') this.streamResponses = input.checked;
        else if (key === 'suppressViewMove') this.suppressViewMove = input.checked;
        else if (key === 'contextLimit') {
          const parsed = parseInt(input.value, 10);
          let limit = isNaN(parsed) || parsed < 1024 ? 8192 : parsed;
          const modelEntry = modelSelect2 && modelSelect2.value !== '__custom__'
            ? ZEN_MODELS.find(m => m.id === modelSelect2.value)
            : undefined;
          if (modelEntry && limit > modelEntry.maxContext) {
            limit = modelEntry.maxContext;
          }
          this.contextTokenLimit = limit;
        }
      });
      if (modelSelect2) {
        if (modelSelect2.value === '__custom__') {
          const customVal = modelCustomInput2?.value.trim();
          if (customVal) this.model = customVal;
        } else {
          this.model = modelSelect2.value;
        }
      }
      this.seedMaxOutput();
      this.refreshModelMetadata();
      this.saveSettings();
      viewPrefs.suppressViewMove = this.suppressViewMove;
      settingsEl.classList.remove('is-visible');
    });
  }
}
