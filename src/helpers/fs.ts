import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Recursively copy a directory from src to dest
 * @param src Source directory path
 * @param dest Destination directory path
 * @param options Options for copying
 */
export function copyDir(
  src: string,
  dest: string,
  options: {
    overwrite?: boolean;
    filter?: (srcPath: string) => boolean;
  } = {}
): void {
  const { overwrite = false, filter } = options;

  // Create destination directory if it doesn't exist
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Skip .gitkeep files - they're just placeholders
    if (entry.name === ".gitkeep") {
      continue;
    }

    // Apply filter if provided
    if (filter && !filter(srcPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, options);
    } else {
      // Only copy if overwrite is true or file doesn't exist
      if (overwrite || !fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath);

        // Preserve executable permission for .sh files
        if (entry.name.endsWith(".sh")) {
          fs.chmodSync(destPath, "755");
        }
      }
    }
  }
}

/**
 * Get the templates directory path (resolved from package location)
 */
export function getTemplatesDir(): string {
  const currentFileUrl = import.meta.url;
  const currentFilePath = new URL(currentFileUrl).pathname;
  const distDir = path.dirname(currentFilePath);
  // Templates are at the package root, dist is one level down
  return path.join(distDir, "templates");
}
