import * as fs from "fs/promises";
import * as path from "path";

export interface VersionMetadata {
  version: string;
  isDownloaded: boolean;
  localFilePath: string | null;
  downloadedAt: Date | null;
}

/**
 * Abstract class for repository services.
 * Subclasses implement remote operations (_getLatestVersion, _pullByVersion).
 * Filesystem operations (delete, list) are handled by the base class.
 *
 * Folder naming convention: {unixTimestamp}.{version}
 * e.g., 1706640000.v1.0.0
 */
export abstract class RepoService {
  protected repoUrl: string;
  protected outputDir: string;
  protected branch: string;

  constructor(repoUrl: string, outputDir: string, branch: string = "main") {
    this.repoUrl = repoUrl;
    this.outputDir = outputDir;
    this.branch = branch;
  }

  // ============================================================
  // Abstract methods - subclasses implement these (remote operations)
  // ============================================================

  /**
   * Fetch the latest version string from the remote repository.
   */
  protected abstract _getLatestVersion(): Promise<{ version: string }>;

  /**
   * Pull/download a specific version to the target path.
   * @param version - The version to download
   * @param targetPath - The full path where the version should be downloaded
   * @returns The path to the downloaded content
   */
  protected abstract _pullByVersion(
    version: string,
    targetPath: string
  ): Promise<string>;

  // ============================================================
  // Public methods - simpler API that manages paths internally
  // ============================================================

  /**
   * Get the latest version from remote and check if it's downloaded locally.
   * @returns VersionMetadata with download status
   */
  async getLatestVersion(): Promise<VersionMetadata> {
    const { version } = await this._getLatestVersion();
    const downloaded = await this.findDownloadedVersion(version);

    if (downloaded) {
      return downloaded;
    }

    return {
      version,
      isDownloaded: false,
      localFilePath: null,
      downloadedAt: null,
    };
  }

  /**
   * Download a specific version to the output directory.
   * Folder name format: {unixTimestamp}.{version}
   * @param version - The version to download
   * @returns The path to the downloaded content
   */
  async pullByVersion(version: string): Promise<string> {
    const timestamp = Math.floor(Date.now() / 1000);
    const folderName = `${timestamp}.${version}`;
    const targetPath = path.join(this.outputDir, folderName);

    await fs.mkdir(this.outputDir, { recursive: true });
    return this._pullByVersion(version, targetPath);
  }

  /**
   * Delete a downloaded version by its version string.
   * @param version - The version to delete
   */
  async deleteVersion(version: string): Promise<void> {
    const downloaded = await this.findDownloadedVersion(version);

    if (!downloaded || !downloaded.localFilePath) {
      throw new Error(`Version ${version} is not downloaded`);
    }

    await fs.rm(downloaded.localFilePath, { recursive: true, force: true });
  }

  /**
   * List all downloaded versions, sorted by download time (latest first).
   * @returns Record of version string to VersionMetadata
   */
  async listDownloadedVersions(): Promise<Record<string, VersionMetadata>> {
    const result: Record<string, VersionMetadata> = {};

    try {
      const entries = await fs.readdir(this.outputDir, { withFileTypes: true });
      const folders = entries.filter((entry) => entry.isDirectory());

      // Parse folder names and sort by timestamp (descending - latest first)
      const parsed = folders
        .map((folder) => this.parseFolderName(folder.name))
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .sort((a, b) => b.timestamp - a.timestamp);

      for (const { version, timestamp, folderName } of parsed) {
        result[version] = {
          version,
          isDownloaded: true,
          localFilePath: path.join(this.outputDir, folderName),
          downloadedAt: new Date(timestamp * 1000),
        };
      }
    } catch (error) {
      // If directory doesn't exist, return empty record
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    return result;
  }

  // ============================================================
  // Private helper methods
  // ============================================================

  /**
   * Parse a folder name in the format {unixTimestamp}.{version}
   * @returns Parsed data or null if invalid format
   */
  private parseFolderName(
    folderName: string
  ): { version: string; timestamp: number; folderName: string } | null {
    const dotIndex = folderName.indexOf(".");
    if (dotIndex === -1) {
      return null;
    }

    const timestampStr = folderName.substring(0, dotIndex);
    const version = folderName.substring(dotIndex + 1);

    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp) || !version) {
      return null;
    }

    return { version, timestamp, folderName };
  }

  /**
   * Find a downloaded version by its version string.
   * If multiple downloads of the same version exist, returns the latest one.
   * @returns VersionMetadata or null if not found
   */
  private async findDownloadedVersion(
    version: string
  ): Promise<VersionMetadata | null> {
    const downloaded = await this.listDownloadedVersions();
    return downloaded[version] || null;
  }
}
