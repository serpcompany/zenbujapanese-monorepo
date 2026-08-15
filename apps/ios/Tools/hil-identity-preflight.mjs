#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const expected = Object.freeze({
  referenceBundle: "com.serpentisei.studyjapanese",
  referenceVersion: "1.34.4",
  referenceProductType: "iPhone18,2",
  candidateBundle: "com.zenbujapanese.dictionary",
  candidateDisplayName: "Zenbu Japanese",
  candidateProductType: "iPhone15,3",
  simulatorDestination: "Zenbu Issue 141 iPhone 16e",
});

const disallowedCloneBundles = [
  "com.zenbujapanese.nihongoclone",
  "com.zenbujapanese.replica",
  "com.devinschumacher.zenbu-japanese",
  "com.devinschumacher.zenbu-japanese.native",
  "com.example.nihongoclone",
  "com.devin.nihongoproclone",
  "com.serp.prototype.nihongo.lookup",
];

function problem(code, message) {
  return { code, message };
}

function appsWithBundlePrefix(apps, prefix) {
  return apps.filter(({ bundleIdentifier = "" }) => bundleIdentifier === prefix || bundleIdentifier.startsWith(`${prefix}.`));
}

function cloneApps(apps) {
  return apps.filter(({ bundleIdentifier = "" }) => disallowedCloneBundles.includes(bundleIdentifier));
}

export function validateHilIdentity(inventory) {
  const problems = [];
  const reference = inventory.reference ?? { apps: [] };
  const candidate = inventory.candidate ?? { apps: [] };
  const artifact = inventory.candidateArtifact ?? {};

  if (inventory.includesAllApps !== true) {
    problems.push(problem(
      "INCOMPLETE_APP_INVENTORY",
      "Physical-device inventory must come from devicectl device info apps --include-all-apps.",
    ));
  }

  if (!reference.identifier || reference.identifier === candidate.identifier) {
    problems.push(problem("DEVICE_ROLE_OVERLAP", "Reference and candidate must resolve to two distinct physical devices."));
  }
  if (reference.productType !== expected.referenceProductType) {
    problems.push(problem("WRONG_REFERENCE_DEVICE", `Reference must be ${expected.referenceProductType}.`));
  }
  if (candidate.productType !== expected.candidateProductType) {
    problems.push(problem("WRONG_CANDIDATE_DEVICE", `Candidate must be ${expected.candidateProductType}.`));
  }

  const referenceApps = reference.apps ?? [];
  const candidateApps = candidate.apps ?? [];
  const exactReferences = referenceApps.filter(({ bundleIdentifier }) => bundleIdentifier === expected.referenceBundle);
  if (exactReferences.length !== 1) {
    problems.push(problem("MISSING_OR_AMBIGUOUS_REFERENCE_APP", "Reference device must contain exactly one real Nihongo app."));
  } else if (exactReferences[0].version !== expected.referenceVersion) {
    problems.push(problem(
      "STALE_REFERENCE_VERSION",
      `Reference Nihongo must be ${expected.referenceVersion}, not ${exactReferences[0].version ?? "unknown"}.`,
    ));
  }
  if (appsWithBundlePrefix(referenceApps, "com.zenbujapanese").length > 0 || cloneApps(referenceApps).length > 0) {
    problems.push(problem("REFERENCE_DEVICE_HAS_CANDIDATE", "Reference device contains a Zenbu or clone build."));
  }

  const exactCandidates = candidateApps.filter(({ bundleIdentifier }) => bundleIdentifier === expected.candidateBundle);
  if (exactCandidates.length !== 1) {
    problems.push(problem("MISSING_OR_AMBIGUOUS_CANDIDATE_APP", "Candidate device must contain exactly one Zenbu candidate app."));
  }
  if (candidateApps.some(({ bundleIdentifier }) => bundleIdentifier === expected.referenceBundle)) {
    problems.push(problem("CANDIDATE_DEVICE_HAS_REFERENCE", "Candidate device contains the Nihongo reference app."));
  }
  if (cloneApps(candidateApps).length > 0) {
    problems.push(problem("CANDIDATE_DEVICE_HAS_CLONE", "Candidate device contains an obsolete clone or replica app."));
  }

  if (artifact.count !== 1) {
    problems.push(problem("AMBIGUOUS_CANDIDATE_ARTIFACT", "Preflight requires exactly one explicit candidate .app artifact."));
  }
  if (artifact.bundleIdentifier !== expected.candidateBundle || artifact.displayName !== expected.candidateDisplayName) {
    problems.push(problem("WRONG_CANDIDATE_ARTIFACT", "Candidate artifact identity does not match Zenbu Japanese."));
  }
  if (!artifact.sourceCommit || artifact.sourceCommit !== artifact.expectedCommit) {
    problems.push(problem("STALE_CANDIDATE_COMMIT", "Candidate artifact source commit does not match the frozen expected commit."));
  }

  if (inventory.simulatorDestination !== expected.simulatorDestination) {
    problems.push(problem(
      "WRONG_SIMULATOR_DESTINATION",
      `Simulator evidence must use ${expected.simulatorDestination}, not a generic destination.`,
    ));
  }
  if ((inventory.simulators ?? []).some(({ state }) => state === "Booted")) {
    problems.push(problem("BOOTED_SIMULATOR_CONTAMINATION", "All simulators must be shut down before physical HIL."));
  }

  return problems;
}

