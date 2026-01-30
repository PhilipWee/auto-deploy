import { outro, log } from "@clack/prompts";
import path from "path";
import fs from "fs";
import { getTemplatesDir, copyDir } from "../../helpers/fs";

export function rootInitRepo() {
  const templatesDir = getTemplatesDir();
  const templatePath = path.join(templatesDir, "autodeploy.config");
  const destPath = ".autodeploy.config";

  if (fs.existsSync(destPath)) {
    throw new Error(`${destPath}/ already exists.`);
  }

  // Copy template to destination
  copyDir(templatePath, destPath, { overwrite: false });
}
