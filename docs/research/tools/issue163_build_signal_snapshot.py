#!/usr/bin/env python3
"""Build the candidate-restricted normalized signal snapshot for issue #163."""

from __future__ import annotations

import argparse
import bz2
import csv
import hashlib
import importlib.metadata
import io
import json
import sqlite3
import tarfile
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Iterable, Iterator

import wordfreq
from wordfreq import zipf_frequency

from issue163_signal_benchmark import REVEALED, english_candidates


ROOT = Path(__file__).resolve().parents[3]
DB_REL = "apps/ios/Modules/Sources/SearchExperience/Resources/LanguageReferenceData.sqlite3"
CONTEXTS_REL = "docs/research/fixtures/example-sentence-retrieval-issue-147-observation-contexts.tsv"
OBSERVATIONS_REL = "docs/research/fixtures/example-sentence-retrieval-issue-147-observation-rows.tsv"
COMPARISON_REL = "apps/ios/LanguageData/Generated/ExampleSentenceRetrieval-v1-comparison-rows.tsv"
VISIBLE_REL = "apps/ios/LanguageData/Generated/ExampleSentenceRetrieval-v1-rows.tsv"
EXPECTED_REPO_INPUTS = {
    DB_REL: "248f9308662374c00dc597731ef085ee5ed87d9b703ec356be93ee9be8f03d4f",
    CONTEXTS_REL: "b91487df29df9bc731765b3a437216d2656bf4761b64c609c12a80189b93a6d8",
    OBSERVATIONS_REL: "ffbad9f0a93843507058045f0820dec6f242c6041db224b0ec8e79574c5c7dbc",
    COMPARISON_REL: "3dd0a21b7628da6352909e32c310a1f0ae63bcccc13aa11b4df9a1f88ecc9100",
    VISIBLE_REL: "65c47a1502c9848f1f8ed18dcb06f025d06bd3586643b90272c0f8f16a6d4d15",
}
EXPECTED_SIGNAL_INPUTS = {
    "sentences_base.tar.bz2": "08c13e6d94e36fb7f42954bfc32e71f2b6b487c5d08235fc0156531e9b270230",
    "sentences_in_lists.tar.bz2": "b16e3797a45d799eb5855b40ed393e19935cb119069dc0ddd7cac46513f2a158",
    "sentences_with_audio.tar.bz2": "7c0835b4b9792fb49843766c41ce457abb42f5fc04cc538e52ee98614d8cd65a",
    "tags.tar.bz2": "44e07d94ecfb111b01c3633f3c4062207f203602ef7fac551434fe1e5af7afe0",
    "user_languages.tar.bz2": "cad063b6b1a0c65175f82e94ff0c648fbd04006100e5c23c85951f68d58a82f9",
    "user_lists.tar.bz2": "d3c60721631bf37d0fa00b46c4004ade9d3ae6535e72d8690808d4b4936a48d3",
    "users_sentences.csv": "16338c24cf446b0faea040b2ebbb3c84284a732c91327cc4cfae2c30196e0cf3",
}
EXPECTED_CORPUS_INPUTS = {
    "eng_sentences_detailed.tsv.bz2": "2080a8720ab4f5d7475dff0b49f40a37871f42ac29432ceb2084fe405f31cc02",
    "jpn_sentences_detailed.tsv.bz2": "ec113c38e4fa8bff8c1ed44b2786345084f1766780b86ef9bc754450ca21f0ac",
    "eng_sentences_CC0.tsv.bz2": "6ab169264a28008c25bf63042bf7535fc63137c9d7e09b7b8bd7812d10117d1b",
    "jpn_sentences_CC0.tsv.bz2": "39e6768de61f901a0904d9e74e554772d4e12286121ec3e2c6bd5307ce543465",
    "jpn_indices.tar.bz2": "375e13617e970ff54b1f1417b48493887ecbef48e6779cbdb8f774224baae84f",
}
EXPECTED_WORDFREQ_VERSION = "3.0.2"
EXPECTED_WORDFREQ_ASSET_SHA256 = "dffae8066b78dce0a6667cf5f58e567054f902674667090a7ac8a8a44628b05c"
EXPECTED_PAIR_COUNT = 9_479
EXPECTED_ROWS_SHA256 = "6131e8f29d8b15f90b8be30e8d525299decd857c72a612e4b7224616b63a74d5"

