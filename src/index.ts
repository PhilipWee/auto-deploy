import { Command } from "commander";
import * as p from "@clack/prompts";
import * as fs from "node:fs";
import * as path from "node:path";
import { copyDir, getTemplatesDir } from "./helpers/fs.js";

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

    const templatesDir = getTemplatesDir();
    const templatePath = path.join(templatesDir, "autodeploy.local");
    const destPath = ".autodeploy.local";

    if (fs.existsSync(destPath)) {
      p.log.info(`${destPath}/ already exists, merging files...`);
    }

    // Copy template to destination
    copyDir(templatePath, destPath, { overwrite: false });
    p.log.success(`Created ${destPath}/`);

    // Ensure files directory exists (in case .gitkeep was skipped)
    const filesDir = path.join(destPath, "files");
    if (!fs.existsSync(filesDir)) {
      fs.mkdirSync(filesDir, { recursive: true });
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

    const templatesDir = getTemplatesDir();
    const templatePath = path.join(templatesDir, "autodeploy.config");
    const destPath = ".autodeploy.config";

    if (fs.existsSync(destPath)) {
      p.log.info(`${destPath}/ already exists, merging files...`);
    }

    // Copy template to destination
    copyDir(templatePath, destPath, { overwrite: false });
    p.log.success(`Created ${destPath}/`);

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
