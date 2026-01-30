import { intro, select, isCancel, outro, text } from "@clack/prompts";
import z from "zod";
import { parseZodType } from "./helpers/zod-parser";

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
          args: z.object({
            repoUrl: z.string().meta({
              question: "Enter the git repository URL:",
              placeholder: "https://github.com/user/repo.git",
            }),
          }),
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

async function handleBranch(
  curCommand: CliCommandBranch,
  curContext: CliResult
): Promise<CliResult | undefined> {
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

  return promptForContextHelper(chosenBranch, {
    type: newType,
    args: undefined,
  });
}

interface TextMeta {
  question?: string;
  placeholder?: string;
}

async function handleText(
  key: string,
  zodType: z.ZodType
): Promise<string | undefined> {
  const meta = (zodType.meta() ?? {}) as TextMeta;

  const value = await text({
    message: meta.question ?? `Enter value for ${key}:`,
    placeholder: meta.placeholder ?? key,
  });

  if (isCancel(value)) {
    return undefined;
  }

  return value;
}

function handleVoid(
  curCommand: CliCommandLeaf,
  curContext: CliResult
): CliResult {
  return {
    type: [...curContext.type, curCommand.command],
    args: undefined,
  };
}

async function handleObj(
  curCommand: CliCommandLeaf,
  curContext: CliResult,
  zodObj: z.ZodObject<any>
): Promise<CliResult | undefined> {
  const shape = zodObj.def.shape as Record<string, z.ZodType>;
  const args: Record<string, string> = {};

  for (const [key, fieldZodType] of Object.entries(shape)) {
    const parsedFieldType = parseZodType(fieldZodType);

    if (parsedFieldType.type !== "string") {
      throw new Error(
        `Internal Error: Unsupported field type '${parsedFieldType.type}' for key '${key}'. Only 'string' is supported.`
      );
    }

    const value = await handleText(key, fieldZodType);

    if (value === undefined) {
      return undefined;
    }

    args[key] = value;
  }

  return {
    type: [...curContext.type, curCommand.command],
    args,
  };
}

async function handleLeaf(
  curCommand: CliCommandLeaf,
  curContext: CliResult
): Promise<CliResult | undefined> {
  const parsedType = parseZodType(curCommand.args);

  if (parsedType.type === "void") {
    return handleVoid(curCommand, curContext);
  } else if (parsedType.type === "object") {
    return handleObj(
      curCommand,
      curContext,
      curCommand.args as z.ZodObject<any>
    );
  } else {
    throw new Error(
      `Internal Error: Unsupported leaf schema type '${parsedType.type}'`
    );
  }
}

async function promptForContextHelper(
  curCommand: CliCommand,
  curContext: CliResult = {
    type: [],
    args: undefined,
  }
): Promise<CliResult | undefined> {
  if (curCommand.type === "leaf") {
    return handleLeaf(curCommand, curContext);
  } else if (curCommand.type === "branch") {
    return handleBranch(curCommand, curContext);
  }
}

// The main export for this module remains promptForContext:
const promptForContext = promptForContextHelper;

export async function runCli(): Promise<CliResult | undefined> {
  intro("self-deploy");

  const res = await promptForContext(cliArgs);

  if (!res) {
    outro("Operation cancelled");
  }

  return res;
}
