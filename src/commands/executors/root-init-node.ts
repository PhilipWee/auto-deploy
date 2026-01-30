import path from "path";
import { getTemplatesDir, copyDir } from "../../helpers/fs";
import {
  getRepoNameFromUrl,
  getSnapshotPath,
  cloneRepo,
} from "../../helpers/git";
import { NodeConfig } from "../../types";
import fs from "fs";
import {
  cancel,
  isCancel,
  log,
  multiselect,
  outro,
  spinner,
} from "@clack/prompts";

export async function rootInitNode({ repoUrl }: { repoUrl: string }) {
  const localDir = ".autodeploy.local";
  // Step 2: Create base directory structure
  const templatesDir = getTemplatesDir();
  const templatePath = path.join(templatesDir, "autodeploy.local");

  if (!fs.existsSync(localDir)) {
    copyDir(templatePath, localDir, { overwrite: false });
  }

  // Ensure files directory exists
  const filesDir = path.join(localDir, "files");
  if (!fs.existsSync(filesDir)) {
    fs.mkdirSync(filesDir, { recursive: true });
  }

  log.success(`Created ${localDir}/`);

  // Step 3: Clone repo into repo-snapshots/<timestamp>/<repo-name>
  const repoName = getRepoNameFromUrl(repoUrl);
  const timestamp = Date.now();
  const snapshotPath = getSnapshotPath(localDir, repoName, timestamp);

  const clackSpinner = spinner();
  clackSpinner.start(`Cloning ${repoName}...`);

  const cloneResult = await cloneRepo(repoUrl, snapshotPath);

  if (!cloneResult.success) {
    clackSpinner.stop(`Failed to clone repository`);
    log.error(cloneResult.error || "Unknown error");
    process.exit(1);
  }

  clackSpinner.stop(`Cloned ${repoName} to ${snapshotPath}`);

  // Step 4: Look for .autodeploy.config in the cloned repo
  const autoDeployConfigPath = path.join(snapshotPath, ".autodeploy.config");

  if (!fs.existsSync(autoDeployConfigPath)) {
    log.warn(
      `No .autodeploy.config found in the repository. Please run 'auto-deploy init repo' in the target repo first.`
    );
    process.exit(1);
  }

  // Step 5: Read available task types (directories in .autodeploy.config)
  const entries = fs.readdirSync(autoDeployConfigPath, {
    withFileTypes: true,
  });
  const taskTypes = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  if (taskTypes.length === 0) {
    log.warn(`No task types found in .autodeploy.config`);
    process.exit(1);
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

  if (isCancel(selectedTasks)) {
    cancel("Operation cancelled");
    process.exit(0);
  }

  // Step 7: Generate config.json
  const config: NodeConfig = {
    repo: repoUrl,
    tasks: selectedTasks as string[],
  };

  const configPath = path.join(localDir, "config.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  log.success(`Created ${configPath}`);

  // Update .gitignore to ignore .autodeploy.local/
  const gitignorePath = ".gitignore";
  const gitignoreEntry = ".autodeploy.local/";

  let gitignoreContent = "";
  if (fs.existsSync(gitignorePath)) {
    gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
  }

  if (!gitignoreContent.includes(gitignoreEntry)) {
    const newContent = gitignoreContent
      ? `${gitignoreContent.trimEnd()}\n${gitignoreEntry}\n`
      : `${gitignoreEntry}\n`;
    fs.writeFileSync(gitignorePath, newContent);
    log.success(`Added ${gitignoreEntry} to .gitignore`);
  }

  log.info(`Selected tasks: ${(selectedTasks as string[]).join(", ")}`);
  outro("Node initialized!");
}
