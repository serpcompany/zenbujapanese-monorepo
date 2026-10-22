import ort from "onnxruntime-node";
for (const f of process.argv.slice(2)) {
  const s = await ort.InferenceSession.create(f);
  console.log(f.split("/").slice(-2).join("/"));
  for (const n of s.inputNames) console.log("  in ", n, JSON.stringify(s.inputMetadata?.find?.((m) => m.name === n) ?? ""));
  for (const n of s.outputNames) console.log("  out", n, JSON.stringify(s.outputMetadata?.find?.((m) => m.name === n) ?? ""));
}
