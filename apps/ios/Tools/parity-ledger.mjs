import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { compareImages } from "./parity-image-diff.mjs";

function filesBelow(directory) {
  const files = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const child = join(current, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) files.push(child);
    }
  };
  visit(directory);
  return files.sort();
}

export function sha256Path(path) {
  if (!statSync(path).isDirectory()) {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  }

  const files = filesBelow(path);

  const digest = createHash("sha256");
  for (const file of files) {
    digest.update(relative(path, file));
    digest.update("\0");
    digest.update(readFileSync(file));
    digest.update("\0");
  }
  return digest.digest("hex");
}

const unique = (values) => [...new Set(values.filter(Boolean))];

export function testsFromTree(document) {
  const tests = [];
  const visit = (node, suiteName = null) => {
    const currentSuite = node.nodeType === "Test Suite" ? node.name : suiteName;
    if (node.nodeType === "Test Case" && currentSuite) {
      tests.push({
        test_id: `${currentSuite}/${node.name}`,
        result: node.result?.toLowerCase() ?? "unknown",
      });
    }
    for (const child of node.children ?? []) visit(child, currentSuite);
  };
  for (const node of document.testNodes ?? []) visit(node);
  return tests;
}

export function validateRecordedTests(recordedTests, actualTests) {
  const errors = [];
  const recordedById = new Map(recordedTests.map((test) => [test.test_id, test]));
  const actualById = new Map(actualTests.map((test) => [test.test_id, test]));
  for (const recorded of recordedTests) {
    const actual = actualById.get(recorded.test_id);
    if (!actual) {
      errors.push({
        code: "RECORDED_TEST_NOT_IN_TREE",
        message: `Recorded test ${recorded.test_id} is absent from the hashed xcresult test tree.`,
      });
    } else if (recorded.result !== actual.result) {
      errors.push({
        code: "TEST_TREE_MISMATCH",
        message: `Recorded test ${recorded.test_id} is ${recorded.result}, but the hashed xcresult tree says ${actual.result}.`,
      });
    }
  }
  for (const actual of actualTests) {
    if (!recordedById.has(actual.test_id)) {
      errors.push({
        code: "TEST_NOT_RECORDED",
        message: `Hashed xcresult test ${actual.test_id} is absent from the run's recorded tests.`,
      });
    }
  }
  return errors;
}

export function validateExecutionPlan(
  plan,
  requiredJourneyIds,
  executedTestIds = undefined,
  executedEnvironmentIds = undefined,
  executionRuns = undefined,
) {
  const errors = [];
  const planJourneyIds = (plan.journeys ?? []).map((journey) => journey.journey_id);
  for (const journeyId of requiredJourneyIds) {
    if (!planJourneyIds.includes(journeyId)) {
      errors.push({
        code: "MISSING_JOURNEY_PLAN",
        message: `Blocking journey ${journeyId} has no executable plan entry.`,
      });
    }
  }
  for (const journey of plan.journeys ?? []) {
    if (!(journey.test_ids ?? []).length) {
      errors.push({
        code: "JOURNEY_WITHOUT_TESTS",
        message: `Journey ${journey.journey_id} has no XCTest IDs.`,
      });
    }
  }
  for (const journeyId of unique(planJourneyIds.filter((id, index) => planJourneyIds.indexOf(id) !== index))) {
    errors.push({
      code: "DUPLICATE_JOURNEY_PLAN",
      message: `Journey ${journeyId} appears more than once in the execution plan.`,
    });
  }
  if (executedTestIds) {
    const executed = new Set(executedTestIds);
    for (const testId of unique((plan.journeys ?? []).flatMap((journey) => journey.test_ids ?? []))) {
      if (!executed.has(testId)) {
        errors.push({
          code: "PLANNED_TEST_NOT_EXECUTED",
          message: `Planned XCTest ${testId} is absent from the xcresult test tree.`,
        });
      }
    }
  }
  if (executedEnvironmentIds) {
    const executed = new Set(executedEnvironmentIds);
    for (const environmentId of plan.environments ?? []) {
      if (!executed.has(environmentId)) {
        errors.push({
          code: "MISSING_EXECUTION_ENVIRONMENT",
          message: `Execution plan requires ${environmentId}, but no supplied run used it.`,
        });
      }
    }
  }
  if (executionRuns && Number.isInteger(plan.minimum_complete_runs) && plan.minimum_complete_runs > 0) {
    const plannedTestIds = unique((plan.journeys ?? []).flatMap((journey) => journey.test_ids ?? []));
    const isComplete = (run) => {
      const results = new Map((run.tests ?? []).map((test) => [test.test_id, test.result]));
      return plannedTestIds.every((testId) => results.get(testId) === "passed");
    };
    const orderedRuns = [...executionRuns].sort((left, right) =>
      String(left.captured_at).localeCompare(String(right.captured_at))
    );
    let trailingCompleteRuns = 0;
    for (const run of orderedRuns.toReversed()) {
      if (!isComplete(run)) break;
      trailingCompleteRuns += 1;
    }
    if (trailingCompleteRuns < plan.minimum_complete_runs) {
      errors.push({
        code: "INSUFFICIENT_COMPLETE_RUNS",
        message: `Execution plan requires ${plan.minimum_complete_runs} consecutive complete passing runs, but the supplied sequence ends with ${trailingCompleteRuns}.`,
      });
    }
    for (const environmentId of plan.evidence_required_environments ?? []) {
      const hasCompleteEvidenceRun = orderedRuns.some((run) => {
        if (run.environment_id !== environmentId || !isComplete(run)) return false;
        const observedJourneys = new Set((run.observations ?? []).flatMap((item) => item.journey_ids ?? []));
        return requiredJourneyIds.every((journeyId) => observedJourneys.has(journeyId));
      });
      if (!hasCompleteEvidenceRun) {
        errors.push({
          code: "MISSING_COMPLETE_ENVIRONMENT_EVIDENCE",
          message: `${environmentId} requires a complete passing run with observations for every blocking journey.`,
        });
      }
    }
  }
  return errors;
}

