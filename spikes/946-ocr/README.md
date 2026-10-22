# Spike #946: Japanese OCR in a Chrome extension page

Throwaway. Never merged. It runs each OCR candidate inside an MV3 extension page in Chrome, on one fixed set of images, and scores the text against hand-checked ground truth.

## Run it

```sh
npm install
# fetch the models (see below) into models/
node scripts/dicts.mjs          # writes models/*_rec/dict.txt from inference.yml
node scripts/render-images.mjs  # renders images/*.png and images/truth.json (needs ffmpeg)
node scripts/build-ext.mjs      # bundles the extension into ../../tmp/agent/ext
node scripts/run-bench.mjs [config ids]   # one fresh Chrome for Testing profile per config
node scripts/score.mjs          # prints the CER table, writes results/_scores.json
```

`scripts/configs.mjs` lists the configs. `WARM=3` sets the warm runs; `HEADFUL=1` shows the browser.

Chrome is Puppeteer's Chrome for Testing (`node scripts/which.mjs`), headless, with `--enable-unsafe-webgpu`. The page is cross-origin isolated (COOP and COEP in the manifest), so ONNX Runtime Web runs threaded WASM.

## Models (not committed)

```sh
cd models
for m in PP-OCRv6_tiny_det PP-OCRv6_small_det PP-OCRv5_mobile_det PP-OCRv6_tiny_rec PP-OCRv6_small_rec PP-OCRv6_medium_rec PP-OCRv5_mobile_rec; do
  mkdir -p $m
  curl -sL -o $m/inference.onnx https://huggingface.co/PaddlePaddle/${m}_onnx/resolve/main/inference.onnx
  curl -sL -o $m/inference.yml  https://huggingface.co/PaddlePaddle/${m}_onnx/resolve/main/inference.yml
done
mkdir -p japan_PP-OCRv3_rec && curl -sL -o japan.zip https://github.com/xushengfeng/eSearch-OCR/releases/download/4.0.0/japan.zip
#   unzip; japan_rec.onnx -> japan_PP-OCRv3_rec/inference.onnx, japan_dict.txt -> japan_PP-OCRv3_rec/dict.txt
mkdir -p manga-ocr && H=https://huggingface.co/onnx-community/manga-ocr-base-ONNX/resolve/main
curl -sL -o manga-ocr/encoder_q8.onnx    $H/onnx/encoder_model_quantized.onnx
curl -sL -o manga-ocr/decoder_q8.onnx    $H/onnx/decoder_model_quantized.onnx
curl -sL -o manga-ocr/encoder_q4f16.onnx $H/onnx/encoder_model_q4f16.onnx
curl -sL -o manga-ocr/decoder_q4f16.onnx $H/onnx/decoder_model_q4f16.onnx
curl -sL -o manga-ocr/config.json        $H/config.json
curl -sL -o manga-ocr/vocab.txt https://huggingface.co/kha-white/manga-ocr-base/resolve/main/vocab.txt
mkdir -p comic-det && curl -sL -o comic-det/detector-v4-s_int8.onnx https://huggingface.co/ogkalu/comic-text-and-bubble-detector/resolve/main/detector-v4-s_int8.onnx
mkdir -p tess && for l in jpn jpn_vert; do curl -sL -o tess/$l.traineddata.gz https://cdn.jsdelivr.net/npm/@tesseract.js-data/$l/4.0.0_best_int/$l.traineddata.gz; done
# NDLOCR-Lite: public/models/*.onnx and public/config/NDLmoji.yaml from https://codeload.github.com/yuta1984/ndlocrlite-web/tar.gz/HEAD -> models/ndl/
```

## Images

| Image | What | Source and licence |
| --- | --- | --- |
| `h1-web` | Horizontal article page, 1280x800 | Rendered here. My own text, plus the opening of 吾輩は猫である (Natsume Soseki, public domain, Aozora Bunko) |
| `h2-furigana` | Horizontal text with ruby | Rendered here. My own text |
| `v1-vertical` | Vertical text, Hiragino Mincho | Rendered here. 蜘蛛の糸 opening (Akutagawa Ryunosuke, public domain, Aozora Bunko) |
| `v2-vertical-ruby` | Vertical text with ruby | Rendered here. 銀河鉄道の夜 opening (Miyazawa Kenji, public domain, Aozora Bunko) |
| `m1-manga-p1`, `m2-manga-p2` | Manga pages 1 and 2 | "いけいけ！百科事典娘" Wikipe-tan manga by カスガ, CC BY-SA 3.0, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Wikipe-tan_manga_page1.jpg) ([page 2](https://commons.wikimedia.org/wiki/File:Wikipe-tan_manga_page2.jpg)). Ground truth transcribed here; fine print, furigana and the puzzle-piece marks left out |
| `f1-video-subtitle`, `f2-video-telop` | Video frames with burned-in captions | Frames at 5 s and 29 s of the Sintel trailer, (c) Blender Foundation, CC BY 3.0, [durian.blender.org](https://durian.blender.org/). Captions are my own text, drawn over the frame and re-encoded with H.264 (crf 30) |

`images/truth.json` holds the ground truth. `images/defs.mjs` defines every rendered image.

## Scoring

CER is the Levenshtein distance over the ground truth's length, after NFKC and keeping only letters and digits, so punctuation and spacing don't count. Three readings:

- **Engine order:** the text as the engine joins it.
- **Layout order:** the engine's boxes put in reading order by `scripts/layout.mjs` (vertical columns right to left, a small-kana-only line beside a bigger one dropped as furigana).
- **Order-free:** max(missing, extra) characters over length; recognition quality alone.

Cold is engine start (fetch the model from the extension, create the session) plus the first image. Warm is the median of three later runs on the same page.

## Vendored code

`vendor/ndlocrlite-web/` is from [yuta1984/ndlocrlite-web](https://github.com/yuta1984/ndlocrlite-web), CC BY 4.0, (c) 2025 Yuta Hashimoto; `worker/onnx-config.ts` there is mine. NDLOCR-Lite itself is by the National Diet Library, CC BY 4.0, and its layout model also falls under the DINOv3 License.
