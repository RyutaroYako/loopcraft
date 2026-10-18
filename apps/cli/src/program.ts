import { Command, CommanderError, InvalidArgumentError, Option } from "commander";
import { explainCommanderError, explainUnknownCommand } from "./argv-errors.ts";
import { agentInit } from "./commands/agent-init.ts";
import { check } from "./commands/check.ts";
import type { CheckOptions } from "./commands/check.ts";
import { diff } from "./commands/diff.ts";
import type { DiffDependencies } from "./commands/diff.ts";
import { edit } from "./commands/edit.ts";
import { init, DEFAULT_FILE } from "./commands/init.ts";
import { layout } from "./commands/layout.ts";
import { render } from "./commands/render.ts";
import type { RenderDependencies } from "./commands/render.ts";
import { loops } from "./commands/loops.ts";
import type { LoopKindFilter, LoopsFormat } from "./commands/loops.ts";
import { schema } from "./commands/schema.ts";
import { serve } from "./commands/serve.ts";
import { validate } from "./commands/validate.ts";
import type { OutputFormat } from "./commands/validate.ts";
import type { Context } from "./context.ts";
import { done, exitCodeOf, failure, usageError } from "./outcome.ts";
import type { Failure, Outcome } from "./outcome.ts";
import { printFailure, wantsJson } from "./output.ts";
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
  /** パイプで渡された標準入力を読む。端末から入力しているなら undefined */
  readStdin: () => Promise<string> | undefined;
  svgToPng?: RenderDependencies["svgToPng"];
  showFile?: DiffDependencies["showFile"];
}

export async function runCli(argv: string[], dependencies: ProgramDependencies): Promise<number> {
  const { log } = dependencies.context;
  let outcome: Outcome = done;
  const program = createProgram(dependencies, (result) => {
    outcome = result;
  });
  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      // ヘルプやバージョンの表示も CommanderError として届く
      if (error.exitCode === 0) return 0;
      outcome = explainCommanderError(error, program, argv.slice(2));
    } else {
      outcome = failure(error instanceof Error ? error.message : String(error), {
        code: "UNEXPECTED_ERROR",
      });
    }
  }
  if (outcome.kind === "cancelled") dependencies.prompts.cancelled();
  if (outcome.kind === "usage" || outcome.kind === "failure") {
    reportFailure(log, outcome, wantsJson(argv));
  }
  return exitCodeOf(outcome);
}

function reportFailure(log: Context["log"], outcome: Failure, json: boolean) {
  if (json) {
    printFailure(log, outcome);
    return;
  }
  log.error(outcome.message);
  for (const suggestion of outcome.suggestions ?? []) log.note(`  → ${suggestion}`);
}

