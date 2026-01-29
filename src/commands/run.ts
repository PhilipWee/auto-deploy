import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import {
  NodeConfig,
  AutoDeployConfig,
  TaskProcess,
  DeploymentState,
} from "../types.js";
import { copyDir } from "../helpers/fs.js";
import { cloneRepo, getRepoNameFromUrl, checkoutBranch } from "../helpers/git.js";
import {
  runScript,
  runBuildScript,
  calculateBackoff,
  killProcess,
} from "../helpers/process.js";
import { startPolling } from "../helpers/github.js";

const LOCAL_DIR = ".autodeploy.local";

/**
 * Load node configuration from .autodeploy.local/config.json
 */
function loadNodeConfig(): NodeConfig | null {
  const configPath = path.join(LOCAL_DIR, "config.json");
  if (!fs.existsSync(configPath)) {
    return null;
  }
  const content = fs.readFileSync(configPath, "utf-8");
  return JSON.parse(content);
}

/**
 * Load autodeploy configuration from a snapshot
 */
function loadAutoDeployConfig(snapshotPath: string): AutoDeployConfig | null {
  const configPath = path.join(
    snapshotPath,
    ".autodeploy.config",
    "config.json"
  );
  if (!fs.existsSync(configPath)) {
    return null;
  }
  const content = fs.readFileSync(configPath, "utf-8");
  return JSON.parse(content);
}

/**
 * Get all existing snapshots sorted by timestamp (newest first)
 */
function getSnapshots(repoName: string): string[] {
  const snapshotsDir = path.join(LOCAL_DIR, "repo-snapshots");
  if (!fs.existsSync(snapshotsDir)) {
    return [];
  }

  const timestamps = fs.readdirSync(snapshotsDir).filter((name) => {
    const snapshotPath = path.join(snapshotsDir, name, repoName);
    return fs.existsSync(snapshotPath) && fs.statSync(snapshotPath).isDirectory();
  });

  // Sort by timestamp descending (newest first)
  timestamps.sort((a, b) => parseInt(b) - parseInt(a));

  return timestamps.map((ts) => path.join(snapshotsDir, ts, repoName));
}

/**
 * Cleanup old snapshots, keeping only the specified count
 */
function cleanupSnapshots(repoName: string, keepCount: number): void {
  const snapshots = getSnapshots(repoName);
  const toDelete = snapshots.slice(keepCount);

  for (const snapshotPath of toDelete) {
    const timestampDir = path.dirname(snapshotPath);
    p.log.info(`Cleaning up old snapshot: ${timestampDir}`);
    fs.rmSync(timestampDir, { recursive: true, force: true });
  }
}

/**
 * Copy local files to snapshot
 */
function copyLocalFiles(snapshotPath: string): void {
  const filesDir = path.join(LOCAL_DIR, "files");
  if (fs.existsSync(filesDir)) {
    copyDir(filesDir, snapshotPath, { overwrite: true });
  }
}

/**
 * Start a task (run its run.sh script)
 */
function startTask(
  taskName: string,
  snapshotPath: string,
  autoDeployConfig: AutoDeployConfig,
  state: DeploymentState,
  onCrash: () => void
): TaskProcess {
  // Relative path for execution (relative to snapshotPath which is cwd)
  const runScriptPath = path.join(".autodeploy.config", taskName, "run.sh");

  const taskProcess: TaskProcess = {
    taskName,
    process: null,
    snapshotPath,
    restartCount: 0,
    lastRestartTime: Date.now(),
  };

  const startProcess = () => {
    p.log.info(`[${taskName}] Starting process...`);

    const process = runScript(runScriptPath, {
      cwd: snapshotPath,
      onStdout: (data) => {
        console.log(`[${taskName}] ${data.trim()}`);
      },
      onStderr: (data) => {
        console.error(`[${taskName}] ${data.trim()}`);
      },
      onExit: (code) => {
        p.log.warn(`[${taskName}] Process exited with code ${code}`);

        // Don't restart if we're updating or the state has changed
        if (state.isUpdating || state.currentSnapshot !== snapshotPath) {
          return;
        }

        // Calculate backoff
        const backoffMs = calculateBackoff(
          taskProcess.restartCount,
          autoDeployConfig.restart.initialDelay,
          autoDeployConfig.restart.maxBackoff
        );

        taskProcess.restartCount++;
        p.log.info(
          `[${taskName}] Restarting in ${backoffMs / 1000}s (attempt ${taskProcess.restartCount})...`
        );

        setTimeout(() => {
          if (state.currentSnapshot === snapshotPath && !state.isUpdating) {
            taskProcess.lastRestartTime = Date.now();
            startProcess();
          }
        }, backoffMs);

        onCrash();
      },
      onError: (error) => {
        p.log.error(`[${taskName}] Process error: ${error.message}`);
      },
    });

    taskProcess.process = process;
  };

  startProcess();
  return taskProcess;
}

