import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  compileLedger,
  xcodeSigningBuildSettings,
  testsFromTree,
  validateBuildConfiguration,
  validateEvidenceRun,
  validateExecutionPlan,
  validateObservation,
  validateRequiredAttachmentCaptures,
  validateRecordedTests,
} from "../parity-ledger.mjs";

test("search dictionary plan reserves one three-environment matrix for the frozen commit", () => {
  const plan = JSON.parse(readFileSync("apps/ios/Parity/search-dictionary-plan.json", "utf8"));

  assert.equal(plan.minimum_complete_runs, 1);
  assert.deepEqual(plan.minimum_complete_runs_by_environment, Object.fromEntries(
    plan.environments.map((environmentId) => [environmentId, 1]),
  ));
  assert.deepEqual(plan.execution_policy, {
    development: "affected_tests_only",
    final_acceptance: "complete_matrix_on_frozen_commit",
  });
});

test("signed-device blocking plan verifies image ingestion without requiring camera capture", () => {
  const plan = JSON.parse(readFileSync("apps/ios/Parity/search-dictionary-plan.json", "utf8"));
  const scope = JSON.parse(readFileSync("docs/clone-discovery/nihongo/scope.json", "utf8"));
  const physicalTests = plan.environment_test_ids.signed_physical_device;

  assert.ok(physicalTests.includes("SearchReplicaJourneyUITests/testPhotoLibrarySelectionStartsImageTextFlow()"));
  assert.ok(physicalTests.includes("SearchReplicaJourneyUITests/testImageTextFilesSourceOpensThePublicMultipleSelectionPicker()"));
  assert.ok(!physicalTests.includes("SearchReplicaJourneyUITests/testCameraCaptureStartsImageTextFlow()"));
  assert.ok(!scope.blocking_journey_ids.includes("JOURNEY-IMAGE-TAKE-PHOTO"));
});

test("signed-device crawls pass explicit Xcode signing settings", () => {
  const arguments_ = [
    "--development-team", "847HR8U8D9",
    "--code-sign-style", "Automatic",
  ];
  assert.deepEqual(xcodeSigningBuildSettings(arguments_, "signed_physical_device"), [
    "DEVELOPMENT_TEAM=847HR8U8D9",
    "CODE_SIGN_STYLE=Automatic",
  ]);
  assert.deepEqual(xcodeSigningBuildSettings(arguments_, "debug_simulator"), []);
});

test("build configuration is derived from the hashed Xcode request and product path", () => {
  assert.deepEqual(validateBuildConfiguration({
    run_id: "RUN-RELABELED",
    environment_id: "signed_physical_device",
    configuration: "Release",
    artifact: { path: "DerivedData/Build/Products/Debug-iphoneos/Zenbu Japanese.app" },
  }, {
    parameters: { configurationName: "Debug" },
  }), [{
    code: "BUILD_CONFIGURATION_MISMATCH",
    message: "Run RUN-RELABELED configuration does not match its hashed Xcode build request and product path.",
  }]);
});

test("evidence validation rejects a run captured from a different commit", () => {
  const run = {
    schema_version: 1,
    run_id: "RUN-001",
    source_commit: "captured-commit",
    artifact: { path: "ZenbuJapanese.app", sha256: "a".repeat(64) },
    xcresult: { path: "Parity.xcresult", sha256: "b".repeat(64) },
    device: { platform: "iOS Simulator", name: "iPhone 17 Pro Max", os_version: "26.0.1" },
    observations: [],
    attachments: [],
  };

  assert.deepEqual(validateEvidenceRun(run, { expectedCommit: "current-commit" }), [
    {
      code: "STALE_SOURCE_COMMIT",
      message: "Run RUN-001 was captured from captured-commit, not current-commit.",
    },
  ]);
});

test("evidence validation rejects a mismatched artifact hash", () => {
  const runRoot = mkdtempSync(join(tmpdir(), "parity-ledger-"));
  mkdirSync(join(runRoot, "Build"));
  mkdirSync(join(runRoot, "Results"));
  mkdirSync(join(runRoot, "Attachments"));
  writeFileSync(join(runRoot, "Build", "ZenbuJapanese.app"), "artifact\n");
  writeFileSync(join(runRoot, "Results", "Parity.xcresult"), "xcresult\n");

  const run = {
    schema_version: 1,
    run_id: "RUN-002",
    source_commit: "current-commit",
    artifact: { path: "Build/ZenbuJapanese.app", sha256: "0".repeat(64) },
    xcresult: {
      path: "Results/Parity.xcresult",
      sha256: "a3b806a7afc22fe989791c800a816bee07d6edbcd3963fe01c292428ee09b12c",
    },
    device: { platform: "iOS Simulator", name: "iPhone 17 Pro Max", os_version: "26.0.1" },
    attachment_root: "Attachments",
    observations: [],
    attachments: [],
  };

  assert.deepEqual(validateEvidenceRun(run, { expectedCommit: "current-commit", runRoot }), [
    {
      code: "HASH_MISMATCH",
      message: "artifact Build/ZenbuJapanese.app has SHA-256 5b3513f580c8397212ff2c8f459c199efc0c90e4354a5f3533adf0a3fff3a530, not 0000000000000000000000000000000000000000000000000000000000000000.",
    },
  ]);
});

