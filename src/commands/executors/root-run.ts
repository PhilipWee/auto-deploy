import { log, spinner } from "@clack/prompts";
import fs from "fs";
import path from "path";
import os from "os";
import { createProcessManager } from "../../services/process-manager";

export async function rootRun() {
  const processManager = createProcessManager();

  const serviceName = "time-printer";
  const workDir = path.join(os.tmpdir(), "autodeploy-test");
  const scriptPath = path.join(workDir, "print-time.sh");

  // Create working directory
  fs.mkdirSync(workDir, { recursive: true });

  // Create a simple script that prints the time every second
  const script = `#!/bin/bash
while true; do
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Hello from autodeploy service"
  sleep 1
done
`;
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });

  const clackSpinner = spinner();

  // Check if already installed
  const isInstalled = await processManager.isInstalled(serviceName);
  if (isInstalled) {
    log.info(`Service "${serviceName}" already installed. Restarting...`);
    await processManager.restart(serviceName);
  } else {
    clackSpinner.start(`Installing service "${serviceName}"...`);

    await processManager.install({
      name: serviceName,
      command: "/bin/bash",
      args: [scriptPath],
      workingDirectory: workDir,
      restartOnFailure: true,
      restartDelaySec: 3,
    });

    clackSpinner.stop(`Service "${serviceName}" installed ✅`);
  }

  // Get status
  const status = await processManager.getStatus(serviceName);
  log.info(`Service status: ${status.isRunning ? "running" : "stopped"} (PID: ${status.pid ?? "none"})`);

  // Show recent logs
  log.info("Fetching logs (last 10 lines)...");
  const logs = await processManager.getLogs(serviceName, { lines: 10 });
  if (logs && typeof logs === "string") {
    console.log("\n" + logs);
  }

  log.success(`Service "${serviceName}" is running!`);
  log.info(`To view live logs, run: launchctl list | grep autodeploy`);
  log.info(`Logs are at: ~/Library/Logs/autodeploy/${serviceName}.out.log`);
}