export function validateObservation(
  observation,
  {
    rowById,
    executedTestIds,
    executedTestResults = new Map(),
    registeredPaths = new Set(),
    registeredMediaTypes = new Map(),
    testIdsByJourney = new Map(),
    motionRowIds = new Set(),
  },
) {
  const errors = [];
  for (const rowId of observation.row_ids ?? []) {
    if (!rowById.has(rowId)) {
      errors.push({
        code: "UNKNOWN_ROW_ID",
        message: `${observation.observation_id} references unknown parity row ${rowId}.`,
      });
    }
  }
  if (!executedTestIds.has(observation.test_id)) {
    errors.push({
      code: "TEST_NOT_IN_XCRESULT",
      message: `${observation.observation_id} references ${observation.test_id}, which is absent from the run test tree.`,
    });
  } else if (executedTestResults.has(observation.test_id)) {
    const testResult = executedTestResults.get(observation.test_id);
    const compatibleStatuses = testResult === "passed" ? ["passed"]
      : testResult === "failed" ? ["failed"]
        : ["blocked"];
    if (!compatibleStatuses.includes(observation.test_status)) {
      errors.push({
        code: "TEST_STATUS_MISMATCH",
        message: `${observation.observation_id} records ${observation.test_status}, but ${observation.test_id} is ${testResult} in the hashed xcresult test tree.`,
      });
    }
  }
  if (!(observation.reference_evidence ?? []).length) {
    errors.push({
      code: "MISSING_REFERENCE_EVIDENCE",
      message: `${observation.observation_id} has no reference-app evidence.`,
    });
  }
  if (!(observation.clone_evidence ?? []).length) {
    errors.push({
      code: "MISSING_CLONE_EVIDENCE",
      message: `${observation.observation_id} has no Zenbu evidence.`,
    });
  }
  const knownRows = (observation.row_ids ?? []).map((rowId) => rowById.get(rowId)).filter(Boolean);
  for (const row of knownRows) {
    if ((row.journey_ids ?? []).length
      && !(observation.journey_ids ?? []).some((journeyId) => row.journey_ids.includes(journeyId))) {
      errors.push({
        code: "ROW_JOURNEY_MISMATCH",
        message: `${observation.observation_id} does not name a journey associated with parity row ${row.id}.`,
      });
    }
  }
  for (const journeyId of observation.journey_ids ?? []) {
    if (testIdsByJourney.size && !testIdsByJourney.get(journeyId)?.has(observation.test_id)) {
      errors.push({
        code: "TEST_JOURNEY_MISMATCH",
        message: `${observation.observation_id} uses ${observation.test_id}, which is not planned for ${journeyId}.`,
      });
    }
  }
  const canonicalReferencePaths = new Set(knownRows.flatMap((row) => row.reference_evidence ?? []));
  for (const path of observation.reference_evidence ?? []) {
    if (knownRows.length
      && path !== observation.visual_comparison?.reference_path
      && !canonicalReferencePaths.has(path)
      && !registeredPaths.has(path)) {
      errors.push({
        code: "UNBOUND_REFERENCE_EVIDENCE",
        message: `${observation.observation_id} references ${path}, which is neither canonical row evidence nor a registered attachment.`,
      });
    }
  }
  const visualPaths = new Set([
    observation.visual_comparison?.clone_path,
    observation.visual_comparison?.diff_path,
  ].filter(Boolean));
  for (const path of observation.clone_evidence ?? []) {
    if (!registeredPaths.has(path) && !visualPaths.has(path)) {
      errors.push({
        code: "UNREGISTERED_CLONE_EVIDENCE",
        message: `${observation.observation_id} references ${path}, which is not a registered run attachment.`,
      });
    }
  }
  if ((observation.row_ids ?? []).some((rowId) => motionRowIds.has(rowId))) {
    const hasVideo = (observation.clone_evidence ?? [])
      .some((path) => registeredMediaTypes.get(path)?.startsWith("video/"));
    if (!hasVideo) {
      errors.push({
        code: "MISSING_MOTION_EVIDENCE",
        message: `${observation.observation_id} covers a motion row without registered video evidence.`,
      });
    }
  }
  if (!observation.destination_state?.surface_id
    || !observation.destination_state?.state
    || !observation.destination_state?.output) {
    errors.push({
      code: "MISSING_DESTINATION_STATE",
      message: `${observation.observation_id} does not identify the reached surface, state, and output.`,
    });
  }
  if (!observation.semantic_observation) {
    errors.push({
      code: "MISSING_SEMANTIC_OBSERVATION",
      message: `${observation.observation_id} has no semantic observation.`,
    });
  }
  if (!observation.action_observation) {
    errors.push({
      code: "MISSING_ACTION_OBSERVATION",
      message: `${observation.observation_id} has no action observation.`,
    });
  }
  if (!observation.expected || !observation.actual) {
    errors.push({
      code: "MISSING_EXPECTED_ACTUAL",
      message: `${observation.observation_id} must record expected and actual behavior.`,
    });
  }
  return errors;
}