FEATURE_SCHEMA = {
    "audio": "boolean",
    "beginner_list": "boolean",
    "both_original": "boolean",
    "cc0_both": "boolean",
    "cc0_either": "boolean",
    "either_original": "boolean",
    "goodexample_list": "boolean",
    "jpn_indexed": "boolean; Japanese sentence has an official jpn_indices entry",
    "list_count": "nonnegative integer",
    "negative_list": "boolean",
    "negative_reviews": "nonnegative integer",
    "negative_tag": "boolean",
    "ngsl_level1_list": "boolean",
    "ogte_level": "integer 1...20; 100 means absent",
    "owner_skill": "integer; -1 means incomplete",
    "pair_created_at": "nullable provider datetime string; maximum of both sentence creation values; null unless both valid",
    "pair_modified_at": "nullable provider datetime string; maximum of both sentence modification values; null unless both valid",
    "positive_reviews": "nonnegative integer",
    "positive_tag": "boolean",
    "proofread_list": "boolean",
    "review_score": "integer",
    "reviewed": "boolean",
    "wordfreq_zipf_milli": "wordfreq 3.0.2 whole-English-text Zipf frequency multiplied by 1000 and rounded",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_hashes(base: Path, expected: dict[str, str]) -> None:
    failures = []
    for relative, wanted in expected.items():
        actual = sha256(base / relative)
        if actual != wanted:
            failures.append(f"{base / relative}: expected {wanted}, got {actual}")
    if failures:
        raise RuntimeError("input checksum mismatch\n" + "\n".join(failures))


def validate_repo_fixture_schemas() -> None:
    expected_headers = {
        CONTEXTS_REL: "context_id\tphase\tcontext_type\tquery_or_entry\tlanguage\treference_version\tenvironment\tcaptured_at_start\tcaptured_at_end\tprivate_evidence_start_pointer\tprivate_evidence_start_sha256\tprivate_evidence_terminal_pointer\tprivate_evidence_terminal_sha256\tcount_value\tcount_kind\tcaptured_row_count\texhaustive\tterminal_evidence\tzenbu_baseline",
        OBSERVATIONS_REL: "context_id\trank\tcaptured_at\tenvironment\tprivate_evidence_pointer\tevidence_sha256\tjapanese\tenglish\tjapanese_id\tenglish_id\tzenbu_present_pre\tzenbu_rank_pre\tlexical_relation\tgeneral_japanese\tgeneral_english\tdirect_link\tjapanese_indices\tduplicate_group\tduplicate_group_size\tobservation_source",
        COMPARISON_REL: "context_id\tquery\troute\tpair_id\tin_baseline\tbaseline_rank\tin_v1\tv1_rank\trank_delta",
        VISIBLE_REL: "context_id\tquery\troute\tresult_rank\tpair_id\tlexical_relation\tmatch_location\tmatch_length\tenglish_term_count\tjapanese_grapheme_count\trank_tuple",
    }
    for relative, expected in expected_headers.items():
        with (ROOT / relative).open(encoding="utf-8") as handle:
            if handle.readline().rstrip("\n") != expected:
                raise RuntimeError(f"fixture schema mismatch: {relative}")


def raw_tsv(path: Path, expected_columns: int | None = None, minimum_columns: int | None = None) -> Iterator[list[str]]:
    with path.open(encoding="utf-8", errors="replace", newline="") as handle:
        yield from validated_rows(csv.reader(handle, delimiter="\t"), path.name, expected_columns, minimum_columns)


def bz2_tsv(path: Path, expected_columns: int | None = None, minimum_columns: int | None = None) -> Iterator[list[str]]:
    with bz2.open(path, "rt", encoding="utf-8", errors="replace", newline="") as handle:
        yield from validated_rows(csv.reader(handle, delimiter="\t"), path.name, expected_columns, minimum_columns)


def archive_tsv(path: Path, member_name: str, expected_columns: int | None = None, minimum_columns: int | None = None) -> Iterator[list[str]]:
    with tarfile.open(path, "r:bz2") as archive:
        regular_members = [member for member in archive.getmembers() if member.isfile()]
        if [member.name for member in regular_members] != [member_name]:
            raise RuntimeError(f"archive schema mismatch: {path}")
        extracted = archive.extractfile(regular_members[0])
        if extracted is None:
            raise RuntimeError(f"archive member unreadable: {path}")
        with io.TextIOWrapper(extracted, encoding="utf-8", errors="replace", newline="") as handle:
            yield from validated_rows(csv.reader(handle, delimiter="\t"), member_name, expected_columns, minimum_columns)


def validated_rows(
    rows: Iterable[list[str]], name: str, expected_columns: int | None, minimum_columns: int | None
) -> Iterator[list[str]]:
    for line_number, row in enumerate(rows, start=1):
        if expected_columns is not None and len(row) != expected_columns:
            raise RuntimeError(f"{name}:{line_number}: expected {expected_columns} columns, got {len(row)}")
        if minimum_columns is not None and len(row) < minimum_columns:
            raise RuntimeError(f"{name}:{line_number}: expected at least {minimum_columns} columns, got {len(row)}")
        yield row


def normalized_timestamp(value: str | None) -> str | None:
    if not value or value in ("\\N", "0000-00-00 00:00:00"):
        return None
    datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
    return value


def wanted_pairs(db: sqlite3.Connection) -> set[str]:
    with (ROOT / COMPARISON_REL).open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle, delimiter="\t"))
    for row in rows:
        if row["in_v1"] not in ("true", "false"):
            raise RuntimeError("comparison fixture has invalid in_v1 value")
    pair_ids = {row["pair_id"] for row in rows if row["in_v1"] == "true"}
    for query, _ in REVEALED.values():
        pair_ids.update(english_candidates(db, query))
    if len(pair_ids) != EXPECTED_PAIR_COUNT:
        raise RuntimeError(f"candidate pair count mismatch: {len(pair_ids)}")
    return pair_ids


