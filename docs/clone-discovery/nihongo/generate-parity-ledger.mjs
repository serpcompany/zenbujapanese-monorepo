import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const readJson = (name) => JSON.parse(readFileSync(join(root, name), "utf8"));
const unique = (values) => [...new Set((values ?? []).filter(Boolean))];
const asArray = (value) => value == null ? [] : Array.isArray(value) ? value : [value];
const generatedAt = new Date().toISOString();

const scope = readJson("scope.json");
const authorities = readJson("reference-authorities.json");
const authority = authorities[0];
const journeysDocument = readJson("journeys.json");
const journeys = journeysDocument.journeys;
const surfaceMap = readJson("surface-map.json");
const referenceEvidence = readJson("reference-evidence.json");
const crosswalk = readJson("reference-resource-crosswalk.json");
const crosswalkReport = readJson("crosswalk-coverage-report.json");
const designTokenIndex = readJson("design-token-index.json");
const assetIndex = readJson("asset-index.json");
const discoveryStatus = readJson("discovery-status.json");
const finalAuditComplete = Boolean(discoveryStatus.final_disposition);

const evidenceById = new Map(referenceEvidence.map((item) => [item.evidence_id, item.path]));
const journeyById = new Map(journeys.map((item) => [item.journey_id, item]));
const surfaceById = new Map(surfaceMap.surfaces.map((item) => [item.surface_id, item]));
const targetEnvironment = [
  authority.platform,
  authority.device,
  authority.appearance,
  authority.orientation,
  authority.locale,
].filter(Boolean).join(" / ");

const blockerRecords = [
  ...crosswalkReport.inherited_access_blockers.map((item) => ({ ...item, blocker_id: item.id, category: item.category ?? "runtime-access" })),
  ...crosswalkReport.inherited_provenance_gaps.map((item) => ({ ...item, blocker_id: item.gap_id })),
  ...crosswalkReport.crosswalk_gaps.map((item) => ({ ...item, blocker_id: item.gap_id })),
];
const blockerById = new Map(blockerRecords.map((item) => [item.blocker_id, item]));

const visualVariances = scope.allowed_variance.filter((item) =>
  /colors|typography|logos|icons|bottom-navigation/i.test(item),
);
const imageAddition = scope.allowed_variance.find((item) => /natural-translation/i.test(item));
const kanjiSourceVariance = scope.allowed_variance.find((item) => /source-dependent row denominators/i.test(item));

const allowedVarianceFor = (dimensions, surfaceIds = []) => unique([
  ...(dimensions.includes("visual") ? visualVariances : []),
  ...(surfaceIds.some((id) => id === "LOOKUP-IMAGE-TEXT-RESULT") && imageAddition ? [imageAddition] : []),
  ...(surfaceIds.some((id) => id.startsWith("LOOKUP-KANJI-")) && kanjiSourceVariance ? [kanjiSourceVariance] : []),
]);

const entryPointForJourneys = (journeyIds) => {
  const entries = unique(journeyIds.map((id) => {
    const journey = journeyById.get(id);
    if (!journey) return null;
    const surface = surfaceById.get(journey.entry_surface_id);
    return `${journey.name}: ${(surface?.entry_paths ?? [journey.entry_surface_id]).join(" | ")}`;
  }));
  return entries.length ? entries.join("; ") : "Supporting reference input; reach through the linked surface and row IDs.";
};

