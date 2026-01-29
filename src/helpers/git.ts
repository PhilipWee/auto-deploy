import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";

const execAsync = promisify(exec);

/**
 * Extract repo name from a git URL
 * Supports: https://github.com/user/repo.git, git@github.com:user/repo.git
 */
export function getRepoNameFromUrl(repoUrl: string): string {
  // Remove trailing .git if present
  const cleanUrl = repoUrl.replace(/\.git$/, "");

  // Extract the last part of the path
  const parts = cleanUrl.split(/[\/:]/).filter(Boolean);
  return parts[parts.length - 1] || "repo";
}

/**
 * Clone a git repository to a destination directory
 */
export async function cloneRepo(
  repoUrl: string,
  destDir: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await execAsync(`git clone "${repoUrl}" "${destDir}"`);
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { success: false, error: message };
  }
}

/**
 * Pull latest changes in a git repository
 */
export async function pullRepo(
  repoDir: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await execAsync(`git -C "${repoDir}" pull`);
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { success: false, error: message };
  }
}

/**
 * Generate the snapshot directory path for a repo
 */
export function getSnapshotPath(
  baseDir: string,
  repoName: string,
  timestamp?: number
): string {
  const ts = timestamp || Date.now();
  return path.join(baseDir, "repo-snapshots", String(ts), repoName);
}
