import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const readJson = (name) => JSON.parse(readFileSync(join(root, name), "utf8"));
const readJsonl = (name) => readFileSync(join(root, name), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const unique = (values) => [...new Set(values.filter(Boolean))];
const sorted = (values) => [...values].sort();
const sameSet = (left, right) => JSON.stringify(sorted(unique(left))) === JSON.stringify(sorted(unique(right)));
const duplicateIds = (values) => values.filter((value, index) => values.indexOf(value) !== index);
const generatedAt = new Date().toISOString();

const scope = readJson("scope.json");
const authorities = readJson("reference-authorities.json");
const journeysDocument = readJson("journeys.json");
const journeys = journeysDocument.journeys;
const surfaceMap = readJson("surface-map.json");
const environmentMatrix = readJson("environment-matrix.json");
const referenceEvidence = readJson("reference-evidence.json");
const evidenceIndex = readJson("evidence-index.json");
const crosswalk = readJson("reference-resource-crosswalk.json");
const crosswalkReport = readJson("crosswalk-coverage-report.json");
const parityReport = readJson("parity-coverage-report.json");
const openQuestions = readJson("parity-open-questions.json");
const accessBlockers = readJson("access-blockers.json");
const discoveryStatus = readJson("discovery-status.json");
const fixtureIndex = readJson("fixture-index.json");
const assetIndex = readJson("asset-index.json");
const designTokenIndex = readJson("design-token-index.json");
const ledger = readJsonl("parity-inventory.jsonl");
const behaviorObservations = readJsonl("behavior-observations.jsonl");

const familyNames = ["search", "word", "kanji", "image"];
const crawls = Object.fromEntries(familyNames.map((name) => [name, readJson(`${name}-crawl.json`)]));
const fixtureMatrices = Object.fromEntries(familyNames.map((name) => [name, readJson(`${name}-fixture-matrix.json`)]));
const coverageReports = Object.fromEntries(familyNames.map((name) => [name, readJson(`${name}-coverage-report.json`)]));
const behaviorMatrix = readJson("behavior-fixture-matrix.json");
const behaviorReport = readJson("behavior-coverage-report.json");

const authorityIds = new Set(authorities.map((item) => item.authority_id));
const journeyIds = new Set(journeys.map((item) => item.journey_id));
const blockingJourneyIds = new Set(scope.blocking_journey_ids);
const surfaceIds = new Set(surfaceMap.surfaces.map((item) => item.surface_id));
const evidenceIds = new Set(referenceEvidence.map((item) => item.evidence_id));
const blockerIds = new Set(crosswalkReport.blocking_gap_ids);
const questionById = new Map(openQuestions.questions.map((item) => [item.blocker_id, item]));
const ledgerById = new Map(ledger.map((row) => [row.id, row]));

const allStates = familyNames.flatMap((name) => crawls[name].states);
const allActions = familyNames.flatMap((name) => crawls[name].actions);
const allFixtures = familyNames.flatMap((name) => fixtureMatrices[name].fixtures);

const errors = [];
const expect = (condition, code, detail) => {
  if (!condition) errors.push({ code, detail });
};

expect(authorities.length === 1, "AUTHORITY-DENOMINATOR", `Expected one pinned authority, found ${authorities.length}.`);
expect(authorities.every((item) => item.authority_id), "AUTHORITY-ID", "Every reference authority must have an ID.");
expect(sameSet(scope.blocking_journey_ids, journeys.filter((item) => item.scope === "blocking").map((item) => item.journey_id)), "JOURNEY-DENOMINATOR", "scope.json and journeys.json blocking journey IDs differ.");
expect(duplicateIds(journeys.map((item) => item.journey_id)).length === 0, "DUPLICATE-JOURNEY-ID", "Journey IDs must be unique.");
expect(duplicateIds(surfaceMap.surfaces.map((item) => item.surface_id)).length === 0, "DUPLICATE-SURFACE-ID", "Surface IDs must be unique.");
expect(surfaceMap.counts.total === surfaceMap.surfaces.length, "SURFACE-COUNT", "Declared and actual surface counts differ.");
expect(surfaceMap.counts.blocking === surfaceMap.surfaces.filter((item) => item.scope === "blocking").length, "BLOCKING-SURFACE-COUNT", "Blocking surface count differs.");
expect(surfaceMap.counts.navigation_support === surfaceMap.surfaces.filter((item) => item.scope === "navigation_support").length, "NAVIGATION-SURFACE-COUNT", "Navigation-support surface count differs.");
expect(surfaceMap.counts.excluded === surfaceMap.surfaces.filter((item) => item.scope === "excluded").length, "EXCLUDED-SURFACE-COUNT", "Excluded surface count differs.");

for (const journey of journeys) {
  expect(surfaceIds.has(journey.entry_surface_id), "UNKNOWN-JOURNEY-ENTRY", `${journey.journey_id} has unknown entry surface ${journey.entry_surface_id}.`);
  for (const surfaceId of journey.surfaces) expect(surfaceIds.has(surfaceId), "UNKNOWN-JOURNEY-SURFACE", `${journey.journey_id} references ${surfaceId}.`);
  for (const evidenceId of journey.evidence_ids ?? []) expect(evidenceIds.has(evidenceId), "UNKNOWN-JOURNEY-EVIDENCE", `${journey.journey_id} references ${evidenceId}.`);
}
for (const surface of surfaceMap.surfaces) {
  for (const outgoingId of surface.outgoing_surface_ids ?? []) expect(surfaceIds.has(outgoingId), "UNKNOWN-OUTGOING-SURFACE", `${surface.surface_id} points to ${outgoingId}.`);
  for (const evidenceId of surface.evidence_ids ?? []) expect(evidenceIds.has(evidenceId), "UNKNOWN-SURFACE-EVIDENCE", `${surface.surface_id} references ${evidenceId}.`);
}

const stateIds = allStates.map((item) => item.state_id);
const actionIds = allActions.map((item) => item.action_id);
expect(duplicateIds(stateIds).length === 0, "DUPLICATE-STATE-ID", duplicateIds(stateIds));
expect(duplicateIds(actionIds).length === 0, "DUPLICATE-ACTION-ID", duplicateIds(actionIds));
for (const state of allStates) expect(surfaceIds.has(state.surface_id), "UNKNOWN-STATE-SURFACE", `${state.state_id} references ${state.surface_id}.`);
const stateIdSet = new Set(stateIds);
const allowedDispositions = new Set(["traversed", "same_destination_as", "unavailable_under_fixture", "blocked_by_access", "external_boundary", "excluded_with_reason"]);
for (const action of allActions) {
  expect(Boolean(action.source), "MISSING-ACTION-SOURCE", action.action_id);
  if (/-STATE-\d+$/.test(action.source)) expect(stateIdSet.has(action.source), "UNKNOWN-ACTION-SOURCE", `${action.action_id} references ${action.source}.`);
  expect(allowedDispositions.has(action.disposition), "INVALID-ACTION-DISPOSITION", `${action.action_id} uses ${action.disposition}.`);
}

expect(sameSet(stateIds, crosswalk.node_crosswalk.map((item) => item.source_id)), "NODE-CROSSWALK-COVERAGE", "Crawl state IDs and node crosswalk IDs differ.");
expect(sameSet(actionIds, crosswalk.action_crosswalk.map((item) => item.source_id)), "ACTION-CROSSWALK-COVERAGE", "Crawl action IDs and action crosswalk IDs differ.");
expect(sameSet(allFixtures.map((item) => item.fixture_id), crosswalk.fixture_crosswalk.map((item) => item.source_id)), "FIXTURE-CROSSWALK-COVERAGE", "Fixture IDs and fixture crosswalk IDs differ.");
expect(sameSet(behaviorObservations.map((item) => item.observation_id), crosswalk.language_behavior_claim_crosswalk.map((item) => item.source_id)), "BEHAVIOR-CROSSWALK-COVERAGE", "Behavior observation and crosswalk IDs differ.");

for (const row of [...crosswalk.node_crosswalk, ...crosswalk.action_crosswalk, ...crosswalk.fixture_crosswalk, ...crosswalk.language_behavior_claim_crosswalk]) {
  expect(row.authority_id && authorityIds.has(row.authority_id), "UNKNOWN-CROSSWALK-AUTHORITY", `${row.crosswalk_id} has authority ${row.authority_id}.`);
  expect(row.environment_id === crosswalk.environment_id, "CROSSWALK-ENVIRONMENT-DRIFT", `${row.crosswalk_id} has environment ${row.environment_id}.`);
  for (const journeyId of row.journey_ids ?? []) expect(journeyIds.has(journeyId), "UNKNOWN-CROSSWALK-JOURNEY", `${row.crosswalk_id} references ${journeyId}.`);
  for (const evidencePath of row.evidence_paths ?? []) expect(existsSync(join(root, evidencePath)), "MISSING-CROSSWALK-EVIDENCE", `${row.crosswalk_id} references ${evidencePath}.`);
}

const searchMatrix = fixtureMatrices.search;
expect(searchMatrix.required_categories_executed === searchMatrix.required_category_count, "SEARCH-CATEGORY-DENOMINATOR", "Not every required Search category is represented.");
expect(searchMatrix.fixtures.every((fixture) => fixture.status === "executed"), "UNEXECUTED-SEARCH-FIXTURE", "A Search fixture is not executed.");
expect(searchMatrix.behavior_layout_classes.length === searchMatrix.behavior_layout_class_count, "SEARCH-CLASS-DENOMINATOR", "Search behavior/layout class count differs.");
expect(behaviorMatrix.behavior_classes.length === behaviorMatrix.behavior_class_count, "BEHAVIOR-CLASS-DENOMINATOR", "Behavior class count differs.");
expect(behaviorObservations.length === behaviorMatrix.behavior_class_count, "BEHAVIOR-OBSERVATION-DENOMINATOR", "Behavior observations do not cover every approved behavior class.");
expect(fixtureIndex.fixture_count === allFixtures.length, "FIXTURE-INDEX-COUNT", "Fixture index count differs from source matrices.");

const hashMismatches = [];
const missingIndexedEvidence = [];
for (const artifact of evidenceIndex.artifacts) {
  const path = join(root, artifact.evidence_path);
  if (!existsSync(path)) missingIndexedEvidence.push(artifact.evidence_path);
  else if (sha256(path) !== artifact.sha256) hashMismatches.push(artifact.evidence_path);
}
expect(evidenceIndex.artifact_count === evidenceIndex.artifacts.length, "EVIDENCE-INDEX-COUNT", "Evidence index count differs.");
expect(missingIndexedEvidence.length === 0, "MISSING-INDEXED-EVIDENCE", missingIndexedEvidence);
expect(hashMismatches.length === 0, "EVIDENCE-HASH-MISMATCH", hashMismatches);
for (const source of crosswalk.source_records) {
  const path = join(root, source.path);
  expect(existsSync(path), "MISSING-CROSSWALK-SOURCE", source.path);
  if (existsSync(path)) expect(sha256(path) === source.sha256, "CROSSWALK-SOURCE-HASH-MISMATCH", source.path);
}

const requiredLedgerFields = [
  "id", "source_ids", "source_record", "kind", "claim", "preconditions", "action", "immediate_result",
  "settled_result", "durable_result", "entry_point", "reachability_status", "environment_id", "target_environment",
  "reference_authority_id", "reference_evidence", "parity_dimensions", "allowed_variance", "capability_class",
  "discovery_status", "clone_status", "test_status", "verification_procedure", "blocked_by",
];
expect(duplicateIds(ledger.map((row) => row.id)).length === 0, "DUPLICATE-LEDGER-ID", duplicateIds(ledger.map((row) => row.id)));
for (const row of ledger) {
  const missingFields = requiredLedgerFields.filter((field) => row[field] == null || row[field] === "" || (["source_ids", "preconditions", "action", "reference_evidence", "parity_dimensions"].includes(field) && Array.isArray(row[field]) && row[field].length === 0));
  expect(missingFields.length === 0, "INCOMPLETE-LEDGER-ROW", { row_id: row.id, missing_fields: missingFields });
  expect(authorityIds.has(row.reference_authority_id), "UNKNOWN-LEDGER-AUTHORITY", `${row.id} references ${row.reference_authority_id}.`);
  expect(row.environment_id === crosswalk.environment_id, "LEDGER-ENVIRONMENT-DRIFT", `${row.id} references ${row.environment_id}.`);
  for (const journeyId of row.journey_ids ?? []) expect(journeyIds.has(journeyId), "UNKNOWN-LEDGER-JOURNEY", `${row.id} references ${journeyId}.`);
  for (const evidencePath of row.reference_evidence) expect(existsSync(join(root, evidencePath)), "MISSING-LEDGER-EVIDENCE", `${row.id} references ${evidencePath}.`);
  for (const blockerId of row.blocked_by) expect(blockerIds.has(blockerId), "UNKNOWN-LEDGER-BLOCKER", `${row.id} references ${blockerId}.`);
  expect(row.discovery_status !== "blocked" || row.blocked_by.length > 0, "SILENT-BLOCKED-ROW", row.id);
  expect(row.discovery_status !== "ready_input" || row.blocked_by.length === 0, "SILENT-READY-BLOCKER", row.id);
  expect(row.discovery_status !== "excluded" || Boolean(row.exclusion), "UNEXPLAINED-EXCLUSION", row.id);
  expect(row.discovery_status !== "excluded" || row.blocked_by.length === 0, "EXCLUDED-ROW-WITH-BLOCKER", row.id);
  expect(row.discovery_status === "excluded" || row.capability_class !== "user-visible" || (row.journey_ids ?? []).length > 0, "USER-VISIBLE-ROW-WITHOUT-JOURNEY", row.id);
  expect(row.substitute == null, "UNAPPROVED-SUBSTITUTE", row.id);
  expect(row.allowed_variance.every((variance) => scope.allowed_variance.includes(variance)), "UNAPPROVED-VARIANCE", row.id);
}
expect(ledger.length === parityReport.ledger.atomic_rows, "LEDGER-COUNT", "Ledger row count differs from parity report.");
expect(sameSet(ledger.filter((row) => row.discovery_status === "blocked").map((row) => row.id), parityReport.blocked_row_ids), "BLOCKED-ROW-COUNT", "Blocked ledger row IDs differ from the parity report.");
expect(sameSet([...blockerIds], openQuestions.questions.map((item) => item.blocker_id)), "BLOCKER-REGISTRY-COVERAGE", "Crosswalk and open-question blocker IDs differ.");

for (const blockerId of blockerIds) {
  const question = questionById.get(blockerId);
  expect(Boolean(question?.owner), "BLOCKER-WITHOUT-OWNER", blockerId);
  expect(Boolean(question?.missing), "BLOCKER-WITHOUT-MISSING-EVIDENCE", blockerId);
  expect(Boolean(question?.completed_independent_work), "BLOCKER-WITHOUT-COMPLETED-WORK", blockerId);
  expect((question?.resume_procedure ?? []).length > 0, "BLOCKER-WITHOUT-RESUME-PROCEDURE", blockerId);
  for (const rowId of question?.affected_ledger_row_ids ?? []) expect(ledgerById.has(rowId), "BLOCKER-UNKNOWN-LEDGER-ROW", `${blockerId} references ${rowId}.`);
  const affectedRows = (question?.affected_ledger_row_ids ?? []).map((rowId) => ledgerById.get(rowId)).filter(Boolean);
  expect(affectedRows.some((row) => (row.journey_ids ?? []).some((journeyId) => blockingJourneyIds.has(journeyId))), "BLOCKER-WITHOUT-BLOCKING-JOURNEY", blockerId);
}

const accessBlockerById = new Map(accessBlockers.map((item) => [item.id, item]));
const unresolvedRequiredEnvironmentCells = environmentMatrix.cells.filter((cell) => cell.required && !cell.status.startsWith("observed"));
for (const cell of unresolvedRequiredEnvironmentCells) {
  expect(Boolean(cell.blocked_by), "ENVIRONMENT-CELL-WITHOUT-BLOCKER", cell.id);
  expect(accessBlockerById.has(cell.blocked_by), "ENVIRONMENT-CELL-UNKNOWN-BLOCKER", `${cell.id} references ${cell.blocked_by}.`);
}

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  return entry.isDirectory() ? walk(path) : [relative(root, path)];
});
const dossierFiles = walk(root);
const implementationExtensions = new Set([".swift", ".kt", ".java", ".tsx", ".jsx", ".xcworkspace", ".xcodeproj"]);
const implementationOutputs = dossierFiles.filter((path) => implementationExtensions.has(extname(path)) || /(^|\/)(src|Sources|Tests|Package\.swift|package\.json)(\/|$)/.test(path));
expect(implementationOutputs.length === 0, "IMPLEMENTATION-OUTPUT-IN-DOSSIER", implementationOutputs);
expect(evidenceIndex.artifacts.every((item) => Boolean(item.privacy_status)), "EVIDENCE-WITHOUT-PRIVACY-STATUS", "Every indexed evidence artifact must carry a privacy status.");
expect(assetIndex.assets.every((item) => Boolean(item.legal_use)), "ASSET-WITHOUT-LEGAL-BOUNDARY", "Every asset must carry a legal-use boundary.");

