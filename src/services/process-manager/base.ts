export interface ServiceConfig {
  name: string;
  command: string;
  args?: string[];
  workingDirectory: string;
  env?: Record<string, string>;
  user?: string;
  restartOnFailure?: boolean;
  restartDelaySec?: number;
}

export interface ServiceStatus {
  name: string;
  isRunning: boolean;
  pid: number | null;
  uptime: string | null;
  memoryUsage: string | null;
}

export interface LogOptions {
  lines?: number;
  since?: string;
  follow?: boolean;
}

/**
 * Abstract class for process/service management.
 * Subclasses implement OS-specific operations.
 *
 * Linux: systemd + journald
 * macOS: launchd
 * Windows: NSSM or native SCM (future)
 */
export abstract class ProcessManager {
  protected servicePrefix: string;

  constructor(servicePrefix: string = "autodeploy") {
    this.servicePrefix = servicePrefix;
  }

  /**
   * Get the full service name with prefix
   */
  protected getServiceName(name: string): string {
    return `${this.servicePrefix}-${name}`;
  }

  // ============================================================
  // Abstract methods - subclasses implement these (OS-specific)
  // ============================================================

  /**
   * Install/register a service with the OS service manager
   */
  abstract install(config: ServiceConfig): Promise<void>;

  /**
   * Uninstall/remove a service from the OS service manager
   */
  abstract uninstall(name: string): Promise<void>;

  /**
   * Start a service
   */
  abstract start(name: string): Promise<void>;

  /**
   * Stop a service
   */
  abstract stop(name: string): Promise<void>;

  /**
   * Restart a service
   */
  abstract restart(name: string): Promise<void>;

  /**
   * Get the status of a service
   */
  abstract getStatus(name: string): Promise<ServiceStatus>;

  /**
   * Get logs for a service
   * If follow is true, streams to stdout and returns void
   */
  abstract getLogs(name: string, options?: LogOptions): Promise<string | void>;

  /**
   * Check if a service is installed
   */
  abstract isInstalled(name: string): Promise<boolean>;

  /**
   * List all services managed by this process manager
   */
  abstract listServices(): Promise<ServiceStatus[]>;

  // ============================================================
  // Shared convenience methods
  // ============================================================

  /**
   * Restart a service and wait for it to be healthy
   * @returns true if healthy, false if failed
   */
  async restartAndVerify(
    name: string,
    timeoutMs: number = 10000
  ): Promise<boolean> {
    await this.restart(name);
    return this.waitForHealthy(name, timeoutMs);
  }

  /**
   * Wait for a service to be running and stable
   */
  async waitForHealthy(
    name: string,
    timeoutMs: number = 10000
  ): Promise<boolean> {
    const start = Date.now();
    const checkInterval = 1000;
    const stabilityDelay = 3000;

    // Initial startup delay
    await this.sleep(2000);

    while (Date.now() - start < timeoutMs) {
      const status = await this.getStatus(name);

      if (status.isRunning && status.pid) {
        // Process is running, wait to ensure it doesn't crash immediately
        await this.sleep(stabilityDelay);
        const recheck = await this.getStatus(name);

        if (recheck.isRunning && recheck.pid === status.pid) {
          return true;
        }
      }

      await this.sleep(checkInterval);
    }

    return false;
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
