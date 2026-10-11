import * as v from "valibot";
import { DiagramSchema } from "./schema.ts";

/**
 * `loopcraft serve` とブラウザのエディタの間の取り決め。
 * サーバーは index.html の meta タグにセッションを埋め込み、エディタはそれを読んで
 * localStorage の代わりにファイルへ保存する。
 */

export const SESSION_META_NAME = "loopcraft-session";
export const TOKEN_HEADER = "x-loopcraft-token";
/** 保存した画面を見分ける。同じセッションを開いた別のタブには、ほかの画面の保存として知らせる */
export const CLIENT_HEADER = "x-loopcraft-client";

export const SessionSchema = v.object({
  token: v.pipe(v.string(), v.nonEmpty()),
  /** 表示用のファイル名 */
  file: v.string(),
  /** 開いたときに編集できるか。false なら閲覧モードで始める */
  editable: v.boolean(),
  /** true なら編集モードに切り替えられない */
  readonly: v.boolean(),
});

export type Session = v.InferOutput<typeof SessionSchema>;

/** ファイルの中身から計算する版。外部での変更や、保存の競合を見分けるのに使う */
export type Revision = string;

export const DocumentResponseSchema = v.variant("status", [
  v.object({ status: v.literal("ok"), diagram: DiagramSchema, revision: v.string() }),
  v.object({ status: v.literal("missing") }),
  v.object({
    status: v.literal("invalid"),
    revision: v.string(),
    errors: v.array(v.string()),
  }),
]);

export type DocumentResponse = v.InferOutput<typeof DocumentResponseSchema>;

export const SaveRequestSchema = v.object({
  diagram: DiagramSchema,
  /** 保存の前提にした版。null はファイルがまだ無い前提。force なら版を確かめずに上書きする */
  baseRevision: v.nullable(v.string()),
  force: v.optional(v.boolean()),
});

export type SaveRequest = v.InferOutput<typeof SaveRequestSchema>;

export const SaveResponseSchema = v.variant("status", [
  v.object({ status: v.literal("saved"), revision: v.string() }),
  v.object({ status: v.literal("conflict"), revision: v.nullable(v.string()) }),
]);

export type SaveResponse = v.InferOutput<typeof SaveResponseSchema>;

/** writer は保存した画面の ID。エディタ以外が書き換えたときは null */
export const ChangeEventSchema = v.object({
  revision: v.nullable(v.string()),
  writer: v.optional(v.nullable(v.string())),
});
