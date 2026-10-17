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

# Vue（apps/web）

- SFC（`<script setup lang="ts">`）で書き、[ubugeeei/style-guide.vue](https://github.com/ubugeeei/style-guide.vue) に沿う。コメントの書き方はこのファイルの「コード規約」を優先する
- 状態の遷移とロジックは素の TS（`history.ts` `autosave.ts` など）に置き、`use*.ts` は ref と computed でつなぐだけにする。テストは素の TS と、アプリ全体を描くブラウザでのテストで書き、部品だけを描くテストは書かない
- ディレクトリは機能ごとに分け（`canvas/` `sidebar/` など）、部品・composable・テストを同じ場所に置く。どの画面からも使う見た目だけの部品は `primitives/`
- `provide` / `inject` はエディタ（`injectEditor()`）だけにする。ほかは props と emit で渡す
- ダイアログ・メニュー・タブ・ラジオ・スイッチ・お知らせ・ツールチップなど、reka-ui に部品があるものは reka-ui で組み、自前やブラウザの要素で書かない
- 説明は `title` でなく `HintTooltip` で出す。ボタンでない要素に付けるときは `tabindex="0"` でフォーカスできるようにし、キーボードでも出せるようにする
- `vp check` は .vue の型とテンプレートを見ないので、`vp run @loopcraft/web#check:vue` と `vp run @loopcraft/web#lint:vue`（Vize の opinionated）も通す

# スタイル（apps/web）

- 見た目は各コンポーネントの `<style scoped>` に書く。値は `src/styles/tokens.css` のトークン（`var(--color-ink)` `var(--text-sm)` `var(--radius-md)` など）を使う。色・文字サイズ・角丸・`z-index` を足すときは tokens.css に足し、直書きしない
- `<style scoped>` はテンプレートの入れ子をそのまま写す。ルートのクラスから始めて子要素を同じ順・同じ深さでネストし、状態（`&[aria-pressed="true"]` など）はその要素の中に書く。CSS だけを読んでも、どの領域の何の要素かが分かるようにする
- ルートのクラスは部品名のケバブケースにする（`EditorToolbar` なら `.editor-toolbar`）。`ModalDialog` のように外側が別の部品なら、その部品に自分の部品名のクラスを付けてそこから書き始める
- ほかのクラスは「役割＋要素の種類」で名付け、CSS だけで何の要素か分かるようにする（`.add` や `.add-variable` でなく `.add-variable-button`）。種類の語は `-heading` `-button` `-buttons`（ボタンの並び） `-group`（`role="group"`） `-list` `-item` `-field`（ラベル・入力・説明の組） `-input` `-text` `-label` `-icon` `-image` `-badge` `-area`（並べるだけの入れ物） `-rect` `-circle` `-path`（SVG の図形）などから選ぶ
- タグや role では選ばず、スタイルを当てる要素にはすべてクラスを付ける（`<h2 class="title-heading">` `<ul class="step-list">`）。クラスは見た目のためだけでなく、マークアップの意味を表すもの。子をまとめて扱うときだけ `> *` を使う
- reka-ui の部品が描く要素には、scoped の印が付かないことがある（body へ移すもの、包む div を挟むもの）。`as-child` で自分の要素を描かせ、その要素にクラスを付ける。body へ移すものはルートの入れ子に入れず、そのクラスから書き始める
- いくつもの画面で同じ見た目を使うときは、CSS を共通にせずコンポーネントにする。全体に効く CSS は tokens.css と base.css（リセットと土台）だけ
- いくつもの親から使う部品は、既定の見た目を `@layer components` に入れる。親は部品に自分のクラスを付けて、層の外から寸法や表示を変える
- 子コンポーネントに付けるクラスも「役割＋種類」にし、部品名とは別の名前にする（`<ThemeMenu class="theme-switcher">`）。親のクラス名が子の外側の要素のクラス名と重なると、scoped でも親のスタイルがそこに当たる
- ブレークポイントは `@media (width < 48rem)`（狭い画面）、`(width < 80rem)`（ボタンの文字を省く幅）、`(height <= 760px)`（低い画面）。`@custom-media` は SFC から見えないので使わない
- 左右は論理プロパティ（`inset-inline-start` `padding-inline` など）で書く。ネストを基本にし、状態は `[aria-pressed="true"]` や `data-*` の属性セレクタで変える
- テストやコードから要素を探すときは、クラス名でなく role・`aria-*`・`data-*` を使う（状態は `aria-current` `aria-pressed`、領域は `<section aria-label>`）。`data-testid` で済ませず、取れないときは要素に役割と名前を付ける。キャンバスの SVG は状態のクラス（`.canvas-node.selected` など）で探してよい
