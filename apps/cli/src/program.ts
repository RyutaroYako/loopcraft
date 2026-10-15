import { Command, CommanderError, InvalidArgumentError, Option } from "commander";
import { init, DEFAULT_FILE } from "./commands/init.ts";
import { loops, type LoopKindFilter, type LoopsFormat } from "./commands/loops.ts";
import { schema } from "./commands/schema.ts";
import { serve } from "./commands/serve.ts";
import { validate, type OutputFormat } from "./commands/validate.ts";
import type { Context } from "./context.ts";
import { exitCodeOf, UsageError } from "./errors.ts";
import { renderHeader } from "./header.ts";
import type { CommandName, Prompts } from "./interactive.ts";

export interface ProgramDependencies {
  context: Context;
  version: string;
  canPrompt: () => boolean;
  prompts: Prompts;
  openBrowser: (url: string) => Promise<unknown>;
  waitForExit: () => Promise<void>;
}

class Cancelled extends Error {}

export async function runCli(argv: string[], dependencies: ProgramDependencies): Promise<number> {
  const { log } = dependencies.context;
  try {
    await createProgram(dependencies).parseAsync(argv);
    return 0;
  } catch (error) {
    if (error instanceof Cancelled) {
      dependencies.prompts.cancelled();
      return 0;
    }
    if (error instanceof CommanderError) {
      // ヘルプやバージョンの表示も CommanderError として届く
      return error.exitCode === 0 ? 0 : 2;
    }
    log.error(error instanceof Error ? error.message : String(error));
    return exitCodeOf(error);
  }
}

export function createProgram(dependencies: ProgramDependencies) {
  const { context, version, canPrompt, prompts } = dependencies;
  const { log } = context;
  let headerShown = false;
  const showHeader = () => {
    if (headerShown) return;
    headerShown = true;
    log.plain(renderHeader(version, log.color));
    log.plain("");
  };

  const ask = async <T>(question: Promise<T | undefined>): Promise<T> => {
    const answer = await question;
    if (answer === undefined) throw new Cancelled();
    return answer;
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
      const target =
        file ??
        (canPrompt()
          ? ((await ask(
              prompts.chooseFile(context.cwd, {
                message: "開くファイル",
                allowNew: true,
                // 一覧から選ばせないのは、サンプルを既にあるファイルには使えないため
                newOnly: options.sample,
              }),
            )) ?? missing("開くファイルを指定してください"))
          : missing("開くファイルを指定してください（例: loopcraft serve diagram.json）"));
      const server = await serve(
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
      await dependencies.waitForExit();
      await server.close();
      log.success("終了しました");
    },
    validate: async (files: string[], options: { format: OutputFormat }) => {
      const targets =
        files.length > 0
          ? files
          : canPrompt()
            ? await ask(prompts.chooseFiles(context.cwd))
            : missing("検証するファイルを指定してください（例: loopcraft validate diagram.json）");
      if (targets.length === 0) throw new UsageError("検証できる JSON ファイルが見つかりません");
      await validate(targets, options, context);
    },
    loops: async (
      file: string | undefined,
      options: { format: LoopsFormat; kind?: LoopKindFilter },
    ) => {
      const target =
        file ??
        (canPrompt()
          ? ((await ask(
              prompts.chooseFile(context.cwd, { message: "図のファイル", allowNew: false }),
            )) ?? missing("図の JSON ファイルが見つかりません"))
          : missing("図のファイルを指定してください（例: loopcraft loops diagram.json）"));
      await loops(target, options, context);
    },
    init: async (
      file: string | undefined,
      options: { sample?: boolean; title?: string; force?: boolean },
    ) => {
      if (file !== undefined || !canPrompt()) {
        await init(file ?? DEFAULT_FILE, options, context);
        return;
      }
      const answers = await ask(prompts.askInit({ sample: options.sample }));
      await init(answers.file, { ...options, sample: answers.sample }, context);
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
    .description("図の JSON をスキーマと整合性で検証する。問題があれば終了コード 1")
    .argument("[files...]", "図の JSON ファイル")
    .addOption(formatOption(["text", "json"]))
    .action(actions.validate);

  program
    .command("loops")
    .description("図に含まれるループを一覧する")
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
      throw new UsageError(`知らないコマンドです: ${program.args[0]}`);
    }
    if (!canPrompt()) {
      program.outputHelp();
      return;
    }
    showHeader();
    const command: CommandName = await ask(prompts.chooseCommand());
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

function missing(message: string): never {
  throw new UsageError(message);
}