test("evidence validation rejects frames that are not registered in the run", () => {
  const runRoot = mkdtempSync(join(tmpdir(), "parity-ledger-"));
  mkdirSync(join(runRoot, "Attachments"));
  writeFileSync(join(runRoot, "Attachments", "registered.png"), "frame\n");
  writeFileSync(join(runRoot, "Attachments", "rogue.png"), "rogue\n");

  const run = {
    schema_version: 1,
    run_id: "RUN-003",
    source_commit: "current-commit",
    artifact: null,
    xcresult: null,
    device: { platform: "iOS Simulator", name: "iPhone 17 Pro Max", os_version: "26.0.1" },
    attachment_root: "Attachments",
    observations: [],
    attachments: [
      {
        path: "Attachments/registered.png",
        sha256: "3c04009b8f1d7bee2e496be23c08761744b26c499ca15f3c125643be85c86e0c",
        media_type: "image/png",
      },
    ],
  };

  assert.deepEqual(validateEvidenceRun(run, { expectedCommit: "current-commit", runRoot }), [
    {
      code: "UNREGISTERED_ATTACHMENT",
      message: "Attachments/rogue.png exists below Attachments but is not registered by RUN-003.",
    },
  ]);
});

test("required signed-device captures are bound to their XCTest and retained name", () => {
  const plan = {
    required_attachment_captures_by_environment: {
      signed_physical_device: [{
        test_id: "Suite/testCamera()",
        name_prefix: "production-camera-preview",
      }],
    },
  };
  const run = { run_id: "RUN-CAMERA", environment_id: "signed_physical_device" };
  const manifest = [{
    testIdentifier: "Suite/testCamera()",
    attachments: [{
      suggestedHumanReadableName: "production-camera-preview_0_1234.png",
    }],
  }];

  assert.deepEqual(validateRequiredAttachmentCaptures(plan, run, manifest), []);
  assert.deepEqual(validateRequiredAttachmentCaptures(plan, run, []), [{
    code: "MISSING_REQUIRED_TEST_ATTACHMENT",
    message: "Run RUN-CAMERA is missing production-camera-preview from Suite/testCamera().",
  }]);
});

test("ledger compilation records exact clone evidence and XCTest IDs on covered rows", () => {
  const ledger = [
    {
      id: "PARITY-ACTION-SEARCH-001",
      journey_ids: ["JOURNEY-SEARCH-TEXT"],
      discovery_status: "ready_input",
      clone_status: "unknown",
      test_status: "not_run",
      allowed_variance: [],
    },
    {
      id: "PARITY-SURFACE-BOUNDARY",
      journey_ids: ["JOURNEY-EXCLUDED"],
      discovery_status: "excluded",
      clone_status: "unknown",
      test_status: "not_run",
      allowed_variance: [],
    },
  ];
  const run = {
    run_id: "RUN-004",
    observations: [
      {
        observation_id: "OBS-SEARCH-001",
        row_ids: ["PARITY-ACTION-SEARCH-001"],
        test_id: "SearchReplicaJourneyUITests/testJapaneseQueryOpensWordDetailAndBackPreservesResults()",
        classification: "exact",
        test_status: "passed",
        reference_evidence: ["reference/search-results.png"],
        clone_evidence: ["Attachments/search-results.png"],
        semantic_observations: ["Best Matches is visible."],
        action_observations: ["Selecting 問題 opens Word Detail."],
      },
    ],
  };

  const result = compileLedger(ledger, [run], {
    requiredJourneyIds: ["JOURNEY-SEARCH-TEXT"],
  });

  assert.equal(result.rows[0].clone_status, "exact");
  assert.equal(result.rows[0].test_status, "passed");
  assert.deepEqual(result.rows[0].clone_evidence, {
    run_ids: ["RUN-004"],
    observation_ids: ["OBS-SEARCH-001"],
    test_ids: ["SearchReplicaJourneyUITests/testJapaneseQueryOpensWordDetailAndBackPreservesResults()"],
    reference_evidence: ["reference/search-results.png"],
    clone_evidence: ["Attachments/search-results.png"],
  });
  assert.equal(result.rows[1].clone_status, "excluded");
  assert.equal(result.rows[1].test_status, "not_applicable");
  assert.deepEqual(result.report.blocking, {
    rows: 1,
    exact: 1,
    approved_variance: 0,
    defects: 0,
    access_blockers: 0,
    unknown: 0,
    passed: 1,
    failed: 0,
    blocked: 0,
    not_run: 0,
    unexplained: 0,
  });
});