const baseRow = ({
  id,
  sourceIds,
  kind,
  claim,
  journeyIds = [],
  surfaceIds = [],
  preconditions,
  action,
  immediateResult,
  settledResult,
  durableResult,
  evidencePaths = [],
  dimensions,
  blockerIds = [],
  exclusion = null,
  capabilityClass = "user-visible",
  fixtureIds = [],
  designTokenIds = [],
  assetIds = [],
  resourceIds = [],
  conflicts = [],
  sourceRecord,
  verificationProcedure,
}) => ({
  id,
  source_ids: unique(sourceIds),
  source_record: sourceRecord,
  kind,
  claim,
  journey_ids: unique(journeyIds),
  surface_ids: unique(surfaceIds),
  fixture_ids: unique(fixtureIds),
  preconditions: asArray(preconditions),
  action: asArray(action),
  immediate_result: immediateResult,
  settled_result: settledResult,
  durable_result: durableResult,
  entry_point: entryPointForJourneys(unique(journeyIds)),
  reachability_status: exclusion ? "excluded_by_approved_scope" : blockerIds.length ? "observed_with_blocking_gap" : "observed",
  environment_id: crosswalk.environment_id,
  target_environment: targetEnvironment,
  reference_authority_id: crosswalk.authority_id,
  reference_evidence: unique(evidencePaths).length ? unique(evidencePaths) : [sourceRecord],
  parity_dimensions: unique(dimensions),
  allowed_variance: allowedVarianceFor(unique(dimensions), unique(surfaceIds)),
  capability_class: exclusion ? "excluded" : capabilityClass,
  discovery_status: exclusion ? "excluded" : blockerIds.length ? "blocked" : "ready_input",
  clone_status: "unknown",
  test_status: "not_run",
  verification_procedure: verificationProcedure,
  design_token_ids: unique(designTokenIds),
  asset_ids: unique(assetIds),
  resource_ids: unique(resourceIds),
  conflict_ids: unique(conflicts),
  blocked_by: unique(blockerIds),
  substitute: null,
  exclusion,
  notes: "Discovery-only reference claim. No Zenbu implementation or verification status is asserted.",
});

const surfaceRows = surfaceMap.surfaces.map((surface) => {
  const journeyIds = journeys.filter((journey) => journey.surfaces.includes(surface.surface_id)).map((journey) => journey.journey_id);
  const evidencePaths = asArray(surface.evidence_ids).map((id) => evidenceById.get(id)).filter(Boolean);
  const statesObserved = asArray(surface.states_observed);
  const controls = asArray(surface.controls);
  const excluded = surface.scope === "excluded";
  return baseRow({
    id: `PARITY-SURFACE-${surface.surface_id}`,
    sourceIds: [surface.surface_id],
    sourceRecord: "surface-map.json",
    kind: "surface",
    claim: `${surface.name} is a ${surface.kind} with observed states ${statesObserved.join("; ") || "none retained"} and controls ${controls.join("; ") || "none retained"}.`,
    journeyIds,
    surfaceIds: [surface.surface_id],
    preconditions: surface.entry_paths,
    action: ["Navigate through one recorded entry path and wait for the surface to settle."],
    immediateResult: `The ${surface.name} surface is entered.`,
    settledResult: `Observed controls and state roles are present: ${controls.join("; ") || "approved boundary only"}.`,
    durableResult: "No separate durable output is asserted by the surface-presence claim.",
    evidencePaths,
    dimensions: ["visual", "interaction", "state-data"],
    exclusion: excluded ? `Approved scope classification: ${surface.scope_basis}.` : null,
    capabilityClass: "user-visible",
    verificationProcedure: `Replay an entry path from surface-map.json for ${surface.surface_id}; compare the settled presentation and controls with the retained evidence.`,
  });
});

const nodeRows = crosswalk.node_crosswalk.map((node) => baseRow({
  id: `PARITY-STATE-${node.source_id}`,
  sourceIds: [node.source_id, node.crosswalk_id],
  sourceRecord: node.source_record,
  kind: "state-node",
  claim: `${node.name} is an observed distinguishable state on ${node.surface_id}.`,
  journeyIds: node.journey_ids,
  surfaceIds: [node.surface_id],
  fixtureIds: node.fixture_binding.fixture_ids,
  preconditions: [node.fixture_binding.precondition, ...node.fixture_binding.fixture_ids.map((id) => `Prepare fixture ${id}.`)],
  action: [`Recreate ${node.source_id} from the recorded source precondition and wait for two stable reads.`],
  immediateResult: `The runtime enters ${node.source_id}.`,
  settledResult: `${node.name}; visible content: ${(node.visible_text ?? []).join("; ") || "see retained evidence"}.`,
  durableResult: "No separate durable output is asserted by this state-presentation row; persistence is covered by linked action or behavior rows.",
  evidencePaths: node.evidence_paths,
  dimensions: ["visual", "state-data"],
  blockerIds: node.blocker_ids,
  exclusion: node.exclusion,
  fixtureIds: node.fixture_binding.fixture_ids,
  designTokenIds: node.design_token_ids,
  assetIds: node.asset_ids,
  conflicts: node.conflict_ids,
  verificationProcedure: `Recreate ${node.source_id} using ${node.source_record}, apply its fixture/precondition, wait for a settled state, and compare visible fields against the referenced evidence.`,
}));

