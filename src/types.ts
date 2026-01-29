export interface NodeConfig {
  repo: string;
  tasks: string[];
}

export interface AutoDeployConfig {
  branch: string;
  startupTimeout: number;
  pollInterval: number; // in seconds
  restart: {
    maxBackoff: number;
    initialDelay: number;
  };
}

export interface TaskProcess {
  taskName: string;
  process: ReturnType<typeof import("node:child_process").spawn> | null;
  snapshotPath: string;
  restartCount: number;
  lastRestartTime: number;
}

export interface DeploymentState {
  currentSnapshot: string | null;
  previousSnapshot: string | null;
  processes: Map<string, TaskProcess>;
  isUpdating: boolean;
}
