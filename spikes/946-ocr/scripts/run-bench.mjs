import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import puppeteer from "puppeteer";
import { configs } from "./configs.mjs";

const root = path.resolve(import.meta.dirname, "..");
const ext = path.resolve(root, "../../tmp/agent/ext");
const resultsDir = path.join(root, "results");
fs.mkdirSync(resultsDir, { recursive: true });
const truth = JSON.parse(fs.readFileSync(path.join(root, "images/truth.json"), "utf8"));
const only = process.argv.slice(2);
const warmRuns = Number(process.env.WARM ?? 3);

async function launch(flags = []) {
  const profile = path.resolve(root, "../../tmp/agent/profile-bench");
  fs.rmSync(profile, { recursive: true, force: true });
  const browser = await puppeteer.launch({
    headless: process.env.HEADFUL ? false : true,
    pipe: true,
    enableExtensions: true,
    userDataDir: profile,
    args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", ...flags],
  });
  const id = await browser.installExtension(ext);
  return { browser, id };
}

async function openBench(browser, id) {
  const page = await browser.newPage();
  page.on("console", (m) => m.type() === "error" && console.error("  [page]", m.text().slice(0, 300)));
  await page.goto(`chrome-extension://${id}/bench.html`);
  await page.waitForFunction("window.ready === true", { timeout: 60000 });
  return page;
}

const machine = { cpu: os.cpus()[0].model, memGB: Math.round(os.totalmem() / 2 ** 30), cores: os.cpus().length, os: `${os.type()} ${os.release()}` };

for (const c of configs) {
  if (only.length && !only.includes(c.id)) continue;
  console.log("==", c.id);
  const { browser, id } = await launch(c.flags);
  const version = await browser.version();
  const probePage = await openBench(browser, id);
  const probe = await probePage.evaluate("probe()");
  await probePage.close();
  const rows = [];
  for (const imageId of c.images) {
    const page = await openBench(browser, id);
    try {
      const r = await page.evaluate((cfg, file, warm) => window.bench(cfg, [file], warm), c.cfg, truth[imageId].file, warmRuns);
      const x = r.results[0];
      rows.push({ image: imageId, initMs: r.initMs, firstMs: x.firstMs, coldMs: r.initMs + x.firstMs, warmMs: x.warmMs, text: x.text, lines: x.lines, items: x.items });
      console.log(`  ${imageId} cold=${Math.round(r.initMs + x.firstMs)} warm=${Math.round(x.warmMs)}`);
    } catch (e) {
      rows.push({ image: imageId, error: String(e.message ?? e).slice(0, 500) });
      console.log(`  ${imageId} ERROR ${String(e.message ?? e).slice(0, 200)}`);
    }
    await page.close();
  }
  fs.writeFileSync(path.join(resultsDir, `${c.id}.json`), JSON.stringify({ id: c.id, cfg: c.cfg, chrome: version, probe, machine, warmRuns, rows }, null, 1));
  await browser.close();
}