test("evidence validation rejects visual observations without a comparison contract", () => {
  const run = {
    schema_version: 1,
    run_id: "RUN-005",
    source_commit: "current-commit",
    artifact: null,
    xcresult: null,
    device: { platform: "iOS Simulator", name: "iPhone 17 Pro Max", os_version: "26.0.1" },
    observations: [
      {
        observation_id: "OBS-VISUAL-001",
        row_ids: ["PARITY-STATE-RESULTS"],
        test_id: "SearchReplicaJourneyUITests/testJapaneseQueryOpensWordDetailAndBackPreservesResults()",
        classification: "exact",
        test_status: "passed",
        reference_evidence: ["reference/results.png"],
        clone_evidence: ["Attachments/results.png"],
        semantic_observations: ["Best Matches and Additional Matches are visible."],
        action_observations: ["The result settles after entering 問題."],
      },
    ],
    attachments: [],
  };
  const ledger = [
    { id: "PARITY-STATE-RESULTS", parity_dimensions: ["visual", "state-data"] },
  ];

  assert.deepEqual(validateEvidenceRun(run, { expectedCommit: "current-commit", ledger }), [
    {
      code: "MISSING_VISUAL_COMPARISON",
      message: "OBS-VISUAL-001 covers visual row PARITY-STATE-RESULTS without a paired diff, masks, and tolerances.",
    },
  ]);
});

test("ledger compilation emits journey-sized correction input for a defect", () => {
  const ledger = [
    {
      id: "PARITY-ACTION-CAMERA-001",
      claim: "Take Photo opens the system camera.",
      journey_ids: ["JOURNEY-IMAGE-TAKE-PHOTO"],
      discovery_status: "ready_input",
      clone_status: "unknown",
      test_status: "not_run",
      allowed_variance: [],
    },
  ];
  const run = {
    run_id: "RUN-006",
    observations: [
      {
        observation_id: "OBS-CAMERA-001",
        row_ids: ["PARITY-ACTION-CAMERA-001"],
        journey_ids: ["JOURNEY-IMAGE-TAKE-PHOTO"],
        test_id: "SearchReplicaJourneyUITests/testCameraCaptureStartsImageTextFlow()",
        classification: "defect",
        test_status: "failed",
        summary: "Take Photo reports Camera unavailable",
        reproduction: ["Open Search", "Open image sources", "Select Take Photo"],
        expected: "The system camera opens.",
        actual: "An unavailable alert appears.",
        reference_evidence: ["reference/camera-open.png"],
        clone_evidence: ["Attachments/camera-unavailable.png"],
      },
    ],
  };

  const result = compileLedger(ledger, [run], {
    requiredJourneyIds: ["JOURNEY-IMAGE-TAKE-PHOTO"],
  });

  assert.deepEqual(result.corrections, [
    {
      journey_id: "JOURNEY-IMAGE-TAKE-PHOTO",
      title: "[Parity] Take Photo reports Camera unavailable",
      row_ids: ["PARITY-ACTION-CAMERA-001"],
      observation_ids: ["OBS-CAMERA-001"],
      test_ids: ["SearchReplicaJourneyUITests/testCameraCaptureStartsImageTextFlow()"],
      reproduction: ["Open Search", "Open image sources", "Select Take Photo"],
      expected: ["The system camera opens."],
      actual: ["An unavailable alert appears."],
      reference_evidence: ["reference/camera-open.png"],
      clone_evidence: ["Attachments/camera-unavailable.png"],
    },
  ]);
});

test("execution-plan validation rejects an omitted blocking journey", () => {
  const plan = {
    schema_version: 1,
    journeys: [
      { journey_id: "JOURNEY-A", test_ids: ["Suite/testA()"] },
    ],
  };

  assert.deepEqual(validateExecutionPlan(plan, ["JOURNEY-A", "JOURNEY-B"]), [
    {
      code: "MISSING_JOURNEY_PLAN",
      message: "Blocking journey JOURNEY-B has no executable plan entry.",
    },
  ]);
});

test("execution-plan validation rejects a planned test absent from the xcresult", () => {
  const plan = {
    schema_version: 1,
    journeys: [
      { journey_id: "JOURNEY-A", test_ids: ["Suite/testA()"] },
    ],
  };

  assert.deepEqual(validateExecutionPlan(plan, ["JOURNEY-A"], []), [
    {
      code: "PLANNED_TEST_NOT_EXECUTED",
      message: "Planned XCTest Suite/testA() is absent from the xcresult test tree.",
    },
  ]);
});

test("strict evidence validation rejects incomplete capture provenance", () => {
  const run = {
    schema_version: 1,
    run_id: "RUN-007",
    source_commit: "current-commit",
    observations: [],
    attachments: [],
  };

  assert.deepEqual(
    validateEvidenceRun(run, { expectedCommit: "current-commit", strict: true }).map((error) => error.code),
    [
      "MISSING_CAPTURE_METADATA",
      "MISSING_CAPTURE_METADATA",
      "MISSING_CAPTURE_METADATA",
      "MISSING_CAPTURE_METADATA",
      "MISSING_CAPTURE_METADATA",
      "MISSING_CAPTURE_METADATA",
    ],
  );
});

