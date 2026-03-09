import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uninstall } from "../commands/uninstall.js";

// Silence clack prompts output during tests
vi.mock("@clack/prompts", async (importOriginal) => {
  const original = await importOriginal<typeof import("@clack/prompts")>();
  return {
    ...original,
    intro: vi.fn(),
    outro: vi.fn(),
    cancel: vi.fn(),
    confirm: vi.fn().mockResolvedValue(false),
    log: {
      message: vi.fn(),
      step: vi.fn(),
      warn: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    },
    note: vi.fn(),
    isCancel: original.isCancel,
  };
});

vi.mock("../utils/banner.js", () => ({ printPaperclipCliBanner: vi.fn() }));

const ORIGINAL_ENV = { ...process.env };

describe("uninstall command", () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-uninstall-test-"));
    process.env.PAPERCLIP_HOME = tmpHome;
    delete process.env.PAPERCLIP_INSTANCE_ID;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  function createInstance(instanceId = "default"): string {
    const instanceRoot = path.join(tmpHome, "instances", instanceId);
    fs.mkdirSync(path.join(instanceRoot, "db"), { recursive: true });
    fs.writeFileSync(path.join(instanceRoot, "config.json"), JSON.stringify({ test: true }));
    return instanceRoot;
  }

  it("reports nothing to remove when no instance data exists", async () => {
    const { log } = await import("@clack/prompts");
    await uninstall({ yes: true });
    expect(log.message).toHaveBeenCalledWith(expect.stringContaining("No data found"));
  });

  it("removes a single instance directory when --yes is passed", async () => {
    const instanceRoot = createInstance("default");
    expect(fs.existsSync(instanceRoot)).toBe(true);

    await uninstall({ yes: true });

    expect(fs.existsSync(instanceRoot)).toBe(false);
  });

  it("removes a named instance when --instance is specified with --yes", async () => {
    const defaultRoot = createInstance("default");
    const devRoot = createInstance("dev");

    await uninstall({ instance: "dev", yes: true });

    expect(fs.existsSync(devRoot)).toBe(false);
    // default instance should be untouched
    expect(fs.existsSync(defaultRoot)).toBe(true);
  });

  it("removes entire home dir when --all --yes is passed", async () => {
    createInstance("default");
    createInstance("staging");
    expect(fs.existsSync(tmpHome)).toBe(true);

    await uninstall({ all: true, yes: true });

    expect(fs.existsSync(tmpHome)).toBe(false);
  });

  it("does nothing when --all is used but home dir does not exist", async () => {
    // Remove the tmpHome so it doesn't exist
    fs.rmSync(tmpHome, { recursive: true, force: true });

    const { outro } = await import("@clack/prompts");
    await uninstall({ all: true, yes: true });
    expect(outro).toHaveBeenCalledWith("Nothing to remove.");
  });

  it("does not remove anything without --yes when prompt returns false", async () => {
    const instanceRoot = createInstance("default");

    // confirm mock returns false (already set in vi.mock above)
    await uninstall({});

    expect(fs.existsSync(instanceRoot)).toBe(true);
  });
});
