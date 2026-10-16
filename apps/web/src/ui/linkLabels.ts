import type { Polarity } from "@loopcraft/core/schema";

export function togglePolarityLabel(current: Polarity | undefined) {
  return current === "-" ? "極性を +（同じ向き）にする" : "極性を −（逆向き）にする";
}