const actionRows = crosswalk.action_crosswalk.map((edge) => baseRow({
  id: `PARITY-ACTION-${edge.source_id}`,
  sourceIds: [edge.source_id, edge.crosswalk_id, edge.source, edge.observed_result],
  sourceRecord: edge.source_record,
  kind: "action-edge",
  claim: `From ${edge.source}, ${edge.trigger} has disposition ${edge.disposition} and the recorded result ${edge.observed_result}.`,
  journeyIds: edge.journey_ids,
  surfaceIds: edge.surface_ids,
  fixtureIds: edge.fixture_binding.fixture_ids,
  preconditions: [edge.fixture_binding.precondition, ...edge.fixture_binding.fixture_ids.map((id) => `Prepare fixture ${id}.`)],
  action: [edge.trigger],
  immediateResult: `Observe the immediate response to ${edge.trigger}; the recorded edge disposition is ${edge.disposition}.`,
  settledResult: `The settled recorded result is ${edge.observed_result}.`,
  durableResult: "Inspect the linked journey and state after navigation/relaunch; no durable mutation beyond those recorded sources is inferred by this edge.",
  evidencePaths: edge.evidence_paths,
  dimensions: ["interaction", "behavior", "state-data"],
  blockerIds: edge.blocker_ids,
  exclusion: edge.exclusion,
  designTokenIds: edge.design_token_ids,
  assetIds: edge.asset_ids,
  conflicts: edge.conflict_ids,
  verificationProcedure: `Restore ${edge.source}, apply the fixture/precondition in ${edge.source_record}, perform exactly “${edge.trigger}”, record immediate and settled states, then verify ${edge.disposition} and ${edge.observed_result}.`,
}));

const fixtureRows = crosswalk.fixture_crosswalk.map((fixture) => baseRow({
  id: `PARITY-FIXTURE-${fixture.source_id}`,
  sourceIds: [fixture.source_id, fixture.crosswalk_id, ...fixture.behavior_layout_classes],
  sourceRecord: fixture.source_record,
  kind: "fixture-behavior-class",
  claim: `Fixture ${fixture.source_id} (${fixture.exact_input ?? fixture.family}) exercises ${fixture.required_categories.join("; ")} and represents ${fixture.behavior_layout_classes.join("; ")}.`,
  journeyIds: fixture.journey_ids,
  surfaceIds: unique([
    ...fixture.linked_state_ids.map((id) => crosswalk.node_crosswalk.find((node) => node.source_id === id)?.surface_id),
    ...fixture.linked_action_ids.flatMap((id) => crosswalk.action_crosswalk.find((edge) => edge.source_id === id)?.surface_ids ?? []),
  ]),
  fixtureIds: [fixture.source_id],
  preconditions: [`Use exact input ${JSON.stringify(fixture.exact_input ?? fixture.family)}.`, `Use selection mode: ${fixture.selection_mode ?? "recorded fixture procedure"}.`],
  action: ["Execute every linked action from a restored starting state."],
  immediateResult: `The input is accepted under the recorded ${fixture.family} fixture procedure.`,
  settledResult: `The represented behavior/layout classes are ${fixture.behavior_layout_classes.join("; ")}.`,
  durableResult: "Only durable outcomes explicitly claimed by linked actions or observations are expected; the fixture itself creates no implied product record.",
  evidencePaths: fixture.evidence_paths,
  dimensions: ["behavior", "state-data"],
  blockerIds: fixture.blocker_ids,
  assetIds: fixture.asset_ids,
  conflicts: fixture.conflict_ids,
  capabilityClass: "supporting-internal",
  verificationProcedure: `Execute ${fixture.source_id} exactly as defined in ${fixture.source_record}; replay linked state/action IDs and compare the resulting behavior/layout class with retained evidence.`,
}));

