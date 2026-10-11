import * as v from "valibot";
import { describe, expect, it } from "vite-plus/test";
import { DocumentResponseSchema, SaveRequestSchema, SessionSchema } from "./session.ts";
import { createSampleInput } from "./testing/sample.ts";

describe("session の取り決め", () => {
  it("セッションと API の形を検証する", () => {
    expect(
      v.is(SessionSchema, { token: "t", file: "a.json", editable: false, readonly: false }),
    ).toBe(true);
    expect(
      v.is(SessionSchema, { token: "", file: "a.json", editable: false, readonly: false }),
    ).toBe(false);
    expect(v.is(DocumentResponseSchema, { status: "missing" })).toBe(true);
    expect(
      v.is(SaveRequestSchema, { diagram: createSampleInput(), baseRevision: null, force: true }),
    ).toBe(true);
  });
});