/**
 * Build all tasks in a snapshot
 */
async function buildTasks(
  snapshotPath: string,
  tasks: string[]
): Promise<{ success: boolean; failedTask?: string }> {
  for (const task of tasks) {
    // Full path for existence check
    const fullBuildScriptPath = path.join(
      snapshotPath,
      ".autodeploy.config",
      task,
      "build.sh"
    );
    // Relative path for execution (relative to snapshotPath which is cwd)
    const relativeBuildScriptPath = path.join(".autodeploy.config", task, "build.sh");

    if (!fs.existsSync(fullBuildScriptPath)) {
      p.log.warn(`[${task}] No build.sh found, skipping build`);
      continue;
    }

    p.log.info(`[${task}] Running build...`);
    const result = await runBuildScript(relativeBuildScriptPath, snapshotPath);

    if (!result.success) {
      p.log.error(`[${task}] Build failed: ${result.error}`);
      return { success: false, failedTask: task };
    }

    p.log.success(`[${task}] Build completed`);
  }

  return { success: true };
}

/**
 * Stop all processes for a deployment
 */
async function stopAllProcesses(state: DeploymentState): Promise<void> {
  const stopPromises: Promise<void>[] = [];

  for (const [taskName, taskProcess] of state.processes) {
    if (taskProcess.process && !taskProcess.process.killed) {
      p.log.info(`[${taskName}] Stopping process...`);
      stopPromises.push(killProcess(taskProcess.process));
    }
  }

  await Promise.all(stopPromises);
  state.processes.clear();
}

/**
 * Check if all processes are healthy after startup timeout
 */
async function waitForHealthy(
  state: DeploymentState,
  timeoutMs: number
): Promise<boolean> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let resolved = false;

    const checkHealth = () => {
      if (resolved) return;

      // Check if any process has exited
      for (const [, taskProcess] of state.processes) {
        if (
          taskProcess.process &&
          taskProcess.process.exitCode !== null
        ) {
          resolved = true;
          resolve(false);
          return;
        }
      }

      // Check if timeout reached
      if (Date.now() - startTime >= timeoutMs) {
        resolved = true;
        resolve(true);
        return;
      }

      // Keep checking
      setTimeout(checkHealth, 1000);
    };

    checkHealth();
  });
}

/**
 * Deploy a new snapshot
 */
async function deploy(
  snapshotPath: string,
  nodeConfig: NodeConfig,
  autoDeployConfig: AutoDeployConfig,
  state: DeploymentState
): Promise<boolean> {
  // Copy local files to snapshot
  p.log.info("Copying local files to snapshot...");
  copyLocalFiles(snapshotPath);

  // Build all tasks first (before stopping anything)
  p.log.info("Building tasks...");
  const buildResult = await buildTasks(snapshotPath, nodeConfig.tasks);
  if (!buildResult.success) {
    p.log.error(`Build failed for task: ${buildResult.failedTask}`);
    return false;
  }

  // Build succeeded - now stop old processes to free up ports
  const oldProcesses = state.processes;
  const oldSnapshot = state.currentSnapshot;

  if (oldProcesses.size > 0) {
    p.log.info("Stopping old processes to free up ports...");
    await stopAllProcesses(state);
  }

  // Start all tasks
  p.log.info("Starting tasks...");
  const newProcesses = new Map<string, TaskProcess>();
  let crashedDuringStartup = false;

  for (const task of nodeConfig.tasks) {
    const taskProcess = startTask(
      task,
      snapshotPath,
      autoDeployConfig,
      state,
      () => {
        crashedDuringStartup = true;
      }
    );
    newProcesses.set(task, taskProcess);
  }

  // Set new processes for health check (but don't update currentSnapshot yet)
  state.processes = newProcesses;

  // Wait for startup timeout to verify health
  p.log.info(
    `Waiting ${autoDeployConfig.startupTimeout}s for processes to stabilize...`
  );

  const healthy = await waitForHealthy(
    state,
    autoDeployConfig.startupTimeout * 1000
  );

  if (!healthy || crashedDuringStartup) {
    p.log.error("New deployment failed health check, rolling back...");

    // Stop failed new processes
    await stopAllProcesses(state);

    // Rollback: restart old deployment if we had one
    if (oldSnapshot) {
      p.log.warn("Restarting previous deployment...");
      state.currentSnapshot = oldSnapshot;

      // Restart old processes
      const restoredProcesses = new Map<string, TaskProcess>();
      for (const task of nodeConfig.tasks) {
        const taskProcess = startTask(
          task,
          oldSnapshot,
          autoDeployConfig,
          state,
          () => {} // Don't track crashes during rollback
        );
        restoredProcesses.set(task, taskProcess);
      }
      state.processes = restoredProcesses;
    } else {
      // No previous deployment to rollback to
      p.log.error("No previous deployment to rollback to");
      state.currentSnapshot = null;
    }

    return false;
  }

  // Success! Update state
  state.previousSnapshot = oldSnapshot;
  state.currentSnapshot = snapshotPath;

  p.log.success("Deployment successful!");
  return true;
}

