import { expect, it } from "vite-plus/test";
import { closest } from "./suggest.ts";

it("打ち間違いに近い候補を返し、遠いものは返さない", () => {
  expect(closest("polarty", ["id", "from", "to", "polarity"])).toBe("polarity");
  expect(closest("Lable", ["label", "level"])).toBe("label");
  expect(closest("c", ["a", "b"])).toBeUndefined();
  expect(closest("weather", ["polarity"])).toBeUndefined();
  expect(closest("sale", ["sales", "salt"])).toBe("sales");
});
