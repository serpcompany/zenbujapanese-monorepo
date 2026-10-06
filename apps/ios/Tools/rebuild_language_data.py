#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

from language_data_tools import file_sha256

TOOLS = Path(__file__).resolve().parent
IOS = TOOLS.parent
REPOSITORY = IOS.parent.parent
SOURCES = IOS / "LanguageData/Sources"
GENERATED = IOS / "LanguageData/Generated"
RESOURCES = IOS / "Modules/Sources/SearchExperience/Resources"
CATALOG = RESOURCES / "FrequencyPackCatalog.json"
ANIME_FIXTURE = IOS / "Modules/Tests/SearchExperienceTests/Fixtures/jiten-anime.json.zip"
PINNED_PYTHON = (3, 14, 8)
PINNED_PYTHON_TEXT = ".".join(str(part) for part in PINNED_PYTHON)
FIRST_EVIDENCE_ROW = (
    "SELECT lower(hex(language_reference_id)), rank FROM frequency_evidence "
    "ORDER BY rank, language_reference_id LIMIT 1"
)
TUBELEX = "zenbu.tubelex.youtube.ja.unidic-3.1"
WIKIPEDIA = "zenbu.wikipedia.written.ja.unidic-3.1"
JLPT = "zenbu.jlpt.waller.levels"
CHECKED_ARTIFACT_FIELDS = {
    "packVersion": "pack_version",
    "coveredSourceRows": "covered_source_rows",
    "sourceTotalTokens": "source_total_tokens",
    "mappingPolicyVersion": "mapping_policy_version",
    "presentationPolicyVersion": "presentation_policy_version",
}


def only(pattern: str) -> Path:
    matches = sorted(SOURCES.glob(pattern))
    if len(matches) != 1:
        names = ", ".join(match.name for match in matches) or "none"
        raise SystemExit(f"expected exactly one {pattern} in {SOURCES}, found {names}")
    return matches[0]


