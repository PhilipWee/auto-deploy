import { intro, select, isCancel, outro } from "@clack/prompts";
import z from "zod";

export interface CliResult {
  type: string[];
  args: any;
}
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
  command: "root",
  question: "What command would you like to run?",
  label: "root",
  branches: [
    {
      type: "branch",
      command: "init",
      question: "What kind of initialization would you like to perform?",
      label: "Init Node / Repo",
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

async function promptForContext(
  curCommand: CliCommand,
  curContext: CliResult = {
    type: [],
    args: undefined,
  }
): Promise<CliResult | undefined> {
  if (curCommand.type === "leaf") {
    // On a leaf, append final command to the type array and return
    return {
      type: [...curContext.type, curCommand.command],
      args: undefined,
    };
  } else if (curCommand.type === "branch") {
    // Use select to show the branches
    const options = curCommand.branches.map((branch) => ({
      value: branch.command,
      label: branch.label,
    }));

    const choice = await select({
      message: curCommand.question,
      options,
    });

    if (isCancel(choice)) {
      return undefined;
    }

    const chosenBranch = curCommand.branches.find(
      (branch) => branch.command === choice
    );

    if (!chosenBranch) {
      throw new Error("Invalid selection");
    }

    const newType = [...curContext.type, curCommand.command];

    return promptForContext(chosenBranch, { type: newType, args: undefined });
  }
}

export async function runCli(): Promise<CliResult | undefined> {
  intro("self-deploy");

  const res = await promptForContext(cliArgs);

  if (!res) {
    outro('Operation cancelled')
  }

  return res;
}
