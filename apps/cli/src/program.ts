import { Command, CommanderError, InvalidArgumentError, Option } from "commander";
import { init, DEFAULT_FILE } from "./commands/init.ts";
import { loops } from "./commands/loops.ts";
import type { LoopKindFilter, LoopsFormat } from "./commands/loops.ts";
import { schema } from "./commands/schema.ts";
import { serve } from "./commands/serve.ts";
import { validate } from "./commands/validate.ts";
import type { OutputFormat } from "./commands/validate.ts";
import type { Context } from "./context.ts";
import { done, exitCodeOf, usageError } from "./outcome.ts";
import type { Outcome } from "./outcome.ts";
import { renderHeader } from "./header.ts";
import type { Prompts } from "./interactive.ts";

const cancelled: Outcome = { kind: "cancelled" };

export interface ProgramDependencies {
  context: Context;
  version: string;
  canPrompt: () => boolean;
  prompts: Prompts;
  openBrowser: (url: string) => Promise<unknown>;
  waitForExit: () => Promise<void>;
}

export async function runCli(argv: string[], dependencies: ProgramDependencies): Promise<number> {
  const { log } = dependencies.context;
  let outcome: Outcome = done;
  try {
    await createProgram(dependencies, (result) => {
      outcome = result;
    }).parseAsync(argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      // ヘルプやバージョンの表示も CommanderError として届く
      return error.exitCode === 0 ? 0 : 2;
    }
    log.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  if (outcome.kind === "cancelled") dependencies.prompts.cancelled();
  if (outcome.kind === "usage" || outcome.kind === "failure") log.error(outcome.message);
  return exitCodeOf(outcome);
}

export function createProgram(
  dependencies: ProgramDependencies,
  report: (outcome: Outcome) => void,
) {
  const { context, version, canPrompt, prompts } = dependencies;
  const { log } = context;
  let headerShown = false;
  const showHeader = () => {
    if (headerShown) return;
    headerShown = true;
    log.plain(renderHeader(version, log.color));
    log.plain("");
  };

  const chooseTarget = async (
    file: string | undefined,
    question: () => Promise<string | null | undefined>,
    messages: { missing: string; none: string },
  ): Promise<string | Outcome> => {
    if (file !== undefined) return file;
    if (!canPrompt()) return usageError(messages.missing);
    const chosen = await question();
    if (chosen === undefined) return cancelled;
    return chosen ?? usageError(messages.none);
  };

  const actions = {
    serve: async (file: string | undefined, options: ServeFlags) => {
      if (options.edit) {
        log.warn(
          options.readonly
            ? "--edit は不要になりました。--readonly を指定しているので読み取り専用で開きます"
            : "--edit は不要になりました。serve は常に編集できる状態で開きます",
        );
      }
      const target = await chooseTarget(
        file,
        () =>
          prompts.chooseFile(context.cwd, {
            message: "開くファイル",
            allowNew: true,
            // 一覧から選ばせないのは、サンプルを既にあるファイルには使えないため
            newOnly: options.sample,
          }),
        {
          missing: "開くファイルを指定してください（例: loopcraft serve diagram.json）",
          none: "開くファイルを指定してください",
        },
      );
      if (typeof target !== "string") return report(target);
      const started = await serve(
        target,
        {
          port: options.port,
          open: options.open,
          readonly: options.readonly,
          sample: options.sample,
        },
        context,
        { openBrowser: dependencies.openBrowser },
      );
      if (started.kind !== "serving") return report(started);
      await dependencies.waitForExit();
      await started.server.close();
      log.success("終了しました");
    },
    validate: async (files: string[], options: { format: OutputFormat }) => {
      let targets = files;
      if (targets.length === 0) {
        if (!canPrompt()) {
          return report(
            usageError("検証するファイルを指定してください（例: loopcraft validate diagram.json）"),
          );
        }
        const chosen = await prompts.chooseFiles(context.cwd);
        if (chosen === undefined) return report(cancelled);
        if (chosen.length === 0)
          return report(usageError("検証できる JSON ファイルが見つかりません"));
        targets = chosen;
      }
      report(await validate(targets, options, context));
    },
    loops: async (
      file: string | undefined,
      options: { format: LoopsFormat; kind?: LoopKindFilter },
    ) => {
      const target = await chooseTarget(
        file,
        () => prompts.chooseFile(context.cwd, { message: "図のファイル", allowNew: false }),
        {
          missing: "図のファイルを指定してください（例: loopcraft loops diagram.json）",
          none: "図の JSON ファイルが見つかりません",
        },
      );
      if (typeof target !== "string") return report(target);
      report(await loops(target, options, context));
    },
    init: async (
      file: string | undefined,
      options: { sample?: boolean; title?: string; force?: boolean },
    ) => {
      if (file !== undefined || !canPrompt()) {
        return report(await init(file ?? DEFAULT_FILE, options, context));
      }
      const answers = await prompts.askInit({ sample: options.sample });
      if (answers === undefined) return report(cancelled);
      report(await init(answers.file, { ...options, sample: answers.sample }, context));
    },
    schema: () => {
      schema(context);
    },
  };

  const program = new Command()
    .name("loopcraft")
    .description("システム思考の因果ループ図を描くエディタ")
    .version(version, "-v, --version", "バージョンを表示する")
    .helpOption("-h, --help", "ヘルプを表示する")
    .helpCommand(false)
    .showHelpAfterError()
    .exitOverride()
    .configureOutput({
      writeOut: (text) => log.output(text.trimEnd()),
      writeErr: (text) => log.plain(text.trimEnd()),
    })
    .hook("preAction", showHeader);

  program
    .command("serve")
    .description("ファイルをブラウザのエディタで開く。ファイルが無ければ最初の保存で作る")
    .argument("[file]", "図の JSON ファイル")
    .option(
      "-p, --port <number>",
      "待ち受けるポート（既定: 4747。使えなければ空いているポート）",
      parsePort,
    )
    .option("--readonly", "読み取り専用で開く")
    // 消さないのは、閲覧モードが既定だった頃に付けていた使い方を壊さないため
    .addOption(new Option("--edit").hideHelp())
    .option("--sample", "新しいファイルをサンプルの図で開く。保存するまでファイルは作らない")
    .option("--no-open", "ブラウザを開かない")
    .action(actions.serve);

  program
    .command("validate")
    .description("図の JSON のスキーマと整合性を検証する。問題があれば終了コード 1")
    .argument("[files...]", "図の JSON ファイル")
    .addOption(formatOption(["text", "json"]))
    .action(actions.validate);

  program
    .command("loops")
    .description("図に含まれるループを一覧表示する")
    .argument("[file]", "図の JSON ファイル")
    .addOption(formatOption(["text", "json", "md"]))
    .addOption(
      new Option("--kind <kind>", "種類で絞り込む（r: 自己強化, b: バランス）").choices(["r", "b"]),
    )
    .action(actions.loops);

  // 案内しないのは、serve が最初の保存でファイルを作るため。消さないのは、既存のスクリプトのため
  program
    .command("init", { hidden: true })
    .description("新しい図のファイルを作る")
    .argument("[file]", `作るファイル（既定: ${DEFAULT_FILE}）`)
    .option("--sample", "サンプルの図を入れる")
    .option("--title <title>", "図のタイトル")
    .option("-f, --force", "既にあるファイルを上書きする")
    .action(actions.init);

  program.command("schema").description("図の JSON Schema を出力する").action(actions.schema);

  program.addHelpText(
    "after",
    [
      "",
      "例:",
      "  loopcraft serve diagram.json            ブラウザで開いて編集する",
      "  loopcraft serve diagram.json --readonly 読み取り専用で開く",
      "  loopcraft serve new.json --sample       サンプルの図で試す",
      "  loopcraft validate *.json               まとめて検証する",
      "  loopcraft loops diagram.json --format md",
      "",
      "引数を付けずに実行すると、コマンドやファイルを選んで進められます。",
    ].join("\n"),
  );

  // 知らないコマンドを commander に任せないのは、エラーが英語になるため。
  // 設定はサブコマンドを作るときに引き継がれるので、すべて作った後でルートにだけ付ける
  program.allowExcessArguments();
  program.action(async () => {
    if (program.args.length > 0) {
      showHeader();
      return report(usageError(`不明なコマンドです: ${program.args[0]}`));
    }
    if (!canPrompt()) {
      program.outputHelp();
      return;
    }
    showHeader();
    const command = await prompts.chooseCommand();
    if (command === undefined) return report(cancelled);
    await program.parseAsync([command], { from: "user" });
  });

  return program;
}

interface ServeFlags {
  port?: number;
  edit?: boolean;
  readonly?: boolean;
  sample?: boolean;
  open: boolean;
}

function formatOption(formats: string[]) {
  return new Option("--format <format>", "出力の形式").choices(formats).default("text");
}

function parsePort(value: string) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new InvalidArgumentError("0〜65535 の整数を指定してください");
  }
  return port;
}
