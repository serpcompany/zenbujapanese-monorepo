import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import puppeteer from "puppeteer";
import { images } from "../images/defs.mjs";

const dir = path.resolve(import.meta.dirname, "../images");
const tmp = path.resolve(import.meta.dirname, "../../../tmp/agent/render");
fs.mkdirSync(tmp, { recursive: true });
const browser = await puppeteer.launch({ headless: true, userDataDir: path.join(tmp, "profile") });
const page = await browser.newPage();
const truth = {};
for (const img of images) {
  truth[img.id] = { kind: img.kind, file: img.file ?? `${img.id}.png`, truth: img.truth };
  if (!img.html) continue;
  const htmlPath = path.join(dir, `_${img.id}.html`);
  fs.writeFileSync(htmlPath, `<!doctype html><meta charset="utf-8">${img.html}`);
  await page.setViewport({ width: img.viewport[0], height: img.viewport[1], deviceScaleFactor: 1 });
  await page.goto(`file://${htmlPath}`);
  await page.evaluate(() => document.fonts.ready);
  const out = path.join(dir, `${img.id}.png`);
  if (img.video) {
    const still = path.join(tmp, `${img.id}-still.png`);
    const mp4 = path.join(tmp, `${img.id}.mp4`);
    await page.screenshot({ path: still });
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-loop", "1", "-i", still, "-t", "1", "-r", "25", "-c:v", "libx264", "-crf", "30", "-pix_fmt", "yuv420p", mp4]);
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-ss", "0.5", "-i", mp4, "-frames:v", "1", out]);
  } else {
    await page.screenshot({ path: out });
  }
  fs.unlinkSync(htmlPath);
}
fs.writeFileSync(path.join(dir, "truth.json"), JSON.stringify(truth, null, 1));
await browser.close();
console.log(Object.keys(truth).join(" "));
