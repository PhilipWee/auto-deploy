import { CliResult } from "../cli";
import { rootInitRepo } from "./executors/root-init-repo";

const executors: Record<string, (arg: any) => void> = {
  "root.init.node": () => {
    console.log("Executing: root.init.node");
  },
  "root.init.repo": rootInitRepo,
  "root.run": () => {
    console.log("Executing: root.run");
  },
};

export async function runCommand(command: CliResult) {
  const task = command.type.join(".");
  const executor = executors[task];
  if (!executor) {
    throw new Error("Missing executor");
  }

  return executor(command.args);
}