export function compileLedger(ledger, runs, { requiredJourneyIds = [] } = {}) {
  const requiredJourneys = new Set(requiredJourneyIds);
  const observations = runs.flatMap((run) => (run.observations ?? []).map((observation) => ({
    ...observation,
    run_id: run.run_id,
  })));

  const rows = ledger.map((row) => {
    if (row.discovery_status === "excluded") {
      return { ...row, clone_status: "excluded", test_status: "not_applicable" };
    }

    const rowObservations = observations.filter((observation) => observation.row_ids.includes(row.id));
    if (!rowObservations.length) return { ...row };

    const clonePrecedence = ["defect", "access_blocker", "approved_variance", "exact"];
    const testPrecedence = ["failed", "blocked", "passed"];
    const cloneStatus = clonePrecedence.find((status) => rowObservations.some((item) => item.classification === status));
    const testStatus = testPrecedence.find((status) => rowObservations.some((item) => item.test_status === status));
    const variances = unique(rowObservations.filter((item) => item.classification === "approved_variance")
      .map((item) => item.variance));
    const cloneEvidence = {
      run_ids: unique(rowObservations.map((item) => item.run_id)),
      observation_ids: unique(rowObservations.map((item) => item.observation_id)),
      test_ids: unique(rowObservations.map((item) => item.test_id)),
      reference_evidence: unique(rowObservations.flatMap((item) => item.reference_evidence ?? [])),
      clone_evidence: unique(rowObservations.flatMap((item) => item.clone_evidence ?? [])),
    };
    if (variances.length) cloneEvidence.variance = variances;
    return {
      ...row,
      clone_status: cloneStatus,
      test_status: testStatus,
      clone_evidence: cloneEvidence,
    };
  });

  const blockingRows = rows.filter((row) =>
    row.discovery_status !== "excluded"
    && row.journey_ids.some((journeyId) => requiredJourneys.has(journeyId))
  );
  const count = (field, value) => blockingRows.filter((row) => row[field] === value).length;
  const correctionInputs = observations.filter((observation) =>
    observation.classification === "defect"
    || observation.classification === "access_blocker"
    || observation.test_status === "failed"
    || observation.test_status === "blocked"
  );
  const correctionJourneyIds = unique(correctionInputs.flatMap((observation) => observation.journey_ids ?? []));
  const corrections = correctionJourneyIds.map((journeyId) => {
    const journeyDefects = correctionInputs.filter((observation) => observation.journey_ids?.includes(journeyId));
    return {
      journey_id: journeyId,
      title: `[Parity] ${journeyDefects[0].summary ?? `${journeyDefects[0].classification} in ${journeyId}`}`,
      row_ids: unique(journeyDefects.flatMap((item) => item.row_ids ?? [])),
      observation_ids: unique(journeyDefects.map((item) => item.observation_id)),
      test_ids: unique(journeyDefects.map((item) => item.test_id)),
      reproduction: unique(journeyDefects.flatMap((item) => item.reproduction ?? [])),
      expected: unique(journeyDefects.map((item) => item.expected)),
      actual: unique(journeyDefects.map((item) => item.actual)),
      reference_evidence: unique(journeyDefects.flatMap((item) => item.reference_evidence ?? [])),
      clone_evidence: unique(journeyDefects.flatMap((item) => item.clone_evidence ?? [])),
    };
  });
  return {
    rows,
    corrections,
    report: {
      blocking: {
        rows: blockingRows.length,
        exact: count("clone_status", "exact"),
        approved_variance: count("clone_status", "approved_variance"),
        defects: count("clone_status", "defect"),
        access_blockers: count("clone_status", "access_blocker"),
        unknown: count("clone_status", "unknown"),
        passed: count("test_status", "passed"),
        failed: count("test_status", "failed"),
        blocked: count("test_status", "blocked"),
        not_run: count("test_status", "not_run"),
        unexplained: blockingRows.filter((row) => row.clone_status === "approved_variance" && !row.clone_evidence?.variance).length,
      },
    },
  };
}