def provenance_and_text(
    db: sqlite3.Connection, pair_ids: set[str]
) -> tuple[dict[str, tuple[int, int]], dict[str, str]]:
    db.execute("CREATE TEMP TABLE wanted(pair_id BLOB PRIMARY KEY) WITHOUT ROWID")
    db.executemany("INSERT INTO wanted VALUES (?)", [(bytes.fromhex(pair_id[5:]),) for pair_id in pair_ids])
    provenance: dict[str, tuple[int, int]] = {}
    for row in db.execute(
        """
        SELECT 'esp1_' || lower(hex(p.pair_id)) pair_id,
               p.source_japanese_record_id japanese_id,
               p.source_english_record_id english_id
        FROM example_sentence_provenance p JOIN wanted w ON w.pair_id=p.pair_id
        WHERE p.source_identity='tatoeba.weekly-export'
        ORDER BY p.pair_id, japanese_id, english_id
        """
    ):
        coordinate = (int(row["japanese_id"]), int(row["english_id"]))
        previous = provenance.setdefault(row["pair_id"], coordinate)
        if previous != coordinate:
            raise RuntimeError(f"ambiguous retained provenance for {row['pair_id']}")
    if set(provenance) != pair_ids:
        raise RuntimeError("retained provenance does not cover candidate pair set")
    english_text = {
        row["pair_id"]: row["english"]
        for row in db.execute(
            """
            SELECT 'esp1_' || lower(hex(e.id)) pair_id, e.english
            FROM example_sentences e JOIN wanted w ON w.pair_id=e.id
            """
        )
    }
    if set(english_text) != pair_ids:
        raise RuntimeError("English text does not cover candidate pair set")
    return provenance, english_text


