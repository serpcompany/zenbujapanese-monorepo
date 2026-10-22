const kanaOnly = /^[\p{Script=Hiragana}\p{Script=Katakana}ー\d\s]+$/u;

function rect(box) {
  const xs = box.map((p) => p[0]), ys = box.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)] ?? 0;
}

export function order(items) {
  const lines = items
    .filter((i) => i.text && i.text.trim())
    .map((i) => {
      const r = rect(i.box);
      const w = r.x1 - r.x0, h = r.y1 - r.y0;
      const vertical = h > 1.3 * w;
      return { ...i, ...r, w, h, vertical, size: vertical ? w : h };
    });
  if (!lines.length) return "";
  const weighted = lines.flatMap((l) => Array(Math.max(1, [...l.text].length)).fill(l.size));
  const med = median(weighted);
  const kept = lines.filter((l) => !(l.size < 0.6 * med && kanaOnly.test(l.text)));
  const parent = kept.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < kept.length; i++)
    for (let j = i + 1; j < kept.length; j++) {
      const a = kept[i], b = kept[j];
      if (a.vertical !== b.vertical) continue;
      const g = 0.8 * Math.max(a.size, b.size);
      if (a.x0 - g < b.x1 && b.x0 - g < a.x1 && a.y0 - g < b.y1 && b.y0 - g < a.y1) parent[find(i)] = find(j);
    }
  const groups = new Map();
  kept.forEach((l, i) => {
    const k = find(i);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(l);
  });
  const H = Math.max(...kept.map((l) => l.y1));
  const vChars = kept.filter((l) => l.vertical).reduce((a, l) => a + l.text.length, 0);
  const hChars = kept.filter((l) => !l.vertical).reduce((a, l) => a + l.text.length, 0);
  const verticalPage = vChars > hChars;
  const blocks = [...groups.values()].map((ls) => ({
    lines: ls,
    x0: Math.min(...ls.map((l) => l.x0)),
    y0: Math.min(...ls.map((l) => l.y0)),
    x1: Math.max(...ls.map((l) => l.x1)),
    vertical: ls.filter((l) => l.vertical).length >= ls.length / 2,
  }));
  const band = H / 5;
  blocks.sort((a, b) =>
    verticalPage ? Math.floor(a.y0 / band) - Math.floor(b.y0 / band) || b.x1 - a.x1 : a.y0 - b.y0 || a.x0 - b.x0,
  );
  return blocks
    .map((b) =>
      b.lines
        .sort((p, q) =>
          b.vertical ? (q.x0 + q.x1) / 2 - (p.x0 + p.x1) / 2 || p.y0 - q.y0 : (p.y0 + p.y1) / 2 - (q.y0 + q.y1) / 2 || p.x0 - q.x0,
        )
        .map((l) => l.text)
        .join(""),
    )
    .join("\n");
}