export function createProgram(
  dependencies: ProgramDependencies,
  report: (outcome: Outcome) => void,
) {
  const { context, version, canPrompt, prompts } = dependencies;
  const { log } = context;
  let headerShown = false;
  // 端末で人が使うときだけ出すのは、エージェントやスクリプトが 2>&1 で読むと結果に混ざるため
  const showHeader = () => {
    if (headerShown || !canPrompt()) return;
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
    check: async (file: string, options: CheckOptions) => {
      report(await check(file, options, context));
    },
    layout: async (
      file: string,
      options: { format: "text" | "json"; all?: boolean; pin?: string[] },
    ) => {
      report(await layout(file, options, context));
    },
    render: async (
      file: string,
      options: { format: "text" | "json"; output?: string; theme: "light" | "dark"; scale: number },
    ) => {
      report(await render(file, options, context, { svgToPng: dependencies.svgToPng }));
    },
    edit: async (
      file: string,
      source: string | undefined,
      options: { format: "text" | "json"; dryRun?: boolean },
    ) => {
      report(await edit(file, source, options, context, { readStdin: dependencies.readStdin }));
    },
    diff: async (files: string[], options: { format: "text" | "json"; base: string }) => {
      report(await diff(files, options, context, { showFile: dependencies.showFile }));
    },
    agentInit: async (options: { format: "text" | "json"; file?: string }) => {
      report(await agentInit(options, context));
    },
  };

  const program = new Command()
    .name("loopcraft")
    .description("システム思考の因果ループ図を描くエディタ")
    .version(version, "-v, --version", "バージョンを表示する")
    .helpOption("-h, --help", "ヘルプを表示する")
    .helpCommand(false)
    .exitOverride()
    .configureOutput({
      writeOut: (text) => log.output(text.trimEnd()),
      writeErr: (text) => log.plain(text.trimEnd()),
      outputError: () => {},
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
    .action(actions.validate)
    .addHelpText(
      "after",
      outputHelp(
        ["loopcraft validate diagram.json --format json"],
        `{"ok":false,"error":{"code":"INVALID_DIAGRAM","message":"…","suggestions":[…]},"data":{"files":[{"file":"diagram.json","valid":false,"errors":[{"path":"links.0.to","message":"変数 \\"sale\\" は存在しません","hint":"\\"sales\\" のことですか"}],"unplaced":[]}]}}`,
        ["配置の崩れやループも見るときは check を使う"],
      ),
    );

  program
    .command("loops")
    .description("図に含まれるループを一覧表示する")
    .argument("[file]", "図の JSON ファイル")
    .addOption(formatOption(["text", "json", "md"]))
    .addOption(
      new Option("--kind <kind>", "種類で絞り込む（r: 自己強化, b: バランス）").choices(["r", "b"]),
    )
    .action(actions.loops)
    .addHelpText(
      "after",
      outputHelp(
        ["loopcraft loops diagram.json --format json"],
        `{"ok":true,"data":{"file":"diagram.json","loops":[{"badge":"R1","kind":"R","featured":true,"id":"growth","name":"成長","variables":["sales","staff"],"route":["売上","社員数"],"links":["l1","l2"]}],"truncated":false}}`,
        ["注目しているループ（loops に書いたもの）を先に、ほかの見つかったループを後に並べる"],
      ),
    );

  program
    .command("check")
    .description(
      "図を検証し、ループの数と配置の崩れを調べる。崩れや期待との違いがあれば終了コード 1",
    )
    .argument("<file>", "図の JSON ファイル")
    .addOption(formatOption(["text", "json"]))
    .option(
      "--expect <json>",
      `期待する構造。違えば 1 行ずつ挙げる（例: '{"loops":{"R":2,"B":1},"has":[{"kind":"B","through":["客数","待ち時間","満足度"]}]}'）`,
    )
    .option("--compact", "直すべきものだけを出す")
    .action(actions.check)
    .addHelpText(
      "after",
      outputHelp(
        [
          "loopcraft check diagram.json",
          `loopcraft check diagram.json --format json --expect '{"variables":6,"loops":{"R":2,"B":1}}'`,
        ],
        `{"ok":true,"data":{"file":"diagram.json","valid":true,"variables":6,"links":7,"loops":{"R":2,"B":1,"truncated":false,"list":[{"badge":"R1","kind":"R","featured":true,"id":"growth","name":"成長","variables":["sales","staff"],"route":["売上","社員数"],"links":["l1","l2"]}]},"unplaced":[],"layout":{"errors":0,"warnings":1,"issues":[{"kind":"crossing","severity":"warning","message":"…"}]},"expect":{"passed":true,"failures":[]}}}`,
        [
          "配置の崩れは、重なりと矢印の突き抜けが error、交差などは warning。error があれば失敗にする",
          "大きさは画面のフォントでなく文字数から見積もる",
        ],
      ),
    );

  program
    .command("edit")
    .description(
      "操作を並べて図を作る・変える。ファイルが無ければ作る。1 つでも失敗したら何も書き込まない",
    )
    .argument("<file>", "図の JSON ファイル")
    .argument("[operations]", "操作を 1 行に 1 つの JSON で書いたファイル。- か省略で標準入力", "-")
    .addOption(formatOption(["text", "json"]))
    .option("--dry-run", "書き込まずに、反映できるかだけを確かめる")
    .action(actions.edit)
    .addHelpText(
      "after",
      [
        "",
        "操作（from・to・through・id には、変数の ID かラベルを書ける）:",
        '  {"op":"add-variable","id":"sales","label":"売上"}          position を省くと自動で置く',
        '  {"op":"update-variable","id":"sales","label":"月の売上","position":{"x":0,"y":0}}',
        '  {"op":"remove-variable","id":"sales"}                       つながる関連とループも消す',
        '  {"op":"add-link","from":"sales","to":"staff","polarity":"+","delay":true}',
        '  {"op":"update-link","from":"sales","to":"staff","polarity":"-"}   id で指してもよい',
        '  {"op":"remove-link","from":"sales","to":"staff"}',
        '  {"op":"add-loop","through":["sales","staff"],"name":"成長"}   辿る順に変数を並べる',
        '  {"op":"update-loop","id":"成長","name":"成長エンジン"}',
        '  {"op":"remove-loop","id":"成長"}',
        '  {"op":"set-title","title":"組織の成長"}',
        '  {"op":"set-description","description":"…"}',
        outputHelp(
          [
            `loopcraft edit diagram.json - <<'EOF'\n{"op":"add-variable","id":"sales","label":"売上"}\n{"op":"add-variable","id":"staff","label":"社員数"}\n{"op":"add-link","from":"sales","to":"staff","polarity":"+"}\n{"op":"add-link","from":"staff","to":"sales","polarity":"+"}\n{"op":"add-loop","through":["sales","staff"],"name":"成長"}\nEOF`,
          ],
          `{"ok":true,"data":{"file":"diagram.json","written":true,"created":true,"applied":5,"ids":["sales","staff","sales_staff","staff_sales","loop1"],"variables":2,"links":2,"loops":{"R":1,"B":0},"layout":{"errors":0,"warnings":0,"issues":[]}}}`,
          ["heredoc の EOF は引用符で囲む（'EOF'）。囲まないと、シェルが $ や ` を展開する"],
        ),
      ].join("\n"),
    );

  program
    .command("layout")
    .description("座標の無い変数を配置して書き込む。--all で全体を並べ直す")
    .argument("<file>", "図の JSON ファイル")
    .option("--all", "座標のある変数も含めて並べ直す")
    .option(
      "--pin <variables>",
      "--all でも動かさない変数（ID かラベルをカンマ区切りで）",
      parseList,
    )
    .addOption(formatOption(["text", "json"]))
    .action(actions.layout)
    .addHelpText(
      "after",
      outputHelp(
        ["loopcraft layout diagram.json", "loopcraft layout diagram.json --all --pin sales,staff"],
        `{"ok":true,"data":{"file":"diagram.json","written":true,"moved":["sales","staff"],"layout":{"errors":0,"warnings":0,"issues":[]}}}`,
        [
          "決まった手順で並べるので、同じ図からは毎回同じ配置になる",
          "細かく直すときは、edit の update-variable で position を書き換える",
        ],
      ),
    );

  program
    .command("render")
    .description("図を SVG か PNG の画像にする。-o を省くと SVG を標準出力に出す")
    .argument("<file>", "図の JSON ファイル")
    .option("-o, --output <file>", "書き出すファイル（.svg か .png）")
    .addOption(new Option("--theme <theme>", "配色").choices(["light", "dark"]).default("light"))
    .option("--scale <number>", "PNG の倍率", parseScale, 2)
    .addOption(formatOption(["text", "json"]))
    .action(actions.render)
    .addHelpText(
      "after",
      outputHelp(
        ["loopcraft render diagram.json -o diagram.png"],
        `{"ok":true,"data":{"file":"diagram.png","format":"png","width":1600,"height":900}}`,
        ["文字は手元のフォントで描くので、エディタの画面と字形が違うことがある"],
      ),
    );

  program
    .command("diff")
    .description(
      "変数・関連・ループの違いを挙げる。ファイルを 1 つ渡すと git の版（既定: HEAD）と比べる",
    )
    .argument("<files...>", "図の JSON ファイル（1 つか 2 つ）")
    .option("--base <revision>", "比べる git の版", "HEAD")
    .addOption(formatOption(["text", "json"]))
    .action(actions.diff)
    .addHelpText(
      "after",
      outputHelp(
        ["loopcraft diff diagram.json", "loopcraft diff before.json after.json"],
        `{"ok":true,"data":{"base":"HEAD","file":"diagram.json","changed":true,"variables":{"added":[{"id":"cs","label":"顧客満足度"}],"removed":[],"renamed":[],"moved":0},"links":{"added":[…],"removed":[],"changed":[]},"loops":{"added":[{"kind":"B","route":["業務量","顧客満足度","売上"]}],"removed":[],"flipped":[]},"featured":{"added":["サービス品質"],"removed":[]}}}`,
        ["位置だけの変更は数だけを出す"],
      ),
    );

  program
    .command("agent-init")
    .description("AGENTS.md（無ければ CLAUDE.md）に、エージェントへの loopcraft の使い方を書く")
    .option("--file <file>", "書き込むファイル")
    .addOption(formatOption(["text", "json"]))
    .action(actions.agentInit)
    .addHelpText(
      "after",
      outputHelp(
        ["loopcraft agent-init"],
        `{"ok":true,"data":{"file":"AGENTS.md","action":"created"}}`,
        ["もう一度実行すると、<!-- loopcraft:start --> から end までを書き換える"],
      ),
    );

  // 案内しないのは、edit がファイルを作るため。消さないのは、既存のスクリプトのため
  program
    .command("init", { hidden: true })
    .description("新しい図のファイルを作る")
    .argument("[file]", `作るファイル（既定: ${DEFAULT_FILE}）`)
    .option("--sample", "サンプルの図を入れる")
    .option("--title <title>", "図のタイトル")
    .option("-f, --force", "既にあるファイルを上書きする")
    .action(actions.init);

  program.command("schema").description("図の JSON Schema を出力する").action(actions.schema);

  program.addHelpText("before", AGENT_HELP);
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
      return report(explainUnknownCommand(program, program.args));
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

/**
 * 各コマンドの --help に分けて書かないのは、エージェントはまず --help を読み、そこにある例を写して進めるため。
 * 説明でなく写せる例にするのは、書き方を探す往復が減るため
 */
const AGENT_HELP = [
  "エージェント向けの早見表（各コマンドの --help を先に読まなくてよい）:",
  "",
  "  作る・変える  操作を JSONL で渡す。ファイルが無ければ作り、position は自動で置く",
  "    loopcraft edit diagram.json - <<'EOF'",
  '    {"op":"add-variable","id":"sales","label":"売上"}',
  '    {"op":"add-variable","id":"staff","label":"社員数"}',
  '    {"op":"add-link","from":"sales","to":"staff","polarity":"+","delay":true}',
  '    {"op":"add-link","from":"staff","to":"sales","polarity":"+"}',
  '    {"op":"add-loop","through":["sales","staff"],"name":"成長"}',
  "    EOF",
  "  確かめる      構造・ループの数・配置の崩れを 1 回で調べる",
  `    loopcraft check diagram.json --format json --expect '{"loops":{"R":1,"B":0}}'`,
  "  並べ直す      loopcraft layout diagram.json --all",
  "  画像で見る    loopcraft render diagram.json -o diagram.png",
  "  変更を挙げる  loopcraft diff diagram.json        git の HEAD と比べる",
  "",
  '  --format json の出力は {"ok":true,"data":…} か {"ok":false,"error":{"code","message","suggestions"}}。',
  "  失敗したら suggestions を上から試す。JSON を直接書くときの形は loopcraft schema。",
  "",
].join("\n");

function outputHelp(examples: string[], output: string, notes: string[] = []) {
  return [
    "",
    "例:",
    ...examples.flatMap((example) => example.split("\n").map((line) => `  ${line}`)),
    "",
    "--format json の出力:",
    `  ${output}`,
    ...(notes.length > 0 ? ["", ...notes.map((note) => `  ${note}`)] : []),
  ].join("\n");
}

function parseList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseScale(value: string) {
  const scale = Number(value);
  if (!Number.isFinite(scale) || scale <= 0 || scale > 8) {
    throw new InvalidArgumentError("0 より大きく 8 以下の数を指定してください");
  }
  return scale;
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
