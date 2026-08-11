import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
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
