import { cancel, confirm, isCancel, multiselect, select, text } from "@clack/prompts";
import { DEFAULT_FILE } from "./commands/init.ts";
import { listJsonFiles } from "./files.ts";

export type CommandName = "serve" | "validate" | "loops" | "init" | "schema";

export const COMMANDS: { value: CommandName; label: string; hint: string }[] = [
  { value: "serve", label: "serve", hint: "ファイルをブラウザのエディタで開く" },
  { value: "validate", label: "validate", hint: "図の JSON を検証する" },
  { value: "loops", label: "loops", hint: "図に含まれるループを一覧する" },
  { value: "init", label: "init", hint: "新しい図のファイルを作る" },
  { value: "schema", label: "schema", hint: "JSON Schema を出力する" },
];

/** 対話で引数を補う。キャンセルされたら undefined を返す */
export interface Prompts {
  chooseCommand(): Promise<CommandName | undefined>;
  /** 選べるファイルが無く、新しく作ることもできないときは null */
  chooseFile(
    cwd: string,
    /** newOnly なら一覧から選ばせず、新しいファイル名を聞く */
    options: { message: string; allowNew: boolean; newOnly?: boolean },
  ): Promise<string | null | undefined>;
  chooseFiles(cwd: string): Promise<string[] | undefined>;
  /** オプションで決まっている項目は聞かない */
  askInit(known: { sample?: boolean }): Promise<{ file: string; sample: boolean } | undefined>;
  cancelled(): void;
}

/** 「新しいファイルを作る」を選んだ印。ファイル名とは重ならない */
const NEW_FILE = "\u0000new-file";

export const clackPrompts: Prompts = {
  async chooseCommand() {
    const command = await select({ message: "何をしますか？", options: COMMANDS });
    return isCancel(command) ? undefined : command;
  },

  async chooseFile(cwd, { message, allowNew, newOnly }) {
    const files = await listJsonFiles(cwd);
    if (files.length === 0 && !allowNew) return null;
    const choice =
      files.length === 0 || newOnly
        ? NEW_FILE
        : await select({
            message,
            options: [
              ...files.map((file) => ({ value: file, label: file })),
              ...(allowNew ? [{ value: NEW_FILE, label: "新しいファイルを作る" }] : []),
            ],
          });
    if (isCancel(choice)) return undefined;
    if (choice !== NEW_FILE) return choice;
    const name = await text({
      message: "ファイル名",
      placeholder: DEFAULT_FILE,
      defaultValue: DEFAULT_FILE,
      validate: (value) =>
        value && !value.endsWith(".json") ? "拡張子は .json にしてください" : undefined,
    });
    return isCancel(name) ? undefined : name;
  },

  async chooseFiles(cwd) {
    const files = await listJsonFiles(cwd);
    if (files.length === 0) return [];
    const chosen = await multiselect({
      message: "検証するファイル",
      options: files.map((file) => ({ value: file, label: file })),
      initialValues: files,
      required: true,
    });
    return isCancel(chosen) ? undefined : chosen;
  },

  async askInit(known) {
    const file = await text({
      message: "作るファイル名",
      placeholder: DEFAULT_FILE,
      defaultValue: DEFAULT_FILE,
      validate: (value) =>
        value && !value.endsWith(".json") ? "拡張子は .json にしてください" : undefined,
    });
    if (isCancel(file)) return undefined;
    if (known.sample !== undefined) return { file, sample: known.sample };
    const sample = await confirm({ message: "サンプルの図を入れますか？", initialValue: false });
    if (isCancel(sample)) return undefined;
    return { file, sample };
  },

  cancelled() {
    cancel("キャンセルしました");
  },
};