def build_rows(signal_dir: Path, corpus_dir: Path, db: sqlite3.Connection) -> list[dict[str, object]]:
    pair_ids = wanted_pairs(db)
    provenance, english_text = provenance_and_text(db, pair_ids)
    sentence_ids = {sentence_id for coordinate in provenance.values() for sentence_id in coordinate}

    tags: dict[int, set[str]] = defaultdict(set)
    reviews: dict[int, Counter[int]] = defaultdict(Counter)
    lists: dict[int, set[int]] = defaultdict(set)
    audio_ids: set[int] = set()
    base: dict[int, str] = {}
    detail: dict[int, dict[str, str]] = {}
    cc0: set[int] = set()
    jpn_indexed_ids: set[int] = set()

    for row in archive_tsv(signal_dir / "tags.tar.bz2", "tags.csv", expected_columns=2):
        sentence_id = int(row[0])
        if sentence_id in sentence_ids:
            tags[sentence_id].add(row[1])
    for row in raw_tsv(signal_dir / "users_sentences.csv", expected_columns=5):
        sentence_id = int(row[1])
        rating = int(row[2])
        if rating not in (-1, 0, 1):
            raise RuntimeError("users_sentences contains invalid rating")
        if sentence_id in sentence_ids:
            reviews[sentence_id][rating] += 1
    for row in archive_tsv(signal_dir / "sentences_in_lists.tar.bz2", "sentences_in_lists.csv", expected_columns=2):
        sentence_id = int(row[1])
        if sentence_id in sentence_ids:
            lists[sentence_id].add(int(row[0]))
    for row in archive_tsv(signal_dir / "sentences_with_audio.tar.bz2", "sentences_with_audio.csv", expected_columns=5):
        sentence_id = int(row[0])
        if sentence_id in sentence_ids:
            audio_ids.add(sentence_id)
    for row in archive_tsv(signal_dir / "sentences_base.tar.bz2", "sentences_base.csv", expected_columns=2):
        sentence_id = int(row[0])
        if sentence_id in sentence_ids:
            base[sentence_id] = row[1]

    for language in ("jpn", "eng"):
        for row in bz2_tsv(corpus_dir / f"{language}_sentences_detailed.tsv.bz2", expected_columns=6):
            sentence_id = int(row[0])
            if row[1] != language:
                raise RuntimeError(f"detailed export language mismatch: {language}")
            if sentence_id in sentence_ids:
                detail[sentence_id] = {"owner": row[3], "added": row[4], "modified": row[5]}
        for row in bz2_tsv(corpus_dir / f"{language}_sentences_CC0.tsv.bz2", minimum_columns=1):
            sentence_id = int(row[0])
            if sentence_id in sentence_ids:
                cc0.add(sentence_id)
    for row in archive_tsv(corpus_dir / "jpn_indices.tar.bz2", "jpn_indices.csv", minimum_columns=3):
        sentence_id = int(row[0])
        int(row[1])
        if sentence_id in sentence_ids:
            jpn_indexed_ids.add(sentence_id)

    list_metadata: dict[int, str] = {}
    for row in archive_tsv(signal_dir / "user_lists.tar.bz2", "user_lists.csv", minimum_columns=6):
        list_metadata[int(row[0])] = " ".join(row[4:-1])
    owners = {record["owner"] for record in detail.values() if record["owner"] not in ("", "\\N")}
    skills: dict[tuple[str, str], int] = {}
    # The pinned provider file contains free-text continuation lines. Only rows
    # with the documented language/level/username prefix are records we consume.
    for row in archive_tsv(signal_dir / "user_languages.tar.bz2", "user_languages.csv"):
        if len(row) < 3:
            continue
        if row[2] in owners and row[0] in ("eng", "jpn"):
            skills[(row[2], row[0])] = int(row[1]) if row[1] not in ("", "\\N") else 0

    proofread_list_ids = {
        list_id for list_id, name in list_metadata.items() if "proofread good english sentences" in name.lower()
    }
    if 907 not in proofread_list_ids:
        raise RuntimeError("expected official list 907 in proofread class")
    negative_tag_fragments = ("not ok", "needs native check", "incorrect", "bad", "delete", "wrong", "unnatural")
    negative_list_ids = {
        list_id for list_id, name in list_metadata.items() if "filter out" in name.lower() or "to be checked" in name.lower()
    }
    ogte_levels = {
        list_id: level
        for level, list_id in enumerate(
            [7407, 7408, 7409, 7410, 7411, 7412, 7413, 7414, 7415, 7416, 7417, 7418,
             7419, 7426, 7420, 7421, 7422, 7423, 7424, 7425],
            start=1,
        )
    }

    rows = []
    for pair_id in sorted(pair_ids):
        japanese_id, english_id = provenance[pair_id]
        pair_tags = tags[japanese_id] | tags[english_id]
        pair_lists = lists[japanese_id] | lists[english_id]
        positive = reviews[japanese_id][1] + reviews[english_id][1]
        negative = reviews[japanese_id][-1] + reviews[english_id][-1]
        undecided = reviews[japanese_id][0] + reviews[english_id][0]
        japanese_detail = detail.get(japanese_id, {})
        english_detail = detail.get(english_id, {})
        created = [normalized_timestamp(record.get("added")) for record in (japanese_detail, english_detail)]
        modified = [normalized_timestamp(record.get("modified")) for record in (japanese_detail, english_detail)]
        owner_skill_values = []
        if japanese_detail.get("owner"):
            owner_skill_values.append(skills.get((japanese_detail["owner"], "jpn"), -1))
        if english_detail.get("owner"):
            owner_skill_values.append(skills.get((english_detail["owner"], "eng"), -1))
        known_skills = [value for value in owner_skill_values if value >= 0]
        rows.append(
            {
                "audio": japanese_id in audio_ids or english_id in audio_ids,
                "beginner_list": 7 in pair_lists,
                "both_original": base.get(japanese_id) == "0" and base.get(english_id) == "0",
                "cc0_both": japanese_id in cc0 and english_id in cc0,
                "cc0_either": japanese_id in cc0 or english_id in cc0,
                "either_original": base.get(japanese_id) == "0" or base.get(english_id) == "0",
                "goodexample_list": 170810 in pair_lists,
                "jpn_indexed": japanese_id in jpn_indexed_ids,
                "list_count": len(pair_lists),
                "negative_list": bool(pair_lists & negative_list_ids),
                "negative_reviews": negative,
                "negative_tag": any(any(fragment in tag.lower() for fragment in negative_tag_fragments) for tag in pair_tags),
                "ngsl_level1_list": 7389 in pair_lists,
                "ogte_level": min((ogte_levels[list_id] for list_id in pair_lists if list_id in ogte_levels), default=100),
                "owner_skill": min(known_skills) if len(known_skills) == 2 else -1,
                "pair_created_at": max(created) if all(created) else None,
                "pair_id": pair_id,
                "pair_modified_at": max(modified) if all(modified) else None,
                "positive_reviews": positive,
                "positive_tag": bool(pair_tags & {"OK", "ok"}),
                "proofread_list": bool(pair_lists & proofread_list_ids),
                "review_score": positive - negative,
                "reviewed": positive + negative + undecided > 0,
                "wordfreq_zipf_milli": round(zipf_frequency(english_text[pair_id], "en", wordlist="large") * 1000),
            }
        )
    return rows


