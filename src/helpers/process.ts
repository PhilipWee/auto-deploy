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
 * Uses detached: true to create a process group so we can kill all children
 */
export function runScript(
  scriptPath: string,
  options: ProcessOptions
): ChildProcess {
  const childProcess = spawn("bash", [scriptPath], {
    cwd: options.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // Create new process group for proper cleanup
  });

  if (childProcess.stdout) {
    childProcess.stdout.on("data", (data) => {
      const output = data.toString();
      options.onStdout?.(output);
    });
  }

  if (childProcess.stderr) {
    childProcess.stderr.on("data", (data) => {
      const output = data.toString();
      options.onStderr?.(output);
    });
  }

  childProcess.on("error", (error) => {
    options.onError?.(error);
  });

  childProcess.on("exit", (code) => {
    options.onExit?.(code);
  });

  return childProcess;
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
 * Kill a process and all its children (process group)
 */
export async function killProcess(
  childProcess: ChildProcess,
  timeout = 5000
): Promise<void> {
  return new Promise((resolve) => {
    if (!childProcess || childProcess.killed || !childProcess.pid) {
      resolve();
      return;
    }

    const pid = childProcess.pid;

    const forceKillTimer = setTimeout(() => {
      try {
        // Kill entire process group with SIGKILL
        process.kill(-pid, "SIGKILL");
      } catch {
        // Process might already be dead
      }
      resolve();
    }, timeout);

    childProcess.once("exit", () => {
      clearTimeout(forceKillTimer);
      resolve();
    });

    try {
      // Kill entire process group with SIGTERM (negative pid = process group)
      process.kill(-pid, "SIGTERM");
    } catch {
      // Process might already be dead
      clearTimeout(forceKillTimer);
      resolve();
    }
  });
}
