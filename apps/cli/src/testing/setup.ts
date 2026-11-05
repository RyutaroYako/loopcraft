import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

// 手元の claude を隠すのは、入っているかどうかで serve の振る舞いとテストの結果が変わるため。
// AI を使うテストは、偽の claude を agentCommand で渡す
const dir = mkdtempSync(join(tmpdir(), "loopcraft-no-claude-"));
writeFileSync(join(dir, "claude"), "#!/bin/sh\nexit 127\n");
chmodSync(join(dir, "claude"), 0o755);
process.env["PATH"] = `${dir}${delimiter}${process.env["PATH"] ?? ""}`;
