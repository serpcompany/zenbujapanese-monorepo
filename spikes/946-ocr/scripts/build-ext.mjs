import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as esbuild from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const out = path.resolve(root, "../../tmp/agent/ext");
const nm = path.join(root, "node_modules");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "tess/core"), { recursive: true });
fs.mkdirSync(path.join(out, "ort"), { recursive: true });

await esbuild.build({
  entryPoints: [path.join(root, "ext-src/bench.mjs")],
  bundle: true,
  format: "esm",
  platform: "browser",
  outfile: path.join(out, "bench.js"),
  logLevel: "warning",
});
for (const f of ["manifest.json", "bench.html", "sw.js"]) fs.copyFileSync(path.join(root, "ext-src", f), path.join(out, f));
for (const f of fs.readdirSync(path.join(nm, "onnxruntime-web/dist"))) {
  if (/^ort-wasm.*\.(wasm|mjs)$/.test(f)) fs.copyFileSync(path.join(nm, "onnxruntime-web/dist", f), path.join(out, "ort", f));
}
fs.copyFileSync(path.join(nm, "tesseract.js/dist/worker.min.js"), path.join(out, "tess/worker.min.js"));
for (const f of fs.readdirSync(path.join(nm, "tesseract.js-core"))) {
  if (/^tesseract-core/.test(f)) fs.copyFileSync(path.join(nm, "tesseract.js-core", f), path.join(out, "tess/core", f));
}
execFileSync("cp", ["-cR", path.join(root, "models"), path.join(out, "models")]);
execFileSync("cp", ["-cR", path.join(root, "images"), path.join(out, "images")]);
fs.mkdirSync(path.join(out, "config"), { recursive: true });
fs.copyFileSync(path.join(root, "models/ndl/NDLmoji.yaml"), path.join(out, "config/NDLmoji.yaml"));
console.log("built", out);
