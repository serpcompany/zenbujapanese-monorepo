#!/usr/bin/env python3

"""Resolve and enforce Zenbu's repository-owned iOS verification policy."""

from __future__ import annotations

import argparse
import hashlib
import json
from fnmatch import fnmatch
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
from typing import Any
import uuid


class PolicyError(ValueError):
    """The verification manifest would place coverage in an unsafe tier."""


class ProductFingerprintError(ValueError):
    """Previously built test products do not belong to this exact candidate."""


class SimulatorLeaseUnavailable(RuntimeError):
    """Another live process owns the repository's local Simulator lease."""


class VerifiedSHAError(ValueError):
    """A required result belongs to a different source candidate."""


class SimulatorLease:
    def __init__(self, path: Path, owner: str, token: str) -> None:
        self.path = path
        self.owner = owner
        self.token = token

    @staticmethod
    def _process_is_alive(pid: int) -> bool:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return False
        except PermissionError:
            return True
        return True

    @classmethod
    def acquire(cls, path: Path, *, owner: str) -> "SimulatorLease":
        token = str(uuid.uuid4())
        path.parent.mkdir(parents=True, exist_ok=True)
        while True:
            temporary = path.with_name(f".{path.name}.{token}.tmp")
            payload = {"owner": owner, "pid": os.getpid(), "token": token}
            try:
                with temporary.open("x", encoding="utf-8") as output:
                    json.dump(payload, output, sort_keys=True)
                    output.flush()
                    os.fsync(output.fileno())
                os.link(temporary, path)
            except FileExistsError:
                try:
                    owner_path = path / "owner.json" if path.is_dir() else path
                    recorded = json.loads(owner_path.read_text(encoding="utf-8"))
                    recorded_pid = int(recorded["pid"])
                    recorded_owner = str(recorded["owner"])
                except (
                    KeyError,
                    OSError,
                    TypeError,
                    ValueError,
                    json.JSONDecodeError,
                ) as error:
                    raise SimulatorLeaseUnavailable(
                        f"Simulator lease exists with unreadable owner: {error}"
                    ) from error
                if cls._process_is_alive(recorded_pid):
                    raise SimulatorLeaseUnavailable(
                        f"Simulator lease is held by {recorded_owner} "
                        f"(pid {recorded_pid})"
                    )
                if path.is_dir():
                    shutil.rmtree(path)
                else:
                    path.unlink()
                continue
            finally:
                temporary.unlink(missing_ok=True)
            break
        return cls(path, owner, token)

    def release(self) -> None:
        recorded = json.loads(self.path.read_text(encoding="utf-8"))
        if recorded.get("token") != self.token:
            raise SimulatorLeaseUnavailable("Simulator lease ownership changed")
        self.path.unlink()


COMPLETE_SUITE_STAGES = {"merge-candidate", "manual", "release"}
INFRASTRUCTURE_FAILURES = {
    "runner-lost",
    "simulator-unavailable",
    "simulator-uuid-lost",
    "xcode-service-unavailable",
}


def require_verified_sha(*, current_sha: str, partition_shas: list[str]) -> None:
    for tested_sha in partition_shas:
        if tested_sha != current_sha:
            raise VerifiedSHAError(
                f"required result SHA {tested_sha} does not match current SHA {current_sha}"
            )


def classify_failure(*, tests_started: int, failure_category: str) -> dict[str, Any]:
    eligible = tests_started == 0 and failure_category in INFRASTRUCTURE_FAILURES
    return {
        "classification": (
            "infrastructure-zero-test"
            if eligible
            else (
                "unclassified-zero-test"
                if tests_started == 0
                else "product-or-executed-test"
            )
        ),
        "rerun_eligible": eligible,
    }