const behaviorRows = crosswalk.language_behavior_claim_crosswalk.map((behavior) => baseRow({
  id: `PARITY-BEHAVIOR-${behavior.source_id}`,
  sourceIds: [behavior.source_id, behavior.crosswalk_id, behavior.class_id, ...behavior.state_ids, ...behavior.action_ids],
  sourceRecord: behavior.source_record,
  kind: "language-behavior",
  claim: behavior.observed_output,
  journeyIds: behavior.journey_ids,
  surfaceIds: behavior.surface_ids,
  fixtureIds: behavior.fixture_ids,
  preconditions: [`Prepare exact inputs: ${behavior.exact_inputs.join("; ")}.`, `Use only the recorded ${behavior.language_capability} observation boundary.`],
  action: [`Replay linked actions ${behavior.action_ids.join(", ")} from linked states ${behavior.state_ids.join(", ")}.`],
  immediateResult: "Record the visible or audible response without inferring an internal implementation.",
  settledResult: behavior.observed_output,
  durableResult: "No language-source identity, persistence, or offline behavior beyond the explicit observation is inferred.",
  evidencePaths: behavior.evidence_paths,
  dimensions: ["behavior", "state-data"],
  blockerIds: behavior.blocker_ids,
  resourceIds: behavior.resource_ids,
  conflicts: behavior.conflict_ids,
  verificationProcedure: `Run ${behavior.source_id} with the exact inputs and linked fixtures in behavior-observations.jsonl; capture output/order deltas and compare only the stated observable fields.`,
}));

const resourceRows = crosswalk.resource_crosswalk.map((resource) => baseRow({
  id: `PARITY-RESOURCE-${resource.resource_id}`,
  sourceIds: [resource.resource_id, ...resource.observed_claim_ids],
  sourceRecord: "reference-resource-crosswalk.json",
  kind: "language-resource",
  claim: `${resource.identity} is classified as ${resource.status} for ${resource.capabilities.join("; ")}; legal boundary: ${resource.source_legal_status}.`,
  journeyIds: unique(resource.applicable_surface_ids.flatMap((surfaceId) => journeys.filter((journey) => journey.surfaces.includes(surfaceId)).map((journey) => journey.journey_id))),
  surfaceIds: resource.applicable_surface_ids,
  preconditions: ["Use separately acquired, legally available source/provider evidence; do not inspect or copy the proprietary runtime payload."],
  action: ["Resolve the named provenance gaps, then compare independently acquired source records with linked observable claims."],
  immediateResult: `Identity boundary remains ${resource.status}.`,
  settledResult: `Only ${resource.identity} at the recorded confidence boundary may be asserted.`,
  durableResult: "Retain app-owned Language Reference Data provenance independently of any provider schema.",
  evidencePaths: [],
  dimensions: ["state-data", "integration", "package-platform"],
  blockerIds: resource.gap_ids,
  conflicts: resource.conflict_ids,
  capabilityClass: "supporting-internal",
  resourceIds: [resource.resource_id],
  verificationProcedure: `Follow every resume procedure for ${resource.gap_ids.join(", ")}; bind independently acquired evidence to the linked observation IDs and preserve prohibited parity claims.`,
}));

const designRows = designTokenIndex.tokens.map((token) => baseRow({
  id: `PARITY-DESIGN-${token.token_id}`,
  sourceIds: [token.token_id],
  sourceRecord: "design-token-index.json",
  kind: "design-property",
  claim: token.observed,
  journeyIds: unique(token.applicable_surface_ids.flatMap((surfaceId) => journeys.filter((journey) => journey.surfaces.includes(surfaceId)).map((journey) => journey.journey_id))),
  surfaceIds: token.applicable_surface_ids,
  preconditions: ["Use the pinned dark, portrait physical-iPhone environment and retained settled screenshots."],
  action: ["Measure or compare the named design role without copying Nihongo branding or proprietary assets."],
  immediateResult: `The ${token.category} role is visible at the recorded observation boundary.`,
  settledResult: `${token.observed} Status: ${token.status}.`,
  durableResult: "Record quantified tokens as Zenbu-owned design data; no reference asset is copied.",
  evidencePaths: token.evidence_paths,
  dimensions: ["visual"],
  blockerIds: token.blocker_ids,
  capabilityClass: "supporting-internal",
  designTokenIds: [token.token_id],
  verificationProcedure: `Use calibrated comparison for ${token.token_id} against its indexed evidence; record values, uncertainty, and Zenbu variance without overwriting the observed baseline.`,
}));

