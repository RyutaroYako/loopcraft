# Loopcraft

システム思考で使う因果ループ図（システム図）を描くためのエディタです。ブラウザだけでも、手元の JSON ファイルを開く CLI からも使えます。

出来事どうしを矢印でつなぐと、図の中にあるループを自動で見つけ、自己強化ループ（R）かバランスループ（B）かを判定します。どのループを図の主張として見せるかは、自分で選べます。

## 主な機能

- 出来事と、その間の因果関係（同じ向きに動く `+` / 逆向きに動く `−`）、遅れの描画
- ループの自動検出と、R / B の判定
- 見せたいループを選び、名前や説明を付ける
- JSON での書き出し・読み込みと、スキーマによる検証
- 自動保存、元に戻す / やり直す、キーボードでの操作

## CLI

```bash
npx loopcraft serve diagram.json   # ブラウザのエディタで開く（無ければ最初の保存で作る）
npx loopcraft validate *.json      # スキーマと整合性を検証する（CI 向け）
npx loopcraft loops diagram.json   # ループを一覧する（--format md で表にする）
npx loopcraft init --sample        # 新しい図を作る
npx loopcraft schema               # JSON Schema を出力する
```

`serve` は閲覧モードで開きます。編集するときは画面上の「編集」に切り替えるか、`--edit` を付けて起動してください。`--readonly` を付けると編集モードに切り替えられません。編集内容はそのファイルに自動で保存され、ほかのエディタや `git pull` でファイルが変わると画面にも反映されます。

引数を付けずに `npx loopcraft` を実行すると、コマンドやファイルを選んで進められます。

## 使い方

キャンバスをダブルクリックすると出来事を追加できます。出来事の右端にある点をドラッグすると矢印を引けます。矢印の `+` / `−` をクリックすると、向きが切り替わります。

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

## リリース

最新の `main` で版を上げてタグを付け、push すると、GitHub Actions がテストと確認をしたうえで npm への公開と GitHub Release の作成を行います。npm への認証は OIDC（trusted publishing）で、トークンは使いません。

```bash
vpr release patch                   # 0.1.0 → 0.1.1。minor / major / 1.2.3 のような指定もできる
git push --atomic --follow-tags     # main とタグをまとめて送る。どちらかが拒まれたら両方送らない
```

- `vpr release` は、`main` が `origin/main` と一致しているときだけ動きます。版の更新は `main` へ直接 push するので、`main` を守るルールでは管理者が通れるようにしてください
- `vpr release preminor --preid beta` のようなプレリリース（`v0.2.0-beta.0`）は、npm の `next` タグと GitHub のプレリリースとして公開します
- 途中で失敗したら、ワークフローを再実行できます。公開済みの版は npm への公開を飛ばし、GitHub Release だけを作ります
- リリースは 1 つずつ順に動きます。前のリリースが終わる前に続けてタグを push すると、待っていた実行が取り消されることがあるので、その実行を再実行してください。ただし、新しい版を先に出していたら、古い版は npm の latest を戻さないよう公開しません。そのタグは消すか（`git push --delete origin vX.Y.Z`）、必要なら GitHub Release を手で作ってください

### 初回の公開

npm の trusted publisher は、パッケージが npm にあるときだけ登録できるので、最初の版だけ手元から公開します。

1. 手元から公開する（2FA のワンタイムパスワードを聞かれます）

   ```bash
   cd apps/cli && vp pm publish
   ```

2. npmjs.com の `loopcraft` の Settings → Trusted publishing で GitHub Actions を登録する（大文字小文字まで一致させる）

   | 項目              | 値            |
   | ----------------- | ------------- |
   | Organization/user | `RyutaroYako` |
   | Repository        | `loopcraft`   |
   | Workflow filename | `release.yml` |
   | Environment       | `npm`         |

3. 公開した版のタグを push する。npm への公開は飛ばして、GitHub Release を作ります

   ```bash
   git tag -a v0.1.0 -m "chore(release): v0.1.0" && git push origin v0.1.0
   ```

登録した設定は、2 日以内に公開を一度成功させないと使えなくなります。登録したら、早めに次の版を `vpr release` で出してください。動いたら、npm の Publishing access を「Require two-factor authentication and disallow tokens」にします。

## ライセンス

[MIT](LICENSE)