def snapshot(rows: list[dict[str, object]]) -> dict[str, object]:
    rows_sha256 = hashlib.sha256(
        json.dumps(rows, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    if len(rows) != EXPECTED_PAIR_COUNT or rows_sha256 != EXPECTED_ROWS_SHA256:
        raise RuntimeError(f"normalized snapshot mismatch: rows={len(rows)} sha256={rows_sha256}")
    upstream_inputs = [
        {"name": name, "sha256": digest}
        for name, digest in (
            ("eng_sentences_detailed.tsv.bz2", EXPECTED_CORPUS_INPUTS["eng_sentences_detailed.tsv.bz2"]),
            ("jpn_sentences_detailed.tsv.bz2", EXPECTED_CORPUS_INPUTS["jpn_sentences_detailed.tsv.bz2"]),
            ("eng_sentences_CC0.tsv.bz2", EXPECTED_CORPUS_INPUTS["eng_sentences_CC0.tsv.bz2"]),
            ("jpn_sentences_CC0.tsv.bz2", EXPECTED_CORPUS_INPUTS["jpn_sentences_CC0.tsv.bz2"]),
            ("jpn_indices.tar.bz2", EXPECTED_CORPUS_INPUTS["jpn_indices.tar.bz2"]),
            ("sentences_base.tar.bz2", EXPECTED_SIGNAL_INPUTS["sentences_base.tar.bz2"]),
            ("sentences_in_lists.tar.bz2", EXPECTED_SIGNAL_INPUTS["sentences_in_lists.tar.bz2"]),
            ("sentences_with_audio.tar.bz2", EXPECTED_SIGNAL_INPUTS["sentences_with_audio.tar.bz2"]),
            ("tags.tar.bz2", EXPECTED_SIGNAL_INPUTS["tags.tar.bz2"]),
            ("user_languages.tar.bz2", EXPECTED_SIGNAL_INPUTS["user_languages.tar.bz2"]),
            ("user_lists.tar.bz2", EXPECTED_SIGNAL_INPUTS["user_lists.tar.bz2"]),
            ("users_sentences.csv", EXPECTED_SIGNAL_INPUTS["users_sentences.csv"]),
            ("wordfreq-3.0.2-large_en.msgpack.gz", EXPECTED_WORDFREQ_ASSET_SHA256),
        )
    ]
    return {
        "feature_schema": FEATURE_SCHEMA,
        "row_count": len(rows),
        "rows": rows,
        "schema_version": 1,
        "snapshot_rows_sha256": rows_sha256,
        "source_snapshot": {
            "date_semantics": "timezone-less provider sentence-row created/modified values; pair fields are max-of-both proxies, not link age",
            "export_schedule": "weekly Saturday 06:30 UTC",
            "http_last_modified": "Sat, 08 Aug 2026",
            "identity": "tatoeba.weekly-export",
            "normalization": "candidate-restricted app-owned pair features; no provider coordinates",
            "provider_license": "CC BY 2.0 FR unless per-record CC0; audio bytes excluded",
            "upstream_inputs": upstream_inputs,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--signal-dir", type=Path, required=True)
    parser.add_argument("--corpus-dir", type=Path, required=True)
    parser.add_argument("--wordfreq-asset", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    validate_hashes(ROOT, EXPECTED_REPO_INPUTS)
    validate_repo_fixture_schemas()
    validate_hashes(args.signal_dir, EXPECTED_SIGNAL_INPUTS)
    validate_hashes(args.corpus_dir, EXPECTED_CORPUS_INPUTS)
    if importlib.metadata.version("wordfreq") != EXPECTED_WORDFREQ_VERSION:
        raise RuntimeError("wordfreq package version mismatch")
    if sha256(args.wordfreq_asset) != EXPECTED_WORDFREQ_ASSET_SHA256:
        raise RuntimeError("wordfreq asset checksum mismatch")
    installed_asset = Path(wordfreq.__file__).resolve().parent / "data" / "large_en.msgpack.gz"
    if sha256(installed_asset) != EXPECTED_WORDFREQ_ASSET_SHA256:
        raise RuntimeError("installed wordfreq asset checksum mismatch")

    db = sqlite3.connect(ROOT / DB_REL)
    db.row_factory = sqlite3.Row
    rows = build_rows(args.signal_dir, args.corpus_dir, db)
    db.close()
    encoded = json.dumps(snapshot(rows), ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    args.output.write_text(encoded, encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
