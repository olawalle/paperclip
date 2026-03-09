import type { AdapterModel } from "./types.js";
import { readConfigFile } from "../config-file.js";

export const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_MODELS_TIMEOUT_MS = 5000;
const OPENROUTER_MODELS_CACHE_TTL_MS = 60_000;

let cached: { keyFingerprint: string; expiresAt: number; models: AdapterModel[] } | null = null;

function fingerprint(apiKey: string): string {
  return `${apiKey.length}:${apiKey.slice(-6)}`;
}

function dedupeModels(models: AdapterModel[]): AdapterModel[] {
  const seen = new Set<string>();
  const deduped: AdapterModel[] = [];
  for (const model of models) {
    const id = model.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push({ id, label: model.label.trim() || id });
  }
  return deduped;
}

function resolveOpenRouterApiKey(): string | null {
  const envKey = process.env.OPENROUTER_API_KEY?.trim();
  if (envKey) return envKey;

  const config = readConfigFile();
  if (config?.llm?.provider !== "openrouter") return null;
  const configKey = config.llm.apiKey?.trim();
  return configKey && configKey.length > 0 ? configKey : null;
}

function resolveOpenRouterBaseUrl(): string {
  const config = readConfigFile();
  const configBaseUrl = config?.llm?.provider === "openrouter"
    ? config.llm.baseUrl?.trim()
    : undefined;
  return configBaseUrl?.replace(/\/$/, "") ?? OPENROUTER_DEFAULT_BASE_URL;
}

async function fetchOpenRouterModels(apiKey: string, baseUrl: string): Promise<AdapterModel[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_MODELS_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) return [];

    const payload = (await response.json()) as { data?: unknown };
    const data = Array.isArray(payload.data) ? payload.data : [];
    const models: AdapterModel[] = [];
    for (const item of data) {
      if (typeof item !== "object" || item === null) continue;
      const id = (item as { id?: unknown }).id;
      if (typeof id !== "string" || id.trim().length === 0) continue;
      const name = (item as { name?: unknown }).name;
      const trimmedId = id.trim();
      const label = typeof name === "string" && name.trim().length > 0 ? name.trim() : trimmedId;
      models.push({ id, label });
    }
    return dedupeModels(models);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function listOpenRouterModels(): Promise<AdapterModel[]> {
  const apiKey = resolveOpenRouterApiKey();
  if (!apiKey) return [];

  const baseUrl = resolveOpenRouterBaseUrl();
  const now = Date.now();
  const keyFingerprint = fingerprint(apiKey);
  if (cached && cached.keyFingerprint === keyFingerprint && cached.expiresAt > now) {
    return cached.models;
  }

  const fetched = await fetchOpenRouterModels(apiKey, baseUrl);
  if (fetched.length > 0) {
    const sorted = [...fetched].sort((a, b) =>
      a.id.localeCompare(b.id, "en", { numeric: true, sensitivity: "base" }),
    );
    cached = {
      keyFingerprint,
      expiresAt: now + OPENROUTER_MODELS_CACHE_TTL_MS,
      models: sorted,
    };
    return sorted;
  }

  if (cached && cached.keyFingerprint === keyFingerprint && cached.models.length > 0) {
    return cached.models;
  }

  return [];
}

export function resetOpenRouterModelsCacheForTests() {
  cached = null;
}
