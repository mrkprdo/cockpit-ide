/**
 * Live model metadata resolver — fetches the official context/output limits for
 * any model from models.dev (the same registry the AI SDK uses), so max_tokens
 * and context are auto-derived instead of hardcoded per preset.
 *
 * - Caches in memory + localStorage for a week; never blocks the UI.
 * - Prefers the provider matching the endpoint (opencode-go for /zen/go,
 *   opencode for /zen), then falls back to searching every provider by id so
 *   custom models (openai/gpt-4o, anthropic/…, local models, …) resolve too.
 * - Returns null on any failure — callers keep their hardcoded fallback.
 */

interface ProviderModel {
  limit?: { output?: number; context?: number };
  reasoning?: boolean;
}

interface ProviderData {
  [providerId: string]: {
    models?: Record<string, ProviderModel>;
  };
}

const MODELS_DEV_URL = 'https://models.dev/api.json';
const CACHE_KEY = 'cockpit.models-dev.cache';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export interface ModelLimit {
  maxOutput: number;
  maxContext: number;
  reasoning: boolean;
}

let memoryCache: ProviderData | null = null;

/** Test/session hook — clears the in-memory cache (localStorage cache stays). */
export function resetModelMetadataCache(): void {
  memoryCache = null;
}

function loadFromStorage(): ProviderData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; data: ProviderData };
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function saveToStorage(data: ProviderData): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // Best-effort; the in-memory cache still works for the session.
  }
}

export async function loadModelsDev(): Promise<ProviderData> {
  if (memoryCache) return memoryCache;
  const cached = loadFromStorage();
  if (cached) {
    memoryCache = cached;
    return cached;
  }
  const res = await fetch(MODELS_DEV_URL);
  if (!res.ok) throw new Error(`models.dev ${res.status}`);
  const data = (await res.json()) as ProviderData;
  memoryCache = data;
  saveToStorage(data);
  return data;
}

/** Map an endpoint to a models.dev provider id (null for unknown gateways). */
export function providerForEndpoint(endpoint: string): string | null {
  if (endpoint.includes('/zen/go/')) return 'opencode-go';
  if (endpoint.includes('/zen/')) return 'opencode';
  return null;
}

function toLimit(model: ProviderModel | undefined): ModelLimit | null {
  if (!model?.limit?.output) return null;
  return {
    maxOutput: model.limit.output,
    maxContext: model.limit.context ?? 131_072,
    reasoning: !!model.reasoning,
  };
}

/**
 * Official limits for a model id. Null when unknown/unreachable — callers fall
 * back to their preset/default value.
 */
export async function resolveModelLimit(modelId: string, endpoint: string): Promise<ModelLimit | null> {
  let data: ProviderData;
  try {
    data = await loadModelsDev();
  } catch {
    return null;
  }

  const preferred = providerForEndpoint(endpoint);
  if (preferred) {
    const hit = toLimit(data[preferred]?.models?.[modelId]);
    if (hit) return hit;
  }

  for (const provider of Object.values(data)) {
    const hit = toLimit(provider?.models?.[modelId]);
    if (hit) return hit;
  }
  return null;
}