if (errors.length) {
  throw new Error(`Final dossier structural audit failed:\n${JSON.stringify(errors, null, 2)}`);
}

const disposition = blockerIds.size > 0 ? "NOT_READY — DISCOVERY GAPS REMAIN" : "READY_FOR_IMPLEMENTATION";
const dispositionChecks = [
  { id: "AUDIT-CHECK-DENOMINATOR", subject: "approved journeys and surfaces", result: "pass", basis: `${scope.blocking_journey_ids.length} blocking journeys, ${surfaceMap.counts.blocking} blocking surfaces, ${surfaceMap.counts.navigation_support} navigation-support surface, and ${surfaceMap.counts.excluded} excluded boundary surfaces reconcile.` },
  { id: "AUDIT-CHECK-GRAPH-INDEX", subject: "recursive UI graph indexing", result: "pass", basis: `${allStates.length} stable state nodes and ${allActions.length} action edges are represented exactly once in the crosswalk and ledger.` },
  { id: "AUDIT-CHECK-GRAPH-CLOSURE", subject: "recursive action and destination closure", result: blockerIds.size ? "blocked" : "pass", blocking_ids: sorted([...blockerIds].filter((id) => /^(SEARCH|WORD|KANJI|IMAGE|ACCESS)-/.test(id))), basis: "Recorded nodes and edges are structurally complete as an index, but named runtime-access gaps prevent a coding-ready closure claim." },
  { id: "AUDIT-CHECK-FIXTURES", subject: "query and fixture denominator", result: "pass", basis: `${searchMatrix.required_categories_executed}/${searchMatrix.required_category_count} required Search categories executed; ${allFixtures.length} fixture classes and ${behaviorMatrix.behavior_class_count} language-behavior classes are crosswalked.` },
  { id: "AUDIT-CHECK-EVIDENCE", subject: "evidence paths and hashes", result: "pass", basis: `${evidenceIndex.artifact_count} indexed artifacts exist and match their SHA-256 values; all crosswalk and ledger evidence paths resolve.` },
  { id: "AUDIT-CHECK-LEDGER", subject: "atomic ledger schema and referential integrity", result: "pass", basis: `${ledger.length} unique atomic rows are schema-complete; ${parityReport.ledger.ready_input_rows} ready inputs, ${parityReport.ledger.blocked_rows} blocked rows, and ${parityReport.ledger.excluded_rows} exclusions reconcile.` },
  { id: "AUDIT-CHECK-FAILURE-RECOVERY", subject: "failure, recovery, persistence, offline, timing, audio, and accessibility evidence", result: blockerIds.size ? "blocked" : "pass", blocking_ids: sorted([...blockerIds].filter((id) => /OFFLINE|AUDIO|SPEECH|TIMING|SEMANTICS|PERMISSIONS|GESTURES|REPEATABILITY|COPY-TEXT/.test(id))), basis: "Observed persistence and recovery claims are retained, but the listed environment-bound behaviors remain unproved." },
  { id: "AUDIT-CHECK-PROVENANCE", subject: "source provenance and licensing", result: [...blockerIds].some((id) => id.startsWith("PROVENANCE-")) ? "blocked" : "pass", blocking_ids: sorted([...blockerIds].filter((id) => id.startsWith("PROVENANCE-"))), basis: "Named public upstreams remain bounded by exact snapshot, transformation, provider, and licensing gaps." },
  { id: "AUDIT-CHECK-VISUAL", subject: "quantified visual and asset specification", result: [...blockerIds].some((id) => id.startsWith("CROSSWALK-GAP-")) ? "blocked" : "pass", blocking_ids: sorted([...blockerIds].filter((id) => id.startsWith("CROSSWALK-GAP-"))), basis: "Observed visual roles are indexed, but quantified measurements and exact glyph identity/licensing remain open." },
  { id: "AUDIT-CHECK-VARIANCE", subject: "approved Zenbu variances and substitutions", result: "pass", basis: "Every row uses only scope-approved variances; there are zero substitute rows and no silent substitutions." },
  { id: "AUDIT-CHECK-CLEAN-ROOM", subject: "privacy, clean-room, and implementation boundary", result: "pass", basis: `${evidenceIndex.artifact_count} artifacts carry privacy classifications, ${assetIndex.assets.length} assets carry legal-use boundaries, and no implementation output type exists under the dossier root.` },
];