/**
 * Pull latest changes and deploy
 */
async function pullAndDeploy(
  nodeConfig: NodeConfig,
  state: DeploymentState
): Promise<void> {
  if (state.isUpdating) {
    p.log.warn("Update already in progress, skipping...");
    return;
  }

  state.isUpdating = true;

  try {
    const repoName = getRepoNameFromUrl(nodeConfig.repo);
    const timestamp = Date.now();
    const snapshotsDir = path.join(LOCAL_DIR, "repo-snapshots");
    const newSnapshotPath = path.join(snapshotsDir, String(timestamp), repoName);

    // Clone fresh copy
    p.log.info(`Cloning ${nodeConfig.repo}...`);
    const cloneResult = await cloneRepo(nodeConfig.repo, newSnapshotPath);

    if (!cloneResult.success) {
      p.log.error(`Failed to clone: ${cloneResult.error}`);
      return;
    }

    // Load autodeploy config from new snapshot
    const autoDeployConfig = loadAutoDeployConfig(newSnapshotPath);
    if (!autoDeployConfig) {
      p.log.error("No .autodeploy.config/config.json found in repo");
      return;
    }

    // Checkout the correct branch
    const checkoutResult = await checkoutBranch(
      newSnapshotPath,
      autoDeployConfig.branch
    );

    if (!checkoutResult.success) {
      p.log.error(
        `Failed to checkout branch ${autoDeployConfig.branch}: ${checkoutResult.error}`
      );
      return;
    }

    // Deploy
    const success = await deploy(
      newSnapshotPath,
      nodeConfig,
      autoDeployConfig,
      state
    );

    if (success) {
      // Cleanup old snapshots (keep only 2)
      cleanupSnapshots(repoName, 2);
    } else if (state.previousSnapshot) {
      // Rollback: restart previous deployment
      p.log.warn("Rolling back to previous deployment...");
      const prevConfig = loadAutoDeployConfig(state.previousSnapshot);
      if (prevConfig) {
        state.currentSnapshot = state.previousSnapshot;
        await deploy(state.previousSnapshot, nodeConfig, prevConfig, state);
      }
    }
  } finally {
    state.isUpdating = false;
  }
}

/**
 * Main run command
 */
export async function runCommand(): Promise<void> {
  p.intro("auto-deploy run");

  // Check for .autodeploy.local
  if (!fs.existsSync(LOCAL_DIR)) {
    p.log.error(
      `No ${LOCAL_DIR} found. Run 'auto-deploy init node' first.`
    );
    process.exit(1);
  }

  // Load node config
  const nodeConfig = loadNodeConfig();
  if (!nodeConfig) {
    p.log.error(`No config.json found in ${LOCAL_DIR}`);
    process.exit(1);
  }

  p.log.info(`Repository: ${nodeConfig.repo}`);
  p.log.info(`Tasks: ${nodeConfig.tasks.join(", ")}`);

  // Initialize state
  const state: DeploymentState = {
    currentSnapshot: null,
    previousSnapshot: null,
    processes: new Map(),
    isUpdating: false,
  };

  // Initial deployment
  await pullAndDeploy(nodeConfig, state);

  if (!state.currentSnapshot) {
    p.log.error("Initial deployment failed");
    process.exit(1);
  }

  // Load config for polling
  const autoDeployConfig = loadAutoDeployConfig(state.currentSnapshot);
  if (!autoDeployConfig) {
    p.log.error("Failed to load autodeploy config");
    process.exit(1);
  }

  // Start polling for new commits
  const stopPolling = startPolling({
    repoUrl: nodeConfig.repo,
    branch: autoDeployConfig.branch,
    intervalMs: autoDeployConfig.pollInterval * 1000,
    onNewCommit: () => {
      pullAndDeploy(nodeConfig, state);
    },
  });

  // Handle graceful shutdown
  const shutdown = async () => {
    p.log.info("\nShutting down...");

    stopPolling();
    await stopAllProcesses(state);

    p.outro("Goodbye!");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  p.log.success("Auto-deploy is running. Press Ctrl+C to stop.");
}
