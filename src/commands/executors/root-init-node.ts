import { log, multiselect, spinner } from "@clack/prompts";
import fs from "fs";
import path from "path";
import { copyDir, getNodeConfigDir, getTemplatesDir } from "../../helpers/fs";
import {
  cloneRepo,
  getRepoNameFromUrl,
  getSnapshotPath,
} from "../../helpers/git";
import { NodeConfig } from "../../types";
import { GitRepoService } from "../../services/repo-service/git-repo-service";

export async function rootInitNode({ repoUrl }: { repoUrl: string }) {
  const localDir = getNodeConfigDir();
  const templatesDir = getTemplatesDir();

  const templatePath = path.join(templatesDir, "autodeploy.local");

  if (fs.existsSync(localDir)) {
    throw new Error("Node inited already");
  }

  copyDir(templatePath, localDir, { overwrite: false });

  const gitRepoService = new GitRepoService(repoUrl, localDir);

  const repoName = getRepoNameFromUrl(repoUrl);
  const timestamp = Date.now();
  const snapshotPath = getSnapshotPath(localDir, repoName, timestamp);

  const clackSpinner = spinner();
  clackSpinner.start(`Cloning ${repoName}...`);

  const latestVer = await gitRepoService.getLatestVersion();
  const pullResult = await gitRepoService.pullByVersion(latestVer.version);

  clackSpinner.stop(`Cloned ${repoName} to ${pullResult}`);

  const autoDeployConfigPath = path.join(snapshotPath, ".autodeploy.config");

  if (!fs.existsSync(autoDeployConfigPath)) {
    throw new Error(
      `No .autodeploy.config found in the repository. Please run 'auto-deploy init repo' in the target repo first.`
    );
  }

  // Step 5: Read available task types (directories in .autodeploy.config)
  const entries = fs.readdirSync(autoDeployConfigPath, {
    withFileTypes: true,
  });
  const taskTypes = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  if (taskTypes.length === 0) {
    throw new Error(`No task types found in .autodeploy.config`);
  }

  // Step 6: Ask user which task types they want (multiselect)
  const selectedTasks = await multiselect({
    message: "Select task types to enable:",
    options: taskTypes.map((task) => ({
      value: task,
      label: task,
    })),
    required: true,
  });

  // Step 7: Generate config.json
  const config: NodeConfig = {
    repo: repoUrl,
    tasks: selectedTasks as string[],
  };

  const configPath = path.join(localDir, "config.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}
