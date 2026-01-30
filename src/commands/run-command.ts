import { CliResult } from "../cli";
import { rootInitNode } from "./executors/root-init-node";
import { rootInitRepo } from "./executors/root-init-repo";
import { rootRun } from "./executors/root-run";

const executors: Record<string, (arg: any) => void> = {
  "root.init.node": rootInitNode,
  "root.init.repo": rootInitRepo,
  "root.run": rootRun,
};

export async function runCommand(command: CliResult) {
  const task = command.type.join(".");
  const executor = executors[task];
  if (!executor) {
    throw new Error("Missing executor");
  }

  return executor(command.args);
}
