import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as p from "@clack/prompts";

const execAsync = promisify(exec);

/**
 * Get the latest commit SHA for a branch using git ls-remote
 * Uses system git, so it will use existing SSH keys and credential helpers
 */
export async function getLatestCommitSha(
  repoUrl: string,
  branch: string
): Promise<{ sha: string | null; error?: string }> {
  try {
    const { stdout } = await execAsync(
      `git ls-remote "${repoUrl}" "refs/heads/${branch}"`
    );

    const match = stdout.trim().match(/^([a-f0-9]+)/);
    if (match) {
      return { sha: match[1] };
    }

    return { sha: null, error: `Branch '${branch}' not found` };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { sha: null, error: message };
  }
}

export interface PollingOptions {
  repoUrl: string;
  branch: string;
  intervalMs: number;
  onNewCommit: (sha: string) => void;
}

/**
 * Start polling for new commits using git ls-remote
 * Returns a function to stop polling
 */
export function startPolling(options: PollingOptions): () => void {
  const { repoUrl, branch, intervalMs, onNewCommit } = options;

  let lastKnownSha: string | null = null;
  let isRunning = true;
  let timeoutId: NodeJS.Timeout | null = null;

  const poll = async () => {
    if (!isRunning) return;

    const result = await getLatestCommitSha(repoUrl, branch);

    if (result.error) {
      p.log.warn(`Failed to check for updates: ${result.error}`);
    } else if (result.sha) {
      if (lastKnownSha === null) {
        // First poll, just record the SHA
        lastKnownSha = result.sha;
        p.log.info(`Current commit: ${result.sha.substring(0, 7)}`);
      } else if (result.sha !== lastKnownSha) {
        // New commit detected
        p.log.info(
          `New commit detected: ${result.sha.substring(0, 7)} (was ${lastKnownSha.substring(0, 7)})`
        );
        lastKnownSha = result.sha;
        onNewCommit(result.sha);
      }
    }

    if (isRunning) {
      timeoutId = setTimeout(poll, intervalMs);
    }
  };

  // Start polling
  p.log.success(`Polling ${repoUrl}:${branch} every ${intervalMs / 1000}s`);
  poll();

  // Return stop function
  return () => {
    isRunning = false;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };
}
