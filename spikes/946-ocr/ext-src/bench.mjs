import * as ort from "onnxruntime-web/webgpu";
import * as esearch from "esearch-ocr";
import { createWorker } from "tesseract.js";
import { LayoutDetector } from "../vendor/ndlocrlite-web/worker/layout-detector.ts";
import { TextRecognizer } from "../vendor/ndlocrlite-web/worker/text-recognizer.ts";
import { ReadingOrderProcessor } from "../vendor/ndlocrlite-web/worker/reading-order.ts";
import { ndlOrtOptions } from "../vendor/ndlocrlite-web/worker/onnx-config.ts";

const url = (p) => chrome.runtime.getURL(p);
ort.env.wasm.wasmPaths = url("ort/");
const log = (...a) => (document.getElementById("log").textContent += a.join(" ") + "\n");

async function bytes(p) {
  return new Uint8Array(await (await fetch(url(p))).arrayBuffer());
}
async function text(p) {
  return (await fetch(url(p))).text();
}
async function loadImage(file) {
  const img = new Image();
  img.src = url(`images/${file}`);
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext("2d").drawImage(img, 0, 0);
  return c;
}

function sessionOptions(ep, threads) {
  if (threads) ort.env.wasm.numThreads = threads;
  return { executionProviders: ep === "webgpu" ? ["webgpu", "wasm"] : ["wasm"], graphOptimizationLevel: "all" };
}

const engines = {
  async tesseract(cfg) {
    const worker = await createWorker(cfg.lang, 1, {
      workerPath: url("tess/worker.min.js"),
      corePath: url("tess/core/"),
      langPath: url("models/tess/"),
      workerBlobURL: false,
      cacheMethod: "none",
      gzip: true,
    });
    await worker.setParameters({ tessedit_pageseg_mode: cfg.psm ?? "3" });
    return {
      run: async (canvas) => (await worker.recognize(canvas)).data.text,
      close: () => worker.terminate(),
    };
  },

  async paddle(cfg) {
    const opts = sessionOptions(cfg.ep, cfg.threads);
    const dic = await text(`models/${cfg.rec}/dict.txt`);
    const ocr = await esearch.init({
      ort,
      ortOption: opts,
      det: { input: await bytes(`models/${cfg.det}/inference.onnx`) },
      rec: { input: await bytes(`models/${cfg.rec}/${cfg.recFile ?? "inference.onnx"}`), decodeDic: dic, optimize: { space: false } },
    });
    return {
      run: async (canvas) => {
        const r = await ocr.ocr(canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height));
        return { text: r.parragraphs.map((p) => p.text).join("\n"), lines: r.src.length, readingDir: r.readingDir, items: r.src.map((x) => ({ text: x.text, box: x.box })) };
      },
    };
  },

  async mangaocr(cfg) {
    const opts = sessionOptions(cfg.ep, cfg.threads);
    const enc = await ort.InferenceSession.create(await bytes(`models/manga-ocr/encoder_${cfg.q}.onnx`), opts);
    const dec = await ort.InferenceSession.create(await bytes(`models/manga-ocr/decoder_${cfg.q}.onnx`), opts);
    const vocab = (await text("models/manga-ocr/vocab.txt")).split("\n");
    const detector = cfg.det === "comic" ? await comicDetector(opts) : await paddleDetector(cfg.det, opts);
    async function recognize(crop) {
      const pixel = toTensor(crop, 224, 224, true, 0.5, 0.5);
      const { last_hidden_state } = await enc.run({ pixel_values: pixel });
      const ids = [2n];
      for (let i = 0; i < 120; i++) {
        const input_ids = new ort.Tensor("int64", BigInt64Array.from(ids), [1, ids.length]);
        const { logits } = await dec.run({ input_ids, encoder_hidden_states: last_hidden_state });
        const v = logits.dims[2];
        const off = (ids.length - 1) * v;
        const data = await logits.getData();
        let best = 0;
        for (let k = 1; k < v; k++) if (data[off + k] > data[off + best]) best = k;
        if (best === 3) break;
        ids.push(BigInt(best));
      }
      return ids
        .slice(1)
        .map((t) => vocab[Number(t)])
        .filter((t) => !/^\[(CLS|SEP|PAD|UNK|MASK)\]$/.test(t))
        .map((t) => t.replace(/^##/, ""))
        .join("");
    }
    return {
      run: async (canvas) => {
        const boxes = await detector(canvas);
        const items = [];
        for (const b of boxes) items.push({ text: await recognize(cropCanvas(canvas, b, 4)), box: [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]] });
        return { text: items.map((i) => i.text).join("\n"), lines: boxes.length, items };
      },
    };
  },

  async ndl(cfg) {
    if (cfg.threads) ort.env.wasm.numThreads = cfg.threads;
    ndlOrtOptions.executionProviders = cfg.ep === "webgpu" ? ["webgpu", "wasm"] : ["wasm"];
    const layout = new LayoutDetector();
    await layout.initialize((await bytes("models/ndl/deim-s-1024x1024.onnx")).buffer);
    const recs = {};
    for (const [n, w] of [[30, 256], [50, 384], [100, 768]]) {
      recs[n] = new TextRecognizer([1, 3, 16, w]);
      await recs[n].initialize((await bytes(`models/ndl/parseq-ndl-${n}.onnx`)).buffer);
    }
    const pick = (c) => (c === 3 ? recs[30] : c === 2 ? recs[50] : recs[100]);
    const orderer = new ReadingOrderProcessor();
    return {
      run: async (canvas) => {
        const img = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
        const { lines, blocks } = await layout.detect(img);
        const crops = TextRecognizer.cropImageDataBatch(img, lines);
        const results = [];
        for (let i = 0; i < lines.length; i++) results.push({ ...lines[i], text: (await pick(lines[i].charCountCategory).recognizeCropped(crops[i])).text, readingOrder: i + 1 });
        const ordered = orderer.process(results, blocks).filter((b) => b.text);
        const items = results.filter((b) => b.text).map((b) => ({ text: b.text, box: [[b.x, b.y], [b.x + b.width, b.y], [b.x + b.width, b.y + b.height], [b.x, b.y + b.height]] }));
        return { text: ordered.map((b) => b.text).join("\n"), lines: lines.length, items };
      },
    };
  },

  async textdetector() {
    if (typeof TextDetector !== "function") throw new Error("TextDetector is not defined");
    const td = new TextDetector();
    return {
      run: async (canvas) => {
        const r = await td.detect(canvas);
        return { text: r.map((x) => x.rawValue ?? "").join("\n"), lines: r.length };
      },
    };
  },
};