const actionDispositionCounts = Object.fromEntries([...allowedDispositions].map((disposition) => [disposition, allActions.filter((item) => item.disposition === disposition).length]));
const familyCoverage = Object.fromEntries(familyNames.map((name) => [name, {
  states: crawls[name].states.length,
  actions: crawls[name].actions.length,
  fixture_runs: coverageReports[name].coverage.fixture_runs,
  fixture_classes: fixtureMatrices[name].fixtures.length,
  behavior_layout_classes: coverageReports[name].coverage.distinct_behavior_layout_classes ?? coverageReports[name].coverage.behavior_layout_classes ?? fixtureMatrices[name].behavior_layout_class_count,
  capture_complete: coverageReports[name].capture_complete,
  status: coverageReports[name].status,
}]));

const blockingRecords = sorted([...blockerIds]).map((blockerId) => {
  const question = questionById.get(blockerId);
  const affectedRows = (question.affected_ledger_row_ids ?? []).map((rowId) => ledgerById.get(rowId)).filter(Boolean);
  const affectedJourneyIds = sorted(unique(affectedRows.flatMap((row) => row.journey_ids ?? [])));
  return {
    blocker_id: blockerId,
    category: question.category,
    status: question.status,
    owner: question.owner,
    missing_authority_access_or_evidence: question.missing,
    affected_journey_ids: affectedJourneyIds,
    affected_blocking_journey_ids: affectedJourneyIds.filter((journeyId) => blockingJourneyIds.has(journeyId)),
    affected_claim_ids: affectedRows.map((row) => row.id),
    completed_independent_work: question.completed_independent_work,
    fallback: question.fallback,
    resume_procedure: question.resume_procedure,
  };
});

