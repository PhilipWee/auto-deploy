import { exec, spawn } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import {
  ProcessManager,
  ServiceConfig,
  ServiceStatus,
  LogOptions,
} from "./base";

const execAsync = promisify(exec);

// LaunchAgents = user-level, LaunchDaemons = system-level (requires root)
const LAUNCH_AGENTS_PATH = path.join(
  process.env.HOME!,
  "Library/LaunchAgents"
);
const LOG_PATH = path.join(process.env.HOME!, "Library/Logs/autodeploy");

export class DarwinProcessManager extends ProcessManager {
  private getLabel(name: string): string {
    return `com.${this.servicePrefix}.${name}`;
  }

  private getPlistPath(name: string): string {
    return path.join(LAUNCH_AGENTS_PATH, `${this.getLabel(name)}.plist`);
  }

  private getLogPaths(name: string): { stdout: string; stderr: string } {
    return {
      stdout: path.join(LOG_PATH, `${name}.out.log`),
      stderr: path.join(LOG_PATH, `${name}.err.log`),
    };
  }

  private generatePlist(config: ServiceConfig): string {
    const label = this.getLabel(config.name);
    const logs = this.getLogPaths(config.name);

    const programArgs = config.args
      ? [config.command, ...config.args]
      : [config.command];

    const programArgsXml = programArgs
      .map((arg) => `        <string>${this.escapeXml(arg)}</string>`)
      .join("\n");

    const envXml = config.env
      ? `    <key>EnvironmentVariables</key>
    <dict>
${Object.entries(config.env)
  .map(
    ([k, v]) =>
      `        <key>${this.escapeXml(k)}</key>\n        <string>${this.escapeXml(v)}</string>`
  )
  .join("\n")}
    </dict>`
      : "";

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${label}</string>
    <key>ProgramArguments</key>
    <array>
${programArgsXml}
    </array>
    <key>WorkingDirectory</key>
    <string>${this.escapeXml(config.workingDirectory)}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <${config.restartOnFailure !== false}/>
    <key>StandardOutPath</key>
    <string>${logs.stdout}</string>
    <key>StandardErrorPath</key>
    <string>${logs.stderr}</string>
${envXml}
</dict>
</plist>`;
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  async install(config: ServiceConfig): Promise<void> {
    // Ensure directories exist
    await fs.mkdir(LAUNCH_AGENTS_PATH, { recursive: true });
    await fs.mkdir(LOG_PATH, { recursive: true });

    const plistContent = this.generatePlist(config);
    const plistPath = this.getPlistPath(config.name);

    // Unload first if already exists
    if (await this.isInstalled(config.name)) {
      await this.unload(config.name);
    }

    await fs.writeFile(plistPath, plistContent, "utf-8");
    await this.load(config.name);
  }

  async uninstall(name: string): Promise<void> {
    const plistPath = this.getPlistPath(name);

    try {
      await this.unload(name);
    } catch {
      // Might not be loaded
    }

    try {
      await fs.unlink(plistPath);
    } catch {
      // Might not exist
    }

    // Optionally clean up logs
    const logs = this.getLogPaths(name);
    await fs.unlink(logs.stdout).catch(() => {});
    await fs.unlink(logs.stderr).catch(() => {});
  }

  private async load(name: string): Promise<void> {
    const plistPath = this.getPlistPath(name);
    await execAsync(`launchctl load "${plistPath}"`);
  }

  private async unload(name: string): Promise<void> {
    const plistPath = this.getPlistPath(name);
    await execAsync(`launchctl unload "${plistPath}"`);
  }

  async start(name: string): Promise<void> {
    const label = this.getLabel(name);
    // kickstart -k kills existing and restarts, without -k it just starts
    await execAsync(`launchctl kickstart gui/$(id -u)/${label}`);
  }

  async stop(name: string): Promise<void> {
    const label = this.getLabel(name);
    await execAsync(`launchctl kill SIGTERM gui/$(id -u)/${label}`);
  }

  async restart(name: string): Promise<void> {
    const label = this.getLabel(name);
    // kickstart -k = kill and restart
    await execAsync(`launchctl kickstart -k gui/$(id -u)/${label}`);
  }

  async getStatus(name: string): Promise<ServiceStatus> {
    const label = this.getLabel(name);

    try {
      const { stdout } = await execAsync(`launchctl list | grep "${label}"`);
      // Output format: PID	Status	Label
      // e.g.: 1234	0	com.autodeploy.clip-worker
      // or:   -	0	com.autodeploy.clip-worker (not running)

      const parts = stdout.trim().split(/\s+/);
      const pid = parts[0] !== "-" ? parseInt(parts[0]) : null;

      return {
        name,
        isRunning: pid !== null,
        pid,
        uptime: null, // launchctl doesn't provide this directly
        memoryUsage: null,
      };
    } catch {
      return {
        name,
        isRunning: false,
        pid: null,
        uptime: null,
        memoryUsage: null,
      };
    }
  }

  async getLogs(
    name: string,
    options: LogOptions = {}
  ): Promise<string | void> {
    const logs = this.getLogPaths(name);
    const lines = options.lines ?? 100;

    if (options.follow) {
      // Tail both stdout and stderr
      const proc = spawn(
        "tail",
        ["-f", "-n", lines.toString(), logs.stdout, logs.stderr],
        {
          stdio: "inherit",
        }
      );

      process.on("SIGINT", () => proc.kill());
      return;
    }

    // Read last N lines from both files
    try {
      const { stdout: outLog } = await execAsync(
        `tail -n ${lines} "${logs.stdout}" 2>/dev/null || true`
      );
      const { stdout: errLog } = await execAsync(
        `tail -n ${lines} "${logs.stderr}" 2>/dev/null || true`
      );

      let result = "";
      if (outLog.trim()) result += `=== stdout ===\n${outLog}\n`;
      if (errLog.trim()) result += `=== stderr ===\n${errLog}\n`;

      return result || "(no logs)";
    } catch {
      return "(no logs)";
    }
  }

  async isInstalled(name: string): Promise<boolean> {
    try {
      await fs.access(this.getPlistPath(name));
      return true;
    } catch {
      return false;
    }
  }

  async listServices(): Promise<ServiceStatus[]> {
    try {
      const { stdout } = await execAsync(
        `launchctl list | grep "com.${this.servicePrefix}\\." || true`
      );

      if (!stdout.trim()) return [];

      const names = stdout
        .trim()
        .split("\n")
        .map((line) => {
          const parts = line.split(/\s+/);
          const label = parts[2]; // PID, Status, Label
          const prefix = `com.${this.servicePrefix}.`;
          return label?.startsWith(prefix) ? label.slice(prefix.length) : null;
        })
        .filter((name): name is string => name !== null);

      return Promise.all(names.map((name) => this.getStatus(name)));
    } catch {
      return [];
    }
  }
}
