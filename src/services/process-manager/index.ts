import { platform } from "os";
import { ProcessManager } from "./base";
import { LinuxProcessManager } from "./linux";
import { DarwinProcessManager } from "./darwin";

export * from "./base";
export { LinuxProcessManager } from "./linux";
export { DarwinProcessManager } from "./darwin";

/**
 * Factory function to get the appropriate ProcessManager for the current OS
 */
export function createProcessManager(servicePrefix?: string): ProcessManager {
  const os = platform();

  switch (os) {
    case "linux":
      return new LinuxProcessManager(servicePrefix);

    case "darwin":
      return new DarwinProcessManager(servicePrefix);

    case "win32":
      // TODO: Implement WindowsProcessManager using NSSM or native SCM
      throw new Error("Windows support not yet implemented");

    default:
      throw new Error(`Unsupported platform: ${os}`);
  }
}
