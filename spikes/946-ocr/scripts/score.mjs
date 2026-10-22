import fs from "node:fs";
import path from "node:path";
import { order } from "./layout.mjs";

const root = path.resolve(import.meta.dirname, "..");
const truth = JSON.parse(fs.readFileSync(path.join(root, "images/truth.json"), "utf8"));

export const norm = (s) => [...(s ?? "").normalize("NFKC")].filter((c) => /[\p{L}\p{N}]/u.test(c));

export function lev(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

export function bag(gt, out) {
  const m = new Map();
  for (const c of gt) m.set(c, (m.get(c) ?? 0) + 1);
  let extra = 0;
  for (const c of out) {
    if (m.get(c) > 0) m.set(c, m.get(c) - 1);
    else extra++;
  }
  const missing = [...m.values()].reduce((a, b) => a + b, 0);
  return Math.max(missing, extra) / gt.length;
}

export function score(imageId, text) {
  const gt = norm(truth[imageId].truth);
  const out = norm(text);
  return { cer: lev(gt, out) / gt.length, bagCer: bag(gt, out), gtLen: gt.length };
}

const files = fs.readdirSync(path.join(root, "results")).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
const table = [];
for (const f of files) {
  const r = JSON.parse(fs.readFileSync(path.join(root, "results", f), "utf8"));
  for (const row of r.rows) {
    const s = row.error ? {} : score(row.image, row.text);
    const ordered = row.items ? order(row.items) : null;
    const l = ordered === null ? {} : score(row.image, ordered);
    table.push({ config: r.id, image: row.image, ...s, cerLayout: l.cer, bagLayout: l.bagCer, layoutText: ordered, coldMs: row.coldMs, warmMs: row.warmMs, error: row.error });
  }
}
fs.writeFileSync(path.join(root, "results/_scores.json"), JSON.stringify(table, null, 1));
const pct = (x) => (x === undefined ? "  err" : `${(x * 100).toFixed(0).padStart(4)}%`);
const ms = (x) => (x === undefined || x === null ? "    -" : String(Math.round(x)).padStart(6));
const images = Object.keys(truth);
const configs = [...new Set(table.map((t) => t.config))];
console.log("CER (engine order / Zenbu layout order / order-free), warm ms");
console.log("config".padEnd(32) + images.map((i) => i.slice(0, 14).padEnd(24)).join(""));
for (const c of configs) {
  const cells = images.map((i) => {
    const t = table.find((x) => x.config === c && x.image === i);
    if (!t) return "".padEnd(24);
    if (t.error) return "error".padEnd(24);
    return `${pct(t.cer)}/${t.cerLayout === undefined ? "    -" : pct(t.cerLayout)}/${pct(t.bagCer)}${ms(t.warmMs)}`.padEnd(24);
  });
  console.log(c.padEnd(32) + cells.join(""));
}
