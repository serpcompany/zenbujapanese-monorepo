#!/usr/bin/env python3
"""Compare retained full and shadow receipts; never authorizes gate cutover."""
import argparse
from datetime import datetime
import json
import math
from pathlib import Path

import ios_verification as policy


def test_cases(document):
    cases = {}

    def visit(node):
        if node.get("nodeType") == "Test Case":
            identity = node["nodeIdentifierURL"].split("/ZenbuJapanese/", 1)[1]
            repetitions = [
                n for n in node.get("children", []) if n.get("nodeType") == "Repetition"
            ]
            cases[identity] = {
                "result": node.get("result"),
                "seconds": max(
                    [n.get("durationInSeconds", 0) for n in repetitions]
                    or [node.get("durationInSeconds", 0)]
                ),
                "failed_repetition": any(
                    n.get("result") != "Passed" for n in repetitions
                ),
            }
        for child in node.get("children", []):
            visit(child)

    for node in document.get("testNodes", []):
        visit(node)
    return cases


def compare(
    manifest, inventory, evidence, jobs, source_sha, run_started_at, run_attempt=1
):
    full = policy.merge_candidate_matrix(
        manifest, manifest["capabilities"]["full-merge"]["merge-candidate"], inventory
    )["include"]
    shadow = policy.lean_shadow_matrix(manifest, inventory)["include"]
    partitions = policy.merge_candidate_partitions(inventory)
    records = []
    problems = []
    if run_attempt != 1:
        problems.append(
            "Workflow rerun requires review of prior failures before it can count"
        )
    failures = {"full": set(), "shadow": set()}
    shadow_completed = []
    for suite, lanes in [("full", full), ("shadow", shadow)]:
        for lane in lanes:
            name = lane["lane"]
            expected = set().union(
                *(
                    policy.selector_tests(
                        manifest["selectors"][key], inventory, partitions
                    )
                    for key in lane["selectors"]
                )
            )
            paths = list(evidence.rglob(f"ZenbuPreMerge-{name}.xcresult.timing.json"))
            record = {
                "suite": suite,
                "lane": name,
                "selectors": lane["selectors"],
                "planned_test_count": len(expected),
            }
            records.append(record)
            try:
                if len(paths) != 1:
                    raise ValueError("missing or duplicate timing receipt")
                timing_path = paths[0]
                timing = json.loads(timing_path.read_text())
                result = json.loads(
                    timing_path.with_name(
                        timing_path.name.replace("timing.json", "results.json")
                    ).read_text()
                )
                cases = test_cases(
                    json.loads(
                        timing_path.with_name(
                            timing_path.name.replace("timing.json", "tests.json")
                        ).read_text()
                    )
                )
                if timing["source_sha"] != source_sha or set(
                    timing["selectors"]
                ) != set(lane["selectors"]):
                    raise ValueError("SHA or selector receipt mismatch")
                if timing.get("attempt") != run_attempt:
                    raise ValueError("workflow attempt receipt mismatch")
                if set(cases) != expected or result["totalTestCount"] != len(expected):
                    raise ValueError(
                        "executed test inventory differs from planned inventory"
                    )
                prefix = "ios-shadow" if suite == "shadow" else "ios-premerge"
                job = next(j for j in jobs if j["name"] == f"{prefix} / {name}")
                if job["conclusion"] != "success":
                    problems.append(f"{name}: job did not succeed")
                record.update(
                    source_sha=source_sha,
                    test_count=result["totalTestCount"],
                    durations_seconds=timing["durations_seconds"],
                    tests=cases,
                    failures=result.get("testFailures", []),
                )
                failed = {
                    key
                    for key, value in cases.items()
                    if value["result"] != "Passed" or value["failed_repetition"]
                }
                failures[suite].update(failed)
                if (
                    failed
                    or result.get("skippedTests", 0)
                    or result.get("result") != "Passed"
                    or timing["failure"]["classification"] != "success"
                ):
                    problems.append(
                        f"{name}: failed, skipped, or repeated-failure tests"
                    )
                if suite == "shadow":
                    if any(
                        not math.isfinite(value["seconds"]) or value["seconds"] <= 0
                        for key, value in cases.items()
                        if key.startswith("ZenbuJapaneseUITests/")
                    ):
                        raise ValueError("invalid or missing blocking UI duration")
                    slow = [
                        key
                        for key, value in cases.items()
                        if key.startswith("ZenbuJapaneseUITests/")
                        and value["seconds"] >= 120
                    ]
                    if slow:
                        problems.append(
                            f"{name}: blocking UI methods exceed 120 seconds: {slow}"
                        )
                    if job["conclusion"] != "success":
                        raise ValueError("shadow job did not succeed")
                    shadow_completed.append(
                        datetime.fromisoformat(
                            job["completed_at"].replace("Z", "+00:00")
                        )
                    )
            except (KeyError, ValueError, OSError, StopIteration, TypeError) as error:
                problems.append(f"{name}: incomplete evidence ({error})")
                record["evidence_error"] = str(error)
    contracts = next((j for j in jobs if j["name"] == "ios-shadow / Contracts"), None)
    if not contracts or contracts.get("conclusion") != "success":
        problems.append("shadow Contracts did not succeed")
    else:
        shadow_completed.append(
            datetime.fromisoformat(contracts["completed_at"].replace("Z", "+00:00"))
        )
    elapsed = None
    if shadow_completed:
        elapsed = (
            max(shadow_completed)
            - datetime.fromisoformat(run_started_at.replace("Z", "+00:00"))
        ).total_seconds()
        if elapsed > 900 or elapsed < 0:
            problems.append("shadow wall time is outside the 15-minute target")
    return {
        "source_sha": source_sha,
        "run_started_at": run_started_at,
        "run_attempt": run_attempt,
        "blocking_journey_owners": policy.blocking_journey_owners(manifest),
        "shadow_wall_seconds": elapsed,
        "lanes": records,
        "full_only_failures": sorted(failures["full"] - failures["shadow"]),
        "problems": problems,
        "candidate_qualifies": not problems,
        "cutover_authorized": False,
        "remaining_cutover_requirements": "Three consecutive qualifying iOS merge candidates, human flake/equivalence review, and explicit owner approval. Full gate remains required.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--jobs", type=Path, required=True)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--run-started-at", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--run-attempt", type=int, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[3]
    manifest = policy.load_and_validate_manifest(
        root / "apps/ios/VerificationPolicy.json"
    )
    report = compare(
        manifest,
        policy.repository_inventory(root),
        args.evidence,
        json.loads(args.jobs.read_text())["jobs"],
        args.source_sha,
        args.run_started_at,
        args.run_attempt,
    )
    report["run_id"] = args.run_id
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k != "lanes"}, indent=2))


if __name__ == "__main__":
    main()
