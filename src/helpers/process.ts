import { spawn, ChildProcess } from "node:child_process";
import * as path from "node:path";
import * as p from "@clack/prompts";

export interface ProcessOptions {
  cwd: string;
  onExit?: (code: number | null) => void;
  onError?: (error: Error) => void;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

/**
 * Run a shell script and return the process
 */
export function runScript(
  scriptPath: string,
  options: ProcessOptions
): ChildProcess {
  const process = spawn("bash", [scriptPath], {
    cwd: options.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  if (process.stdout) {
    process.stdout.on("data", (data) => {
      const output = data.toString();
      options.onStdout?.(output);
    });
  }

  if (process.stderr) {
    process.stderr.on("data", (data) => {
      const output = data.toString();
      options.onStderr?.(output);
    });
  }

  process.on("error", (error) => {
    options.onError?.(error);
  });

  process.on("exit", (code) => {
    options.onExit?.(code);
  });

  return process;
}

/**
 * Run a build script and wait for completion
 */
export async function runBuildScript(
  scriptPath: string,
  cwd: string
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    let stderr = "";

    const process = spawn("bash", [scriptPath], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (process.stdout) {
      process.stdout.on("data", (data) => {
        p.log.info(`[build] ${data.toString().trim()}`);
      });
    }

    if (process.stderr) {
      process.stderr.on("data", (data) => {
        stderr += data.toString();
        p.log.warn(`[build] ${data.toString().trim()}`);
      });
    }

    process.on("error", (error) => {
      resolve({ success: false, error: error.message });
    });

    process.on("exit", (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({
          success: false,
          error: stderr || `Build exited with code ${code}`,
        });
      }
    });
  });
}

/**
 * Calculate exponential backoff delay
 */
export function calculateBackoff(
  restartCount: number,
  initialDelay: number,
  maxBackoff: number
): number {
  const delay = Math.min(initialDelay * Math.pow(2, restartCount), maxBackoff);
  return delay * 1000; // Convert to milliseconds
}

/**
 * Kill a process gracefully
 */
export async function killProcess(
  process: ChildProcess,
  timeout = 5000
): Promise<void> {
  return new Promise((resolve) => {
    if (!process || process.killed) {
      resolve();
      return;
    }

    const forceKillTimer = setTimeout(() => {
      process.kill("SIGKILL");
      resolve();
    }, timeout);

    process.once("exit", () => {
      clearTimeout(forceKillTimer);
      resolve();
    });

    process.kill("SIGTERM");
  });
}