const assetRows = assetIndex.assets.map((asset) => {
  const excluded = asset.status === "excluded_approved_variance";
  return baseRow({
    id: `PARITY-ASSET-${asset.asset_id}`,
    sourceIds: [asset.asset_id],
    sourceRecord: "asset-index.json",
    kind: "asset-or-fixture",
    claim: `${asset.asset_id} is ${asset.kind}, status ${asset.status}; ${asset.legal_use}`,
    journeyIds: unique(asset.applicable_surface_ids.flatMap((surfaceId) => journeys.filter((journey) => journey.surfaces.includes(surfaceId)).map((journey) => journey.journey_id))),
    surfaceIds: asset.applicable_surface_ids,
    fixtureIds: asset.fixture_ids,
    preconditions: [asset.path ? `Use repository path ${asset.path} and verify SHA-256 ${asset.sha256}.` : "Do not acquire or copy the reference asset; use only the recorded observable role and legal boundary."],
    action: [asset.path ? "Load the purpose-created fixture through its linked deterministic procedure." : "Select an original or licensed substitute only after its parity limits are recorded."],
    immediateResult: `Asset/fixture role is ${asset.kind}.`,
    settledResult: `Recorded status is ${asset.status}.`,
    durableResult: asset.path ? `The reusable fixture remains at ${asset.path} with the recorded hash.` : asset.legal_use,
    evidencePaths: asset.evidence_paths,
    dimensions: ["visual", "state-data"],
    blockerIds: asset.blocker_ids,
    exclusion: excluded ? asset.legal_use : null,
    capabilityClass: asset.kind === "purpose-created-discovery-fixture" ? "supporting-internal" : "user-visible",
    assetIds: [asset.asset_id],
    verificationProcedure: asset.path
      ? `Hash ${asset.path}, execute every linked fixture ID, and compare the observed output with retained reference evidence.`
      : `Resolve blockers ${asset.blocker_ids.join(", ") || "recorded legal boundary"}; verify role and behavior from screenshots without extracting the reference payload.`,
  });
});

const rows = [
  ...surfaceRows,
  ...nodeRows,
  ...actionRows,
  ...fixtureRows,
  ...behaviorRows,
  ...resourceRows,
  ...designRows,
  ...assetRows,
];

const requiredFields = [
  "id", "source_ids", "source_record", "kind", "claim", "preconditions", "action",
  "immediate_result", "settled_result", "durable_result", "entry_point", "reachability_status",
  "environment_id", "target_environment", "reference_authority_id", "reference_evidence",
  "parity_dimensions", "allowed_variance", "capability_class", "discovery_status", "clone_status",
  "test_status", "verification_procedure", "blocked_by",
];
const duplicateRowIds = rows.map((row) => row.id).filter((id, index, all) => all.indexOf(id) !== index);
const missingRequiredFields = rows.flatMap((row) => requiredFields
  .filter((field) => row[field] == null || row[field] === "" || (Array.isArray(row[field]) && ["source_ids", "preconditions", "action", "reference_evidence", "parity_dimensions"].includes(field) && row[field].length === 0))
  .map((field) => ({ row_id: row.id, field })));
const unknownBlockerIds = unique(rows.flatMap((row) => row.blocked_by)).filter((id) => !blockerById.has(id));
const missingEvidencePaths = unique(rows.flatMap((row) => row.reference_evidence))
  .filter((path) => !existsSync(join(root, path)));
const invalidDiscoveryStatuses = rows.filter((row) => !["ready_input", "blocked", "excluded"].includes(row.discovery_status)).map((row) => row.id);
const invalidCloneStatuses = rows.filter((row) => row.clone_status !== "unknown" || row.test_status !== "not_run").map((row) => row.id);