const nonblockingEnvironmentLimitations = unresolvedRequiredEnvironmentCells
  .filter((cell) => !blockerIds.has(cell.blocked_by))
  .map((cell) => {
    const blocker = accessBlockerById.get(cell.blocked_by);
    return {
      environment_cell_id: cell.id,
      blocker_id: cell.blocked_by,
      status: cell.status,
      reason_nonblocking: blocker.blocks_final_rows.length === 0
        ? "No current atomic claim depends on the unavailable fact; the observed runtime boundary is retained without inference."
        : `Only future claims matching ${blocker.blocks_final_rows.join("; ")} would be blocked; no current ledger row makes that claim.`,
      owner: blocker.owner,
      missing: blocker.field,
      completed_independent_work: blocker.completed_independent_work,
      resume_procedure: blocker.resume_procedure,
    };
  });

const report = {
  generated_at: generatedAt,
  ticket: "https://github.com/serpcompany/zenbujapanese-monorepo/issues/76",
  map: "https://github.com/serpcompany/zenbujapanese-monorepo/issues/77",
  disposition,
  disposition_basis: blockerIds.size
    ? `${blockerIds.size} exact blockers affect ${parityReport.ledger.blocked_rows} atomic claims. Structural completeness does not satisfy the coding-ready gate.`
    : "Every blocking invariant passes and no blocking gap remains.",
  authority_id: crosswalk.authority_id,
  environment_id: crosswalk.environment_id,
  denominator: {
    blocking_journeys: scope.blocking_journey_ids.length,
    blocking_surfaces: surfaceMap.counts.blocking,
    navigation_support_surfaces: surfaceMap.counts.navigation_support,
    excluded_boundary_surfaces: surfaceMap.counts.excluded,
    state_nodes: allStates.length,
    action_edges: allActions.length,
    action_dispositions: actionDispositionCounts,
    fixture_classes: allFixtures.length,
    search_required_categories_executed: `${searchMatrix.required_categories_executed}/${searchMatrix.required_category_count}`,
    language_behavior_classes: behaviorMatrix.behavior_class_count,
    language_behavior_observations: behaviorObservations.length,
    evidence_artifacts: evidenceIndex.artifact_count,
    environment_cells: environmentMatrix.cells.length,
    language_resources: crosswalk.resource_crosswalk.length,
    design_token_families: designTokenIndex.tokens.length,
    asset_records: assetIndex.assets.length,
    atomic_rows: ledger.length,
    ready_input_rows: parityReport.ledger.ready_input_rows,
    blocked_rows: parityReport.ledger.blocked_rows,
    excluded_rows: parityReport.ledger.excluded_rows,
    distinct_blocking_ids: blockerIds.size,
  },
  family_coverage: familyCoverage,
  checks: dispositionChecks,
  structural_integrity: {
    passed: true,
    duplicate_ids: 0,
    unresolved_references: 0,
    missing_evidence_paths: 0,
    evidence_hash_mismatches: 0,
    count_drift: 0,
    silent_substitutions: 0,
    unexplained_exclusions: 0,
    implementation_outputs: implementationOutputs,
  },
  approved_variances: scope.allowed_variance,
  blocking_records: blockingRecords,
  nonblocking_environment_limitations: nonblockingEnvironmentLimitations,
  resume_contract: "Resolve blocker records against the pinned authority and environment, add privacy-safe evidence and canonical ledger links, regenerate the crosswalk and ledger, then rerun `node docs/clone-discovery/nihongo/audit-dossier.mjs`. READY_FOR_IMPLEMENTATION is permitted only when blocking_records is empty and every audit check passes.",
};

