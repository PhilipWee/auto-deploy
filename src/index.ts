import { Command } from "commander";
import * as p from "@clack/prompts";
import * as fs from "node:fs";
import * as path from "node:path";

const program = new Command();

program
  .name("auto-deploy")
  .description("A CLI tool for auto deployment")
  .version("0.1.0");

// init command with subcommands
const initCommand = new Command("init").description(
  "Initialize autodeploy configuration"
);

initCommand
  .command("node")
  .description("Initialize local node configuration (.autodeploy.local/)")
  .action(async () => {
    p.intro("auto-deploy init node");

    const localDir = ".autodeploy.local";
    const filesDir = path.join(localDir, "files");

    // Create directories
    if (!fs.existsSync(filesDir)) {
      fs.mkdirSync(filesDir, { recursive: true });
      p.log.success(`Created ${filesDir}/`);
    } else {
      p.log.info(`${filesDir}/ already exists`);
    }

    // Create empty config.json
    const configPath = path.join(localDir, "config.json");
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, "{}\n");
      p.log.success(`Created ${configPath}`);
    } else {
      p.log.info(`${configPath} already exists`);
    }

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
      p.log.success(`Added ${gitignoreEntry} to .gitignore`);
    } else {
      p.log.info(`${gitignoreEntry} already in .gitignore`);
    }

    p.outro("Node initialized!");
  });

initCommand
  .command("repo")
  .description("Initialize repo configuration (.autodeploy.config/)")
  .action(async () => {
    p.intro("auto-deploy init repo");

    const configDir = ".autodeploy.config";
    const workflowDir = path.join(configDir, "configs", "workflow-runner");

    // Create directories
    if (!fs.existsSync(workflowDir)) {
      fs.mkdirSync(workflowDir, { recursive: true });
      p.log.success(`Created ${workflowDir}/`);
    } else {
      p.log.info(`${workflowDir}/ already exists`);
    }

    // Create sample build.sh
    const buildPath = path.join(workflowDir, "build.sh");
    if (!fs.existsSync(buildPath)) {
      fs.writeFileSync(
        buildPath,
        `#!/bin/bash
# Build script - customize for your project
echo "Building..."
`
      );
      fs.chmodSync(buildPath, "755");
      p.log.success(`Created ${buildPath}`);
    } else {
      p.log.info(`${buildPath} already exists`);
    }

    // Create sample run.sh
    const runPath = path.join(workflowDir, "run.sh");
    if (!fs.existsSync(runPath)) {
      fs.writeFileSync(
        runPath,
        `#!/bin/bash
# Run script - customize for your project
echo "Running..."
`
      );
      fs.chmodSync(runPath, "755");
      p.log.success(`Created ${runPath}`);
    } else {
      p.log.info(`${runPath} already exists`);
    }

    p.outro("Repo initialized!");
  });

program.addCommand(initCommand);

// run command
program
  .command("run")
  .description("Run the deployment workflow")
  .action(async () => {
    p.intro("auto-deploy run");

    p.log.info("Run command not yet implemented");

    p.outro("Done!");
  });

program.parse();
