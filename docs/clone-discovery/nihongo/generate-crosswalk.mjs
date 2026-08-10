import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./", import.meta.url));
const generatedAt = new Date().toISOString();
const authorityId = "nihongo-ios-1.34.3-9792-runtime";
const environmentId = "ENV-IOS-PHYSICAL-DARK-PORTRAIT-001";

const readJson = (name) => JSON.parse(readFileSync(join(root, name), "utf8"));
const readJsonl = (name) => readFileSync(join(root, name), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
const uniq = (values) => [...new Set(values.flat().filter((value) => value !== null && value !== undefined && value !== ""))];
const array = (value) => value === null || value === undefined ? [] : Array.isArray(value) ? value : [value];
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const output = (name, value) => writeFileSync(join(root, name), `${JSON.stringify(value, null, 2)}\n`);
const rel = (path) => relative(root, path).split("\\").join("/");

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const sourceFiles = [
  "scope.json",
  "reference-authorities.json",
  "journeys.json",
  "surface-map.json",
  "state-transitions.json",
  "reference-evidence.json",
  "access-blockers.json",
  "search-crawl.json",
  "word-crawl.json",
  "kanji-crawl.json",
  "image-crawl.json",
  "search-fixture-matrix.json",
  "word-fixture-matrix.json",
  "kanji-fixture-matrix.json",
  "image-fixture-matrix.json",
  "behavior-fixture-matrix.json",
  "behavior-observations.jsonl",
  "language-stack-behavior-crosswalk.json",
  "source-provenance.json"
];

const familySpecs = [
  { family: "search", crawl: "search-crawl.json", fixtures: "search-fixture-matrix.json", manifest: "search-evidence-manifest.json", coverage: "search-coverage-report.json" },
  { family: "word", crawl: "word-crawl.json", fixtures: "word-fixture-matrix.json", manifest: "word-evidence-manifest.json", coverage: "word-coverage-report.json" },
  { family: "kanji", crawl: "kanji-crawl.json", fixtures: "kanji-fixture-matrix.json", manifest: "kanji-evidence-manifest.json", coverage: "kanji-coverage-report.json" },
  { family: "image", crawl: "image-crawl.json", fixtures: "image-fixture-matrix.json", manifest: "image-evidence-manifest.json", coverage: "image-coverage-report.json" }
].map((spec) => ({ ...spec, crawlData: readJson(spec.crawl), fixtureData: readJson(spec.fixtures), manifestData: readJson(spec.manifest), coverageData: readJson(spec.coverage) }));

const surfaceMap = readJson("surface-map.json");
const journeys = readJson("journeys.json").journeys;
const referenceEvidence = readJson("reference-evidence.json");
const accessBlockers = readJson("access-blockers.json");
const observations = readJsonl("behavior-observations.jsonl");
const behaviorMatrix = readJson("behavior-fixture-matrix.json");
const behaviorManifest = readJson("behavior-evidence-manifest.json");
const languageCrosswalk = readJson("language-stack-behavior-crosswalk.json");
const provenance = readJson("source-provenance.json");
const provenanceManifest = readJson("source-provenance-evidence-manifest.json");

const surfaceById = new Map(surfaceMap.surfaces.map((surface) => [surface.surface_id, surface]));
const surfaceIdsLongestFirst = [...surfaceById.keys()].sort((a, b) => b.length - a.length);
const journeysBySurface = new Map(surfaceMap.surfaces.map((surface) => [
  surface.surface_id,
  journeys.filter((journey) => journey.surfaces.includes(surface.surface_id)).map((journey) => journey.journey_id)
]));

const allStates = familySpecs.flatMap((spec) => spec.crawlData.states.map((state) => ({ ...state, family: spec.family, source_record: spec.crawl })));
const stateById = new Map(allStates.map((state) => [state.state_id, state]));
const allActions = familySpecs.flatMap((spec) => spec.crawlData.actions.map((action) => ({ ...action, family: spec.family, source_record: spec.crawl })));

const allFixtures = familySpecs.flatMap((spec) => spec.fixtureData.fixtures.map((fixture) => ({
  ...fixture,
  family: spec.family,
  source_record: spec.fixtures,
  environment_id: spec.fixtureData.environment_id,
  authority_id: spec.fixtureData.authority_id
})));
const fixtureById = new Map(allFixtures.map((fixture) => [fixture.fixture_id, fixture]));

const manifestArtifacts = [
  ...familySpecs.flatMap((spec) => spec.manifestData.artifacts.map((artifact) => ({ ...artifact, registry: spec.manifest }))),
  ...provenanceManifest.artifacts.map((artifact) => ({ ...artifact, registry: "source-provenance-evidence-manifest.json" }))
];
const manifestByPath = new Map(manifestArtifacts.map((artifact) => [artifact.path, artifact]));

const evidenceFiles = walk(join(root, "evidence")).filter((path) => statSync(path).isFile());
const evidenceRegistryGroups = {
  "EVIDENCE-RECON-SCREENSET-001": "evidence/reference/screenshots/recon-",
  "EVIDENCE-SEARCH-SCREENSET-001": "evidence/reference/screenshots/search-inventory/",
  "EVIDENCE-WORD-SCREENSET-001": "evidence/reference/screenshots/word-inventory/",
  "EVIDENCE-IMAGE-SCREENSET-001": "evidence/reference/screenshots/image-text-inventory/",
  "EVIDENCE-PROVENANCE-SCREENSET-001": "evidence/reference/screenshots/source-provenance/"
};

const filesystemEvidence = evidenceFiles.map((path) => {
  const relativePath = rel(path);
  const manifest = manifestByPath.get(relativePath);
  const registryIds = referenceEvidence.filter((entry) => entry.path === relativePath).map((entry) => entry.evidence_id);
  for (const [registryId, prefix] of Object.entries(evidenceRegistryGroups)) {
    if (relativePath.startsWith(prefix)) registryIds.push(registryId);
  }
  return {
    evidence_path: relativePath,
    sha256: sha256(path),
    media_type: extname(path).slice(1) || "unknown",
    kind: relativePath.includes("/screenshots/") ? "privacy-reviewed-runtime-screenshot" : relativePath.includes("/interaction-traces/") ? "interaction-trace" : relativePath.includes("/semantic-snapshots/") ? "semantic-limitation-record" : "package-platform-report",
    authority_id: authorityId,
    environment_id: environmentId,
    registry_ids: uniq(registryIds),
    registered_by: manifest?.registry ?? (registryIds.length ? "reference-evidence.json" : null),
    privacy_status: relativePath.includes("/screenshots/") ? "privacy_reviewed" : "contains_no_retained_private_payload",
    hash_status: manifest ? (manifest.sha256 === sha256(path) ? "matches_manifest" : "MANIFEST_MISMATCH") : "computed_not_previously_manifested"
  };
});

const supportingEvidencePaths = uniq([
  ...referenceEvidence.map((entry) => entry.path),
  ...surfaceMap.surfaces.flatMap((surface) => surface.evidence_paths ?? []),
  "behavior-evidence-manifest.json",
  "kanji-evidence-manifest.json"
]).filter((path) => path && existsSync(join(root, path)) && !path.startsWith("evidence/"));

const supportingEvidence = supportingEvidencePaths.map((path) => ({
  evidence_path: path,
  sha256: sha256(join(root, path)),
  media_type: extname(path).slice(1) || "unknown",
  kind: "supporting-discovery-record",
  authority_id: authorityId,
  environment_id: environmentId,
  registry_ids: referenceEvidence.filter((entry) => entry.path === path).map((entry) => entry.evidence_id),
  registered_by: "reference-evidence.json or surface-map.json",
  privacy_status: "structured_privacy_reviewed_record",
  hash_status: "computed"
}));

const evidenceArtifacts = [...filesystemEvidence, ...supportingEvidence].sort((a, b) => a.evidence_path.localeCompare(b.evidence_path));
const evidencePaths = new Set(evidenceArtifacts.map((artifact) => artifact.evidence_path));

function pathsForEvidenceIds(ids, expandScreensets = true) {
  const paths = [];
  for (const id of ids ?? []) {
    const registry = referenceEvidence.find((entry) => entry.evidence_id === id);
    if (registry?.path) paths.push(registry.path);
    const prefix = evidenceRegistryGroups[id];
    if (prefix && expandScreensets) paths.push(...evidenceArtifacts.filter((artifact) => artifact.evidence_path.startsWith(prefix)).map((artifact) => artifact.evidence_path));
  }
  return uniq(paths);
}

function resolvedSurfaceId(value) {
  if (!value) return null;
  const exactState = stateById.get(value);
  if (exactState) return exactState.surface_id;
  const embeddedState = allStates.find((state) => String(value).includes(state.state_id));
  if (embeddedState) return embeddedState.surface_id;
  return surfaceIdsLongestFirst.find((surfaceId) => String(value).includes(surfaceId)) ?? null;
}

function fixtureIdsForState(state) {
  const direct = fixtureById.has(state.fixture) ? [state.fixture] : [];
  const byQuery = state.fixture ? allFixtures.filter((fixture) => fixture.query === state.fixture || fixture.input === state.fixture || String(fixture.query ?? fixture.input ?? "").includes(state.fixture)).map((fixture) => fixture.fixture_id) : [];
  const byPurpose = state.surface_id === "LOOKUP-NOTE-EDITING" || state.name.toLowerCase().includes("note") ? allFixtures.filter((fixture) => fixture.family === "word" && array(fixture.covers).some((item) => /note|save|persist|delete|restore|populated|empty/i.test(item))).map((fixture) => fixture.fixture_id) : [];
  const byEvidence = allFixtures.filter((fixture) => array(fixture.evidence).some((path) => array(state.evidence).includes(path))).map((fixture) => fixture.fixture_id);
  const byObservation = observations.filter((observation) => observation.state_ids.includes(state.state_id)).flatMap((observation) => observation.fixture_ids);
  return uniq([direct, byQuery, byPurpose, byEvidence, byObservation]);
}

function fixtureIdsMentionedByAction(action) {
  const text = `${action.source ?? ""} ${action.trigger ?? ""} ${action.result ?? ""}`;
  return allFixtures.filter((fixture) => {
    const raw = String(fixture.input ?? fixture.query ?? "");
    if (raw && text.includes(raw)) return true;
    return raw.split(/\s*(?:\/|→)\s*/).map((part) => part.replace(/\s+synthetic notes$/i, "").trim()).filter((part) => part.length > 0).some((part) => text.includes(part));
  }).map((fixture) => fixture.fixture_id);
}

function blockersForAction(action) {
  const fromCoverage = familySpecs.flatMap((spec) => {
    const gaps = [...(spec.coverageData.unresolved_gaps ?? []), ...(spec.coverageData.nonblocking_gaps ?? [])];
    return gaps.filter((gap) => array(gap.affected_actions).includes(action.action_id)).flatMap((gap) => array(gap.blocked_by ?? gap.id));
  });
  return uniq([array(action.blocked_by), fromCoverage]);
}

function fixtureBinding(fixtureIds, fallback) {
  return fixtureIds.length ? { status: "bound_to_fixture_ids", fixture_ids: fixtureIds } : { status: "bound_to_source_precondition", fixture_ids: [], precondition: fallback };
}

const capabilityRules = [
  [/SEARCH-ROOT|SEARCH-HISTORY|RESULTS|HANDWRITING|RADICAL/, ["dictionary entries", "search normalization and ranking", "Japanese Text Analysis and deinflection"]],
  [/EXAMPLE-SENTENCES/, ["example sentences", "human pronunciation recordings", "speech synthesis"]],
  [/WORD-DETAIL|NOTE-EDITING/, ["dictionary entries", "example sentences", "pitch accent", "human pronunciation recordings", "speech synthesis"]],
  [/CONJUGATIONS/, ["conjugation"]],
  [/KANJI-ELEMENT/, ["radical composition", "kanji classification and stroke-order data"]],
  [/KANJI-STROKE-ORDER/, ["kanji classification and stroke-order data"]],
  [/KANJI-ETYMOLOGY/, ["kanji etymology and visual histories"]],
  [/KANJI-DETAIL/, ["kanji classification and stroke-order data", "kanji etymology and visual histories", "radical composition"]],
  [/IMAGE-TEXT-RESULT|IMAGE-SOURCE-MENU|FILES-PICKER|PHOTO-LIBRARY|CAMERA-CAPTURE/, ["online OCR", "offline OCR", "recognized-text grouping"]]
];

function languageCapabilities(surfaceId) {
  return uniq(capabilityRules.filter(([pattern]) => pattern.test(surfaceId ?? "")).flatMap(([, capabilities]) => capabilities));
}

const designTokens = [
  { token_id: "DESIGN-TOKEN-COLOR-ROLES", category: "color", observed: "Dark-appearance background, grouped-surface, primary/secondary text, separator, accent, selected, and destructive roles are visible.", status: "observed_not_measured" },
  { token_id: "DESIGN-TOKEN-TYPOGRAPHY-ROLES", category: "typography", observed: "Distinct navigation title, section header, Japanese headword, reading, gloss, metadata, control-label, and note-editor roles are visible.", status: "observed_not_measured" },
  { token_id: "DESIGN-TOKEN-SPACING-RHYTHM", category: "spacing", observed: "List insets, card padding, section gaps, row spacing, and safe-area offsets are visible.", status: "observed_not_measured" },
  { token_id: "DESIGN-TOKEN-LAYOUT-GEOMETRY", category: "layout", observed: "Search, result, detail, sheet, popover, overlay, and image-result geometries are evidenced in the pinned portrait environment.", status: "observed_not_measured" },
  { token_id: "DESIGN-TOKEN-ICONOGRAPHY", category: "iconography", observed: "Search-source, audio, navigation, disclosure, note, stroke-playback, share, and selection glyph roles are visible.", status: "observed_not_acquired" },
  { token_id: "DESIGN-TOKEN-MOTION-STATE", category: "motion", observed: "Navigation settling and stroke-order initial, step, play, pause, resume, progress, and completion states are observed; exact Nihongo timing is nonblocking and Zenbu renderer timing is app-owned.", status: "qualitative_contract_observed_exact_timing_nonblocking" },
  { token_id: "DESIGN-TOKEN-CONTROL-STATES", category: "controls", observed: "Focused, populated, selected, disabled/unavailable, empty, modal, and persisted states are represented.", status: "observed" }
].map((token) => ({
  ...token,
  authority_id: authorityId,
  environment_id: environmentId,
  applicable_surface_ids: surfaceMap.surfaces.filter((surface) => surface.scope !== "excluded").map((surface) => surface.surface_id),
  evidence_paths: evidenceArtifacts.filter((artifact) => artifact.kind === "privacy-reviewed-runtime-screenshot").map((artifact) => artifact.evidence_path),
  legal_use: "Observable role may be specified; Zenbu uses its approved visual identity and must not copy paid or proprietary assets.",
  blocker_ids: []
}));

const originalFixtureAssets = walk(join(root, "fixtures")).filter((path) => statSync(path).isFile() && basename(path) !== ".DS_Store").map((path) => ({
  asset_id: `ASSET-FIXTURE-${basename(path).replace(/\.[^.]+$/, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-")}-${extname(path).slice(1).toUpperCase()}`,
  kind: "purpose-created-discovery-fixture",
  path: rel(path),
  sha256: sha256(path),
  status: "original_reusable_fixture",
  legal_use: "Purpose-created synthetic fixture; reusable for discovery and later verification.",
  applicable_surface_ids: ["LOOKUP-IMAGE-TEXT-RESULT"],
  fixture_ids: allFixtures.filter((fixture) => fixture.artifact && rel(path).endsWith(basename(fixture.artifact))).map((fixture) => fixture.fixture_id),
  evidence_paths: []
}));

const referenceAssetFamilies = [
  { asset_id: "ASSET-FAMILY-REFERENCE-UI-GLYPHS", kind: "reference-visible-iconography", status: "reference_role_only_zenbu_substitute_approved", legal_use: "Record roles and behavior only; use Zenbu-original or licensed icons. Exact Nihongo glyph identity and bounds are not parity requirements.", surfaces: surfaceMap.surfaces.filter((surface) => surface.scope !== "excluded").map((surface) => surface.surface_id), blockers: [] },
  { asset_id: "ASSET-FAMILY-KANJI-STROKE-DIAGRAMS", kind: "reference-rendered-language-visual", status: "selected_pinned_kanjivg_zenbu_original_renderer", legal_use: "Use KanjiVG r20250816 ordered paths under CC BY-SA 3.0 with source and modification provenance; generate diagrams and timing with Zenbu-owned code and review final share-alike asset packaging.", surfaces: ["LOOKUP-KANJI-STROKE-ORDER"], blockers: [] },
  { asset_id: "ASSET-FAMILY-KANJI-ETYMOLOGY-IMAGERY", kind: "reference-rendered-language-visual", status: "excluded_from_mvp_deferred_to_issue_91", legal_use: "Do not copy Nihongo or Shinjigen imagery. Etymology, Origin/history content, historical glyph presentation, and source selection are deferred until post-MVP issue #91.", surfaces: ["LOOKUP-KANJI-DETAIL", "LOOKUP-KANJI-ETYMOLOGY"], blockers: [] },
  { asset_id: "ASSET-FAMILY-HUMAN-PRONUNCIATION", kind: "reference-audio", status: "selected_pinned_open_provider_releases", legal_use: "Use only clips from the pinned Tofugu/WaniKani CC BY-SA 4.0 and Kanji Alive CC BY 4.0 releases with per-file provenance and attribution.", surfaces: ["LOOKUP-WORD-DETAIL", "LOOKUP-EXAMPLE-SENTENCES"], blockers: [] },
  { asset_id: "ASSET-FAMILY-SYSTEM-SPEECH-VOICES", kind: "platform-provided-audio", status: "selected_platform_fallback", legal_use: "Use AVSpeechSynthesizer with an available Japanese voice as app-owned fallback; never redistribute system voices or claim exact Nihongo routing.", surfaces: ["LOOKUP-WORD-DETAIL", "LOOKUP-EXAMPLE-SENTENCES"], blockers: [] },
  { asset_id: "ASSET-FAMILY-NIHONGO-BRANDING", kind: "reference-branding", status: "excluded_approved_variance", legal_use: "Excluded from parity; Zenbu colors, typography, logos, and icons are authoritative.", surfaces: surfaceMap.surfaces.map((surface) => surface.surface_id), blockers: [] }
].map((asset) => ({
  asset_id: asset.asset_id,
  kind: asset.kind,
  path: null,
  sha256: null,
  status: asset.status,
  legal_use: asset.legal_use,
  applicable_surface_ids: asset.surfaces,
  fixture_ids: [],
  evidence_paths: evidenceArtifacts.filter((artifact) => artifact.kind === "privacy-reviewed-runtime-screenshot").filter((artifact) => asset.surfaces.some((surface) => artifact.evidence_path.toLowerCase().includes(surface.replace(/^LOOKUP-/, "").split("-")[0].toLowerCase()))).map((artifact) => artifact.evidence_path),
  blocker_ids: asset.blockers
}));
const assets = [...originalFixtureAssets, ...referenceAssetFamilies];

function assetIdsForSurface(surfaceId) {
  return assets.filter((asset) => asset.applicable_surface_ids.includes(surfaceId)).map((asset) => asset.asset_id);
}

const languageInputsByCapability = new Map(languageCrosswalk.inputs.map((input) => [input.capability, input]));
const resourceRows = provenance.component_ledger.map((component) => {
  const matchingInputs = languageCrosswalk.inputs.filter((input) => {
    const haystack = `${input.capability} ${input.named_component ?? ""}`.toLowerCase();
    return component.capabilities.some((capability) => haystack.includes(capability.toLowerCase().replace("image text recognition", "ocr"))) || (component.identity && haystack.includes(component.identity.toLowerCase().split(" /")[0]));
  });
  return {
    resource_id: component.component_id,
    kind: "language-stack-component",
    identity: component.identity ?? component.displayed_label,
    status: component.status,
    capabilities: component.capabilities,
    observed_claim_ids: uniq(matchingInputs.flatMap((input) => input.observation_ids)),
    applicable_surface_ids: uniq(matchingInputs.flatMap((input) => surfaceMap.surfaces.filter((surface) => languageCapabilities(surface.surface_id).includes(input.capability)).map((surface) => surface.surface_id))),
    source_legal_status: component.exact_reuse_posture,
    confidence: component.status.includes("verified") ? "verified_for_named_identity_at_stated_boundary" : component.status.includes("inferred") ? "inferred" : "historical_or_unknown",
    conflict_ids: [],
    gap_ids: component.gap_ids,
    classification: component.installed_build_displayed ? "reachable_or_settings-published_supporting-resource" : component.status.startsWith("historical") ? "historical_unconfirmed" : "published_or_inferred_supporting-resource",
    atomic_parity_input: component.gap_ids.length ? "blocked_resource_input" : "ready_resource_input"
  };
});

const actionById = new Map(allActions.map((action) => [action.action_id, action]));

function crosswalkEvidenceForSurface(surfaceId) {
  const surface = surfaceById.get(surfaceId);
  return uniq([surface?.evidence_paths ?? [], pathsForEvidenceIds(surface?.evidence_ids ?? [], false)]).filter((path) => evidencePaths.has(path));
}

function surfaceIdsForAction(action, sourceState, resultState) {
  const direct = sourceState?.surface_id ?? resolvedSurfaceId(action.source) ?? resultState?.surface_id ?? resolvedSurfaceId(action.result);
  if (direct) return [direct];
  if (action.source === "share menu") return ["IOS-SHARE-SHEET-BOUNDARY"];
  if (String(action.source).includes("family")) {
    return familySpecs.find((spec) => spec.family === action.family)?.crawlData.capture_scope.filter((surfaceId) => surfaceById.has(surfaceId)) ?? [];
  }
  return [];
}

const nodeRows = allStates.map((state) => {
  const surface = surfaceById.get(state.surface_id);
  const fixtureIds = fixtureIdsForState(state);
  const blockers = [];
  if (state.evidence_gap) blockers.push("CROSSWALK-GAP-NODE-EVIDENCE");
  const evidence = uniq([state.evidence ?? [], crosswalkEvidenceForSurface(state.surface_id)]).filter((path) => evidencePaths.has(path));
  if (!evidence.length && surface?.scope !== "excluded") blockers.push("CROSSWALK-GAP-NODE-EVIDENCE");
  const journeyIds = journeysBySurface.get(state.surface_id) ?? [];
  if (!journeyIds.length && surface?.scope !== "excluded") blockers.push("CROSSWALK-GAP-JOURNEY-BINDING");
  return {
    crosswalk_id: `CROSSWALK-NODE-${state.state_id}`,
    source_id: state.state_id,
    source_record: state.source_record,
    kind: "state-node",
    name: state.name,
    surface_id: state.surface_id,
    journey_ids: journeyIds,
    scope: surface?.scope ?? "unresolved",
    fixture_binding: fixtureBinding(fixtureIds, `${state.name}${state.fixture ? `; source fixture ${state.fixture}` : ""}`),
    environment_id: environmentId,
    authority_id: authorityId,
    evidence_paths: evidence,
    visible_text: uniq([state.visible_copy ?? [], surface?.visible_copy ?? [], surface?.controls ?? [], surface?.content_sections ?? []]),
    design_token_ids: designTokens.map((token) => token.token_id),
    asset_ids: assetIdsForSurface(state.surface_id),
    language_capabilities: languageCapabilities(state.surface_id),
    source_legal_status: "observable_behavior_clean_room_only",
    confidence: evidence.length ? "high_for_observed_presentation" : "blocked_without_retained_evidence",
    conflict_ids: [],
    blocker_ids: uniq(blockers),
    exclusion: surface?.scope === "excluded" ? "Approved boundary or waived platform-source mechanics; only the boundary edge is retained." : null,
    atomic_parity_input: surface?.scope === "excluded" ? "excluded" : blockers.length ? "blocked" : "ready_for_atomic_ledger"
  };
});
const nodeRowById = new Map(nodeRows.map((row) => [row.source_id, row]));

const actionRows = allActions.map((action) => {
  const sourceState = stateById.get(action.source) ?? allStates.find((state) => String(action.source).includes(state.state_id));
  const resultState = stateById.get(action.result) ?? allStates.find((state) => String(action.result).includes(state.state_id));
  const surfaceIds = surfaceIdsForAction(action, sourceState, resultState);
  const surfaceId = surfaceIds[0] ?? null;
  const surfaces = surfaceIds.map((id) => surfaceById.get(id)).filter(Boolean);
  const surface = surfaces[0];
  const observationLinks = observations.filter((observation) => observation.action_ids.includes(action.action_id));
  const fixtureIds = uniq([
    sourceState ? fixtureIdsForState(sourceState) : [],
    resultState ? fixtureIdsForState(resultState) : [],
    observationLinks.flatMap((observation) => observation.fixture_ids),
    fixtureIdsMentionedByAction(action),
    allFixtures.filter((fixture) => array(fixture.evidence).some((path) => array(action.evidence).includes(path))).map((fixture) => fixture.fixture_id)
  ]);
  const evidence = uniq([
    action.evidence ?? [],
    sourceState?.evidence ?? [],
    resultState?.evidence ?? [],
    observationLinks.flatMap((observation) => observation.evidence),
    surfaceIds.flatMap(crosswalkEvidenceForSurface)
  ]).filter((path) => evidencePaths.has(path));
  const blockers = blockersForAction(action);
  const explicitlyBlocked = ["blocked_by_access", "unavailable_under_fixture"].includes(action.disposition) && blockers.length;
  if (!surfaceIds.length && !["external_boundary", "excluded_with_reason"].includes(action.disposition)) blockers.push("CROSSWALK-GAP-SURFACE-BINDING");
  if (!evidence.length && !explicitlyBlocked && !["external_boundary", "excluded_with_reason"].includes(action.disposition)) blockers.push("CROSSWALK-GAP-ACTION-EVIDENCE");
  const journeyIds = uniq(surfaceIds.flatMap((id) => journeysBySurface.get(id) ?? []));
  if (!journeyIds.length && !surfaces.every((item) => item.scope === "excluded") && !["external_boundary", "excluded_with_reason"].includes(action.disposition)) blockers.push("CROSSWALK-GAP-JOURNEY-BINDING");
  const excluded = ["external_boundary", "excluded_with_reason"].includes(action.disposition) || (surfaces.length > 0 && surfaces.every((item) => item.scope === "excluded"));
  return {
    crosswalk_id: `CROSSWALK-ACTION-${action.action_id}`,
    source_id: action.action_id,
    source_record: action.source_record,
    kind: "action-edge",
    source: action.source,
    trigger: action.trigger,
    observed_result: action.result,
    disposition: action.disposition,
    surface_id: surfaceId,
    surface_ids: surfaceIds,
    journey_ids: journeyIds,
    scope: surface?.scope ?? (excluded ? "excluded" : "unresolved"),
    fixture_binding: fixtureBinding(fixtureIds, `Recreate source ${action.source}; then ${action.trigger}`),
    environment_id: environmentId,
    authority_id: authorityId,
    evidence_paths: evidence,
    visible_text: uniq([surface?.visible_copy ?? [], surface?.controls ?? []]),
    design_token_ids: designTokens.map((token) => token.token_id),
    asset_ids: uniq(surfaceIds.flatMap(assetIdsForSurface)),
    language_capabilities: uniq(surfaceIds.flatMap(languageCapabilities)),
    source_legal_status: "observable_behavior_clean_room_only",
    confidence: evidence.length ? "high_for_recorded_transition_boundary" : "blocked_without_retained_evidence",
    conflict_ids: uniq(observationLinks.flatMap((observation) => observation.conflicts ?? [])),
    blocker_ids: uniq(blockers),
    exclusion: excluded ? (action.reason ?? "Approved external or excluded boundary.") : null,
    atomic_parity_input: excluded ? "excluded" : blockers.length ? "blocked" : "ready_for_atomic_ledger"
  };
});

const fixtureRows = allFixtures.map((fixture) => {
  const linkedStates = nodeRows.filter((row) => row.fixture_binding.fixture_ids.includes(fixture.fixture_id));
  const linkedActions = actionRows.filter((row) => row.fixture_binding.fixture_ids.includes(fixture.fixture_id));
  const linkedObservations = observations.filter((observation) => observation.fixture_ids.includes(fixture.fixture_id));
  const evidence = uniq([fixture.evidence ?? [], linkedStates.flatMap((row) => row.evidence_paths), linkedActions.flatMap((row) => row.evidence_paths), linkedObservations.flatMap((observation) => observation.evidence)]).filter((path) => evidencePaths.has(path));
  const blockers = linkedStates.length || linkedActions.length || linkedObservations.length ? [] : ["CROSSWALK-GAP-FIXTURE-BINDING"];
  return {
    crosswalk_id: `CROSSWALK-FIXTURE-${fixture.fixture_id}`,
    source_id: fixture.fixture_id,
    source_record: fixture.source_record,
    kind: "fixture-class",
    family: fixture.family,
    exact_input: fixture.input ?? fixture.query ?? fixture.source ?? fixture.artifact ?? null,
    selection_mode: fixture.input_method ?? fixture.selection_mode ?? null,
    required_categories: fixture.required_categories ?? fixture.covers ?? [],
    behavior_layout_classes: fixture.observed_classes ?? fixture.covers ?? [],
    linked_state_ids: linkedStates.map((row) => row.source_id),
    linked_action_ids: linkedActions.map((row) => row.source_id),
    linked_observation_ids: linkedObservations.map((observation) => observation.observation_id),
    journey_ids: uniq([...linkedStates.flatMap((row) => row.journey_ids), ...linkedActions.flatMap((row) => row.journey_ids)]),
    environment_id: fixture.environment_id,
    authority_id: fixture.authority_id,
    evidence_paths: evidence,
    asset_ids: assets.filter((asset) => asset.fixture_ids.includes(fixture.fixture_id)).map((asset) => asset.asset_id),
    source_legal_status: fixture.family === "image" ? "purpose_created_public_synthetic_fixture" : "synthetic_or_public_text_fixture",
    confidence: fixture.status === "executed" || linkedStates.length || linkedObservations.length ? "executed_or_cross_referenced" : "class_declared_without_retained_run",
    conflict_ids: [],
    blocker_ids: blockers,
    atomic_parity_input: blockers.length ? "blocked" : "ready_for_atomic_ledger"
  };
});

const observationRows = observations.map((observation) => {
  const languageInput = languageCrosswalk.inputs.find((input) => input.observation_ids.includes(observation.observation_id));
  const blockers = uniq(observation.blocker_ids ?? []);
  return {
    crosswalk_id: `CROSSWALK-CLAIM-${observation.observation_id}`,
    source_id: observation.observation_id,
    source_record: "behavior-observations.jsonl",
    kind: "language-behavior-claim",
    class_id: observation.class_id,
    surface_ids: observation.surface_ids,
    state_ids: observation.state_ids,
    action_ids: observation.action_ids,
    fixture_ids: observation.fixture_ids,
    journey_ids: uniq(observation.surface_ids.flatMap((surfaceId) => journeysBySurface.get(surfaceId) ?? [])),
    environment_id: observation.environment_id,
    authority_id: authorityId,
    exact_inputs: observation.exact_inputs,
    observed_output: observation.observed_output,
    evidence_paths: observation.evidence.filter((path) => evidencePaths.has(path)),
    language_capability: languageInput?.capability ?? null,
    provenance_status: languageInput?.provenance_status ?? "not_separately_bound",
    resource_ids: resourceRows.filter((resource) => resource.observed_claim_ids.includes(observation.observation_id)).map((resource) => resource.resource_id),
    source_legal_status: "observable_output_only; named upstreams remain governed by resource rows",
    confidence: observation.confidence,
    conflict_ids: observation.conflicts ?? [],
    blocker_ids: blockers,
    atomic_parity_input: blockers.length ? "blocked" : "ready_for_atomic_ledger"
  };
});

const genericGaps = [
  { gap_id: "CROSSWALK-GAP-NODE-EVIDENCE", category: "evidence", owner: "discovery driver", affected_ids: nodeRows.filter((row) => row.blocker_ids.includes("CROSSWALK-GAP-NODE-EVIDENCE")).map((row) => row.source_id), missing: "One or more observed state nodes lack retained direct or aggregate evidence.", completed_independent_work: "All available direct, screenset, trace, and supporting-record evidence was resolved and hash-indexed.", resume_procedure: "Use the state ID and source crawl to recreate the exact precondition, capture a settled privacy-safe frame or trace, register its hash, and rerun this generator." },
  { gap_id: "CROSSWALK-GAP-ACTION-EVIDENCE", category: "evidence", owner: "discovery driver", affected_ids: actionRows.filter((row) => row.blocker_ids.includes("CROSSWALK-GAP-ACTION-EVIDENCE")).map((row) => row.source_id), missing: "One or more non-excluded action edges lack direct, endpoint, observation, or aggregate evidence.", completed_independent_work: "All available action, endpoint-state, behavior-observation, and surface evidence was inherited explicitly.", resume_procedure: "Replay the affected action from its fixture binding, retain the immediate and settled result, register evidence and hash, then rerun this generator." },
  { gap_id: "CROSSWALK-GAP-SURFACE-BINDING", category: "referential-integrity", owner: "discovery dossier owner", affected_ids: actionRows.filter((row) => row.blocker_ids.includes("CROSSWALK-GAP-SURFACE-BINDING")).map((row) => row.source_id), missing: "One or more action descriptions cannot be resolved to a canonical surface ID.", completed_independent_work: "Exact state IDs, embedded state IDs, and canonical surface IDs were resolved mechanically.", resume_procedure: "Replace the descriptive source/result with stable state or surface IDs and rerun this generator." },
  { gap_id: "CROSSWALK-GAP-JOURNEY-BINDING", category: "scope", owner: "product owner with discovery driver", affected_ids: [...nodeRows, ...actionRows].filter((row) => row.blocker_ids.includes("CROSSWALK-GAP-JOURNEY-BINDING")).map((row) => row.source_id), missing: "One or more non-excluded states/actions do not bind to an approved journey.", completed_independent_work: "Journey membership was derived from canonical surface IDs; Kanji Etymology and Origin/history content were retained as reference evidence but excluded from MVP under issue #91.", resume_procedure: "Approve a journey binding or exclusion for each affected ID, update journeys.json, and rerun this generator." },
  { gap_id: "CROSSWALK-GAP-FIXTURE-BINDING", category: "fixture", owner: "discovery driver", affected_ids: fixtureRows.filter((row) => row.blocker_ids.includes("CROSSWALK-GAP-FIXTURE-BINDING")).map((row) => row.source_id), missing: "One or more declared fixture classes do not bind to a state, action, or behavior observation.", completed_independent_work: "Direct IDs, query/input strings, source-state fixtures, evidence paths, and observation links were reconciled.", resume_procedure: "Add stable fixture IDs to the affected crawl states/actions or behavior observations and rerun this generator." }
].filter((gap) => gap.affected_ids.length);

const manifestMismatches = evidenceArtifacts.filter((artifact) => artifact.hash_status === "MANIFEST_MISMATCH");
const missingEvidencePaths = uniq([
  ...allStates.flatMap((state) => state.evidence ?? []),
  ...allActions.flatMap((action) => action.evidence ?? []),
  ...allFixtures.flatMap((fixture) => fixture.evidence ?? []),
  ...observations.flatMap((observation) => observation.evidence)
]).filter((path) => !evidencePaths.has(path));
const duplicate = (items) => items.filter((item, index) => items.indexOf(item) !== index);
const unresolvedStateSurfaces = uniq(allStates.map((state) => state.surface_id).filter((surfaceId) => !surfaceById.has(surfaceId)));
const unresolvedJourneySurfaces = uniq(journeys.flatMap((journey) => journey.surfaces).filter((surfaceId) => !surfaceById.has(surfaceId)));
const unresolvedOutgoingSurfaces = uniq(surfaceMap.surfaces.flatMap((surface) => surface.outgoing_surface_ids ?? []).filter((surfaceId) => !surfaceById.has(surfaceId)));

const integrity = {
  duplicate_surface_ids: duplicate(surfaceMap.surfaces.map((surface) => surface.surface_id)),
  duplicate_state_ids: duplicate(allStates.map((state) => state.state_id)),
  duplicate_action_ids: duplicate(allActions.map((action) => action.action_id)),
  duplicate_fixture_ids: duplicate(allFixtures.map((fixture) => fixture.fixture_id)),
  duplicate_observation_ids: duplicate(observations.map((observation) => observation.observation_id)),
  unresolved_state_surface_ids: unresolvedStateSurfaces,
  unresolved_journey_surface_ids: unresolvedJourneySurfaces,
  unresolved_outgoing_surface_ids: unresolvedOutgoingSurfaces,
  missing_evidence_paths: missingEvidencePaths,
  manifest_hash_mismatches: manifestMismatches.map((artifact) => artifact.evidence_path),
  declared_surface_count: surfaceMap.counts.total,
  actual_surface_count: surfaceMap.surfaces.length
};
integrity.passed = Object.entries(integrity).every(([key, value]) => key === "passed" || key === "declared_surface_count" || key === "actual_surface_count" ? true : Array.isArray(value) ? value.length === 0 : true) && integrity.declared_surface_count === integrity.actual_surface_count;

const resolvableBlockerIds = new Set([
  ...accessBlockers.map((blocker) => blocker.id),
  ...provenance.gaps.map((gap) => gap.gap_id),
  ...genericGaps.map((gap) => gap.gap_id)
]);
integrity.unresolved_blocker_ids = uniq([
  ...nodeRows.flatMap((row) => row.blocker_ids),
  ...actionRows.flatMap((row) => row.blocker_ids),
  ...fixtureRows.flatMap((row) => row.blocker_ids),
  ...observationRows.flatMap((row) => row.blocker_ids),
  ...designTokens.flatMap((token) => token.blocker_ids),
  ...assets.flatMap((asset) => asset.blocker_ids ?? []),
  ...resourceRows.flatMap((resource) => resource.gap_ids)
]).filter((id) => !resolvableBlockerIds.has(id));
integrity.passed = integrity.passed && integrity.unresolved_blocker_ids.length === 0;

if (!integrity.passed) {
  console.error(JSON.stringify(integrity, null, 2));
  process.exit(1);
}

const allCrosswalkRows = [...nodeRows, ...actionRows, ...fixtureRows, ...observationRows];
const blockingGapIds = uniq([
  ...allCrosswalkRows.flatMap((row) => row.blocker_ids ?? []),
  ...designTokens.flatMap((token) => token.blocker_ids),
  ...assets.flatMap((asset) => asset.blocker_ids ?? []),
  ...resourceRows.flatMap((resource) => resource.gap_ids)
]);

const coverage = {
  source_surfaces: surfaceMap.surfaces.length,
  source_nodes: allStates.length,
  source_actions: allActions.length,
  source_fixtures: allFixtures.length,
  source_behavior_classes: behaviorMatrix.behavior_classes.length,
  source_behavior_claims: observations.length,
  crosswalk_nodes: nodeRows.length,
  crosswalk_actions: actionRows.length,
  crosswalk_fixtures: fixtureRows.length,
  crosswalk_behavior_claims: observationRows.length,
  nodes_ready: nodeRows.filter((row) => row.atomic_parity_input === "ready_for_atomic_ledger").length,
  nodes_blocked: nodeRows.filter((row) => row.atomic_parity_input === "blocked").length,
  nodes_excluded: nodeRows.filter((row) => row.atomic_parity_input === "excluded").length,
  actions_ready: actionRows.filter((row) => row.atomic_parity_input === "ready_for_atomic_ledger").length,
  actions_blocked: actionRows.filter((row) => row.atomic_parity_input === "blocked").length,
  actions_excluded: actionRows.filter((row) => row.atomic_parity_input === "excluded").length,
  fixtures_ready: fixtureRows.filter((row) => row.atomic_parity_input === "ready_for_atomic_ledger").length,
  fixtures_blocked: fixtureRows.filter((row) => row.atomic_parity_input === "blocked").length,
  behavior_claims_ready: observationRows.filter((row) => row.atomic_parity_input === "ready_for_atomic_ledger").length,
  behavior_claims_blocked: observationRows.filter((row) => row.atomic_parity_input === "blocked").length,
  evidence_artifacts: evidenceArtifacts.length,
  design_token_families: designTokens.length,
  asset_records: assets.length,
  language_resource_records: resourceRows.length,
  observed_conflicts_or_tensions: readJson("behavior-coverage-report.json").coverage.unique_observed_behavior_conflicts_or_tensions,
  crosswalk_gap_groups: genericGaps.length,
  inherited_access_blockers: accessBlockers.length,
  inherited_provenance_gaps: provenance.gaps.length,
  distinct_blocking_gap_ids: blockingGapIds.length
};

const report = {
  generated_at: generatedAt,
  ticket: "https://github.com/serpcompany/zenbujapanese-monorepo/issues/74",
  authority_id: authorityId,
  environment_id: environmentId,
  disposition: blockingGapIds.length ? "CROSSWALK_COMPLETE_WITH_EXPLICIT_BLOCKERS" : "CROSSWALK_COMPLETE",
  count_definitions: {
    ready: "A crosswalk row resolves to scope, journey or approved exclusion, fixture/precondition, authority, environment, and retained evidence without a row-level blocker.",
    blocked: "The item is present and mapped, but one or more explicit blocker IDs prevent coding-ready atomic parity input.",
    excluded: "The item is present only as an approved external, platform, branding, or scope boundary.",
    crosswalk_complete: "Every source item is represented exactly once and every non-ready item has an explicit blocker or exclusion; it does not mean discovery is coding-ready."
  },
  coverage,
  integrity,
  reconciled_source_repairs: [
    "Canonicalized the preliminary LOOKUP-STROKE-ORDER-OVERLAY identifier to the recursive-crawl ID LOOKUP-KANJI-STROKE-ORDER across the surface map, journey, transition table, and reachability map.",
    "Recomputed surface-map scope counts after the post-MVP etymology decision: 14 blocking, 1 navigation-support, 8 excluded, 23 total.",
    "Retained LOOKUP-KANJI-ETYMOLOGY reference evidence while excluding its surface and Kanji Detail Origin/history content from the MVP contract under issue #91."
  ],
  conflicts: readJson("behavior-coverage-report.json").observed_conflicts_or_tensions,
  crosswalk_gaps: genericGaps,
  inherited_access_blockers: accessBlockers,
  inherited_provenance_gaps: provenance.gaps,
  blocking_gap_ids: blockingGapIds,
  privacy_and_clean_room: {
    private_material_included: false,
    reference_source_or_executable_copied: false,
    personal_media_or_clipboard_payload_retained: false,
    paid_or_proprietary_assets_copied: false,
    evidence_basis: "Only previously privacy-reviewed runtime evidence, structured discovery records, and purpose-created fixtures were indexed."
  },
  next_ticket_effect: "The atomic parity ledger can consume every row, but blocked rows and resources must remain blocked/unknown; no coding-ready disposition is permitted while blocking_gap_ids is non-empty."
};

output("design-token-index.json", {
  generated_at: generatedAt,
  authority_id: authorityId,
  environment_id: environmentId,
  status: "OBSERVED REFERENCE ROLE INDEX — EXACT NIHONGO VISUAL MEASUREMENTS ARE NONBLOCKING",
  allowed_variance: "Zenbu colors, typography, logos, icons, layout, spacing, geometry, and accessible semantics are authoritative; preserve the evidenced information hierarchy and interaction contract without claiming pixel-identical parity.",
  tokens: designTokens
});

output("asset-index.json", {
  generated_at: generatedAt,
  authority_id: authorityId,
  environment_id: environmentId,
  status: "REFERENCE ASSET FAMILIES CLASSIFIED; NO PROPRIETARY OR PAID ASSET COPIED",
  assets
});

output("fixture-index.json", {
  generated_at: generatedAt,
  authority_id: authorityId,
  environment_id: environmentId,
  fixture_count: fixtureRows.length,
  fixtures: fixtureRows
});

output("evidence-index.json", {
  generated_at: generatedAt,
  authority_id: authorityId,
  environment_id: environmentId,
  artifact_count: evidenceArtifacts.length,
  hash_mismatch_count: manifestMismatches.length,
  missing_referenced_path_count: missingEvidencePaths.length,
  artifacts: evidenceArtifacts
});

output("reference-resource-crosswalk.json", {
  generated_at: generatedAt,
  ticket: "https://github.com/serpcompany/zenbujapanese-monorepo/issues/74",
  authority_id: authorityId,
  environment_id: environmentId,
  domain_boundary: languageCrosswalk.domain_boundary,
  canonical_future_ledger: "parity-inventory.jsonl",
  source_records: sourceFiles.map((path) => ({ path, sha256: sha256(join(root, path)) })),
  counts: coverage,
  node_crosswalk: nodeRows,
  action_crosswalk: actionRows,
  fixture_crosswalk: fixtureRows,
  language_behavior_claim_crosswalk: observationRows,
  resource_crosswalk: resourceRows,
  design_token_index: "design-token-index.json",
  asset_index: "asset-index.json",
  fixture_index: "fixture-index.json",
  evidence_index: "evidence-index.json",
  coverage_report: "crosswalk-coverage-report.json"
});

output("crosswalk-coverage-report.json", report);

console.log(JSON.stringify({ disposition: report.disposition, coverage, integrity }, null, 2));
