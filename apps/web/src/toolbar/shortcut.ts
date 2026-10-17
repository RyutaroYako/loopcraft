const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);

/** ツールチップに添える修飾キーの表記 */
export const mod = isMac ? "⌘" : "Ctrl+";