test("strict evidence validation rejects visual paths outside the attachment registry", () => {
  const run = {
    schema_version: 1,
    run_id: "RUN-008",
    captured_at: "2026-08-11T00:00:00.000Z",
    source_commit: "current-commit",
    artifact: { path: "Build/ZenbuJapanese.app", sha256: "a".repeat(64) },
    xcresult: { path: "Results/Parity.xcresult", sha256: "b".repeat(64) },
    test_summary: { path: "Results/test-summary.json", sha256: "c".repeat(64) },
    test_tree: { path: "Results/test-tree.json", sha256: "d".repeat(64) },
    device: {
      platform: "iOS Simulator",
      name: "iPhone 17 Pro Max",
      identifier: "SIM-001",
      os_version: "26.0.1",
      runtime_identifier: "com.apple.CoreSimulator.SimRuntime.iOS-26-0",
    },
    toolchain: { xcode_version: "26.0", build_version: "17A000" },
    attachment_root: "Attachments",
    attachments: [],
    tests: [{ test_id: "Suite/testResults()", result: "passed" }],
    observations: [
      {
        observation_id: "OBS-VISUAL-008",
        row_ids: ["PARITY-STATE-RESULTS"],
        journey_ids: ["JOURNEY-SEARCH-TEXT"],
        test_id: "Suite/testResults()",
        classification: "exact",
        test_status: "passed",
        reference_evidence: ["Attachments/reference.png"],
        clone_evidence: ["Attachments/clone.png", "Attachments/diff.png"],
        destination_state: { surface_id: "search-results", state: "loaded", output: "results" },
        semantic_observation: "The result state matches the reference.",
        action_observation: "Submitting the query reaches results.",
        expected: "Reference results are visible.",
        actual: "Zenbu results are visible.",
        visual_comparison: {
          reference_path: "Attachments/reference.png",
          clone_path: "Attachments/clone.png",
          diff_path: "Attachments/diff.png",
          masks: [],
          tolerance: { per_channel: 8, max_changed_pixel_ratio: 0.01 },
          result: { changed_pixel_ratio: 0, passed: true },
        },
      },
    ],
  };
  const ledger = [{ id: "PARITY-STATE-RESULTS", parity_dimensions: ["visual"] }];

  assert.deepEqual(
    validateEvidenceRun(run, { expectedCommit: "current-commit", ledger, strict: true }),
    [
      {
        code: "UNREGISTERED_VISUAL_EVIDENCE",
        message: "OBS-VISUAL-008 references Attachments/reference.png, which is not a registered attachment.",
      },
      {
        code: "UNREGISTERED_VISUAL_EVIDENCE",
        message: "OBS-VISUAL-008 references Attachments/clone.png, which is not a registered attachment.",
      },
      {
        code: "UNREGISTERED_VISUAL_EVIDENCE",
        message: "OBS-VISUAL-008 references Attachments/diff.png, which is not a registered attachment.",
      },
    ],
  );
});

test("ledger compilation preserves an approved variance explanation", () => {
  const ledger = [{
    id: "PARITY-VISUAL-001",
    journey_ids: ["JOURNEY-A"],
    discovery_status: "ready_input",
    clone_status: "unknown",
    test_status: "not_run",
  }];
  const run = {
    run_id: "RUN-009",
    observations: [{
      observation_id: "OBS-009",
      row_ids: ["PARITY-VISUAL-001"],
      test_id: "Suite/testA()",
      classification: "approved_variance",
      test_status: "passed",
      variance: {
        reason: "Zenbu uses its own brand color.",
        approval: "docs/adr/0001-language-capability-boundaries.md",
      },
    }],
  };

  const result = compileLedger(ledger, [run], { requiredJourneyIds: ["JOURNEY-A"] });

  assert.deepEqual(result.rows[0].clone_evidence.variance, [{
    reason: "Zenbu uses its own brand color.",
    approval: "docs/adr/0001-language-capability-boundaries.md",
  }]);
  assert.equal(result.report.blocking.approved_variance, 1);
  assert.equal(result.report.blocking.unexplained, 0);
});

test("strict evidence validation rejects unknown rows and tests", () => {
  const run = {
    schema_version: 1,
    run_id: "RUN-010",
    captured_at: "2026-08-11T00:00:00.000Z",
    source_commit: "current-commit",
    artifact: { path: "Build/App.app", sha256: "a".repeat(64) },
    xcresult: { path: "Results/Parity.xcresult", sha256: "b".repeat(64) },
    test_summary: { path: "Results/test-summary.json", sha256: "c".repeat(64) },
    test_tree: { path: "Results/test-tree.json", sha256: "d".repeat(64) },
    device: {
      platform: "iOS Simulator",
      name: "iPhone 17 Pro Max",
      identifier: "SIM-001",
      os_version: "26.0.1",
      runtime_identifier: "com.apple.CoreSimulator.SimRuntime.iOS-26-0",
    },
    toolchain: { xcode_version: "26.0", build_version: "17A000" },
    attachment_root: "Attachments",
    attachments: [{
      path: "Attachments/unknown-row.png",
      sha256: "e".repeat(64),
      media_type: "image/png",
    }],
    tests: [{ test_id: "Suite/testKnown()", result: "passed" }],
    observations: [{
      observation_id: "OBS-010",
      row_ids: ["PARITY-UNKNOWN"],
      journey_ids: ["JOURNEY-A"],
      test_id: "Suite/testMissing()",
      classification: "exact",
      test_status: "passed",
      reference_evidence: ["reference/unknown-row.md"],
      clone_evidence: ["Attachments/unknown-row.png"],
      destination_state: { surface_id: "search", state: "loaded", output: "result" },
      semantic_observation: "A result is visible.",
      action_observation: "The query was submitted.",
      expected: "A result is visible.",
      actual: "A result is visible.",
    }],
  };

  assert.deepEqual(validateEvidenceRun(run, {
    expectedCommit: "current-commit",
    ledger: [{ id: "PARITY-KNOWN", parity_dimensions: ["interaction"] }],
    strict: true,
  }), [
    {
      code: "UNKNOWN_ROW_ID",
      message: "OBS-010 references unknown parity row PARITY-UNKNOWN.",
    },
    {
      code: "TEST_NOT_IN_XCRESULT",
      message: "OBS-010 references Suite/testMissing(), which is absent from the run test tree.",
    },
  ]);
});

