import { RepoService } from "./repo-service";
import {
  cloneRepo,
  checkoutCommit,
  getLatestCommitHash,
} from "../../helpers/git";

export class GitRepoService extends RepoService {
  /**
   * Fetch the latest commit hash from the remote repository for the configured branch.
   */
  protected async _getLatestVersion(): Promise<{ version: string }> {
    const result = await getLatestCommitHash(this.repoUrl, this.branch);

    if (!result.success || !result.commitHash) {
      throw new Error(
        result.error || `Failed to get latest commit for branch "${this.branch}"`
      );
    }

    return { version: result.commitHash };
  }

  /**
   * Clone the repository and checkout a specific commit hash.
   * @param version - The commit hash to checkout
   * @param targetPath - The full path where the repo should be cloned
   * @returns The path to the cloned repository
   */
  protected async _pullByVersion(
    version: string,
    targetPath: string
  ): Promise<string> {
    // Clone the repository
    const cloneResult = await cloneRepo(this.repoUrl, targetPath);

    if (!cloneResult.success) {
      throw new Error(cloneResult.error || "Failed to clone repository");
    }

    // Checkout the specific commit
    const checkoutResult = await checkoutCommit(targetPath, version);

    if (!checkoutResult.success) {
      throw new Error(
        checkoutResult.error || `Failed to checkout commit "${version}"`
      );
    }

    return targetPath;
  }
}