import { exec } from "child_process";
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

const SYSTEMD_PATH = "/etc/systemd/system";

export class LinuxProcessManager extends ProcessManager {
  private getUnitPath(name: string): string {
    return path.join(SYSTEMD_PATH, `${this.getServiceName(name)}.service`);
  }

  private generateUnitFile(config: ServiceConfig): string {
    const envLines = config.env
      ? Object.entries(config.env)
          .map(([k, v]) => `Environment=${k}=${v}`)
          .join("\n")
      : "";

    const execStart = config.args
      ? `${config.command} ${config.args.join(" ")}`
      : config.command;

    return `[Unit]
Description=${this.servicePrefix} - ${config.name}
After=network.target

[Service]
Type=simple
User=${config.user ?? "root"}
WorkingDirectory=${config.workingDirectory}
ExecStart=${execStart}
Restart=${config.restartOnFailure !== false ? "always" : "no"}
RestartSec=${config.restartDelaySec ?? 5}
${envLines}

# Hardening
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
`.trim();
  }

  async install(config: ServiceConfig): Promise<void> {
    const unitContent = this.generateUnitFile(config);
    const unitPath = this.getUnitPath(config.name);

    await fs.writeFile(unitPath, unitContent, "utf-8");
    await execAsync("systemctl daemon-reload");
    await execAsync(`systemctl enable ${this.getServiceName(config.name)}`);
  }

  async uninstall(name: string): Promise<void> {
    const serviceName = this.getServiceName(name);
    const unitPath = this.getUnitPath(name);

    try {
      await execAsync(`systemctl stop ${serviceName}`);
      await execAsync(`systemctl disable ${serviceName}`);
    } catch {
      // Service might not be running
    }

    try {
      await fs.unlink(unitPath);
    } catch {
      // File might not exist
    }

    await execAsync("systemctl daemon-reload");
  }

  async start(name: string): Promise<void> {
    await execAsync(`systemctl start ${this.getServiceName(name)}`);
  }

  async stop(name: string): Promise<void> {
    await execAsync(`systemctl stop ${this.getServiceName(name)}`);
  }

  async restart(name: string): Promise<void> {
    await execAsync(`systemctl restart ${this.getServiceName(name)}`);
  }

  async getStatus(name: string): Promise<ServiceStatus> {
    const serviceName = this.getServiceName(name);

    try {
      const { stdout } = await execAsync(
        `systemctl show ${serviceName} --property=ActiveState,MainPID,MemoryCurrent,ActiveEnterTimestamp`
      );

      const props = Object.fromEntries(
        stdout
          .trim()
          .split("\n")
          .map((line) => {
            const [key, ...rest] = line.split("=");
            return [key, rest.join("=")];
          })
      );

      const pid = props.MainPID !== "0" ? parseInt(props.MainPID) : null;

      return {
        name,
        isRunning: props.ActiveState === "active",
        pid,
        uptime: props.ActiveEnterTimestamp || null,
        memoryUsage:
          props.MemoryCurrent !== "[not set]" ? props.MemoryCurrent : null,
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
    const serviceName = this.getServiceName(name);
    const args = ["-u", serviceName, "--no-pager"];

    if (options.lines) args.push("-n", options.lines.toString());
    if (options.since) args.push("--since", options.since);

    if (options.follow) {
      const { spawn } = await import("child_process");
      const proc = spawn("journalctl", [...args, "-f"], { stdio: "inherit" });

      process.on("SIGINT", () => proc.kill());
      return;
    }

    const { stdout } = await execAsync(`journalctl ${args.join(" ")}`);
    return stdout;
  }

  async isInstalled(name: string): Promise<boolean> {
    try {
      await fs.access(this.getUnitPath(name));
      return true;
    } catch {
      return false;
    }
  }

  async listServices(): Promise<ServiceStatus[]> {
    try {
      const { stdout } = await execAsync(
        `systemctl list-units --type=service --all --no-pager --plain | grep "^${this.servicePrefix}-"`
      );

      const serviceNames = stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const match = line.match(
            new RegExp(`^${this.servicePrefix}-([^\\s.]+)`)
          );
          return match?.[1];
        })
        .filter((name): name is string => name !== undefined);

      return Promise.all(serviceNames.map((name) => this.getStatus(name)));
    } catch {
      return [];
    }
  }
}