test("strict evidence validation rejects a failed visual comparison classified as exact", () => {
  const paths = ["Attachments/reference.png", "Attachments/clone.png", "Attachments/diff.png"];
  const run = {
    schema_version: 1,
    run_id: "RUN-011",
    captured_at: "2026-08-11T00:00:00.000Z",
    source_commit: "current-commit",
    artifact: { path: "Build/App.app", sha256: "a".repeat(64) },
    xcresult: { path: "Results/Parity.xcresult", sha256: "b".repeat(64) },
    test_summary: { path: "Results/test-summary.json", sha256: "c".repeat(64) },
    test_tree: { path: "Results/test-tree.json", sha256: "d".repeat(64) },
    device: {
      platform: "iOS Simulator",
      name: "iPhone 17 Pro Max",
      identifier: "SIM-001",
      os_version: "26.0.1",
      runtime_identifier: "com.apple.CoreSimulator.SimRuntime.iOS-26-0",
    },
    toolchain: { xcode_version: "26.0", build_version: "17A000" },
    attachment_root: "Attachments",
    attachments: paths.map((path) => ({ path, sha256: "e".repeat(64), media_type: "image/png" })),
    tests: [{ test_id: "Suite/testVisual()", result: "passed" }],
    observations: [{
      observation_id: "OBS-011",
      row_ids: ["PARITY-VISUAL"],
      journey_ids: ["JOURNEY-A"],
      test_id: "Suite/testVisual()",
      classification: "exact",
      test_status: "passed",
      reference_evidence: [paths[0]],
      clone_evidence: [paths[1], paths[2]],
      destination_state: { surface_id: "search-results", state: "loaded", output: "results" },
      semantic_observation: "The result state matches the reference.",
      action_observation: "Submitting the query reaches results.",
      expected: "The images match within tolerance.",
      actual: "The changed-pixel ratio exceeds tolerance.",
      visual_comparison: {
        reference_path: paths[0],
        clone_path: paths[1],
        diff_path: paths[2],
        masks: [],
        tolerance: { per_channel: 8, max_changed_pixel_ratio: 0.01 },
        result: { changed_pixel_ratio: 0.02, passed: false },
      },
    }],
  };

  assert.deepEqual(validateEvidenceRun(run, {
    expectedCommit: "current-commit",
    ledger: [{ id: "PARITY-VISUAL", parity_dimensions: ["visual"] }],
    strict: true,
  }), [{
    code: "VISUAL_COMPARISON_FAILED",
    message: "OBS-011 is classified exact even though its visual comparison failed.",
  }]);
});

test("xcresult test-tree reconciliation rejects an edited recorded result", () => {
  const actual = testsFromTree({
    testNodes: [{
      nodeType: "Test Suite",
      name: "All tests",
      children: [{
        nodeType: "Test Suite",
        name: "SearchReplicaJourneyUITests",
        children: [{ nodeType: "Test Case", name: "testPhoto()", result: "Failed" }],
      }],
    }],
  });

  assert.deepEqual(validateRecordedTests(
    [{ test_id: "SearchReplicaJourneyUITests/testPhoto()", result: "passed" }],
    actual,
  ), [{
    code: "TEST_TREE_MISMATCH",
    message: "Recorded test SearchReplicaJourneyUITests/testPhoto() is passed, but the hashed xcresult tree says failed.",
  }]);
});

test("execution-plan validation requires every declared environment", () => {
  const plan = {
    environments: ["debug_simulator", "signed_physical_device"],
    journeys: [{ journey_id: "JOURNEY-A", test_ids: ["Suite/testA()"] }],
  };

  assert.deepEqual(validateExecutionPlan(
    plan,
    ["JOURNEY-A"],
    ["Suite/testA()"],
    ["debug_simulator"],
  ), [{
    code: "MISSING_EXECUTION_ENVIRONMENT",
    message: "Execution plan requires signed_physical_device, but no supplied run used it.",
  }]);
});