function validateEvidenceRecord(kind, record, runRoot) {
  if (!record) return [];
  const path = join(runRoot, record.path);
  if (!existsSync(path)) {
    return [{ code: "MISSING_EVIDENCE", message: `${kind} ${record.path} does not exist.` }];
  }
  const actual = sha256Path(path);
  if (actual !== record.sha256) {
    return [{
      code: "HASH_MISMATCH",
      message: `${kind} ${record.path} has SHA-256 ${actual}, not ${record.sha256}.`,
    }];
  }
  return [];
}

export function validateEvidenceRun(run, {
  expectedCommit,
  runRoot,
  ledger = [],
  plan,
  strict = false,
} = {}) {
  const errors = [];
  const rowById = new Map(ledger.map((row) => [row.id, row]));
  const registeredPaths = new Set((run.attachments ?? []).map((item) => item.path));
  const registeredMediaTypes = new Map((run.attachments ?? []).map((item) => [item.path, item.media_type]));
  const testIdsByJourney = new Map((plan?.journeys ?? []).map((journey) => [
    journey.journey_id,
    new Set(journey.test_ids ?? []),
  ]));
  const motionRowIds = new Set(plan?.motion_row_ids ?? []);

  if (strict) {
    const requiredRecords = [
      ["captured_at", run.captured_at],
      ["artifact", run.artifact?.path && run.artifact?.sha256],
      ["xcresult", run.xcresult?.path && run.xcresult?.sha256],
      ["test_summary", run.test_summary?.path && run.test_summary?.sha256],
      ["test_tree", run.test_tree?.path && run.test_tree?.sha256],
      ["capture_environment", run.device?.platform
        && run.device?.name
        && run.device?.identifier
        && run.device?.os_version
        && run.device?.runtime_identifier
        && run.toolchain?.xcode_version
        && run.toolchain?.build_version],
    ];
    for (const [field, value] of requiredRecords) {
      if (!value) {
        errors.push({
          code: "MISSING_CAPTURE_METADATA",
          message: `Run ${run.run_id} is missing required ${field} provenance.`,
        });
      }
    }
  }

  if (expectedCommit && run.source_commit !== expectedCommit) {
    errors.push({
      code: "STALE_SOURCE_COMMIT",
      message: `Run ${run.run_id} was captured from ${run.source_commit}, not ${expectedCommit}.`,
    });
  }

  if (strict) {
    const executedTestIds = new Set((run.tests ?? []).map((test) => test.test_id));
    const executedTestResults = new Map((run.tests ?? []).map((test) => [test.test_id, test.result]));
    for (const observation of run.observations ?? []) {
      errors.push(...validateObservation(observation, {
        rowById,
        executedTestIds,
        executedTestResults,
        registeredPaths,
        registeredMediaTypes,
        testIdsByJourney,
        motionRowIds,
      }));
    }
  }

  for (const observation of run.observations ?? []) {
    const visualRowIds = (observation.row_ids ?? []).filter((rowId) =>
      (rowById.get(rowId)?.parity_dimensions ?? []).includes("visual")
    );
    if (!visualRowIds.length) continue;
    const comparison = observation.visual_comparison;
    const hasContract = Boolean(
      comparison?.reference_path
      && comparison?.clone_path
      && comparison?.diff_path
      && Array.isArray(comparison?.masks)
      && Number.isFinite(comparison?.tolerance?.per_channel)
      && Number.isFinite(comparison?.tolerance?.max_changed_pixel_ratio)
      && Number.isFinite(comparison?.result?.changed_pixel_ratio)
      && typeof comparison?.result?.passed === "boolean"
    );
    if (!hasContract) {
      errors.push({
        code: "MISSING_VISUAL_COMPARISON",
        message: `${observation.observation_id} covers visual row ${visualRowIds[0]} without a paired diff, masks, and tolerances.`,
      });
    } else if (strict) {
      for (const path of [comparison.reference_path, comparison.clone_path, comparison.diff_path]) {
        if (!registeredPaths.has(path)) {
          errors.push({
            code: "UNREGISTERED_VISUAL_EVIDENCE",
            message: `${observation.observation_id} references ${path}, which is not a registered attachment.`,
          });
        }
      }
      if (!comparison.result.passed && ["exact", "approved_variance"].includes(observation.classification)) {
        errors.push({
          code: "VISUAL_COMPARISON_FAILED",
          message: `${observation.observation_id} is classified ${observation.classification} even though its visual comparison failed.`,
        });
      }

      const comparisonPaths = [comparison.reference_path, comparison.clone_path, comparison.diff_path];
      if (runRoot && comparisonPaths.every((path) => registeredPaths.has(path) && existsSync(join(runRoot, path)))) {
        const temporaryDirectory = mkdtempSync(join(tmpdir(), "parity-validate-"));
        try {
          const recomputed = compareImages({
            referencePath: join(runRoot, comparison.reference_path),
            clonePath: join(runRoot, comparison.clone_path),
            diffPath: join(temporaryDirectory, "diff.png"),
            masks: comparison.masks,
            tolerance: comparison.tolerance,
          });
          const recomputedDiffHash = sha256Path(join(temporaryDirectory, "diff.png"));
          const registeredDiffHash = sha256Path(join(runRoot, comparison.diff_path));
          if (recomputed.passed !== comparison.result.passed
            || Math.abs(recomputed.changed_pixel_ratio - comparison.result.changed_pixel_ratio) > Number.EPSILON
            || recomputedDiffHash !== registeredDiffHash) {
            errors.push({
              code: "VISUAL_RESULT_MISMATCH",
              message: `${observation.observation_id} recorded a visual result that does not match a fresh comparison of its registered images.`,
            });
          }
        } finally {
          rmSync(temporaryDirectory, { recursive: true, force: true });
        }
      }
    }
  }

  if (runRoot) {
    for (const [kind, record] of [
      ["artifact", run.artifact],
      ["xcresult", run.xcresult],
      ["test summary", run.test_summary],
      ["test tree", run.test_tree],
    ]) {
      errors.push(...validateEvidenceRecord(kind, record, runRoot));
    }

    const attachmentRoot = join(runRoot, run.attachment_root);
    if (existsSync(attachmentRoot)) {
      for (const path of filesBelow(attachmentRoot)) {
        const runPath = relative(runRoot, path);
        if (!registeredPaths.has(runPath)) {
          errors.push({
            code: "UNREGISTERED_ATTACHMENT",
            message: `${runPath} exists below ${run.attachment_root} but is not registered by ${run.run_id}.`,
          });
        }
      }
    }

    for (const attachment of run.attachments ?? []) {
      errors.push(...validateEvidenceRecord("attachment", attachment, runRoot));
    }

    if (strict && run.test_tree?.path && existsSync(join(runRoot, run.test_tree.path))) {
      try {
        errors.push(...validateRecordedTests(run.tests ?? [], testsFromTree(readJson(join(runRoot, run.test_tree.path)))));
      } catch (error) {
        errors.push({
          code: "INVALID_TEST_TREE",
          message: `test tree ${run.test_tree.path} cannot be reconciled: ${error.message}`,
        });
      }
    }
  }

  return errors;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonl(path) {
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeJsonl(path, values) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`);
}

function optionValues(arguments_, name) {
  return arguments_.flatMap((value, index) => value === name ? [arguments_[index + 1]] : []).filter(Boolean);
}

function optionValue(arguments_, name, fallback = undefined) {
  return optionValues(arguments_, name).at(-1) ?? fallback;
}

function requireOption(arguments_, name) {
  const value = optionValue(arguments_, name);
  if (!value) throw new Error(`Missing required option ${name}.`);
  return value;
}

function expectedCommit(value, cwd) {
  if (value && value !== "HEAD") return value;
  return execFileSync("git", ["rev-parse", value ?? "HEAD"], { cwd, encoding: "utf8" }).trim();
}

function loadRequiredJourneyIds(path) {
  const document = readJson(path);
  return document.blocking_journey_ids ?? document.required_journey_ids ?? [];
}

function blockingGateFailures(report) {
  const blocking = report.blocking;
  return blocking.unknown + blocking.not_run + blocking.defects + blocking.failed
    + blocking.access_blockers + blocking.blocked + blocking.unexplained;
}

function compileCommand(arguments_) {
  const ledgerPath = resolve(requireOption(arguments_, "--ledger"));
  const requiredJourneysPath = resolve(requireOption(arguments_, "--required-journeys"));
  const runPaths = optionValues(arguments_, "--run").map((path) => resolve(path));
  if (!runPaths.length) throw new Error("At least one --run is required.");
  const ledger = readJsonl(ledgerPath);
  const requiredJourneyIds = loadRequiredJourneyIds(requiredJourneysPath);
  const planPath = optionValue(arguments_, "--plan");
  const plan = planPath ? readJson(resolve(planPath)) : undefined;
  const runs = runPaths.map(readJson);
  if (plan) {
    const executedTestIds = unique(runs.flatMap((run) => (run.tests ?? []).map((test) => test.test_id)));
    const executedEnvironmentIds = unique(runs.map((run) => run.environment_id));
    const planErrors = validateExecutionPlan(
      plan,
      requiredJourneyIds,
      executedTestIds,
      executedEnvironmentIds,
      runs,
    );
    if (planErrors.length) throw new Error(`Execution-plan validation failed:\n${JSON.stringify(planErrors, null, 2)}`);
  }
  const commit = expectedCommit(optionValue(arguments_, "--expected-commit"), process.cwd());
  const validationErrors = runs.flatMap((run, index) => validateEvidenceRun(run, {
    expectedCommit: commit,
    runRoot: dirname(runPaths[index]),
    ledger,
    plan,
    strict: true,
  }));
  if (validationErrors.length) {
    throw new Error(`Evidence validation failed:\n${JSON.stringify(validationErrors, null, 2)}`);
  }

  const result = compileLedger(ledger, runs, {
    requiredJourneyIds,
  });
  const outputLedger = resolve(requireOption(arguments_, "--output-ledger"));
  const outputReport = resolve(requireOption(arguments_, "--output-report"));
  const outputCorrections = resolve(requireOption(arguments_, "--output-corrections"));
  writeJsonl(outputLedger, result.rows);
  writeJson(outputReport, {
    generated_at: new Date().toISOString(),
    source_commit: commit,
    run_ids: runs.map((run) => run.run_id),
    ...result.report,
  });
  writeJson(outputCorrections, {
    generated_at: new Date().toISOString(),
    source_commit: commit,
    corrections: result.corrections,
  });
  return result;
}

function validateCommand(arguments_) {
  const runPath = resolve(requireOption(arguments_, "--run"));
  const ledgerPath = resolve(requireOption(arguments_, "--ledger"));
  const run = readJson(runPath);
  const planPath = optionValue(arguments_, "--plan");
  const errors = validateEvidenceRun(run, {
    expectedCommit: expectedCommit(optionValue(arguments_, "--expected-commit"), process.cwd()),
    runRoot: dirname(runPath),
    ledger: readJsonl(ledgerPath),
    plan: planPath ? readJson(resolve(planPath)) : undefined,
    strict: true,
  });
  if (errors.length) throw new Error(`Evidence validation failed:\n${JSON.stringify(errors, null, 2)}`);
  return { run_id: run.run_id, attachments: run.attachments.length, observations: run.observations.length };
}

function runChecked(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, { encoding: "utf8", stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}.`);
}

