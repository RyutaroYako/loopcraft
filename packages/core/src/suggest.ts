/** 打ち間違いとみなす近さ。短い語ほど許す違いを減らし、無関係な語を候補にしない */
const tolerance = (word: string) =>
  word.length <= 2 ? 0 : word.length <= 5 ? 1 : word.length <= 10 ? 2 : 3;

export const closest = (word: string, candidates: Iterable<string>): string | undefined => {
  let best: { candidate: string; distance: number } | undefined;
  const lowered = word.toLowerCase();
  for (const candidate of candidates) {
    const distance = editDistance(lowered, candidate.toLowerCase());
    if (distance > tolerance(candidate)) continue;
    if (!best || distance < best.distance) best = { candidate, distance };
  }
  return best?.candidate;
};

/** 隣り合う 2 文字の入れ替えも 1 回と数える。lable のような打ち間違いがいちばん多いため */
const editDistance = (a: string, b: string) => {
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, rows[i - 2]![j - 2]! + 1);
      }
      rows[i]![j] = best;
    }
  }
  return rows[a.length]![b.length]!;
};
