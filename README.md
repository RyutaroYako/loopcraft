# Loopcraft

システム思考で使う因果ループ図（システム図）を描くためのエディタです。ブラウザだけでも、手元の JSON ファイルを開く CLI からも使えます。

出来事どうしを矢印でつなぐと、図の中にあるループを自動で見つけ、自己強化ループ（R）かバランスループ（B）かを判定します。どのループを図の主張として見せるかは、自分で選べます。

## 主な機能

- 出来事と、その間の因果関係（同じ向きに動く `+` / 逆向きに動く `−`）、遅れの描画
- ループの自動検出と、R / B の判定
- 見せたいループを選び、名前や説明を付ける
- JSON のコピー・貼り付けやファイルでの書き出し・読み込みと、スキーマによる検証
- 図全体を画像（PNG）にしてコピー・保存
- 自動保存、元に戻す / やり直す、キーボードでの操作

## CLI

```bash
npx loopcraft serve diagram.json   # ブラウザのエディタで開く（無ければ最初の保存で作る）
npx loopcraft serve new.json --sample  # 新しいファイルをサンプルの図で開いて試す
npx loopcraft validate *.json      # スキーマと整合性を検証する（CI 向け）
npx loopcraft loops diagram.json   # ループを一覧する（--format md で表にする）
npx loopcraft init --sample        # 新しい図を作る
npx loopcraft schema               # JSON Schema を出力する
```

`serve` は閲覧モードで開きます。編集するときは画面上の「編集」に切り替えるか、`--edit` を付けて起動してください。`--readonly` を付けると編集モードに切り替えられません。編集内容はそのファイルに自動で保存され、ほかのエディタや `git pull` でファイルが変わると画面にも反映されます。

引数を付けずに `npx loopcraft` を実行すると、コマンドやファイルを選んで進められます。

## 使い方

キャンバスをダブルクリックすると出来事を追加できます。出来事の右端にある点をドラッグすると矢印を引けます。矢印の `+` / `−` をクリックすると、向きが切り替わります。

ツールバーの「画像」で図全体を PNG にしてコピー・保存でき、「JSON を書き出す」「読み込み」で JSON をコピー・貼り付けできます。

まずは空の画面にある「サンプルを開く」から試してみてください。

## データ形式

保存する JSON の形式は [`packages/core/loopcraft.schema.json`](packages/core/loopcraft.schema.json) の JSON Schema で定義しています。`npx loopcraft schema` でも出力できます。

## 開発

[Vite+](https://viteplus.dev/)、SolidJS 2、valibot で作っているモノレポです。

| ディレクトリ    | 内容                                                        |
| --------------- | ----------------------------------------------------------- |
| `apps/web`      | ブラウザのエディタ                                          |
| `apps/cli`      | npm に `loopcraft` として公開する CLI（エディタを同梱する） |
| `packages/core` | スキーマ、検証、ループの検出など、両方で使う処理            |

```bash
vp install                 # 依存関係のインストール
vp run dev                 # エディタの開発サーバー
vp check                   # フォーマット・lint・型チェック
vp test run --coverage     # テスト（カバレッジのしきい値は 90%）
vp run -r build            # ビルド
vp run gen:schema          # JSON Schema の再生成
```

ブラウザのテストには Chromium を使います。初回は `vp exec --filter @loopcraft/web playwright install chromium` を実行してください。

## ライセンス

[MIT](LICENSE)