function bootSimulator(identifier) {
  const boot = spawnSync("xcrun", ["simctl", "boot", identifier], { encoding: "utf8" });
  const bootOutput = `${boot.stdout ?? ""}\n${boot.stderr ?? ""}`;
  if (boot.error) throw boot.error;
  if (boot.status !== 0 && !bootOutput.includes("current state: Booted")) {
    throw new Error(`Could not boot simulator ${identifier}: ${bootOutput.trim()}`);
  }
  runChecked("xcrun", ["simctl", "bootstatus", identifier, "-b"]);
}

function destinationValue(destination, key) {
  return destination.split(",").map((part) => part.trim().split("="))
    .find(([candidate]) => candidate === key)?.slice(1).join("=");
}

function captureEnvironment(destination) {
  const platform = destinationValue(destination, "platform") ?? "unknown";
  const requestedName = destinationValue(destination, "name");
  const requestedIdentifier = destinationValue(destination, "id");
  let device = {
    platform,
    name: requestedName,
    identifier: requestedIdentifier,
    os_version: destinationValue(destination, "OS"),
    runtime_identifier: platform,
    destination,
  };

  if (platform.includes("Simulator")) {
    const devices = JSON.parse(execFileSync("xcrun", ["simctl", "list", "devices", "available", "-j"], { encoding: "utf8" }));
    const runtimes = JSON.parse(execFileSync("xcrun", ["simctl", "list", "runtimes", "available", "-j"], { encoding: "utf8" })).runtimes;
    const candidates = Object.entries(devices.devices).flatMap(([runtimeIdentifier, values]) =>
      values.map((value) => ({ ...value, runtimeIdentifier }))
    );
    const match = candidates.find((candidate) => requestedIdentifier && candidate.udid === requestedIdentifier)
      ?? candidates.find((candidate) => candidate.name === requestedName && candidate.state === "Booted")
      ?? candidates.findLast((candidate) => candidate.name === requestedName);
    if (!match) throw new Error(`Could not resolve simulator metadata for ${destination}.`);
    const runtime = runtimes.find((item) => item.identifier === match.runtimeIdentifier);
    device = {
      ...device,
      name: match.name,
      identifier: match.udid,
      os_version: runtime?.version ?? device.os_version,
      runtime_identifier: match.runtimeIdentifier,
    };
  } else if (platform === "iOS") {
    const physicalSection = execFileSync("xcrun", ["xctrace", "list", "devices"], { encoding: "utf8" })
      .split("== Simulators ==")[0];
    const devices = physicalSection.split("\n").flatMap((line) => {
      const match = line.match(/^(.*?) \(([0-9.]+)\) \(([^)]+)\)$/);
      return match ? [{ name: match[1], osVersion: match[2], identifier: match[3] }] : [];
    });
    const match = devices.find((candidate) => requestedIdentifier && candidate.identifier === requestedIdentifier)
      ?? devices.find((candidate) => candidate.name === requestedName);
    if (!match) throw new Error(`Could not resolve physical-device metadata for ${destination}.`);
    device = {
      ...device,
      name: match.name,
      identifier: match.identifier,
      os_version: match.osVersion,
      runtime_identifier: "com.apple.platform.iphoneos",
    };
  }

  const [xcodeVersionLine, buildVersionLine] = execFileSync("xcodebuild", ["-version"], { encoding: "utf8" }).trim().split("\n");
  return {
    device,
    toolchain: {
      xcode_version: xcodeVersionLine?.replace(/^Xcode\s+/, ""),
      build_version: buildVersionLine?.replace(/^Build version\s+/, ""),
    },
  };
}