function toTensor(canvas, w, h, gray, mean, std) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const f = new Float32Array(3 * w * h);
  for (let i = 0; i < w * h; i++) {
    let r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255;
    if (gray) r = g = b = 0.299 * r + 0.587 * g + 0.114 * b;
    f[i] = (r - mean) / std;
    f[w * h + i] = (g - mean) / std;
    f[2 * w * h + i] = (b - mean) / std;
  }
  return new ort.Tensor("float32", f, [1, 3, h, w]);
}

function cropCanvas(canvas, [x0, y0, x1, y1], pad) {
  const x = Math.max(0, Math.floor(x0 - pad)), y = Math.max(0, Math.floor(y0 - pad));
  const w = Math.min(canvas.width, Math.ceil(x1 + pad)) - x, h = Math.min(canvas.height, Math.ceil(y1 + pad)) - y;
  const c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  c.getContext("2d").drawImage(canvas, x, y, w, h, 0, 0, w, h);
  return c;
}

function iou(a, b) {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const area = (r) => (r[2] - r[0]) * (r[3] - r[1]);
  return inter / Math.min(area(a), area(b));
}

function mangaOrder(boxes, H) {
  const band = H / 5;
  return boxes.sort((a, b) => Math.floor(a[1] / band) - Math.floor(b[1] / band) || b[2] - a[2]);
}

async function comicDetector(opts) {
  const s = await ort.InferenceSession.create(await bytes("models/comic-det/detector-v4-s_int8.onnx"), opts);
  return async (canvas) => {
    const images = toTensor(canvas, 640, 640, false, 0, 1);
    const sizes = new ort.Tensor("int64", BigInt64Array.from([BigInt(canvas.width), BigInt(canvas.height)]), [1, 2]);
    const r = await s.run({ images, orig_target_sizes: sizes });
    const labels = await r.labels.getData(), boxes = await r.boxes.getData(), scores = await r.scores.getData();
    const keep = [];
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] < 0.4 || Number(labels[i]) === 0) continue;
      const b = Array.from(boxes.slice(i * 4, i * 4 + 4));
      if (keep.some((k) => iou(k, b) > 0.6)) continue;
      keep.push(b);
    }
    return mangaOrder(keep, canvas.height);
  };
}

async function paddleDetector(det, opts) {
  const d = await esearch.initDet({ ort, ortOption: opts, input: await bytes(`models/${det}/inference.onnx`) });
  return async (canvas) => {
    const r = await d.det(canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height));
    const boxes = r.map(({ box }) => {
      const xs = box.map((p) => p[0]), ys = box.map((p) => p[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    });
    return mangaOrder(boxes, canvas.height);
  };
}

window.probe = async () => ({
  ua: navigator.userAgent,
  gpu: !!navigator.gpu && !!(await navigator.gpu.requestAdapter().catch(() => null)),
  isolated: crossOriginIsolated,
  cores: navigator.hardwareConcurrency,
  textDetector: typeof TextDetector === "function",
  languageModel: typeof LanguageModel === "function",
});

window.bench = async (cfg, files, warmRuns = 3) => {
  const t0 = performance.now();
  const engine = await engines[cfg.engine](cfg);
  const initMs = performance.now() - t0;
  const results = [];
  for (const file of files) {
    const canvas = await loadImage(file);
    const c0 = performance.now();
    const first = await engine.run(canvas);
    const firstMs = performance.now() - c0;
    const warm = [];
    for (let i = 0; i < warmRuns; i++) {
      const w0 = performance.now();
      await engine.run(canvas);
      warm.push(performance.now() - w0);
    }
    warm.sort((a, b) => a - b);
    const out = typeof first === "string" ? { text: first } : first;
    results.push({ file, firstMs, warmMs: warm[Math.floor(warm.length / 2)] ?? null, ...out });
  }
  await engine.close?.();
  return { initMs, results };
};
log("ready");
window.ready = true;