test("execution-plan validation requires consecutive complete passing runs", () => {
  const plan = {
    minimum_complete_runs: 2,
    journeys: [{ journey_id: "JOURNEY-A", test_ids: ["Suite/testA()"] }],
  };
  const runs = [{ tests: [{ test_id: "Suite/testA()", result: "passed" }] }];

  assert.deepEqual(validateExecutionPlan(
    plan,
    ["JOURNEY-A"],
    ["Suite/testA()"],
    [],
    runs,
  ), [{
    code: "INSUFFICIENT_COMPLETE_RUNS",
    message: "Execution plan requires 2 consecutive complete passing runs, but the supplied sequence ends with 1.",
  }]);
});

test("execution-plan validation does not count passing runs separated by a failure", () => {
  const plan = {
    minimum_complete_runs: 2,
    journeys: [{ journey_id: "JOURNEY-A", test_ids: ["Suite/testA()"] }],
  };
  const result = (captured_at, testResult) => ({
    captured_at,
    tests: [{ test_id: "Suite/testA()", result: testResult }],
  });

  const errors = validateExecutionPlan(plan, ["JOURNEY-A"], ["Suite/testA()"], [], [
    result("2026-08-11T00:00:00Z", "passed"),
    result("2026-08-11T01:00:00Z", "failed"),
    result("2026-08-11T02:00:00Z", "passed"),
  ]);

  assert.equal(errors[0].code, "INSUFFICIENT_COMPLETE_RUNS");
  assert.match(errors[0].message, /sequence ends with 1/);
});

test("execution-plan completeness uses each run environment's declared XCTest set", () => {
  const plan = {
    minimum_complete_runs: 1,
    environments: ["debug_simulator", "signed_physical_device"],
    environment_test_ids: {
      debug_simulator: ["Suite/testDebugRegression()"],
      signed_physical_device: ["Suite/testProductionDevice()"],
    },
    journeys: [{
      journey_id: "JOURNEY-A",
      test_ids: ["Suite/testDebugRegression()", "Suite/testProductionDevice()"],
    }],
  };
  const runs = [{
    captured_at: "2026-08-11T00:00:00Z",
    environment_id: "debug_simulator",
    tests: [{ test_id: "Suite/testDebugRegression()", result: "passed" }],
  }, {
    captured_at: "2026-08-11T01:00:00Z",
    environment_id: "signed_physical_device",
    tests: [{ test_id: "Suite/testProductionDevice()", result: "passed" }],
  }];

  assert.deepEqual(validateExecutionPlan(
    plan,
    ["JOURNEY-A"],
    undefined,
    ["debug_simulator", "signed_physical_device"],
    runs,
  ), []);
});

test("execution-plan validation requires consecutive complete runs per environment", () => {
  const plan = {
    minimum_complete_runs: 0,
    environments: ["debug_simulator", "signed_physical_device"],
    minimum_complete_runs_by_environment: {
      debug_simulator: 2,
      signed_physical_device: 2,
    },
    environment_test_ids: {
      debug_simulator: ["Suite/testDebugRegression()"],
      signed_physical_device: ["Suite/testProductionDevice()"],
    },
    journeys: [{
      journey_id: "JOURNEY-A",
      test_ids: ["Suite/testDebugRegression()", "Suite/testProductionDevice()"],
    }],
  };
  const passingRun = (capturedAt, environmentId, testId) => ({
    captured_at: capturedAt,
    environment_id: environmentId,
    tests: [{ test_id: testId, result: "passed" }],
  });
  const runs = [
    passingRun("2026-08-11T00:00:00Z", "debug_simulator", "Suite/testDebugRegression()"),
    passingRun("2026-08-11T01:00:00Z", "debug_simulator", "Suite/testDebugRegression()"),
    passingRun("2026-08-11T02:00:00Z", "signed_physical_device", "Suite/testProductionDevice()"),
  ];

  assert.deepEqual(validateExecutionPlan(plan, ["JOURNEY-A"], undefined, undefined, runs), [{
    code: "INSUFFICIENT_COMPLETE_ENVIRONMENT_RUNS",
    message: "Execution plan requires 2 consecutive complete signed_physical_device runs, but the supplied sequence for that environment ends with 1.",
  }]);
});

test("execution-plan validation rejects invalid environment XCTest mappings", () => {
  const plan = {
    minimum_complete_runs: 0,
    environments: ["debug_simulator", "signed_physical_device"],
    evidence_required_environments: ["signed_physical_device"],
    environment_test_ids: {
      debug_simulator: ["Suite/testUnknown()"],
      signed_physical_device: ["Suite/testJourneyA()"],
      undeclared_environment: ["Suite/testJourneyA()"],
    },
    journeys: [{
      journey_id: "JOURNEY-A",
      test_ids: ["Suite/testJourneyA()"],
    }, {
      journey_id: "JOURNEY-B",
      test_ids: ["Suite/testJourneyB()"],
    }],
  };

  assert.deepEqual(validateExecutionPlan(plan, ["JOURNEY-A", "JOURNEY-B"]), [{
    code: "UNKNOWN_ENVIRONMENT_TEST_ID",
    message: "Execution environment debug_simulator names unplanned test Suite/testUnknown().",
  }, {
    code: "UNDECLARED_EXECUTION_ENVIRONMENT",
    message: "Execution plan maps tests for undeclared environment undeclared_environment.",
  }, {
    code: "MISSING_ENVIRONMENT_JOURNEY_TEST",
    message: "Evidence-required environment signed_physical_device has no declared test for JOURNEY-B.",
  }]);
});

