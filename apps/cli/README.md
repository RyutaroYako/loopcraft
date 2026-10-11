# loopcraft

システム思考で使う因果ループ図（システム図）を、手元の JSON ファイルで描くための CLI です。ブラウザで動くエディタを同梱しています。

出来事どうしを矢印でつなぐと、図の中にあるループを自動で見つけ、自己強化ループ（R）かバランスループ（B）かを判定します。どのループを図の主張として見せるかは、自分で選べます。

## 使い方

```bash
npx loopcraft serve diagram.json   # ブラウザのエディタで開く（無ければ最初の保存で作る）
npx loopcraft validate *.json      # スキーマと整合性を検証する（CI 向け）
npx loopcraft loops diagram.json   # ループを一覧する（--format md で表にする）
npx loopcraft init --sample        # 新しい図を作る
npx loopcraft schema               # JSON Schema を出力する
```

引数を付けずに `npx loopcraft` を実行すると、コマンドやファイルを選んで進められます。各コマンドの詳しい使い方は `npx loopcraft <command> --help` で確かめられます。

## エディタ

`serve` は閲覧モードで開きます。編集するときは画面上の「編集」に切り替えるか、`--edit` を付けて起動してください。`--readonly` を付けると編集モードに切り替えられません。

編集内容はそのファイルに自動で保存され、ほかのエディタや `git pull` でファイルが変わると画面にも反映されます。エディタは `127.0.0.1` だけで待ち受け、ターミナルに表示した URL からしか開けません。

キャンバスをダブルクリックすると出来事を追加できます。出来事の右端にある点をドラッグすると矢印を引けます。矢印の `+` / `−` をクリックすると、向きが切り替わります。

## データ形式

保存する JSON の形式は JSON Schema で定義しています。`npx loopcraft schema` で出力できます。

## 動作環境

Node.js 22.18 以上

## ライセンス

[MIT](https://github.com/RyutaroYako/loopcraft/blob/main/LICENSE)
