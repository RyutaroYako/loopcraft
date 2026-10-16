<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

# コード規約

- **コード**には what を書く。何をしているかは、名前と構造で読めるようにする
- **コミットメッセージ**には why を書く。なぜこの変更が必要だったか（何が困っていたか）
- **コメント**には why not を書く。素直な書き方や他の選択肢を、なぜ採らなかったか。コードを読めば分かる what や、コミットに書くべき why はコメントにしない

# スタイル（apps/web）

- 新しく書く UI は Tailwind のユーティリティで書く。値は `src/styles/tokens.css` のトークン（`text-ink`, `text-sm`, `rounded-md`, `shadow-float` など）を使い、`[13.5px]` のような任意値はトークンにない場合だけにする
- 余白は 4px 単位（`gap-6` = 24px）。`:root` が 14px のため、rem 基準の Tailwind 既定値は tokens.css で消してある
- 色・文字サイズ・角丸を足すときは tokens.css に足す。CSS に値を直書きしない
- 同じプロパティのユーティリティを 1 つの要素に重ねない（`bg-transparent` と `bg-accent` など）。勝ち負けは書いた順でなく生成順で決まるので、状態で変えるときは条件で片方だけ付ける
- `group` は名前付き（`group/item` など）で使う。名前が無いと、外側の別の `group` の hover まで拾う
- CSS に残すのは、複数の画面で使う部品（`primitives.css` の `.button` `.field` など）と、キャンバスの SVG・アイコン（`canvas.css`）だけ
- テストやコードから要素を探すときは、クラス名でなく role・`aria-*`・`data-*` を使う（状態は `aria-current` `aria-pressed`、領域は `<section aria-label>`）。`data-testid` で済ませず、取れないときは要素に役割と名前を付ける。クラスは見た目のためだけに使う。キャンバスの SVG は canvas.css の状態クラス（`.node.selected` など）で探してよい
