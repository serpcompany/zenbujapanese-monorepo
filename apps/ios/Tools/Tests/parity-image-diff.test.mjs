import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { compareImages } from "../parity-image-diff.mjs";

test("image comparison emits an inspectable diff and applies the changed-pixel tolerance", () => {
  const directory = mkdtempSync(join(tmpdir(), "parity-image-diff-"));
  const referencePath = join(directory, "reference.png");
  const clonePath = join(directory, "clone.png");
  const diffPath = join(directory, "diff.png");
  execFileSync("magick", ["-size", "4x4", "xc:black", referencePath]);
  execFileSync("magick", ["-size", "4x4", "xc:black", "-fill", "white", "-draw", "point 0,0", clonePath]);

  const result = compareImages({
    referencePath,
    clonePath,
    diffPath,
    masks: [],
    tolerance: { per_channel: 0, max_changed_pixel_ratio: 0.1 },
  });

  assert.deepEqual(result, {
    width: 4,
    height: 4,
    changed_pixels: 1,
    total_pixels: 16,
    changed_pixel_ratio: 0.0625,
    passed: true,
  });
  assert.equal(existsSync(diffPath), true);
});

test("image comparison emits byte-stable diffs without timestamp metadata", () => {
  const directory = mkdtempSync(join(tmpdir(), "parity-image-diff-stable-"));
  const referencePath = join(directory, "reference.png");
  const clonePath = join(directory, "clone.png");
  const firstDiffPath = join(directory, "first.png");
  const secondDiffPath = join(directory, "second.png");
  execFileSync("magick", ["-size", "4x4", "xc:black", referencePath]);
  execFileSync("magick", ["-size", "4x4", "xc:white", clonePath]);

  const options = {
    referencePath,
    clonePath,
    masks: [],
    tolerance: { per_channel: 0, max_changed_pixel_ratio: 1 },
  };
  compareImages({ ...options, diffPath: firstDiffPath });
  compareImages({ ...options, diffPath: secondDiffPath });

  const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
  assert.equal(hash(firstDiffPath), hash(secondDiffPath));
  const png = readFileSync(firstDiffPath);
  const chunkTypes = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    chunkTypes.push(png.toString("ascii", offset + 4, offset + 8));
    offset += length + 12;
  }
  assert.equal(chunkTypes.includes("tIME"), false);
});