function run(command, arguments_) {
  const result = spawnSync(command, arguments_, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${arguments_.join(" ")} failed: ${result.stderr || result.stdout}`.trim());
  }
  return result.stdout;
}

function devicectlJson(scratch, filename, arguments_) {
  const output = join(scratch, filename);
  run("xcrun", ["devicectl", ...arguments_, "--json-output", output]);
  return JSON.parse(readFileSync(output, "utf8"));
}

function optionValues(arguments_, name) {
  const values = [];
  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] === name) values.push(arguments_[index + 1]);
  }
  return values;
}

function requiredOption(arguments_, name) {
  const [value] = optionValues(arguments_, name);
  if (!value) throw new Error(`Missing required option ${name}.`);
  return value;
}

function plistValue(infoPlist, key) {
  return run("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, infoPlist]).trim();
}

export function collectLiveInventory(arguments_) {
  const referenceDevice = requiredOption(arguments_, "--reference-device");
  const candidateDevice = requiredOption(arguments_, "--candidate-device");
  const expectedCommit = requiredOption(arguments_, "--expected-commit");
  const candidateArtifacts = optionValues(arguments_, "--candidate-artifact").map((path) => resolve(path));
  const simulatorDestination = requiredOption(arguments_, "--simulator-destination");
  const scratch = mkdtempSync(join(tmpdir(), "zenbu-hil-identity-"));

  try {
    const devices = devicectlJson(scratch, "devices.json", ["list", "devices"]).result.devices ?? [];
    const device = (identifier) => devices.find((item) => item.identifier === identifier) ?? {};
    const apps = (identifier, filename) => devicectlJson(scratch, filename, [
      "device", "info", "apps", "--include-all-apps", "--device", identifier,
    ]).result.apps ?? [];
    const simulatorJson = JSON.parse(run("xcrun", ["simctl", "list", "devices", "available", "-j"]));
    const simulators = Object.values(simulatorJson.devices ?? {}).flat().map(({ name, state, udid }) => ({ name, state, udid }));
    const sourceCommit = run("git", ["rev-parse", "HEAD"]).trim();
    const [candidateArtifact] = candidateArtifacts;
    const infoPlist = candidateArtifact ? join(candidateArtifact, "Info.plist") : "";

    return {
      includesAllApps: true,
      reference: {
        identifier: referenceDevice,
        productType: device(referenceDevice).hardwareProperties?.productType,
        apps: apps(referenceDevice, "reference-apps.json"),
      },
      candidate: {
        identifier: candidateDevice,
        productType: device(candidateDevice).hardwareProperties?.productType,
        apps: apps(candidateDevice, "candidate-apps.json"),
      },
      candidateArtifact: {
        count: candidateArtifacts.length,
        bundleIdentifier: candidateArtifact ? plistValue(infoPlist, "CFBundleIdentifier") : undefined,
        displayName: candidateArtifact ? plistValue(infoPlist, "CFBundleDisplayName") : undefined,
        sourceCommit,
        expectedCommit,
        name: candidateArtifact ? basename(candidateArtifact) : undefined,
      },
      simulatorDestination,
      simulators,
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export function main(arguments_ = process.argv.slice(2)) {
  const inventoryPath = optionValues(arguments_, "--inventory")[0];
  const inventory = inventoryPath
    ? JSON.parse(readFileSync(resolve(inventoryPath), "utf8"))
    : collectLiveInventory(arguments_);
  const problems = validateHilIdentity(inventory);
  process.stdout.write(`${JSON.stringify({ status: problems.length === 0 ? "pass" : "fail", problems }, null, 2)}\n`);
  return problems.length === 0 ? 0 : 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
