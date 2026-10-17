const ACCENT = "\u001B[38;2;185;86;26m";
const RESET = "\u001B[0m";
const BOLD = "\u001B[1m";
const DIM = "\u001B[2m";

export function renderHeader(version: string, color: boolean) {
  const name = "Loopcraft";
  const tagline = "因果ループ図エディタ";
  if (!color) return `${name} — ${tagline} v${version}`;
  return `${BOLD}${ACCENT}${name}${RESET} ${tagline} ${DIM}v${version}${RESET}`;
}
