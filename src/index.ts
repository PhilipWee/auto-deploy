import { Command } from "commander";
import * as p from "@clack/prompts";
import * as fs from "node:fs";
import * as path from "node:path";
import { copyDir, getTemplatesDir } from "./helpers/fs.js";
import {
  cloneRepo,
  getRepoNameFromUrl,
  getSnapshotPath,
} from "./helpers/git.js";
import { runCommand } from "./commands/run.js";
import { NodeConfig } from "./types.js";

import './cli-args.js'

// const program = new Command();

// program
//   .name("auto-deploy")
//   .description("A CLI tool for auto deployment")
//   .version("0.1.0");

// // init command with subcommands
// const initCommand = new Command("init").description(
//   "Initialize autodeploy configuration"
// );

// initCommand
//   .command("node")
//   .description("Initialize local node configuration (.autodeploy.local/)")
//   .action(async () => {
//     p.intro("auto-deploy init node");

//     const localDir = ".autodeploy.local";

//     // Step 1: Ask for repo URL
//     const repoUrl = await p.text({
//       message: "Enter the git repository URL:",
//       placeholder: "https://github.com/user/repo.git",
//       validate: (value) => {
//         if (!value) return "Repository URL is required";
//         if (!value.includes("github.com") && !value.includes("gitlab.com") && !value.includes("bitbucket.org")) {
//           // Allow other git URLs too, just a soft warning
//         }
//         return undefined;
//       },
//     });

//     if (p.isCancel(repoUrl)) {
//       p.cancel("Operation cancelled");
//       process.exit(0);
//     }

//     // Step 2: Create base directory structure
//     const templatesDir = getTemplatesDir();
//     const templatePath = path.join(templatesDir, "autodeploy.local");

//     if (!fs.existsSync(localDir)) {
//       copyDir(templatePath, localDir, { overwrite: false });
//     }

//     // Ensure files directory exists
//     const filesDir = path.join(localDir, "files");
//     if (!fs.existsSync(filesDir)) {
//       fs.mkdirSync(filesDir, { recursive: true });
//     }

//     p.log.success(`Created ${localDir}/`);

//     // Step 3: Clone repo into repo-snapshots/<timestamp>/<repo-name>
//     const repoName = getRepoNameFromUrl(repoUrl);
//     const timestamp = Date.now();
//     const snapshotPath = getSnapshotPath(localDir, repoName, timestamp);

//     const spinner = p.spinner();
//     spinner.start(`Cloning ${repoName}...`);

//     const cloneResult = await cloneRepo(repoUrl, snapshotPath);

//     if (!cloneResult.success) {
//       spinner.stop(`Failed to clone repository`);
//       p.log.error(cloneResult.error || "Unknown error");
//       process.exit(1);
//     }

//     spinner.stop(`Cloned ${repoName} to ${snapshotPath}`);

//     // Step 4: Look for .autodeploy.config in the cloned repo
//     const autoDeployConfigPath = path.join(snapshotPath, ".autodeploy.config");

//     if (!fs.existsSync(autoDeployConfigPath)) {
//       p.log.warn(
//         `No .autodeploy.config found in the repository. Please run 'auto-deploy init repo' in the target repo first.`
//       );
//       process.exit(1);
//     }

//     // Step 5: Read available task types (directories in .autodeploy.config)
//     const entries = fs.readdirSync(autoDeployConfigPath, {
//       withFileTypes: true,
//     });
//     const taskTypes = entries
//       .filter((entry) => entry.isDirectory())
//       .map((entry) => entry.name);

//     if (taskTypes.length === 0) {
//       p.log.warn(`No task types found in .autodeploy.config`);
//       process.exit(1);
//     }

//     // Step 6: Ask user which task types they want (multiselect)
//     const selectedTasks = await p.multiselect({
//       message: "Select task types to enable:",
//       options: taskTypes.map((task) => ({
//         value: task,
//         label: task,
//       })),
//       required: true,
//     });

//     if (p.isCancel(selectedTasks)) {
//       p.cancel("Operation cancelled");
//       process.exit(0);
//     }

//     // Step 7: Generate config.json
//     const config: NodeConfig = {
//       repo: repoUrl,
//       tasks: selectedTasks as string[],
//     };

//     const configPath = path.join(localDir, "config.json");
//     fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
//     p.log.success(`Created ${configPath}`);

//     // Update .gitignore to ignore .autodeploy.local/
//     const gitignorePath = ".gitignore";
//     const gitignoreEntry = ".autodeploy.local/";

//     let gitignoreContent = "";
//     if (fs.existsSync(gitignorePath)) {
//       gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
//     }

//     if (!gitignoreContent.includes(gitignoreEntry)) {
//       const newContent = gitignoreContent
//         ? `${gitignoreContent.trimEnd()}\n${gitignoreEntry}\n`
//         : `${gitignoreEntry}\n`;
//       fs.writeFileSync(gitignorePath, newContent);
//       p.log.success(`Added ${gitignoreEntry} to .gitignore`);
//     }

//     p.log.info(`Selected tasks: ${(selectedTasks as string[]).join(", ")}`);
//     p.outro("Node initialized!");
//   });

// initCommand
//   .command("repo")
//   .description("Initialize repo configuration (.autodeploy.config/)")
//   .action(async () => {
//     p.intro("auto-deploy init repo");

//     const templatesDir = getTemplatesDir();
//     const templatePath = path.join(templatesDir, "autodeploy.config");
//     const destPath = ".autodeploy.config";

//     if (fs.existsSync(destPath)) {
//       p.log.info(`${destPath}/ already exists, merging files...`);
//     }

//     // Copy template to destination
//     copyDir(templatePath, destPath, { overwrite: false });
//     p.log.success(`Created ${destPath}/`);

//     p.outro("Repo initialized!");
//   });

// program.addCommand(initCommand);

// // run command
// program
//   .command("run")
//   .description("Run the deployment workflow")
//   .action(runCommand);

// program.parse();
