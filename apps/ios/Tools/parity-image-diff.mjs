import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function runMagick(arguments_, { acceptedStatuses = [0] } = {}) {
  const result = spawnSync("magick", arguments_, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (!acceptedStatuses.includes(result.status)) {
    throw new Error(`ImageMagick failed (${result.status}): ${(result.stderr || result.stdout).trim()}`);
  }
  return result;
}

function imageSize(path) {
  const result = runMagick(["identify", "-format", "%w %h", path]);
  const [width, height] = result.stdout.trim().split(/\s+/).map(Number);
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new Error(`Could not read image dimensions for ${path}.`);
  }
  return { width, height };
}

function maskedCopy(source, destination, masks) {
  const arguments_ = [source];
  for (const mask of masks) {
    const right = mask.x + mask.width - 1;
    const bottom = mask.y + mask.height - 1;
    arguments_.push("-fill", "black", "-draw", `rectangle ${mask.x},${mask.y} ${right},${bottom}`);
  }
  arguments_.push(destination);
  runMagick(arguments_);
}

export function compareImages({ referencePath, clonePath, diffPath, masks, tolerance }) {
  if (!Array.isArray(masks)) throw new Error("masks must be an explicit array.");
  if (!Number.isFinite(tolerance?.per_channel) || tolerance.per_channel < 0 || tolerance.per_channel > 255) {
    throw new Error("tolerance.per_channel must be between 0 and 255.");
  }
  if (!Number.isFinite(tolerance?.max_changed_pixel_ratio)
    || tolerance.max_changed_pixel_ratio < 0
    || tolerance.max_changed_pixel_ratio > 1) {
    throw new Error("tolerance.max_changed_pixel_ratio must be between 0 and 1.");
  }

  const referenceSize = imageSize(referencePath);
  const cloneSize = imageSize(clonePath);
  if (referenceSize.width !== cloneSize.width || referenceSize.height !== cloneSize.height) {
    throw new Error(`Image dimensions differ: reference is ${referenceSize.width}x${referenceSize.height}, clone is ${cloneSize.width}x${cloneSize.height}.`);
  }

  const temporaryDirectory = mkdtempSync(join(tmpdir(), "parity-image-diff-"));
  try {
    const maskedReference = join(temporaryDirectory, "reference.png");
    const maskedClone = join(temporaryDirectory, "clone.png");
    maskedCopy(referencePath, maskedReference, masks);
    maskedCopy(clonePath, maskedClone, masks);
    mkdirSync(dirname(diffPath), { recursive: true });
    const fuzzPercent = (tolerance.per_channel / 255) * 100;
    const comparison = runMagick([
      "compare",
      "-metric", "AE",
      "-fuzz", `${fuzzPercent}%`,
      maskedReference,
      maskedClone,
      diffPath,
    ], { acceptedStatuses: [0, 1] });
    const changedPixels = Number.parseInt(comparison.stderr.trim().split(/\s+/)[0], 10);
    if (!Number.isFinite(changedPixels)) {
      throw new Error(`Could not parse ImageMagick changed-pixel count: ${comparison.stderr.trim()}`);
    }
    const totalPixels = referenceSize.width * referenceSize.height;
    const changedPixelRatio = changedPixels / totalPixels;
    return {
      ...referenceSize,
      changed_pixels: changedPixels,
      total_pixels: totalPixels,
      changed_pixel_ratio: changedPixelRatio,
      passed: changedPixelRatio <= tolerance.max_changed_pixel_ratio,
    };
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function optionValue(arguments_, name) {
  const index = arguments_.lastIndexOf(name);
  return index === -1 ? undefined : arguments_[index + 1];
}

export function main(arguments_ = process.argv.slice(2)) {
  const referencePath = resolve(optionValue(arguments_, "--reference"));
  const clonePath = resolve(optionValue(arguments_, "--clone"));
  const diffPath = resolve(optionValue(arguments_, "--diff"));
  const masksPath = optionValue(arguments_, "--masks");
  return compareImages({
    referencePath,
    clonePath,
    diffPath,
    masks: masksPath ? JSON.parse(readFileSync(resolve(masksPath), "utf8")) : [],
    tolerance: {
      per_channel: Number(optionValue(arguments_, "--per-channel") ?? 0),
      max_changed_pixel_ratio: Number(optionValue(arguments_, "--max-changed-pixel-ratio") ?? 0),
    },
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    const result = main();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.passed) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
