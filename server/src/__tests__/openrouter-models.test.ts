import { beforeEach, describe, expect, it, vi } from "vitest";
import { listOpenRouterModels, resetOpenRouterModelsCacheForTests } from "../adapters/openrouter-models.js";

describe("openrouter model listing", () => {
  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    resetOpenRouterModelsCacheForTests();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns an empty list when no API key is available", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const models = await listOpenRouterModels();

    expect(models).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("loads models from OpenRouter API when key is available", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "openai/gpt-4o", name: "GPT-4o" },
          { id: "anthropic/claude-3-5-sonnet", name: "Claude 3.5 Sonnet" },
          { id: "google/gemini-pro", name: "Gemini Pro" },
        ],
      }),
    } as Response);

    const models = await listOpenRouterModels();

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer sk-or-test" },
      }),
    );
    expect(models.length).toBe(3);
    expect(models.some((m) => m.id === "openai/gpt-4o" && m.label === "GPT-4o")).toBe(true);
    expect(models.some((m) => m.id === "anthropic/claude-3-5-sonnet")).toBe(true);
  });

  it("caches results and only fetches once", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: "openai/gpt-4o", name: "GPT-4o" }],
      }),
    } as Response);

    const first = await listOpenRouterModels();
    const second = await listOpenRouterModels();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it("returns empty list when API request fails", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-invalid";
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response);

    const models = await listOpenRouterModels();
    expect(models).toEqual([]);
  });

  it("returns sorted models by id", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "openai/gpt-4o", name: "GPT-4o" },
          { id: "anthropic/claude-3-opus", name: "Claude 3 Opus" },
          { id: "google/gemini-pro", name: "Gemini Pro" },
        ],
      }),
    } as Response);

    const models = await listOpenRouterModels();

    const ids = models.map((m) => m.id);
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" })));
  });

  it("deduplicates models with the same id", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "openai/gpt-4o", name: "GPT-4o" },
          { id: "openai/gpt-4o", name: "GPT-4o duplicate" },
        ],
      }),
    } as Response);

    const models = await listOpenRouterModels();
    const gpt4oModels = models.filter((m) => m.id === "openai/gpt-4o");
    expect(gpt4oModels.length).toBe(1);
  });

  it("uses model id as label when name is not provided", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: "some-provider/some-model" }],
      }),
    } as Response);

    const models = await listOpenRouterModels();
    expect(models[0]).toEqual({ id: "some-provider/some-model", label: "some-provider/some-model" });
  });
});
