// AI drawer settings — model/endpoint/key/stream prefs, backed by the prefs
// store via window.electronAPI. Owns the model preset list (ZEN_MODELS), the
// active config snapshot, and the settings-panel DOM bindings.

import { getAgentExecutor } from '../../agents/executor';
import { LLMClient } from '../../ai/llm-client';
import { describeLLMError } from '../../ai/llm-errors';
import { protocolLabel } from '../../ai/llm-protocol';
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

/** Preset models — context/output limits from models.dev (refreshed on selection). */
export const ZEN_MODELS: ZenModel[] = [
  // Free (Zen endpoint) — OpenCode restricts these to its own app: other
  // clients receive HTTP 403 even with a valid key (console/api/inference docs).
  { id: 'deepseek-v4-flash-free', label: 'DeepSeek V4 Flash (Free · app only)', group: 'free', maxContext: 200000, maxOutput: 128000 },
  { id: 'north-mini-code-free', label: 'North Mini Code (Free · app only)', group: 'free', maxContext: 256000, maxOutput: 64000 },
  { id: 'nemotron-3-ultra-free', label: 'Nemotron 3 Ultra (Free · app only)', group: 'free', maxContext: 1000000, maxOutput: 128000 },
  { id: 'mimo-v2.5-free', label: 'MiMo V2.5 (Free · app only)', group: 'free', maxContext: 200000, maxOutput: 32000 },
  { id: 'big-pickle', label: 'Big Pickle (Free · app only)', group: 'free', maxContext: 200000, maxOutput: 32000 },
  // Paid (Go endpoint / Console inference) — Chat Completions family
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', group: 'paid', maxContext: 1000000, maxOutput: 384000 },
  { id: 'deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash', group: 'paid', maxContext: 1000000, maxOutput: 384000 },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', group: 'paid', maxContext: 1000000, maxOutput: 384000 },
  { id: 'kimi-k3', label: 'Kimi K3', group: 'paid', maxContext: 262144, maxOutput: 65536 },
  { id: 'glm-5.3', label: 'GLM 5.3', group: 'paid', maxContext: 200000, maxOutput: 65536 },
  { id: 'minimax-m3', label: 'MiniMax M3', group: 'paid', maxContext: 204800, maxOutput: 131072 },
  { id: 'minimax-m2.7', label: 'MiniMax M2.7', group: 'paid', maxContext: 204800, maxOutput: 131072 },
  { id: 'grok-build-0.1', label: 'Grok Build 0.1', group: 'paid', maxContext: 256000, maxOutput: 256000 },
  { id: 'kimi-k2.5', label: 'Kimi K2.5', group: 'paid', maxContext: 262144, maxOutput: 65536 },
  // GPT models are served by the Responses API — the client switches protocols
  // automatically for gpt-/o-series ids on the Console inference base.
  { id: 'gpt-6.1-sol', label: 'GPT 6.1 Sol (Responses)', group: 'paid', maxContext: 400000, maxOutput: 128000 },
  { id: 'gpt-6-luna', label: 'GPT 6 Luna (Responses)', group: 'paid', maxContext: 400000, maxOutput: 128000 },
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
  /** Model ids reported by the endpoint. Empty = fall back to the built-in presets. */
  availableModels: string[] = [];
  /** Notifies the drawer chrome (header model chip) that the active model changed. */
  onModelChange: (() => void) | null = null;

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
      // Tell the chrome what is selected. The live catalogue is fetched when the
      // model UI is opened (see AiDrawer), not at boot: the chat path must not
      // depend on a network round-trip that can fail offline.
      this.onModelChange?.();
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

  /**
   * Ask the endpoint which models it actually offers and rebuild the picker.
   *
   * Hardcoded presets go stale the moment the provider adds or retires a model
   * (and OpenCode rotates its catalogue often), so the live list is the source of
   * truth; presets remain as labels/limits and as an offline fallback.
   */
  async refreshModels(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const models = await this.createClient('ses_model_catalogue').listModels();
      if (models.length === 0) return false;
      this.availableModels = models;
      this.renderModelOptions();
      this.onModelChange?.();
      return true;
    } catch {
      return false; // keep the presets; the failure is visible via Test connection
    }
  }

  /** Rebuild the <select> from presets + whatever the endpoint reported. */
  private renderModelOptions(): void {
    const sel = this.dom.settingsEl?.querySelector<HTMLSelectElement>('.ai-settings-select[data-key="model-select"]');
    if (!sel) return;

    const group = (label: string, entries: Array<{ id: string; text: string }>): void => {
      if (entries.length === 0) return;
      const g = document.createElement('optgroup');
      g.label = label;
      for (const e of entries) {
        const o = document.createElement('option');
        o.value = e.id;
        o.textContent = e.text;
        g.appendChild(o);
      }
      sel.appendChild(g);
    };

    sel.innerHTML = '';
    group('Free (OpenCode app only)', ZEN_MODELS.filter(m => m.group === 'free').map(m => ({ id: m.id, text: m.label })));
    group('Go / Console', ZEN_MODELS.filter(m => m.group === 'paid').map(m => ({ id: m.id, text: m.label })));

    const known = new Set(ZEN_MODELS.map(m => m.id));
    const extras = this.availableModels.filter(id => !known.has(id));
    group('Available on this endpoint', extras.map(id => ({ id, text: id })));

    // Never lose the current selection (e.g. a custom id, or a model the provider
    // stopped advertising but the user still has saved).
    if (!Array.from(sel.options).some(o => o.value === this.model)) {
      group('Current', [{ id: this.model, text: this.model }]);
    }
    const custom = document.createElement('option');
    custom.value = '__custom__';
    custom.textContent = 'Custom…';
    sel.appendChild(custom);

    sel.value = this.model;
  }

  getMaxOutputTokens(): number {
    return this.modelMaxOutput;
  }

  createClient(sessionId?: string): LLMClient {
    return new LLMClient({ endpoint: this.endpoint, apiKey: this.apiKey, model: this.model, sessionId });
  }

  /**
   * Prove the endpoint + key + model actually work, and report the provider's
   * own reason when they don't.
   *
   * Reads the CURRENT input values (not the saved ones) so you can test before
   * saving. This is the difference between "my key expired" and a wall of JSON
   * discovered only after sending a real prompt.
   */
  async testConnection(resultEl?: HTMLElement | null): Promise<boolean> {
    const settingsEl = this.dom.settingsEl;
    const readInput = (key: string): string | undefined =>
      settingsEl?.querySelector<HTMLInputElement>(`.ai-settings-input[data-key="${key}"]`)?.value;

    const endpoint = (readInput('endpoint') ?? this.endpoint).trim();
    const apiKey = (readInput('apiKey') ?? this.apiKey).trim();
    const select = settingsEl?.querySelector<HTMLSelectElement>('.ai-settings-select[data-key="model-select"]');
    const model = select && select.value !== '__custom__' ? select.value : (readInput('model-custom') || this.model);

    const report = (text: string, ok: boolean): void => {
      if (!resultEl) return;
      resultEl.textContent = text;
      resultEl.classList.toggle('is-ok', ok);
      resultEl.classList.toggle('is-error', !ok);
    };

    if (!apiKey) { report('No API key set — paste one above.', false); return false; }

    const client = new LLMClient({ endpoint, apiKey, model, sessionId: 'ses_connection_test' });
    report(`Testing ${client.requestUrl} …`, true);
    try {
      const res = await client.chatCompletion({
        messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
        max_tokens: 16,
      });
      const reply = (res.choices?.[0]?.message?.content ?? '').trim().slice(0, 60);
      report(`Connected · ${protocolLabel(client.protocol)} · ${model}${reply ? ` — "${reply}"` : ''}`, true);
      // A working key means we can also refresh the real model catalogue.
      void this.refreshModels();
      return true;
    } catch (err) {
      const info = describeLLMError(err);
      report(`${info.title}: ${info.message}`, false);
      return false;
    }
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
        // Only rewrite the endpoint when it is one of the known bases. A user
        // who pointed at the Console inference base keeps that path (GPT models
        // are Responses-only there); flipping it back to /zen would break them.
        if (!this.endpoint.includes('/inference/')) {
          this.endpoint = entry?.group === 'free'
            ? 'https://opencode.ai/zen/v1'
            : 'https://opencode.ai/zen/go/v1';
          const epInput = settingsEl.querySelector<HTMLInputElement>('.ai-settings-input[data-key="endpoint"]');
          if (epInput) epInput.value = this.endpoint;
        }
        this.model = modelSelect.value;
        this.seedMaxOutput();
        this.refreshModelMetadata();
        // Selecting a model is a complete action: persist it and update the
        // header chip immediately instead of waiting for Save.
        void this.saveSettings();
        this.onModelChange?.();
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

    const testBtn = settingsEl.querySelector<HTMLButtonElement>('.ai-settings-test');
    testBtn?.addEventListener('click', () => {
      const resultEl = settingsEl.querySelector<HTMLDivElement>('.ai-settings-result');
      void this.testConnection(resultEl);
    });

    const saveBtn = settingsEl.querySelector('.ai-settings-save')!;    saveBtn.addEventListener('click', () => {
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
      this.onModelChange?.();
      viewPrefs.suppressViewMove = this.suppressViewMove;
      settingsEl.classList.remove('is-visible');
    });
  }
}