def classify_test_evidence(
    *, tests_started: int, test_status: int, log_text: str
) -> dict[str, Any]:
    if test_status == 0 and tests_started > 0:
        return {"classification": "success", "rerun_eligible": False}
    if test_status == 0:
        return {"classification": "zero-test-success", "rerun_eligible": False}
    if tests_started > 0:
        return classify_failure(
            tests_started=tests_started, failure_category="product-assertion"
        )
    infrastructure_signatures = {
        "Unable to find a destination matching": "simulator-unavailable",
        "Failed to start test session": "xcode-service-unavailable",
        "Lost connection to testmanagerd": "xcode-service-unavailable",
        "No devices are booted": "simulator-uuid-lost",
    }
    for signature, category in infrastructure_signatures.items():
        if signature in log_text:
            return classify_failure(tests_started=0, failure_category=category)
    return {
        "classification": "unclassified-zero-test",
        "rerun_eligible": False,
    }


def execution_summary(
    *,
    source_sha: str,
    source_fingerprint: str,
    build_fingerprint: str,
    plan: str,
    selectors: list[str],
    os_version: str,
    xcode_version: str,
    attempt: int,
    setup_seconds: float,
    build_seconds: float,
    test_seconds: float,
    build_mode: str = "fresh",
    tests_started: int | None = None,
    failure: dict[str, Any] | None = None,
) -> dict[str, Any]:
    selector_identity = "+".join(selectors) if selectors else "all"
    safe_os = os_version.replace(" ", "_").replace("/", "_")
    safe_xcode = xcode_version.replace(" ", "_").replace("/", "_")
    return {
        "source_sha": source_sha,
        "source_fingerprint": source_fingerprint,
        "build_fingerprint": build_fingerprint,
        "plan": plan,
        "selectors": selectors,
        "os_version": os_version,
        "xcode_version": xcode_version,
        "attempt": attempt,
        "build_mode": build_mode,
        "tests_started": tests_started,
        "failure": failure,
        "durations_seconds": {
            "setup": setup_seconds,
            "build": build_seconds,
            "test": test_seconds,
            "total": setup_seconds + build_seconds + test_seconds,
        },
        "result_identity": (
            f"{plan}-{source_sha}-{selector_identity}-{safe_os}-{safe_xcode}"
            f"-attempt-{attempt}"
        ),
    }


def require_matching_build_products(
    recorded: dict[str, str], expected: dict[str, str]
) -> None:
    for key in ("source_fingerprint", "build_fingerprint"):
        if recorded.get(key) != expected.get(key):
            raise ProductFingerprintError(
                f"{key} mismatch: recorded {recorded.get(key)!r}, "
                f"expected {expected.get(key)!r}"
            )


