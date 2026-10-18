import { closest } from "@loopcraft/core/suggest";
import type { Command, CommanderError } from "commander";
import { usageError } from "./outcome.ts";
import type { Failure } from "./outcome.ts";

/**
 * 書き違いを受け付けてしまわずに案内するのは、書き方が 2 通りあると、例や説明がどちらかに揃わなくなるため
 */
const OPTION_FIXES: Record<string, string> = {
  "--json": "--format json",
  "-j": "--format json",
  "--md": "--format md",
  "--markdown": "--format md",
  "--text": "--format text",
  "--out": "-o",
  "--dry": "--dry-run",
};

const COMMAND_FIXES: Record<string, string> = {
  open: "serve",
  start: "serve",
  dev: "serve",
  view: "serve",
  new: "edit",
  create: "edit",
  add: "edit",
  apply: "edit",
  lint: "check",
  verify: "check",
  test: "check",
  image: "render",
  export: "render",
  png: "render",
  svg: "render",
  draw: "render",
  arrange: "layout",
  tidy: "layout",
  list: "loops",
  compare: "diff",
};

export function explainUnknownCommand(program: Command, args: readonly string[]): Failure {
  const [name = "", ...rest] = args;
  const names = program.commands
    .filter((command) => !hidden(command))
    .map((command) => command.name());
  const fix = COMMAND_FIXES[name] ?? closest(name, names);
  return usageError(`不明なコマンドです: ${name}`, {
    code: "UNKNOWN_COMMAND",
    suggestions: fix
      ? [commandLine([fix, ...rest])]
      : [`使えるコマンドは ${names.join(", ")} です（loopcraft --help）`],
  });
}

/** commander の文をそのまま出さないのは、英語で、次に何を打てばよいかも示さないため */
export function explainCommanderError(
  error: CommanderError,
  program: Command,
  args: readonly string[],
): Failure {
  const at = commandIndex(program, args);
  const command =
    at === undefined ? undefined : program.commands.find((item) => item.name() === args[at]);
  const help = `loopcraft ${command ? `${command.name()} ` : ""}--help`;
  const text = error.message.replace(/^error: /, "");
  const quoted = [...text.matchAll(/'([^']*)'/g)].map((match) => match[1]!);

  switch (error.code) {
    case "commander.unknownOption": {
      // オプションの誤りとして返さないのは、--format json を付けて打ち違えると、コマンド名の案内が出なくなるため
      if (!command && at !== undefined) {
        return explainUnknownCommand(program, [
          args[at]!,
          ...args.filter((_, index) => index !== at),
        ]);
      }
      const option = quoted[0] ?? "";
      const flags = (command ?? program).options
        .flatMap((item) => [item.long, item.short])
        .filter((flag) => flag !== undefined);
      const position = args.indexOf(option);
      if (command && at !== undefined && position < at && flags.includes(option)) {
        const width = takesValue(program, option) ? 2 : 1;
        const moved = args.slice(position, position + width);
        const rest = args.filter((_, index) => index < position || index >= position + width);
        return usageError(`${option} は ${command.name()} の後に書きます`, {
          suggestions: [commandLine([...rest, ...moved])],
        });
      }
      const fix = OPTION_FIXES[option];
      const near = fix && flags.includes(fix.split(" ")[0]!) ? fix : closest(option, flags);
      return usageError(`知らないオプション ${option} です`, {
        suggestions: near
          ? [commandLine(replaceOption(args, option, near))]
          : [`使えるオプションは ${help} で確かめられます`],
      });
    }
    case "commander.invalidArgument": {
      const [flag = "", value = ""] = quoted;
      const choices = /Allowed choices are (.*)\.$/.exec(text)?.[1];
      if (choices) {
        return usageError(
          `${flagName(flag)} に "${value}" は使えません。使えるのは ${choices} です`,
        );
      }
      const reason = text.slice(text.lastIndexOf("is invalid.") + "is invalid.".length).trim();
      return usageError(`${flagName(flag)} の値 "${value}" は使えません。${reason}`);
    }
    case "commander.optionMissingArgument":
      return usageError(`${flagName(quoted[0] ?? "")} に値を付けてください`, {
        suggestions: [help],
      });
    case "commander.missingArgument":
      return usageError(`引数 ${quoted[0] ?? ""} がありません`, { suggestions: [help] });
    case "commander.excessArguments":
      return usageError("引数が多すぎます", { suggestions: [help] });
    default:
      return usageError(text, { suggestions: [help] });
  }
}

/** 値を取るオプションの次の引数を飛ばすのは、--format json の json をコマンド名と取り違えないため */
function commandIndex(program: Command, args: readonly string[]) {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (!arg.startsWith("-")) return index;
    if (!arg.includes("=") && takesValue(program, arg)) index++;
  }
  return undefined;
}

function takesValue(program: Command, flag: string) {
  return program.commands.some((command) =>
    command.options.some(
      (option) =>
        (option.long === flag || option.short === flag) && (option.required || option.optional),
    ),
  );
}

function replaceOption(args: readonly string[], option: string, fix: string) {
  const [flag] = fix.split(" ");
  const replacement = args.includes(flag!) ? [] : fix.split(" ");
  return args.flatMap((arg) => (arg === option ? replacement : [arg]));
}

function flagName(flags: string) {
  return /--[\w-]+/.exec(flags)?.[0] ?? flags;
}

function commandLine(args: readonly string[]) {
  return ["loopcraft", ...args.map((arg) => (/^[\w./:=,-]+$/.test(arg) ? arg : `'${arg}'`))].join(
    " ",
  );
}

function hidden(command: Command) {
  return (command as unknown as { _hidden?: boolean })._hidden === true;
}
