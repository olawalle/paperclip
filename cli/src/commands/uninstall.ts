import fs from "node:fs";
import * as p from "@clack/prompts";
import pc from "picocolors";
import {
  describeLocalInstancePaths,
  resolvePaperclipHomeDir,
  resolvePaperclipInstanceId,
} from "../config/home.js";
import { printPaperclipCliBanner } from "../utils/banner.js";

export type UninstallOptions = {
  instance?: string;
  all?: boolean;
  yes?: boolean;
  dataDir?: string;
};

function bytesToHuman(bytes: number): string {
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / KB).toFixed(1)} KB`;
  if (bytes < GB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${(bytes / GB).toFixed(2)} GB`;
}

function dirSizeSync(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = `${dirPath}/${entry.name}`;
    if (entry.isDirectory()) {
      total += dirSizeSync(full);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      try {
        total += fs.statSync(full).size;
      } catch {
        // ignore stat errors
      }
    }
  }
  return total;
}

function removeDir(dirPath: string): void {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

export async function uninstall(opts: UninstallOptions): Promise<void> {
  printPaperclipCliBanner();
  p.intro(pc.bgRed(pc.white(" paperclipai uninstall ")));

  const homeDir = resolvePaperclipHomeDir();

  if (opts.all) {
    // Remove entire ~/.paperclip home directory
    if (!fs.existsSync(homeDir)) {
      p.log.message(pc.dim(`No Paperclip data found at ${homeDir}`));
      p.outro("Nothing to remove.");
      return;
    }

    const size = dirSizeSync(homeDir);
    p.log.warn(
      `This will permanently delete ALL Paperclip data at:\n  ${pc.bold(homeDir)}\n  (${bytesToHuman(size)}) — all instances, databases, secrets, and logs`,
    );

    let confirmed = opts.yes;
    if (!confirmed) {
      const answer = await p.confirm({
        message: pc.red(`Delete ${pc.bold(homeDir)} and everything inside it?`),
        initialValue: false,
      });
      if (p.isCancel(answer) || !answer) {
        p.cancel("Uninstall cancelled.");
        return;
      }
      confirmed = answer;
    }

    p.log.step("Removing all Paperclip data...");
    removeDir(homeDir);
    p.log.success(`Removed ${homeDir}`);
  } else {
    // Remove a single instance
    const instanceId = resolvePaperclipInstanceId(opts.instance);
    const paths = describeLocalInstancePaths(instanceId);

    if (!fs.existsSync(paths.instanceRoot)) {
      p.log.message(pc.dim(`No data found for instance "${instanceId}" at ${paths.instanceRoot}`));
      p.outro("Nothing to remove.");
      return;
    }

    const size = dirSizeSync(paths.instanceRoot);

    // Also surface the context file if it belongs to home
    const contextPath = `${homeDir}/context.json`;
    const contextExists = fs.existsSync(contextPath);

    p.log.warn(
      `This will permanently delete local Paperclip data for instance "${pc.bold(instanceId)}":\n` +
        `  ${pc.bold(paths.instanceRoot)}  (${bytesToHuman(size)})`,
    );

    if (contextExists) {
      p.log.message(
        pc.dim(
          `Context file ${contextPath} will NOT be removed automatically.\n` +
            `  Run with ${pc.cyan("--all")} to remove it along with all other Paperclip data.`,
        ),
      );
    }

    let confirmed = opts.yes;
    if (!confirmed) {
      const answer = await p.confirm({
        message: pc.red(`Delete instance "${instanceId}" data at ${pc.bold(paths.instanceRoot)}?`),
        initialValue: false,
      });
      if (p.isCancel(answer) || !answer) {
        p.cancel("Uninstall cancelled.");
        return;
      }
      confirmed = answer;
    }

    p.log.step(`Removing instance "${instanceId}" data...`);
    removeDir(paths.instanceRoot);
    p.log.success(`Removed ${paths.instanceRoot}`);

    // If no instances remain, offer to remove the whole home dir
    const instancesDir = `${homeDir}/instances`;
    const remainingInstances = fs.existsSync(instancesDir)
      ? fs.readdirSync(instancesDir).filter((name) => {
          try {
            return fs.statSync(`${instancesDir}/${name}`).isDirectory();
          } catch {
            return false;
          }
        })
      : [];

    if (remainingInstances.length === 0 && !opts.yes) {
      const cleanup = await p.confirm({
        message: `No instances remain. Remove the Paperclip home directory at ${pc.bold(homeDir)} too?`,
        initialValue: false,
      });
      if (!p.isCancel(cleanup) && cleanup) {
        removeDir(homeDir);
        p.log.success(`Removed ${homeDir}`);
      }
    }
  }

  p.note(
    [
      `If you installed via ${pc.cyan("npm")} or ${pc.cyan("npx")}, remove the CLI package:`,
      `  ${pc.cyan("npm uninstall -g paperclipai")}   # global install`,
      `  ${pc.cyan("npx")} uses a cache — no manual removal needed`,
    ].join("\n"),
    "Removing the CLI",
  );

  p.outro("Paperclip data removed.");
}