function crawlCommand(arguments_) {
  const sourceCommit = expectedCommit("HEAD", process.cwd());
  const initialStatus = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    encoding: "utf8",
  }).trim();
  if (initialStatus) {
    throw new Error("Parity evidence requires a clean committed worktree; commit or stash changes before crawling.");
  }
  const project = resolve(optionValue(arguments_, "--project", "apps/ios/ZenbuJapanese.xcodeproj"));
  const scheme = optionValue(arguments_, "--scheme", "ZenbuJapanese");
  const configuration = optionValue(arguments_, "--configuration", "Debug");
  const destination = optionValue(arguments_, "--destination", "platform=iOS Simulator,name=iPhone 17 Pro Max");
  const runDirectory = resolve(requireOption(arguments_, "--run-dir"));
  if (existsSync(runDirectory)) throw new Error(`Run directory already exists: ${runDirectory}`);
  mkdirSync(runDirectory, { recursive: true });
  const environment = captureEnvironment(destination);
  const stagedMedia = optionValues(arguments_, "--stage-photo").map((path) => resolve(path));
  if (stagedMedia.length) {
    if (!destination.includes("Simulator")) throw new Error("--stage-photo is supported only for simulator crawls.");
    for (const path of stagedMedia) {
      if (!existsSync(path)) throw new Error(`Staged photo does not exist: ${path}`);
    }
    bootSimulator(environment.device.identifier);
    runChecked("xcrun", ["simctl", "addmedia", environment.device.identifier, ...stagedMedia]);
  }

  const resultBundlePath = join(runDirectory, "Parity.xcresult");
  const derivedDataPath = join(runDirectory, "DerivedData");
  const testArguments = [
    "test",
    "-project", project,
    "-scheme", scheme,
    "-configuration", configuration,
    "-destination", destination,
    "-derivedDataPath", derivedDataPath,
    "-resultBundlePath", resultBundlePath,
  ];
  for (const testId of optionValues(arguments_, "--only-testing")) {
    testArguments.push("-only-testing", testId);
  }
  runChecked("xcodebuild", testArguments);
  const finalCommit = expectedCommit("HEAD", process.cwd());
  const finalStatus = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    encoding: "utf8",
  }).trim();
  if (finalCommit !== sourceCommit || finalStatus) {
    throw new Error("Source changed during parity capture; discard this run and crawl the clean commit again.");
  }

  const summaryPath = join(runDirectory, "test-summary.json");
  const summary = execFileSync("xcrun", ["xcresulttool", "get", "test-results", "summary", "--path", resultBundlePath], { encoding: "utf8" });
  writeFileSync(summaryPath, `${summary.trim()}\n`);
  const testTreePath = join(runDirectory, "test-tree.json");
  const testTreeText = execFileSync("xcrun", ["xcresulttool", "get", "test-results", "tests", "--path", resultBundlePath, "--compact"], { encoding: "utf8" });
  writeFileSync(testTreePath, `${testTreeText.trim()}\n`);
  const tests = testsFromTree(readJson(testTreePath));
  const attachmentDirectory = join(runDirectory, "Attachments");
  runChecked("xcrun", ["xcresulttool", "export", "attachments", "--path", resultBundlePath, "--output-path", attachmentDirectory]);

  const sdkSuffix = destination.includes("Simulator") ? "iphonesimulator" : "iphoneos";
  const productDirectory = join(derivedDataPath, "Build", "Products", `${configuration}-${sdkSuffix}`);
  const appCandidates = readdirSync(productDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(".app") && !entry.name.endsWith("UITests-Runner.app"))
    .map((entry) => join(productDirectory, entry.name));
  if (appCandidates.length !== 1) {
    throw new Error(`Expected one built app below ${productDirectory}, found: ${appCandidates.join(", ") || "none"}.`);
  }
  const [appPath] = appCandidates;
  const attachmentFiles = filesBelow(attachmentDirectory);
  const run = {
    schema_version: 1,
    run_id: optionValue(arguments_, "--run-id", `PARITY-${new Date().toISOString().replaceAll(/[-:.]/g, "").replace("Z", "Z")}`),
    captured_at: new Date().toISOString(),
    source_commit: sourceCommit,
    artifact: { path: relative(runDirectory, appPath), sha256: sha256Path(appPath) },
    xcresult: { path: relative(runDirectory, resultBundlePath), sha256: sha256Path(resultBundlePath) },
    test_summary: { path: relative(runDirectory, summaryPath), sha256: sha256Path(summaryPath) },
    test_tree: { path: relative(runDirectory, testTreePath), sha256: sha256Path(testTreePath) },
    environment_id: destination.includes("Simulator")
      ? (configuration === "Release" ? "release_simulator_smoke" : "debug_simulator")
      : "signed_physical_device",
    ...environment,
    staged_media: stagedMedia.map((path) => ({ source_path: path, sha256: sha256Path(path) })),
    attachment_root: "Attachments",
    attachments: attachmentFiles.map((path) => ({
      path: relative(runDirectory, path),
      sha256: sha256Path(path),
      media_type: path.endsWith(".png") ? "image/png" : path.endsWith(".mov") ? "video/quicktime" : "application/octet-stream",
    })),
    tests,
    observations: [],
  };
  const runPath = join(runDirectory, "run.json");
  writeJson(runPath, run);
  return { run: runPath, attachments: run.attachments.length, observations: 0 };
}

export function main(arguments_ = process.argv.slice(2)) {
  const [command, ...options] = arguments_;
  if (command === "crawl") return crawlCommand(options);
  if (command === "validate") return validateCommand(options);
  if (command === "compile" || command === "gate") {
    const result = compileCommand(options);
    if (command === "gate" && blockingGateFailures(result.report) > 0) {
      throw new Error(`Parity gate failed:\n${JSON.stringify(result.report.blocking, null, 2)}`);
    }
    return result.report;
  }
  throw new Error("Usage: parity-ledger.mjs <crawl|validate|compile|gate> [options]");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    const result = main();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
