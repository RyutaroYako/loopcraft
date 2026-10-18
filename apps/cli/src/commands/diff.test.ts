import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stringifyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import { describe, expect, it } from "vite-plus/test";
import { createWorkspace, writeSample } from "../testing/fixtures.ts";
import { diff } from "./diff.ts";

const changed = () => {
  const diagram = createSampleDiagram();
  diagram.title = "新";
  diagram.variables[1]!.label = "売上高";
  diagram.variables[0]!.position = { x: 5, y: 5 };
  diagram.links[5]!.polarity = "+";
  diagram.links[2]!.delay = undefined;
  diagram.links.splice(6, 3);
  diagram.loops.splice(2, 1);
  return diagram;
};

describe("diff", () => {
  it("2 つのファイルの違いを挙げる", async () => {
    const { context, stdout, stderr } = await createWorkspace();
    await writeSample(context.cwd, "before.json");
    await writeFile(join(context.cwd, "after.json"), stringifyDiagram(changed()));
    await diff(["before.json", "after.json"], { format: "text", base: "HEAD" }, context);
    expect(stderr[0]).toBe("ℹ before.json → after.json");
    expect(stdout).toEqual(
      expect.arrayContaining([
        "~ タイトル: 組織の成長と人の負荷 → 新",
        "~ 変数 売上 → 売上高（sales）",
        "- 関連 社員数 → 一人あたりの業務量（-）",
        "~ 関連 教育コスト → 利益: polarity: - -> +",
        "~ 関連 利益 → 採用数: delay: true -> false",
        "- ループ R: 社員数 → 一人あたりの業務量 → 離職数",
        "~ ループ B → R: 社員数 → 教育コスト → 利益 → 採用数",
        "- 注目するループ 負荷と離職の悪循環",
      ]),
    );
    expect(stderr.at(-1)).toBe("位置だけが変わった変数: 1 個");
    const described = createSampleDiagram();
    described.description = "別の説明";
    await writeFile(join(context.cwd, "described.json"), stringifyDiagram(described));
    await diff(["before.json", "described.json"], { format: "text", base: "HEAD" }, context);
    expect(stdout.at(-1)).toBe("~ description");
  });

  it("ファイル 1 つなら git の版と比べ、その版に無ければすべて足したものとする", async () => {
    const { context, stdout } = await createWorkspace();
    await writeFile(join(context.cwd, "d.json"), stringifyDiagram(changed()));
    const sample = stringifyDiagram(createSampleDiagram());
    await diff(["d.json"], { format: "json", base: "main" }, context, {
      showFile: async (revision, path) => {
        expect([revision, path]).toEqual(["main", join(context.cwd, "d.json")]);
        return sample;
      },
    });
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      ok: true,
      data: {
        base: "main",
        file: "d.json",
        changed: true,
        featured: { removed: ["負荷と離職の悪循環"] },
      },
    });
    const fresh = await createWorkspace();
    await writeSample(fresh.cwd, "d.json");
    await diff(["d.json"], { format: "text", base: "HEAD" }, fresh.context, {
      showFile: async () => null,
    });
    expect(fresh.stderr[0]).toBe("ℹ HEAD（ファイルが無い） → d.json");
    expect(fresh.stdout).toContain("+ 変数 社員数（staff）");
    expect(fresh.stdout).toContain("+ 関連 社員数 → 売上（+）");
    expect(fresh.stdout).toContain("+ 注目するループ 成長エンジン");
  });

  it("ループを数えきれなかったら、ループの増減が一部だけだと知らせる", async () => {
    const { context, stderr } = await createWorkspace();
    const names = ["a", "b", "c", "d", "e", "f", "g"];
    const dense = {
      version: 1,
      title: "",
      variables: names.map((id, at) => ({ id, label: id, position: { x: at * 100, y: 0 } })),
      links: names.flatMap((from) =>
        names
          .filter((to) => to !== from)
          .map((to) => ({ id: `${from}${to}`, from, to, polarity: "+" })),
      ),
      loops: [],
    };
    await writeFile(join(context.cwd, "a.json"), JSON.stringify(dense));
    await writeFile(join(context.cwd, "b.json"), JSON.stringify({ ...dense, title: "b" }));
    await diff(["a.json", "b.json"], { format: "text", base: "HEAD" }, context);
    expect(stderr.at(-1)).toBe(
      "⚠ ループが多いため数えきれず、ループの増減は一部だけを挙げています",
    );
  });

  it("違いが無ければそう伝える", async () => {
    const { context, stderr } = await createWorkspace();
    await writeSample(context.cwd, "a.json");
    await writeSample(context.cwd, "b.json");
    await diff(["a.json", "b.json"], { format: "text", base: "HEAD" }, context);
    expect(stderr).toEqual(["ℹ a.json と b.json に違いはありません"]);
  });

  it("git から読めないときや、比べる数が合わないときは断る", async () => {
    const { context } = await createWorkspace();
    await writeSample(context.cwd);
    const fail = async () => {
      throw new Error("fatal: not a git repository");
    };
    expect(
      await diff(["diagram.json"], { format: "text", base: "HEAD" }, context, { showFile: fail }),
    ).toMatchObject({
      code: "GIT_ERROR",
      message: "git から HEAD の版を読めません（fatal: not a git repository）",
      suggestions: ["git の管理下に無いときは、比べる 2 つのファイルを指定してください"],
    });
    expect(
      await diff(["diagram.json"], { format: "text", base: "HEAD" }, context, {
        showFile: async () => "{",
      }),
    ).toMatchObject({ code: "INVALID_DIAGRAM" });
    expect(await diff([], { format: "text", base: "HEAD" }, context)).toMatchObject({
      kind: "usage",
    });
    expect(await diff(["none.json"], { format: "text", base: "HEAD" }, context)).toMatchObject({
      code: "FILE_NOT_FOUND",
    });
    expect(
      await diff(["none.json", "diagram.json"], { format: "text", base: "HEAD" }, context),
    ).toMatchObject({ code: "FILE_NOT_FOUND" });
  });

  it("git の管理下で、作業中のファイルと HEAD を比べる", async () => {
    const { context, stdout } = await createWorkspace();
    const { execFileSync } = await import("node:child_process");
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: context.cwd, stdio: "ignore" });
    git("init", "-q");
    await writeSample(context.cwd);
    git("add", ".");
    git(
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.com",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "-qm",
      "init",
    );
    await writeFile(join(context.cwd, "diagram.json"), stringifyDiagram(changed()));
    await writeSample(context.cwd, "untracked.json");
    await diff(["diagram.json"], { format: "json", base: "HEAD" }, context);
    expect(JSON.parse(stdout.join(""))).toMatchObject({ data: { base: "HEAD", changed: true } });
    await diff(["untracked.json"], { format: "json", base: "HEAD" }, context);
    expect(JSON.parse(stdout.at(-1)!)).toMatchObject({ data: { base: "HEAD（ファイルが無い）" } });
    expect(await diff(["diagram.json"], { format: "json", base: "nope" }, context)).toMatchObject({
      code: "GIT_ERROR",
      suggestions: ["--base の版を git log --oneline で確かめてください"],
    });
  });
});
