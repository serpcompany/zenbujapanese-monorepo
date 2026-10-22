const all = ["h1-web", "h2-furigana", "v1-vertical", "v2-vertical-ruby", "m1-manga-p1", "m2-manga-p2", "f1-video-subtitle", "f2-video-telop"];
const vertical = ["v1-vertical", "v2-vertical-ruby", "m1-manga-p1", "m2-manga-p2"];

const paddle = (id, det, rec, ep, extra = {}) => ({ id, images: all, cfg: { engine: "paddle", det, rec, ep, ...extra } });

export const configs = [
  { id: "tess-jpn", images: all, cfg: { engine: "tesseract", lang: "jpn", psm: "3" } },
  { id: "tess-jpn_vert-psm5", images: vertical, cfg: { engine: "tesseract", lang: "jpn_vert", psm: "5" } },
  paddle("paddle-v6small-wasm", "PP-OCRv6_tiny_det", "PP-OCRv6_small_rec", "wasm"),
  paddle("paddle-v6small-webgpu", "PP-OCRv6_tiny_det", "PP-OCRv6_small_rec", "webgpu"),
  paddle("paddle-v5mobile-wasm", "PP-OCRv5_mobile_det", "PP-OCRv5_mobile_rec", "wasm"),
  paddle("paddle-v5mobile-webgpu", "PP-OCRv5_mobile_det", "PP-OCRv5_mobile_rec", "webgpu"),
  paddle("paddle-v6medium-wasm", "PP-OCRv6_small_det", "PP-OCRv6_medium_rec", "wasm"),
  paddle("paddle-japanv3-wasm", "PP-OCRv5_mobile_det", "japan_PP-OCRv3_rec", "wasm"),
  paddle("paddle-v6small-wasm-1thread", "PP-OCRv6_tiny_det", "PP-OCRv6_small_rec", "wasm", { threads: 1 }),
  { id: "mangaocr-comicdet-q8-wasm", images: all, cfg: { engine: "mangaocr", det: "comic", q: "q8", ep: "wasm" } },
  paddle("paddle-v6small-wasm-4thread", "PP-OCRv6_tiny_det", "PP-OCRv6_small_rec", "wasm", { threads: 4 }),
  { id: "mangaocr-comicdet-q8-webgpu", images: all, cfg: { engine: "mangaocr", det: "comic", q: "q8", ep: "webgpu" } },
  { id: "mangaocr-comicdet-q8-wasm-4thread", images: all, cfg: { engine: "mangaocr", det: "comic", q: "q8", ep: "wasm", threads: 4 } },
  { id: "mangaocr-comicdet-q4f16-webgpu", images: all, cfg: { engine: "mangaocr", det: "comic", q: "q4f16", ep: "webgpu" } },
  { id: "mangaocr-paddledet-q8-wasm", images: all, cfg: { engine: "mangaocr", det: "PP-OCRv5_mobile_det", q: "q8", ep: "wasm" } },
  { id: "ndl-wasm", images: all, cfg: { engine: "ndl", ep: "wasm" } },
  { id: "ndl-webgpu", images: all, cfg: { engine: "ndl", ep: "webgpu" } },
  { id: "textdetector", images: all, cfg: { engine: "textdetector" }, flags: ["--enable-experimental-web-platform-features"] },
];
