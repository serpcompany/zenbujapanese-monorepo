import assert from "node:assert/strict";
import test from "node:test";

import { validateHilIdentity } from "../hil-identity-preflight.mjs";

const referenceApp = {
  bundleIdentifier: "com.serpentisei.studyjapanese",
  name: "Nihongo",
  version: "1.34.4",
};

const candidateApp = {
  bundleIdentifier: "com.zenbujapanese.dictionary",
  name: "Zenbu Japanese",
};

function cleanInventory() {
  return {
    includesAllApps: true,
    hilDevice: {
      identifier: "HIL-DEVICE",
      productType: "iPhone15,3",
      apps: [referenceApp, candidateApp],
    },
    candidateArtifact: {
      count: 1,
      bundleIdentifier: "com.zenbujapanese.dictionary",
      displayName: "Zenbu Japanese",
      sourceCommit: "a".repeat(40),
      expectedCommit: "a".repeat(40),
    },
    simulatorDestination: "Zenbu Issue 141 iPhone 16e",
    simulators: [],
  };
}

test("accepts exact all-app role and artifact identity", () => {
  assert.deepEqual(validateHilIdentity(cleanInventory()), []);
});

test("rejects the developer-app-only inventory that hid App Store Nihongo", () => {
  const inventory = cleanInventory();
  inventory.includesAllApps = false;

  assert.ok(validateHilIdentity(inventory).some(({ code }) => code === "INCOMPLETE_APP_INVENTORY"));
});

test("accepts exact reference and candidate apps coexisting on the HIL phone", () => {
  assert.deepEqual(validateHilIdentity(cleanInventory()), []);
});

test("rejects a stale reference version and obsolete clone", () => {
  const inventory = cleanInventory();
  inventory.hilDevice.apps[0] = { ...referenceApp, version: "1.34.3" };
  inventory.hilDevice.apps.push({ bundleIdentifier: "com.example.nihongoclone" });

  const codes = validateHilIdentity(inventory).map(({ code }) => code);
  assert.ok(codes.includes("STALE_REFERENCE_VERSION"));
  assert.ok(codes.includes("HIL_DEVICE_HAS_CLONE"));
});

test("rejects ambiguous artifacts, stale commits, and generic simulator destinations", () => {
  const inventory = cleanInventory();
  inventory.candidateArtifact.count = 2;
  inventory.candidateArtifact.sourceCommit = "b".repeat(40);
  inventory.simulatorDestination = "iPhone 16e";

  const codes = validateHilIdentity(inventory).map(({ code }) => code);
  assert.ok(codes.includes("AMBIGUOUS_CANDIDATE_ARTIFACT"));
  assert.ok(codes.includes("STALE_CANDIDATE_COMMIT"));
  assert.ok(codes.includes("WRONG_SIMULATOR_DESTINATION"));
});

test("rejects identity apps installed on a booted simulator", () => {
  const inventory = cleanInventory();
  inventory.simulators = [{
    name: "iPhone 17 Pro Max",
    state: "Booted",
    apps: [candidateApp],
  }];

  assert.ok(validateHilIdentity(inventory).some(({ code }) => code === "BOOTED_SIMULATOR_CONTAMINATION"));
});