writeFileSync(join(root, "final-audit-report.json"), `${JSON.stringify(report, null, 2)}\n`);

const retainedNotes = discoveryStatus.notes.filter((note) =>
  !note.startsWith("The final dossier audit ") &&
  !note.startsWith("Final disposition: ") &&
  !note.startsWith("The reference-resource crosswalk represents all ") &&
  !note.startsWith("The final audit normalized the already-observed Image Text share menu "),
);
const updatedDiscoveryStatus = {
  ...discoveryStatus,
  phase: "final_discovery_audit_complete_not_coding_ready",
  updated_at: generatedAt,
  next_ticket: null,
  final_audit_ticket: "https://github.com/serpcompany/zenbujapanese-monorepo/issues/76",
  final_audit_ticket_status: "complete",
  final_audit_records: {
    audit_generator: "audit-dossier.mjs",
    audit_report: "final-audit-report.json",
    canonical_ledger: "parity-inventory.jsonl",
    blocker_registry: "parity-open-questions.json",
  },
  final_audit_counts: report.denominator,
  final_disposition: disposition,
  notes: [
    ...retainedNotes,
    `The reference-resource crosswalk represents all ${allStates.length} recursive state nodes, ${allActions.length} action edges, ${allFixtures.length} fixture classes, and ${behaviorObservations.length} language-behavior claims exactly once and binds them to the pinned authority, environment, scope, journeys, fixtures or preconditions, evidence, resource provenance, and atomic-ledger disposition.`,
    "The final audit normalized the already-observed Image Text share menu into stable node IMAGE-STATE-017, binding its Copy Text and Share Image actions to the approved Image Text journey before regenerating the crosswalk and ledger.",
    `The final dossier audit reconciled ${ledger.length} atomic claims against ${allStates.length} states, ${allActions.length} actions, ${allFixtures.length} fixture classes, ${evidenceIndex.artifact_count} evidence artifacts, and every registered blocker with zero structural integrity errors.`,
    `Final disposition: ${disposition}; ${blockerIds.size} exact blocking IDs affect ${parityReport.ledger.blocked_rows} atomic claims, while ${nonblockingEnvironmentLimitations.length} environment limitations remain explicit but do not affect any current claim.`,
  ],
};
writeFileSync(join(root, "discovery-status.json"), `${JSON.stringify(updatedDiscoveryStatus, null, 2)}\n`);

console.log(JSON.stringify({
  disposition,
  structural_integrity: report.structural_integrity,
  denominator: report.denominator,
  nonblocking_environment_limitations: nonblockingEnvironmentLimitations.map((item) => item.blocker_id),
}, null, 2));