const sourceCoverage = {
  surfaces: surfaceRows.length,
  nodes: nodeRows.length,
  actions: actionRows.length,
  fixtures: fixtureRows.length,
  behavior_claims: behaviorRows.length,
  language_resources: resourceRows.length,
  design_token_families: designRows.length,
  assets: assetRows.length,
};
const expectedCoverage = {
  surfaces: crosswalk.counts.source_surfaces,
  nodes: crosswalk.counts.source_nodes,
  actions: crosswalk.counts.source_actions,
  fixtures: crosswalk.counts.source_fixtures,
  behavior_claims: crosswalk.counts.source_behavior_claims,
  language_resources: crosswalk.counts.language_resource_records,
  design_token_families: crosswalk.counts.design_token_families,
  assets: crosswalk.counts.asset_records,
};
const countDrift = Object.keys(expectedCoverage)
  .filter((key) => sourceCoverage[key] !== expectedCoverage[key])
  .map((key) => ({ category: key, expected: expectedCoverage[key], actual: sourceCoverage[key] }));
const registryGapIds = crosswalkReport.blocking_gap_ids.filter((id) => !blockerById.has(id));

const integrity = {
  duplicate_row_ids: duplicateRowIds,
  missing_required_fields: missingRequiredFields,
  unknown_row_blocker_ids: unknownBlockerIds,
  missing_registry_blocker_ids: registryGapIds,
  missing_evidence_paths: missingEvidencePaths,
  invalid_discovery_status_rows: invalidDiscoveryStatuses,
  invalid_clone_or_test_status_rows: invalidCloneStatuses,
  count_drift: countDrift,
};
integrity.passed = Object.entries(integrity).every(([key, value]) => key === "passed" || value.length === 0);

if (!integrity.passed) {
  throw new Error(`Parity ledger integrity failed:\n${JSON.stringify(integrity, null, 2)}`);
}

const countBy = (field, value) => rows.filter((row) => row[field] === value).length;
const blockedRowIds = rows.filter((row) => row.discovery_status === "blocked").map((row) => row.id);
const hasBlockers = crosswalkReport.blocking_gap_ids.length > 0;
const effectiveAuditDisposition = hasBlockers
  ? (discoveryStatus.final_disposition ?? "NOT_READY — DISCOVERY GAPS REMAIN")
  : "READY_FOR_IMPLEMENTATION";
const coverageReport = {
  generated_at: generatedAt,
  ticket: "https://github.com/serpcompany/zenbujapanese-monorepo/issues/75",
  authority_id: crosswalk.authority_id,
  environment_id: crosswalk.environment_id,
  disposition: hasBlockers ? "LEDGER_COMPLETE_NOT_CODING_READY" : "LEDGER_COMPLETE_CODING_READY_INPUT",
  count_definitions: {
    schema_complete: "Every row contains the required atomic claim, reproduction, result, authority, evidence, parity, status, and future-verification fields.",
    ready_input: "The observed reference input has no recorded discovery blocker; clone/test statuses remain unknown/not_run.",
    blocked: "The row is indexed but one or more named gaps prevent a coding-ready parity claim.",
    excluded: "The row preserves an approved scope or branding boundary and is not implementation scope.",
  },
  source_coverage: sourceCoverage,
  expected_source_coverage: expectedCoverage,
  ledger: {
    atomic_rows: rows.length,
    schema_complete_rows: rows.length - new Set(missingRequiredFields.map((item) => item.row_id)).size,
    schema_incomplete_rows: new Set(missingRequiredFields.map((item) => item.row_id)).size,
    ready_input_rows: countBy("discovery_status", "ready_input"),
    blocked_rows: blockedRowIds.length,
    excluded_rows: countBy("discovery_status", "excluded"),
    clone_unknown_rows: countBy("clone_status", "unknown"),
    test_not_run_rows: countBy("test_status", "not_run"),
    distinct_blocker_ids: crosswalkReport.blocking_gap_ids.length,
  },
  blocked_row_ids: blockedRowIds,
  blocking_gap_ids: crosswalkReport.blocking_gap_ids,
  integrity,
  privacy_and_clean_room: crosswalkReport.privacy_and_clean_room,
  next_ticket_effect: finalAuditComplete
    ? `The final recursive audit disposition is ${effectiveAuditDisposition}; rerun audit-dossier.mjs after any canonical discovery change.`
    : "The final recursive audit may consume this ledger mechanically. It must issue NOT_READY while any blocking gap remains and must not infer implementation readiness from structural ledger completeness.",
};

