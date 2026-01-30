import { intro } from "@clack/prompts";
import z from "zod";

interface CliCommandBase {
  label: string;
  command: string;
}

interface CliCommandBase {
  command: string;
  label: string;
}

type CliCommandBranch = CliCommandBase & {
  type: "branch";
  branches: CliCommand[];
  /**The question asked when this branch is ran */
  question: string;
};

type CliCommandLeaf = CliCommandBase & {
  type: "leaf";
  args: z.ZodType;
};

export type CliCommand = CliCommandLeaf | CliCommandBranch;

export const cliArgs: CliCommand = {
  type: "branch",
  command: "",
  question: "What command would you like to run?",
  label: "root",
  branches: [
    {
      type: "branch",
      command: "init",
      question: "What kind of initialization would you like to perform?",
      label: "init",
      branches: [
        {
          type: "leaf",
          command: "node",
          label: "Local Node Init",
          args: z.void(),
        },
        {
          type: "leaf",
          command: "repo",
          label: "Repo Config Init",
          args: z.void(),
        },
      ],
    },
    {
      type: "leaf",
      command: "run",
      label: "Run Local Node",
      args: z.void(),
    },
  ],
};

function promptForContext(
  curCommand: CliCommand,
  curContext: { type: string; args: any }
) {}

export function runCli() {
  intro("self-deploy");
}