test("execution-plan validation requires full signed-device journey evidence", () => {
  const plan = {
    minimum_complete_runs: 1,
    evidence_required_environments: ["signed_physical_device"],
    journeys: [{ journey_id: "JOURNEY-A", test_ids: ["Suite/testA()"] }],
  };
  const runs = [{
    captured_at: "2026-08-11T00:00:00Z",
    environment_id: "signed_physical_device",
    tests: [{ test_id: "Suite/testA()", result: "passed" }],
    observations: [],
  }];

  const errors = validateExecutionPlan(
    plan,
    ["JOURNEY-A"],
    ["Suite/testA()"],
    ["signed_physical_device"],
    runs,
  );

  assert.equal(errors[0].code, "MISSING_COMPLETE_ENVIRONMENT_EVIDENCE");
});

test("strict observation validation binds rows, journeys, and planned tests", () => {
  const observation = {
    observation_id: "OBS-RELATION",
    row_ids: ["PARITY-CAMERA"],
    journey_ids: ["JOURNEY-CAMERA"],
    test_id: "Suite/testUnrelated()",
    classification: "exact",
    test_status: "passed",
    reference_evidence: ["reference/camera.json"],
    clone_evidence: ["Attachments/camera.png"],
    destination_state: { surface_id: "camera", state: "open", output: "preview" },
    semantic_observation: "Camera preview is visible.",
    action_observation: "Selecting Take Photo opens Camera.",
    expected: "Camera opens.",
    actual: "Camera opens.",
  };
  const errors = validateObservation(observation, {
    rowById: new Map([["PARITY-CAMERA", {
      id: "PARITY-CAMERA",
      journey_ids: ["JOURNEY-CAMERA"],
      reference_evidence: ["reference/camera.json"],
    }]]),
    executedTestIds: new Set(["Suite/testUnrelated()"]),
    registeredPaths: new Set(["Attachments/camera.png"]),
    testIdsByJourney: new Map([["JOURNEY-CAMERA", new Set(["Suite/testCamera()"])]]),
  });

  assert.deepEqual(errors.map((error) => error.code), ["TEST_JOURNEY_MISMATCH"]);
});

test("strict observation validation requires video for planned motion rows", () => {
  const errors = validateObservation({
    observation_id: "OBS-MOTION",
    row_ids: ["PARITY-MOTION"],
    journey_ids: ["JOURNEY-STROKE"],
    test_id: "Suite/testStroke()",
    classification: "exact",
    test_status: "passed",
    reference_evidence: ["reference/stroke.json"],
    clone_evidence: ["Attachments/stroke.png"],
    destination_state: { surface_id: "stroke", state: "playing", output: "progress" },
    semantic_observation: "Stroke playback advances.",
    action_observation: "Tapping Play starts playback.",
    expected: "Playback advances.",
    actual: "Playback advances.",
  }, {
    rowById: new Map([["PARITY-MOTION", {
      id: "PARITY-MOTION",
      journey_ids: ["JOURNEY-STROKE"],
      reference_evidence: ["reference/stroke.json"],
    }]]),
    executedTestIds: new Set(["Suite/testStroke()"]),
    registeredPaths: new Set(["Attachments/stroke.png"]),
    registeredMediaTypes: new Map([["Attachments/stroke.png", "image/png"]]),
    motionRowIds: new Set(["PARITY-MOTION"]),
  });

  assert.equal(errors.at(-1).code, "MISSING_MOTION_EVIDENCE");
});

test("strict observation validation binds status and evidence to captured results", () => {
  const errors = validateObservation({
    observation_id: "OBS-BOUND",
    row_ids: ["PARITY-KNOWN"],
    journey_ids: ["JOURNEY-A"],
    test_id: "Suite/testA()",
    classification: "exact",
    test_status: "passed",
    reference_evidence: ["reference/known.json"],
    clone_evidence: ["Attachments/unregistered.png"],
    destination_state: { surface_id: "search", state: "loaded", output: "results" },
    semantic_observation: "The same results are shown.",
    action_observation: "Submitting the query opens results.",
    expected: "Reference results.",
    actual: "Zenbu results.",
  }, {
    rowById: new Map([["PARITY-KNOWN", {
      id: "PARITY-KNOWN",
      reference_evidence: ["reference/known.json"],
    }]]),
    executedTestIds: new Set(["Suite/testA()"]),
    executedTestResults: new Map([["Suite/testA()", "failed"]]),
    registeredPaths: new Set(),
  });

  assert.deepEqual(errors.map((error) => error.code), [
    "TEST_STATUS_MISMATCH",
    "UNREGISTERED_CLONE_EVIDENCE",
  ]);
});