const openQuestions = {
  generated_at: generatedAt,
  ticket: "https://github.com/serpcompany/zenbujapanese-monorepo/issues/75",
  disposition: hasBlockers ? "OPEN_BLOCKERS_PREVENT_CODING_READY_HANDOFF" : "NO_OPEN_BLOCKERS",
  blocking_question_count: crosswalkReport.blocking_gap_ids.length,
  questions: crosswalkReport.blocking_gap_ids.map((blockerId) => {
    const blocker = blockerById.get(blockerId);
    return {
      blocker_id: blockerId,
      category: blocker.category ?? "discovery-gap",
      owner: blocker.owner,
      missing: blocker.missing ?? blocker.field,
      status: blocker.status ?? "open",
      affected_source_ids: unique([
        ...asArray(blocker.affected_records),
        ...asArray(blocker.affected_capabilities),
        ...asArray(blocker.affected_ids),
      ]),
      affected_ledger_row_ids: rows.filter((row) => row.blocked_by.includes(blockerId)).map((row) => row.id),
      completed_independent_work: blocker.completed_independent_work,
      fallback: blocker.fallback ?? null,
      resume_procedure: asArray(blocker.resume_procedure),
    };
  }),
};

const handoff = `# Lookup parity implementation handoff\n\n` +
`Status: **${coverageReport.disposition}**\n\n` +
`This is a discovery-only handoff for the approved Search-rooted Lookup graph. It contains no Zenbu implementation, scaffolding, dependency, service, or prototype work. ${finalAuditComplete ? `The final recursive audit is recorded in \`final-audit-report.json\` with disposition \`${effectiveAuditDisposition}\`.` : "The final recursive audit remains owned by the next Wayfinder ticket."}\n\n` +
`## Canonical sources\n\n` +
`- \`parity-inventory.jsonl\` is the only mutable atomic observable-claim ledger.\n` +
`- \`parity-coverage-report.json\` is generated from the ledger and canonical crosswalk.\n` +
`- \`parity-open-questions.json\` is the generated blocker registry with owners and resume procedures.\n` +
`- \`reference-resource-crosswalk.json\`, the crawl files, fixture matrices, and evidence index are source indexes; they do not compete with the ledger for row status.\n` +
`- Regenerate and audit all four outputs with \`node docs/clone-discovery/nihongo/generate-parity-ledger.mjs\`.\n\n` +
`## Exact denominator\n\n` +
`The ledger has ${rows.length} atomic rows: ${sourceCoverage.surfaces} surfaces, ${sourceCoverage.nodes} distinguishable states, ${sourceCoverage.actions} action edges, ${sourceCoverage.fixtures} fixture/behavior-class inputs, ${sourceCoverage.behavior_claims} observable language-behavior claims, ${sourceCoverage.language_resources} language-resource boundaries, ${sourceCoverage.design_token_families} design-token families, and ${sourceCoverage.assets} asset/fixture records. All ${rows.length} rows are schema-complete; ${coverageReport.ledger.ready_input_rows} are ready reference inputs, ${coverageReport.ledger.blocked_rows} are explicitly blocked, and ${coverageReport.ledger.excluded_rows} preserve approved exclusions. All clone statuses are \`unknown\` and all test statuses are \`not_run\`.\n\n` +
`## Implementation-use contract\n\n` +
`A later implementation agent must select an approved journey, locate all rows by \`journey_ids\`, reproduce each row from its \`preconditions\`, \`fixture_ids\`, and \`action\`, and implement immediate, settled, durable, failure, recovery, and relaunch behavior only to the boundary explicitly stated. It must retain app-owned Language Reference Data behind the focused Shared Capability boundaries in ADR 0001. It must add clone evidence and passed tests before changing any row from \`unknown\`; structural completeness is not runtime verification.\n\n` +
`Reference evidence records the observed Nihongo baseline. The approved variances and nonblocking boundaries are canonical in \`scope.json\`; they include Zenbu-owned visual measurements, glyphs, accessible semantics, pitch-record selection, pronunciation-source routing, repeatability, navigation gestures, long press, and individual history-row deletion. The whole-content Natural Translation is an approved Image Text Flow addition, not evidence of Nihongo behavior.\n\n` +
`## Deterministic fixtures and fault injection\n\n` +
`Fixture rows point to exact inputs and source matrices. Purpose-created image assets carry hashes in \`asset-index.json\`. Future tests must restore the recorded state between runs and inject offline, denial, cancellation, interruption, retry, and recovery only where named rows require them. A neighboring environment or fixture never inherits a pass.\n\n` +
`## Blocking handoff limits\n\n` +
`${hasBlockers
  ? `${coverageReport.ledger.distinct_blocker_ids} distinct gaps block coding readiness. Each blocker’s exact owner, completed independent work, affected rows, and resume procedure lives in \`parity-open-questions.json\`.`
  : "No discovery blocker remains. The zero-question registry in `parity-open-questions.json` is the canonical confirmation that no external action or decision gates implementation."}\n\n` +
`Do not claim exact internal algorithms, provider record identity, clip routing, reference asset identity, reference accessibility behavior, timing, offline behavior, or licensing beyond the recorded authority. Apply the approved Zenbu-owned substitutes and nonblocking boundaries from \`scope.json\` without describing them as exact Nihongo parity.\n\n` +
`## Handoff gate\n\n` +
`${hasBlockers
  ? `This ledger is complete as an index and **not coding-ready**. ${finalAuditComplete ? `The completed audit issued \`${effectiveAuditDisposition}\`; rerun \`audit-dossier.mjs\` after resolving blockers.` : "The next audit must reconcile every row, evidence path/hash, blocker, exclusion, and generated count."}`
  : `This ledger is complete as a **coding-ready discovery input**. The blocker list is empty and the audited disposition is \`${effectiveAuditDisposition}\`; implementation must still add clone evidence and passed tests before changing any row from \`unknown\`.`}\n`;

writeFileSync(join(root, "parity-inventory.jsonl"), `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
writeFileSync(join(root, "parity-coverage-report.json"), `${JSON.stringify(coverageReport, null, 2)}\n`);
writeFileSync(join(root, "parity-open-questions.json"), `${JSON.stringify(openQuestions, null, 2)}\n`);
writeFileSync(join(root, "implementation-handoff.md"), handoff);