def record(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def stem(record_path: Path) -> str:
    return record_path.name.removesuffix(".source.json")


def report(record_path: Path) -> Path:
    return GENERATED / f"{stem(record_path)}.import.json"


def snapshot(record_path: Path, name: str) -> Path:
    path = SOURCES / stem(record_path) / name
    if not path.exists():
        raise SystemExit(f"{path} is missing: snapshots live beside their record, in Git LFS")
    return path


def download_name(url: str) -> str:
    return url.rsplit("/", 1)[1]


def fixed_download(record_path: Path, download: bool) -> Path:
    pinned = record(record_path)
    path = SOURCES / download_name(pinned["download_url"])
    if not path.exists() and download:
        print(f"downloading {pinned['download_url']}", file=sys.stderr)
        partial = path.with_name(f"{path.name}.part")
        with urllib.request.urlopen(pinned["download_url"], timeout=600) as response, partial.open("wb") as output:
            shutil.copyfileobj(response, output)
        partial.replace(path)
    if not path.exists():
        raise SystemExit(f"{path.name} is missing: run again with --download, or fetch {pinned['download_url']}")
    if file_sha256(path) != pinned["sha256"]:
        raise SystemExit(f"{path.name} doesn't match {record_path.name}")
    return path


def run(tool: str, *arguments: object, stdout: Path | None = None) -> None:
    command = [sys.executable, str(TOOLS / tool), *(str(argument) for argument in arguments)]
    print("$", " ".join(command[1:]), file=sys.stderr)
    if stdout is None:
        subprocess.run(command, check=True, cwd=REPOSITORY, stdout=subprocess.DEVNULL)
        return
    with stdout.open("w", encoding="utf-8") as output:
        subprocess.run(command, check=True, cwd=REPOSITORY, stdout=output)


def replace_reports(prefix: str, current: Path) -> None:
    for stale in GENERATED.glob(f"{prefix}*.import.json"):
        if stale != current:
            stale.unlink()
            print(f"removed {stale.relative_to(REPOSITORY)}", file=sys.stderr)


def build_kanji(download: bool) -> None:
    radicals = only("EDRDG-radicals-*.source.json")
    kanjidic = only("KANJIDIC2-*.source.json")
    kanjium = only("Kanjium-*.source.json")
    kanjivg = only("KanjiVG-*.source.json")
    radical_sources = {source["identity"]: source for source in record(radicals)["sources"]}
    run(
        "import_radicals.py",
        "--krad", snapshot(radicals, download_name(radical_sources["EDRDG KRADFILE"]["download_url"])),
        "--radk", snapshot(radicals, download_name(radical_sources["EDRDG RADKFILE"]["download_url"])),
        "--source-manifest", radicals,
        "--output", RESOURCES / "RadicalReferenceData.json",
        "--import-manifest", report(radicals),
    )
    replace_reports("EDRDG-radicals-", report(radicals))
    run(
        "import_kanjidic.py",
        "--source", snapshot(kanjidic, download_name(record(kanjidic)["download_url"])),
        "--source-manifest", kanjidic,
        "--radical-artifact", RESOURCES / "RadicalReferenceData.json",
        "--radical-manifest", report(radicals),
        "--output", RESOURCES / "KanjiReferenceData.json",
        "--import-manifest", report(kanjidic),
    )
    replace_reports("KANJIDIC2-", report(kanjidic))
    run(
        "import_kanji_elements.py",
        "--kanjium", fixed_download(kanjium, download),
        "--kanjium-source", kanjium,
        "--kanji-reference", RESOURCES / "KanjiReferenceData.json",
        "--kanji-reference-manifest", report(kanjidic),
        "--output", RESOURCES / "KanjiElementReferenceData.json",
        "--manifest", report(kanjium),
    )
    run(
        "import_kanjivg.py",
        "--source", fixed_download(kanjivg, download),
        "--source-manifest", kanjivg,
        "--output", RESOURCES / "KanjiStrokeData.sqlite3",
        "--import-manifest", report(kanjivg),
    )


def build_language_reference(unidic: Path) -> None:
    jmdict = only("JMdict_e-*.source.json")
    tatoeba = only("Tatoeba-2*.source.json")
    files = {source["role"]: snapshot(tatoeba, download_name(source["download_url"])) for source in record(tatoeba)["sources"]}
    run(
        "import_jmdict.py",
        SOURCES / f"{stem(jmdict)}.gz",
        jmdict,
        RESOURCES / "LanguageReferenceData.sqlite3",
        report(jmdict),
        "--unidic-source", unidic,
        "--unidic-metadata", only("UniDic-*.source.json"),
        "--tatoeba-japanese-source", files["japanese_sentences"],
        "--tatoeba-english-source", files["english_sentences"],
        "--tatoeba-links-source", files["japanese_english_links"],
        "--tatoeba-japanese-detailed-source", files["japanese_detailed_sentences"],
        "--tatoeba-english-detailed-source", files["english_detailed_sentences"],
        "--tatoeba-japanese-cc0-source", files["japanese_cc0_sentences"],
        "--tatoeba-english-cc0-source", files["english_cc0_sentences"],
        "--tatoeba-metadata", tatoeba,
        "--relationship-source", only("Zenbu-Word-Relationships-*.json"),
        "--ranking-contract", RESOURCES / "DictionaryRankingArtifactContract.json",
    )
    replace_reports("JMdict_e-", report(jmdict))


def build_dependents(unidic: Path, scratch: Path) -> Path:
    language_data = RESOURCES / "LanguageReferenceData.sqlite3"
    indices = only("Tatoeba-jpn-indices-*.source.json")
    run(
        "import_example_word_index.py",
        "--source", snapshot(indices, download_name(record(indices)["download_url"])),
        "--source-manifest", indices,
        "--language-data", language_data,
        "--output", RESOURCES / "ExampleWordIndex.sqlite3",
        "--import-manifest", report(indices),
    )
    replace_reports("Tatoeba-jpn-indices-", report(indices))
    unidic_record = only("UniDic-*.source.json")
    run(
        "import_compound_pitch.py",
        "--source", unidic,
        "--source-manifest", unidic_record,
        "--language-data", language_data,
        "--output", RESOURCES / "CompoundPitch.sqlite3",
        "--import-manifest", GENERATED / f"{stem(unidic_record)}-compound-pitch.import.json",
    )
    tubelex = only("TUBELEX-*.source.json")
    run(
        "import_frequency_pack.py",
        "--source", SOURCES / f"{stem(tubelex)}.tsv.xz",
        "--source-manifest", tubelex,
        "--language-data", language_data,
        "--output", RESOURCES / "TUBELEXFrequencyPack.sqlite3",
        "--output-manifest", report(tubelex),
        "--unidic", unidic,
    )
    wikipedia = only("Wikipedia-*.source.json")
    wikipedia_artifact = scratch / "WikipediaFrequencyPack.sqlite3"
    run(
        "import_frequency_pack.py",
        "--source", SOURCES / f"{stem(wikipedia)}.tsv.xz",
        "--source-manifest", wikipedia,
        "--language-data", language_data,
        "--output", wikipedia_artifact,
        "--output-manifest", report(wikipedia),
    )
    jlpt = only("JLPT-*.source.json")
    run(
        "import_jlpt_level_pack.py",
        "--record", jlpt,
        "--language-data", language_data,
        "--output", RESOURCES / "JLPTLevelPack.sqlite3",
        stdout=report(jlpt),
    )
    return wikipedia_artifact


def artifact_facts(artifact: Path) -> tuple[dict, dict]:
    database = sqlite3.connect(f"file:{artifact}?mode=ro", uri=True)
    try:
        identifier, rank = database.execute(FIRST_EVIDENCE_ROW).fetchone()
        metadata = dict(database.execute("SELECT key, value FROM metadata"))
    finally:
        database.close()
    return {"languageReferenceID": identifier, "rank": rank}, metadata


def same_source(manifest: dict, pack_report: dict) -> None:
    if pack_report["sourceSHA256"] != manifest["sourceSHA256"]:
        raise SystemExit(
            f"{manifest['packID']} has a new source: update its manifest's source fields "
            "(apps/ios/Tools/README.md, Rebuild everything), publish a downloadable pack's source, then rebuild"
        )


def rank_pack_fields(manifest: dict, pack_report: dict, artifact: Path, bundled: bool) -> dict:
    same_source(manifest, pack_report)
    smoke_test, metadata = artifact_facts(artifact)
    updated = dict(manifest)
    for key, value in pack_report.items():
        if key in manifest:
            updated[key] = value
    updated["offlineImporterSHA256"] = pack_report["importerSHA256"]
    updated["bundledArtifactSHA256"] = pack_report["artifactSHA256"] if bundled else None
    updated["smokeTest"] = smoke_test
    for field, key in CHECKED_ARTIFACT_FIELDS.items():
        updated[field] = type(manifest[field])(metadata[key])
    return updated


def level_pack_fields(manifest: dict, pack_report: dict) -> dict:
    same_source(manifest, pack_report)
    updated = dict(manifest)
    for key, value in pack_report.items():
        if key in manifest:
            updated[key] = value
    updated["mappingPolicySHA256"] = pack_report["offlineImporterSHA256"]
    return updated


def update_catalog(wikipedia_artifact: Path) -> None:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    reports = {
        TUBELEX: json.loads(report(only("TUBELEX-*.source.json")).read_text(encoding="utf-8")),
        WIKIPEDIA: json.loads(report(only("Wikipedia-*.source.json")).read_text(encoding="utf-8")),
        JLPT: json.loads(report(only("JLPT-*.source.json")).read_text(encoding="utf-8")),
    }
    packs = []
    for manifest in catalog["packs"]:
        pack_id = manifest["packID"]
        if pack_id == TUBELEX:
            updated = rank_pack_fields(manifest, reports[TUBELEX], RESOURCES / "TUBELEXFrequencyPack.sqlite3", True)
        elif pack_id == WIKIPEDIA:
            updated = rank_pack_fields(manifest, reports[WIKIPEDIA], wikipedia_artifact, False)
            if updated != manifest and manifest not in catalog["trustedHistoricalManifests"]:
                catalog["trustedHistoricalManifests"].append(manifest)
        elif pack_id == JLPT:
            updated = level_pack_fields(manifest, reports[JLPT])
        else:
            updated = manifest
        packs.append(updated)
    catalog["packs"] = packs
    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def published_catalog() -> dict:
    path = CATALOG.relative_to(REPOSITORY).as_posix()
    base = subprocess.run(
        ["git", "merge-base", "HEAD", "origin/main"], cwd=REPOSITORY, capture_output=True, text=True, check=True
    ).stdout.strip()
    shown = subprocess.run(
        ["git", "show", f"{base}:{path}"], cwd=REPOSITORY, capture_output=True, text=True, check=True
    )
    return json.loads(shown.stdout)


def build_jiten(archives: Path) -> list[str]:
    before = {
        manifest["packID"]: manifest["sourceSHA256"]
        for manifest in published_catalog()["packs"]
        if manifest["packID"].startswith("zenbu.jiten.")
    }
    run("build_jiten_frequency_packs.py", "--out-dir", archives)
    changed = []
    for archive in sorted(archives.glob("zenbu.jiten.*.json.zip")):
        pack_id = archive.name.removesuffix(".json.zip")
        if file_sha256(archive) != before.get(pack_id):
            changed.append(str(archive))
    anime = archives / "zenbu.jiten.anime.ja.ordered-v2.json.zip"
    if file_sha256(anime) != file_sha256(ANIME_FIXTURE):
        shutil.copyfile(anime, ANIME_FIXTURE)
    return changed


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Rebuild every artifact the iOS data tools write, in dependency order, and update the catalog."
    )
    parser.add_argument("--download", action="store_true", help="fetch missing versioned upstream sources")
    parser.add_argument("--jiten-sources", type=Path, help="keep the Jiten source ZIPs here, for publishing")
    arguments = parser.parse_args()
    if sys.version_info[:3] != PINNED_PYTHON:
        raise SystemExit(
            f"the data tools are pinned to Python {PINNED_PYTHON_TEXT}: "
            f"uv run --no-project --python {PINNED_PYTHON_TEXT} python {Path(__file__).relative_to(REPOSITORY)}"
        )
    unidic = fixed_download(only("UniDic-*.source.json"), arguments.download)
    with tempfile.TemporaryDirectory() as directory:
        scratch = Path(directory)
        build_kanji(arguments.download)
        build_language_reference(unidic)
        wikipedia_artifact = build_dependents(unidic, scratch)
        update_catalog(wikipedia_artifact)
        changed = build_jiten(arguments.jiten_sources or scratch / "jiten")
    subprocess.run(
        [sys.executable, "-m", "unittest", "discover", "--start-directory", str(TOOLS / "tests"), "--pattern", "test_*.py"],
        check=True,
        cwd=REPOSITORY,
    )
    if changed and not arguments.jiten_sources:
        raise SystemExit("Jiten sources changed: run again with --jiten-sources DIR to keep them for publishing")
    if changed:
        raise SystemExit("publish the changed Jiten sources before merging: " + ", ".join(changed))


if __name__ == "__main__":
    main()
