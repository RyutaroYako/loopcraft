# System Diagram Editor

システム思考のシステム図（因果ループ図）をブラウザだけで編集するエディタ。

## 開発

```bash
vp install
vp dev             # 開発サーバー
vp check           # フォーマット・lint・型チェック
vp test            # テスト
vp build           # 本番ビルド
vp run gen:schema  # src/model/schema.ts から public/system-diagram.schema.json を再生成
```

## データモデル（`src/model/`）

| ファイル         | 内容                                                           |
| ---------------- | -------------------------------------------------------------- |
| `schema.ts`      | valibot スキーマと型。`DiagramSchema` は参照整合性まで検証する |
| `integrity.ts`   | ID 重複・参照切れ・自己ループ・閉じていないループなどの検出    |
| `loop.ts`        | ループの種類（自己強化/バランス）の導出、閉路の正規化キー      |
| `io.ts`          | JSON の読み込み・書き出し                                      |
| `json-schema.ts` | 保存形式の JSON Schema 生成                                    |