const ledgerNote = `The canonical parity ledger contains ${rows.length} schema-complete atomic rows derived from explicit source IDs; clone_status remains unknown and test_status remains not_run for every row.`;
const blockerNote = hasBlockers
  ? `${coverageReport.ledger.distinct_blocker_ids} distinct blockers affect ${coverageReport.ledger.blocked_rows} ledger rows; the generated handoff is structurally complete but not coding-ready.`
  : "No discovery blockers affect the ledger; the generated handoff is a coding-ready discovery input, while clone and test statuses remain intentionally unknown/not_run.";
const retainedNotes = discoveryStatus.notes.filter((note) =>
  !note.startsWith("The canonical parity ledger contains ") &&
  !/^\d+ distinct blockers affect \d+ ledger rows;/.test(note) &&
  !note.startsWith("No discovery blockers affect the ledger;"),
);
const updatedDiscoveryStatus = {
  ...discoveryStatus,
  updated_at: generatedAt,
  phase: finalAuditComplete ? discoveryStatus.phase : hasBlockers ? "atomic_parity_ledger_complete_with_explicit_blockers" : "atomic_parity_ledger_complete_coding_ready_input",
  parity_ledger_ticket: "https://github.com/serpcompany/zenbujapanese-monorepo/issues/75",
  parity_ledger_ticket_status: hasBlockers ? "complete_with_explicit_blockers" : "complete_coding_ready_input",
  parity_ledger_records: {
    inventory: "parity-inventory.jsonl",
    coverage_report: "parity-coverage-report.json",
    open_questions: "parity-open-questions.json",
    implementation_handoff: "implementation-handoff.md",
    generator: "generate-parity-ledger.mjs",
  },
  parity_ledger_counts: coverageReport.ledger,
  next_ticket: finalAuditComplete ? null : "https://github.com/serpcompany/zenbujapanese-monorepo/issues/80",
  notes: [
    ...retainedNotes,
    ledgerNote,
    blockerNote,
  ],
};
writeFileSync(join(root, "discovery-status.json"), `${JSON.stringify(updatedDiscoveryStatus, null, 2)}\n`);

console.log(JSON.stringify({
  disposition: coverageReport.disposition,
  rows: coverageReport.ledger,
  source_coverage: sourceCoverage,
  integrity: coverageReport.integrity.passed,
}, null, 2));