def source_fingerprint(repo_root: Path, paths: list[str] | None = None) -> str:
    """Hash the exact tracked iOS build and verification inputs, plus local drift."""
    if paths is None:
        pathspecs = [
            "apps/ios",
            ".github/workflows/ios-*",
            "docs/clone-discovery/nihongo/fixtures/image-text",
            "docs/research/fixtures/example-sentence-retrieval-*",
            "docs/research/tatoeba-nihongo-sample-2026-08-14.tsv",
        ]
        tracked = subprocess.run(
            [
                "git",
                "ls-files",
                "-s",
                "--",
                *pathspecs,
            ],
            cwd=repo_root,
            check=True,
            capture_output=True,
        ).stdout
        drift = subprocess.run(
            ["git", "diff", "--binary", "HEAD", "--", *pathspecs],
            cwd=repo_root,
            check=True,
            capture_output=True,
        ).stdout
        untracked = subprocess.run(
            ["git", "ls-files", "--others", "--exclude-standard", "--", *pathspecs],
            cwd=repo_root,
            check=True,
            capture_output=True,
            text=True,
        )
        digest = hashlib.sha256(tracked + b"\0" + drift)
        for relative in untracked.stdout.splitlines():
            digest.update(relative.encode("utf-8"))
            digest.update(b"\0")
            digest.update((repo_root / relative).read_bytes())
            digest.update(b"\0")
        return digest.hexdigest()
    digest = hashlib.sha256()
    for relative in sorted(set(paths)):
        path = repo_root / relative
        if not path.is_file():
            continue
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def build_fingerprint(
    *,
    source: str,
    plan: str,
    device_type: str,
    xcode_version: str,
    runtime_id: str = "",
    build_arguments: list[str] | None = None,
) -> str:
    build_inputs = [
        argument
        for argument in (build_arguments or [])
        if not argument.startswith(("-only-testing:", "-skip-testing:"))
    ]
    payload = json.dumps(
        {
            "device_type": device_type,
            "build_arguments": build_inputs,
            "plan": plan,
            "runtime_id": runtime_id,
            "source_fingerprint": source,
            "xcode_version": xcode_version,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def load_and_validate_manifest(path: Path) -> dict[str, Any]:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    selectors = manifest.get("selectors", {})
    for tier, selector_ids in manifest.get("tiers", {}).items():
        maximum_size_journeys: set[str] = set()
        for selector_id in selector_ids:
            if selector_id not in selectors:
                raise PolicyError(f"unknown selector {selector_id} in tier {tier}")
            traits = selectors[selector_id].get("traits", [])
            if tier != "integration" and "network" in traits:
                raise PolicyError(
                    f"{selector_id} has network traits and cannot run in {tier}"
                )
            if "accessibility-maximum" in traits:
                for journey in selectors[selector_id].get("journeys", []):
                    if journey in maximum_size_journeys:
                        raise PolicyError(
                            f"{journey} maximum-size coverage is a duplicate in {tier}"
                        )
                    maximum_size_journeys.add(journey)
    for stage, tiers in manifest.get("stages", {}).items():
        for tier in tiers:
            if tier not in manifest.get("tiers", {}):
                raise PolicyError(f"stage {stage} references unknown tier {tier}")
            for selector_id in manifest.get("tiers", {}).get(tier, []):
                if (
                    "complete-suite" in selectors[selector_id].get("traits", [])
                    and stage not in COMPLETE_SUITE_STAGES
                ):
                    raise PolicyError(
                        f"complete-suite selector {selector_id} cannot run at {stage}"
                    )
    tier_selector_ids = {
        selector_id
        for selector_ids in manifest.get("tiers", {}).values()
        for selector_id in selector_ids
    }
    covered_journeys = {
        journey
        for selector_id in tier_selector_ids
        for journey in selectors[selector_id].get("journeys", [])
    }
    for journey in manifest.get("required_journeys", []):
        if journey not in covered_journeys:
            raise PolicyError(f"required journey {journey} has no verification tier")
    allowed_by_stage = {
        stage: {
            selector_id
            for tier in tiers
            for selector_id in manifest.get("tiers", {}).get(tier, [])
        }
        for stage, tiers in manifest.get("stages", {}).items()
    }
    maximum_size_selectors = {
        selector_id
        for selector_id, selector in selectors.items()
        if "accessibility-maximum" in selector.get("traits", [])
    }
    for capability, policy in manifest.get("capabilities", {}).items():
        for stage, selector_ids in policy.items():
            if stage in ("paths", "reviewed_override_paths", "adaptive_layout"):
                continue
            if stage not in allowed_by_stage:
                raise PolicyError(f"unknown stage {stage} on capability {capability}")
            for selector_id in selector_ids:
                if selector_id not in allowed_by_stage[stage]:
                    raise PolicyError(
                        f"selector {selector_id} is not allowed at {stage} for {capability}"
                    )
                if selector_id in maximum_size_selectors and not policy.get(
                    "adaptive_layout", False
                ):
                    raise PolicyError(
                        f"capability {capability} selects maximum-size coverage "
                        "without an adaptive layout change"
                    )
            _validate_no_equivalent_selectors(
                selectors,
                selector_ids,
                context=f"{capability}/{stage}",
                intentional=manifest.get("intentional_same_stage_evidence", {}),
            )
    for stage, selector_ids in manifest.get("unclassified_fallback", {}).items():
        if stage not in allowed_by_stage:
            raise PolicyError(f"unknown fallback stage {stage}")
        for selector_id in selector_ids:
            if selector_id not in allowed_by_stage[stage]:
                raise PolicyError(
                    f"fallback selector {selector_id} is not allowed at {stage}"
                )
        _validate_no_equivalent_selectors(
            selectors,
            selector_ids,
            context=f"unclassified-fallback/{stage}",
            intentional=manifest.get("intentional_same_stage_evidence", {}),
        )
    return manifest


def _validate_no_equivalent_selectors(
    selectors: dict[str, Any],
    selector_ids: list[str],
    *,
    context: str,
    intentional: dict[str, str],
) -> None:
    seen_tests: dict[tuple[Any, Any], str] = {}
    seen_journeys: dict[str, str] = {}
    for selector_id in selector_ids:
        selector = selectors[selector_id]
        test_identity = (selector.get("plan"), selector.get("test"))
        if selector.get("test") is not None and test_identity in seen_tests:
            pair = "|".join(sorted((seen_tests[test_identity], selector_id)))
            if not str(intentional.get(pair, "")).strip():
                raise PolicyError(
                    f"equivalent selectors {pair} duplicate one test in {context}"
                )
        seen_tests[test_identity] = selector_id
        for journey in selector.get("journeys", []):
            if journey in seen_journeys:
                pair = "|".join(sorted((seen_journeys[journey], selector_id)))
                if not str(intentional.get(pair, "")).strip():
                    raise PolicyError(
                        f"equivalent selectors {pair} duplicate journey {journey} "
                        f"in {context}"
                    )
            seen_journeys[journey] = selector_id


def validate_repository_contracts(manifest: dict[str, Any], repo_root: Path) -> None:
    inventory = repository_inventory(repo_root)
    plan_names = set(inventory["plans"])
    all_tests = set(inventory["tests"])
    exact_exclusions = set(manifest.get("hil_exclusions", {})) | set(
        manifest.get("non_correctness_exclusions", {})
    )
    require_correctness_coverage(
        inventory,
        correctness_plans=manifest.get("correctness_plans", []),
        exact_exclusions=exact_exclusions,
    )
    for selector_id, selector in manifest["selectors"].items():
        plan = selector.get("plan")
        if plan is not None and plan not in plan_names:
            raise PolicyError(f"selector {selector_id} references missing plan {plan}")
        test = selector.get("test")
        if plan is None:
            if test is not None:
                raise PolicyError(
                    f"static selector {selector_id} cannot name Xcode test {test}"
                )
            continue
        if test is None:
            if not inventory["plans"][plan]["included_tests"]:
                raise PolicyError(
                    f"selector {selector_id} references empty plan {plan}"
                )
            continue
        if "/" not in test:
            if test not in inventory["targets"]:
                raise PolicyError(
                    f"selector {selector_id} references missing target {test}"
                )
            if inventory["plans"][plan]["targets"].get(test, 0) == 0:
                raise PolicyError(
                    f"selector {selector_id} references target {test}, "
                    f"which {plan} does not include"
                )
            continue
        if test not in all_tests:
            raise PolicyError(f"selector {selector_id} references missing test {test}")
        if test not in inventory["plans"][plan]["included_tests"]:
            raise PolicyError(
                f"selector {selector_id} references {test}, which {plan} does not include"
            )


def require_correctness_coverage(
    inventory: dict[str, Any],
    *,
    correctness_plans: list[str],
    exact_exclusions: set[str],
) -> None:
    all_tests = set(inventory["tests"])
    unknown_plans = set(correctness_plans) - set(inventory["plans"])
    if unknown_plans:
        raise PolicyError(
            "unknown correctness plans: " + ", ".join(sorted(unknown_plans))
        )
    covered = {
        test
        for plan_name in correctness_plans
        for test in inventory["plans"][plan_name]["included_tests"]
    }
    uncovered = all_tests - covered - exact_exclusions
    if uncovered:
        raise PolicyError(
            "tests disappeared from every correctness plan: "
            + ", ".join(sorted(uncovered))
        )
    unknown_exclusions = exact_exclusions - all_tests
    if unknown_exclusions:
        raise PolicyError(
            "unknown correctness exclusions: " + ", ".join(sorted(unknown_exclusions))
        )


def repository_inventory(repo_root: Path) -> dict[str, Any]:
    source_roots = {
        "ZenbuJapaneseTests": repo_root / "apps/ios/Modules/Tests",
        "ZenbuJapaneseUITests": repo_root / "apps/ios/AppUITests",
    }
    tests_by_target: dict[str, set[str]] = {}
    for target, source_root in source_roots.items():
        discovered: set[str] = set()
        for path in source_root.rglob("*.swift"):
            current_class: str | None = None
            for line in path.read_text(encoding="utf-8").splitlines():
                class_match = re.match(
                    r"\s*(?:final\s+)?class\s+(\w+)\s*:\s*XCTestCase", line
                )
                if class_match:
                    current_class = class_match.group(1)
                    continue
                test_match = re.match(r"\s*func\s+(test\w+)\s*\(", line)
                if current_class and test_match:
                    discovered.add(f"{target}/{current_class}/{test_match.group(1)}")
        tests_by_target[target] = discovered

    plans: dict[str, dict[str, Any]] = {}
    for path in sorted((repo_root / "apps/ios/TestPlans").glob("*.xctestplan")):
        document = json.loads(path.read_text(encoding="utf-8"))
        included: set[str] = set()
        skipped: set[str] = set()
        included_by_target: dict[str, int] = {}
        for entry in document["testTargets"]:
            target = entry["target"]["name"]
            target_tests = tests_by_target[target]

            def expand(items: list[str]) -> set[str]:
                expanded: set[str] = set()
                for item in items:
                    item = item.removesuffix("()")
                    qualified = f"{target}/{item}"
                    if "/" in item:
                        expanded.add(qualified)
                    else:
                        expanded.update(
                            test
                            for test in target_tests
                            if test.startswith(f"{qualified}/")
                        )
                return expanded

            selected_items = entry.get("selectedTests")
            selected = (
                target_tests if selected_items is None else expand(selected_items)
            )
            entry_skipped = expand(entry.get("skippedTests", []))
            entry_included = selected - entry_skipped
            included.update(entry_included)
            skipped.update(entry_skipped)
            included_by_target[target] = len(entry_included)
        plans[path.stem] = {
            "included_tests": sorted(included),
            "skipped_tests": sorted(skipped),
            "targets": included_by_target,
        }
    all_tests = set().union(*tests_by_target.values())
    return {
        "targets": {key: sorted(value) for key, value in tests_by_target.items()},
        "tests": sorted(all_tests),
        "plans": plans,
    }


def resolve_plan(
    manifest: dict[str, Any],
    *,
    changed_paths: list[str],
    stage: str,
    event: str,
    draft: bool,
    source_sha: str,
    requested_capabilities: list[str] | None = None,
) -> dict[str, Any]:
    """Return the exact repository-selected work for one candidate and stage."""
    if stage not in manifest.get("stages", {}):
        raise PolicyError(f"unknown lifecycle stage {stage}")
    if not source_sha.strip():
        raise PolicyError("source SHA is required")
    cadence = lifecycle_cadence(stage=stage, event=event, draft=draft)
    if cadence in (
        "deferred-draft",
        "deferred-merge-group",
        "deferred-until-merge",
    ):
        return {
            "stage": stage,
            "event": event,
            "cadence": cadence,
            "source_sha": source_sha,
            "selectors": [],
            "selection_reasons": [],
        }

    selected: list[str] = []
    reasons: list[dict[str, str]] = []
    matched_capabilities: list[tuple[str, dict[str, Any], list[str]]] = []
    classified_paths: set[str] = set()
    requested = set(requested_capabilities or [])
    for capability, policy in manifest.get("capabilities", {}).items():
        if stage == "tdd" and requested and capability not in requested:
            continue
        patterns = list(policy.get("paths", []))
        if capability in requested:
            patterns.extend(policy.get("reviewed_override_paths", []))
        matching_paths = [
            path
            for path in changed_paths
            if any(fnmatch(path, pattern) for pattern in patterns)
        ]
        if not matching_paths and capability not in requested:
            continue
        classified_paths.update(matching_paths)
        matched_capabilities.append(
            (capability, policy, matching_paths or ["capability:" + capability])
        )
    unknown = requested - set(manifest.get("capabilities", {}))
    if unknown:
        raise PolicyError(
            f"unknown requested capabilities: {', '.join(sorted(unknown))}"
        )

    if matched_capabilities:
        for selector_id in manifest.get("required_stage_selectors", {}).get(stage, []):
            if selector_id not in selected:
                selected.append(selector_id)
                reasons.append(
                    {
                        "selector": selector_id,
                        "capability": "stage-required",
                        "path": f"stage:{stage}",
                    }
                )

    unclassified_paths = [
        path
        for path in changed_paths
        if path not in classified_paths
        and any(
            fnmatch(path, pattern) for pattern in manifest.get("relevant_paths", [])
        )
    ]
    if unclassified_paths:
        for selector_id in manifest.get("unclassified_fallback", {}).get(stage, []):
            if selector_id not in selected:
                selected.append(selector_id)
                reasons.append(
                    {
                        "selector": selector_id,
                        "capability": "unclassified-ios-fallback",
                        "path": unclassified_paths[0],
                    }
                )

    for capability, policy, matching_paths in matched_capabilities:
        for selector_id in policy.get(stage, []):
            if selector_id not in selected:
                selected.append(selector_id)
                reasons.append(
                    {
                        "selector": selector_id,
                        "capability": capability,
                        "path": matching_paths[0],
                    }
                )
    _validate_no_equivalent_selectors(
        manifest["selectors"],
        selected,
        context=f"resolved-candidate/{stage}",
        intentional=manifest.get("intentional_same_stage_evidence", {}),
    )
    return {
        "stage": stage,
        "event": event,
        "cadence": cadence,
        "source_sha": source_sha,
        "selectors": selected,
        "selection_reasons": reasons,
    }


def lifecycle_cadence(*, stage: str, event: str, draft: bool) -> str:
    if stage == "hosted-fast":
        allowed = {
            "opened",
            "reopened",
            "synchronize",
            "ready_for_review",
            "converted_to_draft",
            "merge_group",
            "workflow_dispatch",
        }
        if event not in allowed:
            raise PolicyError(f"unsupported hosted-fast event {event}")
        if event == "converted_to_draft" and not draft:
            raise PolicyError("converted_to_draft must carry draft=true")
        if event == "ready_for_review" and draft:
            raise PolicyError("ready_for_review must carry draft=false")
        if event == "merge_group":
            if draft:
                raise PolicyError("merge_group must carry draft=false")
            return "deferred-merge-group"
        return "deferred-draft" if draft else "verify-current-head"
    if stage == "merge-candidate":
        if event == "pull_request":
            return "deferred-until-merge"
        if event != "merge_group":
            raise PolicyError(f"merge-candidate requires merge_group, got {event}")
        return "verify-merge-candidate"
    if stage in ("manual", "release"):
        if event != "workflow_dispatch":
            raise PolicyError(f"{stage} requires workflow_dispatch, got {event}")
        return f"run-{stage}"
    if stage in ("tdd", "issue-final"):
        if event != "local":
            raise PolicyError(f"{stage} requires local execution, got {event}")
        return "run-local-gate"
    if stage == "performance":
        if event not in ("schedule", "workflow_dispatch"):
            raise PolicyError(
                f"performance requires schedule or workflow_dispatch, got {event}"
            )
        return "run-performance"
    raise PolicyError(f"unsupported lifecycle stage {stage}")


def selector_partitions(
    manifest: dict[str, Any], selector_ids: list[str]
) -> dict[str, list[str]]:
    tiers_by_selector = {
        selector_id: tier
        for tier, members in manifest["tiers"].items()
        for selector_id in members
    }
    partitions: dict[str, list[str]] = {}
    for selector_id in selector_ids:
        tier = tiers_by_selector[selector_id]
        partitions.setdefault(tier, []).append(selector_id)
    return partitions


def changed_paths(base_sha: str, head_sha: str, repo_root: Path) -> list[str]:
    result = subprocess.run(
        ["git", "diff", "--name-only", f"{base_sha}...{head_sha}"],
        cwd=repo_root,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.splitlines()


def _write_github_output(path: Path, values: dict[str, str]) -> None:
    with path.open("a", encoding="utf-8") as output:
        for key, value in values.items():
            output.write(f"{key}={value}\n")


def parse_arguments(arguments: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("apps/ios/VerificationPolicy.json"),
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("validate")

    plan = subparsers.add_parser("plan")
    plan.add_argument("--stage", required=True)
    plan.add_argument("--event", default="local")
    plan.add_argument("--draft", choices=("true", "false"), default="false")
    plan.add_argument("--source-sha", required=True)
    plan.add_argument("--base")
    plan.add_argument("--head")
    plan.add_argument("--path", action="append", default=[])
    plan.add_argument("--capability", action="append", default=[])
    plan.add_argument("--github-output", type=Path)

    fingerprint = subparsers.add_parser("fingerprint")
    fingerprint.add_argument("--repo-root", type=Path, default=Path("."))
    fingerprint.add_argument("--plan", required=True)
    fingerprint.add_argument("--device-type", required=True)
    fingerprint.add_argument("--xcode-version", required=True)
    fingerprint.add_argument("--runtime-id", required=True)
    fingerprint.add_argument("--build-argument", action="append", default=[])

    verify = subparsers.add_parser("verify-products")
    verify.add_argument("--marker", type=Path, required=True)
    verify.add_argument("--source-fingerprint", required=True)
    verify.add_argument("--build-fingerprint", required=True)

    sha = subparsers.add_parser("verify-sha")
    sha.add_argument("--current", required=True)
    sha.add_argument("--tested", action="append", required=True)

    classify = subparsers.add_parser("classify-failure")
    classify.add_argument("--tests-started", type=int, required=True)
    classify.add_argument("--category", required=True)

    tests = subparsers.add_parser("tests")
    tests.add_argument("--selector", action="append", default=[])
    tests.add_argument("--plan", required=True)
    tests.add_argument("--stage", required=True)

    lease = subparsers.add_parser("lease-run")
    lease.add_argument("--lock", type=Path, required=True)
    lease.add_argument("--owner", required=True)
    lease.add_argument("remainder", nargs=argparse.REMAINDER)

    summary = subparsers.add_parser("summary")
    summary.add_argument("--source-sha", required=True)
    summary.add_argument("--source-fingerprint", required=True)
    summary.add_argument("--build-fingerprint", required=True)
    summary.add_argument("--plan", required=True)
    summary.add_argument("--selectors-json", required=True)
    summary.add_argument("--os-version", required=True)
    summary.add_argument("--xcode-version", required=True)
    summary.add_argument("--attempt", type=int, required=True)
    summary.add_argument("--setup-seconds", type=float, required=True)
    summary.add_argument("--build-seconds", type=float, required=True)
    summary.add_argument("--test-seconds", type=float, required=True)
    summary.add_argument("--build-mode", choices=("fresh", "reused"), required=True)
    summary.add_argument("--tests-started", type=int, required=True)
    summary.add_argument("--failure-json", required=True)

    inventory = subparsers.add_parser("inventory")
    inventory.add_argument("--repo-root", type=Path, default=Path("."))
    return parser.parse_args(arguments)


def main(arguments: list[str]) -> int:
    options = parse_arguments(arguments)
    if options.command == "lease-run":
        command = options.remainder
        if command and command[0] == "--":
            command = command[1:]
        if not command:
            raise PolicyError("lease-run requires a command after --")
        lease = SimulatorLease.acquire(options.lock, owner=options.owner)
        try:
            process = subprocess.Popen(command)
            try:
                return process.wait()
            except KeyboardInterrupt:
                process.send_signal(signal.SIGINT)
                try:
                    process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    process.terminate()
                    process.wait(timeout=15)
                return 130
        finally:
            lease.release()
    if options.command == "summary":
        print(
            json.dumps(
                execution_summary(
                    source_sha=options.source_sha,
                    source_fingerprint=options.source_fingerprint,
                    build_fingerprint=options.build_fingerprint,
                    plan=options.plan,
                    selectors=json.loads(options.selectors_json),
                    os_version=options.os_version,
                    xcode_version=options.xcode_version,
                    attempt=options.attempt,
                    setup_seconds=options.setup_seconds,
                    build_seconds=options.build_seconds,
                    test_seconds=options.test_seconds,
                    build_mode=options.build_mode,
                    tests_started=options.tests_started,
                    failure=json.loads(options.failure_json),
                ),
                indent=2,
                sort_keys=True,
            )
        )
        return 0
    if options.command == "inventory":
        print(
            json.dumps(
                repository_inventory(options.repo_root), indent=2, sort_keys=True
            )
        )
        return 0
    if options.command == "tests":
        manifest = load_and_validate_manifest(options.manifest)
        if options.stage not in manifest["stages"]:
            raise PolicyError(f"unknown lifecycle stage {options.stage}")
        allowed = {
            selector_id
            for tier in manifest["stages"][options.stage]
            for selector_id in manifest["tiers"][tier]
        }
        for selector_id in options.selector:
            selector = manifest["selectors"].get(selector_id)
            if selector is None:
                raise PolicyError(f"unknown selector {selector_id}")
            if selector["plan"] != options.plan:
                raise PolicyError(
                    f"selector {selector_id} belongs to {selector['plan']}, not {options.plan}"
                )
            if selector_id not in allowed:
                raise PolicyError(
                    f"selector {selector_id} is not allowed at {options.stage}"
                )
            if selector["test"]:
                print(selector["test"])
        return 0
    if options.command == "fingerprint":
        source = source_fingerprint(options.repo_root)
        print(
            json.dumps(
                {
                    "source_fingerprint": source,
                    "build_fingerprint": build_fingerprint(
                        source=source,
                        plan=options.plan,
                        device_type=options.device_type,
                        xcode_version=options.xcode_version,
                        runtime_id=options.runtime_id,
                        build_arguments=options.build_argument,
                    ),
                },
                sort_keys=True,
            )
        )
        return 0
    if options.command == "verify-products":
        marker = json.loads(options.marker.read_text(encoding="utf-8"))
        require_matching_build_products(
            marker,
            {
                "source_fingerprint": options.source_fingerprint,
                "build_fingerprint": options.build_fingerprint,
            },
        )
        return 0
    if options.command == "verify-sha":
        require_verified_sha(current_sha=options.current, partition_shas=options.tested)
        return 0
    if options.command == "classify-failure":
        print(
            json.dumps(
                classify_failure(
                    tests_started=options.tests_started,
                    failure_category=options.category,
                ),
                sort_keys=True,
            )
        )
        return 0

    manifest = load_and_validate_manifest(options.manifest)
    if options.command == "validate":
        validate_repository_contracts(manifest, Path.cwd())
        print(f"verification policy valid: {options.manifest}")
        return 0
    paths = options.path
    if options.base and options.head:
        paths.extend(changed_paths(options.base, options.head, Path.cwd()))
    plan = resolve_plan(
        manifest,
        changed_paths=paths,
        stage=options.stage,
        event=options.event,
        draft=options.draft == "true",
        source_sha=options.source_sha,
        requested_capabilities=options.capability,
    )
    plan["partitions"] = selector_partitions(manifest, plan["selectors"])
    print(json.dumps(plan, indent=2, sort_keys=True))
    if options.github_output:
        values = {
            "cadence": plan["cadence"],
            "source_sha": plan["source_sha"],
            "run_expensive": str(bool(plan["selectors"])).lower(),
        }
        for tier in (
            "contracts",
            "unit",
            "ui",
            "accessibility",
            "integration",
            "complete",
            "performance",
        ):
            values[f"{tier}_selectors"] = json.dumps(
                plan["partitions"].get(tier, []), separators=(",", ":")
            )
        _write_github_output(options.github_output, values)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except (PolicyError, ProductFingerprintError, VerifiedSHAError) as error:
        print(f"verification policy error: {error}", file=sys.stderr)
        raise SystemExit(2)
