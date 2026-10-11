import { describe, expect, it } from "vite-plus/test";
import { classifyLoop, cycleKey } from "./loop.ts";
import type { LinkId } from "./schema.ts";

describe("classifyLoop", () => {
  it.each([
    [["+", "+"], "reinforcing"],
    [["+", "-"], "balancing"],
    [["-", "-"], "reinforcing"],
    [["-", "-", "-"], "balancing"],
  ] as const)("%j は %s", (polarities, kind) => {
    expect(classifyLoop(polarities)).toBe(kind);
  });
});

describe("cycleKey", () => {
  const ids = (...values: string[]) => values as LinkId[];

  it("回転の違いを同一視する", () => {
    expect(cycleKey(ids("c", "a", "b"))).toBe(cycleKey(ids("a", "b", "c")));
  });

  it("向きの違いは区別する", () => {
    expect(cycleKey(ids("a", "c", "b"))).not.toBe(cycleKey(ids("a", "b", "c")));
  });
});
