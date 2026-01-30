import { intro } from "@clack/prompts";
import z from "zod";

type CliCommandBranch = {
  type: "branch";
  command: string;
  branches: CliCommand;
  /**The question asked when this branch is ran */
  question: string;
  /**The label of this branch in the multiselect */
  label: string;
};

type CliCommandLeaf = {
  type: "leaf";
  command: string;
  args: z.ZodType;
};

export type CliCommand = CliCommandLeaf | CliCommandBranch

export const cliArgs: CliCommand[] = [
  {
    command: "init",
    subCommands: [
      {
        command: "node",
        args: z.void(),
      },
      {
        command: "repo",
        args: z.void(),
      },
    ],
  },
  {
    command: "run",
    args: z.void(),
  },
];

function promptForContext(possibleCommands: CliCommand) {}

export function runCli() {
  intro("self-deploy");
}