test("strict observation validation rejects rowless and unsupported classifications", () => {
  const errors = validateObservation({
    observation_id: "OBS-INVALID",
    row_ids: [],
    journey_ids: ["JOURNEY-A"],
    test_id: "Suite/testA()",
    classification: "looks_close",
    test_status: "passed",
    reference_evidence: ["reference/a.json"],
    clone_evidence: ["Attachments/a.png"],
    destination_state: { surface_id: "search", state: "loaded", output: "results" },
    semantic_observation: "Results are visible.",
    action_observation: "Search was submitted.",
    expected: "Reference results.",
    actual: "Zenbu results.",
  }, {
    rowById: new Map(),
    executedTestIds: new Set(["Suite/testA()"]),
    registeredPaths: new Set(["Attachments/a.png"]),
  });

  assert.deepEqual(errors.map((error) => error.code), [
    "MISSING_ROW_IDS",
    "INVALID_CLASSIFICATION",
  ]);
});

test("ledger compilation keeps unsupported outcomes blocking", () => {
  const result = compileLedger([{
    id: "PARITY-A",
    journey_ids: ["JOURNEY-A"],
    discovery_status: "ready_input",
    clone_status: "unknown",
    test_status: "not_run",
  }], [{
    run_id: "RUN-INVALID",
    observations: [{
      observation_id: "OBS-INVALID",
      row_ids: ["PARITY-A"],
      journey_ids: ["JOURNEY-A"],
      classification: "looks_close",
      test_status: "probably_passed",
    }],
  }], { requiredJourneyIds: ["JOURNEY-A"] });

  assert.equal(result.rows[0].clone_status, "unknown");
  assert.equal(result.rows[0].test_status, "not_run");
  assert.equal(result.report.blocking.unknown, 1);
  assert.equal(result.report.blocking.not_run, 1);
});

test("strict evidence validation rejects unverified physical-device claims", () => {
  const run = {
    schema_version: 1,
    run_id: "RUN-SIGNED",
    captured_at: "2026-08-11T00:00:00Z",
    source_commit: "current-commit",
    environment_id: "signed_physical_device",
    configuration: "Debug",
    artifact: { path: "Build/App.app", sha256: "a".repeat(64) },
    xcresult: { path: "Results/Parity.xcresult", sha256: "b".repeat(64) },
    test_summary: { path: "Results/test-summary.json", sha256: "c".repeat(64) },
    test_tree: { path: "Results/test-tree.json", sha256: "d".repeat(64) },
    build_request: { path: "DerivedData/build-request.json", sha256: "e".repeat(64) },
    device: {
      platform: "iOS",
      name: "iPhone",
      identifier: "DEVICE-001",
      os_version: "26.0",
      runtime_identifier: "com.apple.platform.iphoneos",
    },
    toolchain: { xcode_version: "26.0", build_version: "17A000" },
    attachments: [],
    tests: [],
    observations: [],
  };

  const errors = validateEvidenceRun(run, {
    expectedCommit: "current-commit",
    plan: { expected_bundle_identifier: "com.zenbujapanese.dictionary" },
    strict: true,
  });

  assert.deepEqual(errors.map((error) => error.code), [
    "INVALID_SIGNED_ARTIFACT",
    "UNEXPECTED_BUNDLE_IDENTIFIER",
  ]);
});

test("strict observation validation requires differential evidence and state", () => {
  assert.deepEqual(validateObservation({
    observation_id: "OBS-012",
    row_ids: ["PARITY-KNOWN"],
    journey_ids: ["JOURNEY-A"],
    test_id: "Suite/testA()",
    classification: "exact",
    test_status: "passed",
  }, {
    rowById: new Map([["PARITY-KNOWN", {
      id: "PARITY-KNOWN",
      journey_ids: ["JOURNEY-A"],
      parity_dimensions: ["interaction"],
    }]]),
    executedTestIds: new Set(["Suite/testA()"]),
    registeredPaths: new Set(),
  }).map((error) => error.code), [
    "MISSING_REFERENCE_EVIDENCE",
    "MISSING_CLONE_EVIDENCE",
    "MISSING_DESTINATION_STATE",
    "MISSING_SEMANTIC_OBSERVATION",
    "MISSING_ACTION_OBSERVATION",
    "MISSING_EXPECTED_ACTUAL",
  ]);
});

test("correction output includes access blockers and blocked tests", () => {
  const ledger = [{
    id: "PARITY-CAMERA",
    journey_ids: ["JOURNEY-CAMERA"],
    discovery_status: "ready_input",
    clone_status: "unknown",
    test_status: "not_run",
  }];
  const result = compileLedger(ledger, [{
    run_id: "RUN-013",
    observations: [{
      observation_id: "OBS-013",
      row_ids: ["PARITY-CAMERA"],
      journey_ids: ["JOURNEY-CAMERA"],
      test_id: "Suite/testCamera()",
      classification: "access_blocker",
      test_status: "blocked",
      summary: "Camera permission cannot be granted",
    }],
  }], { requiredJourneyIds: ["JOURNEY-CAMERA"] });

  assert.equal(result.corrections.length, 1);
  assert.equal(result.corrections[0].journey_id, "JOURNEY-CAMERA");
});
