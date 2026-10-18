# loopcraft

システム思考で使う因果ループ図（システム図）を、手元の JSON ファイルで描くための CLI です。ブラウザで動くエディタを同梱しています。

変数どうしを矢印でつなぐと、図の中にあるループを自動で見つけ、自己強化ループ（R）かバランスループ（B）かを判定します。どのループに注目するかは、自分で選べます。

## 使い方

```bash
npx loopcraft serve diagram.json   # ブラウザのエディタで開く（無ければ最初の保存で作る）
npx loopcraft serve new.json --sample  # 新しいファイルをサンプルの図で開いて試す
npx loopcraft validate *.json      # スキーマと整合性を検証する（CI 向け）
npx loopcraft loops diagram.json   # ループを一覧表示する（--format md で表にする）
npx loopcraft check diagram.json   # 検証に加えて、ループの数と配置の崩れを調べる
npx loopcraft edit diagram.json -  # 標準入力の操作（JSONL）で図を作る・変える
npx loopcraft layout diagram.json  # 座標の無い変数を配置する（--all で全体を並べ直す）
npx loopcraft render diagram.json -o diagram.png  # 画像（SVG / PNG）にする
npx loopcraft diff diagram.json    # git の HEAD と比べて、変数・関連・ループの違いを挙げる
npx loopcraft schema               # JSON Schema を出力する
```

### エージェントから使う

コーディングエージェントが図を作り、確かめられるようにしています。

- `npx loopcraft --help` の先頭に、そのまま写せる早見表があります。
- `--format json` を付けると、結果は `{"ok":true,"data":…}`、失敗は `{"ok":false,"error":{"code","message","suggestions"}}` の 1 行の JSON で返します。`suggestions` には、次に打つコマンドや直し方が入ります。
- 図の JSON では、変数の `position` を省けます。開くときに自動で配置します。
- `npx loopcraft agent-init` を実行すると、AGENTS.md（無ければ CLAUDE.md）に使い方を書き込みます。

引数を付けずに `npx loopcraft` を実行すると、コマンドやファイルを選んで進められます。各コマンドの詳しい使い方は `npx loopcraft <command> --help` で確かめられます。

## エディタ

`serve` で開いた図はそのまま編集できます。見せるだけのときは `--readonly` を付けると、編集も保存もできなくなります。

編集内容はそのファイルに自動で保存され、ほかのエディタや `git pull` でファイルが変わると画面にも反映されます。エディタは `127.0.0.1` だけで待ち受け、ターミナルに表示した URL からしか開けません。

キャンバスをダブルクリックすると変数を追加できます。変数の右端にある点をドラッグすると矢印を引けます。矢印の `+` / `−` をクリックすると、極性が切り替わります。

ツールバーの「画像」で図全体を PNG にしてコピー・保存でき、「JSON を書き出す」「読み込み」で JSON をコピー・貼り付けできます。

## データ形式

保存する JSON の形式は JSON Schema で定義しています。`npx loopcraft schema` で出力できます。

## 動作環境

Node.js 22.18 以上

## ライセンス

[MIT](https://github.com/RyutaroYako/loopcraft/blob/main/LICENSE)
