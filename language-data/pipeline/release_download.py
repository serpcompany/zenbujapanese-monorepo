from __future__ import annotations

import hashlib
import zlib
from typing import Callable

from bucket_objects import file_key
from compressed_copies import compressed_key, read_compressed_copies
from public_address import DownloadError, PublicAddress
from refusal import Refusal
from releases_index import read_index, read_listed_manifest

KUROMOJI_FILES = (
    "base", "cc", "check", "tid", "tid_map", "tid_pos", "unk", "unk_char", "unk_invoke",
    "unk_map", "unk_pos",
)
FIRST_SET = (
    "LanguageReferenceData.sqlite3",
    "CompoundPitch.sqlite3",
    "JLPTLevelPack.sqlite3",
    "TUBELEXFrequencyPack.sqlite3",
    "ExampleWordIndex.sqlite3",
    "KanjiReferenceData.json",
    "KanjiElementReferenceData.json",
    "RetiredEntries.json",
    *(f"Kuromoji/{name}.dat.gz" for name in KUROMOJI_FILES),
)
GZIP_STREAM = 16 + zlib.MAX_WBITS
GZIPPED, PUBLISHED = "gzipped parts", "as published"


class Mismatch(Exception):
    pass


class Tally:
    def __init__(self):
        self.digest, self.bytes = hashlib.sha256(), 0

    def update(self, data: bytes) -> None:
        self.digest.update(data)
        self.bytes += len(data)

    def describe(self) -> str:
        return f"{self.bytes:,} bytes with sha256 {self.digest.hexdigest()}"

    def matches(self, listing: dict) -> bool:
        return (self.bytes, self.digest.hexdigest()) == (listing["bytes"], listing["sha256"])


def check_against_manifest(unpacked: Tally, record: dict) -> None:
    if not unpacked.matches(record):
        raise Mismatch(
            f"got {unpacked.describe()}, not the manifest's {record['bytes']:,} bytes and "
            f"sha256 {record['sha256']}"
        )


def unpack_part(address: PublicAddress, part: dict, unpacked: Tally) -> int:
    packed, inflater = Tally(), zlib.decompressobj(GZIP_STREAM)
    try:
        for chunk in address.chunks(part["key"]):
            packed.update(chunk)
            unpacked.update(inflater.decompress(chunk))
        unpacked.update(inflater.flush())
    except zlib.error as error:
        raise Mismatch(f"{part['key']} doesn't unpack as gzip: {error}") from None
    if not packed.matches(part):
        raise Mismatch(
            f"{part['key']} is {packed.describe()}, not the {part['bytes']:,} bytes and "
            f"sha256 {part['sha256']} compressed.json lists"
        )
    if not inflater.eof or inflater.unused_data:
        raise Mismatch(f"{part['key']} isn't one whole gzip stream")
    return packed.bytes


def download_published(address: PublicAddress, record: dict) -> tuple[int, str]:
    tally = Tally()
    for chunk in address.chunks(file_key(record)):
        tally.update(chunk)
    check_against_manifest(tally, record)
    return tally.bytes, f"{tally.describe()}, as the manifest lists"


def download_gzipped(address: PublicAddress, record: dict, listing: dict | None) -> tuple[int, str]:
    if listing is None:
        downloaded, matched = download_published(address, record)
        return downloaded, f"no gzipped copy, so as published: {matched}"
    unpacked = Tally()
    downloaded = sum(unpack_part(address, part, unpacked) for part in listing["parts"])
    check_against_manifest(unpacked, record)
    return downloaded, (
        f"{len(listing['parts'])} parts, {downloaded:,} bytes, unpacked to {unpacked.describe()}, "
        "as the manifest lists"
    )


def check_way(way: str, download: Callable, records: dict, log) -> tuple[int, list[str]]:
    downloaded, failures = 0, []
    for name in FIRST_SET:
        try:
            if name not in records:
                raise Mismatch("the manifest doesn't list it")
            got, matched = download(records[name])
        except (Mismatch, DownloadError, FileNotFoundError) as failure:
            failures.append(f"{way}: {name}: {failure}")
            log(f"{way}: {name}: FAILED: {failure}")
            continue
        downloaded += got
        log(f"{way}: {name}: {matched}")
    log(
        f"{way}: {len(FIRST_SET) - len(failures)} of {len(FIRST_SET)} files match the manifest, "
        f"{downloaded:,} bytes downloaded"
    )
    return downloaded, failures


def check_download(address: PublicAddress, release: str, *, log=print) -> dict:
    index, _ = read_index(address)
    entry = next((e for e in index["releases"] if e["release"] == release), None)
    if entry is None:
        raise Refusal(f"releases.json doesn't list {release}")
    _, manifest = read_listed_manifest(address, entry)
    compressed = read_compressed_copies(address, manifest, entry["manifest_sha256"])
    log(
        f"Release {release}: its manifest has the sha256 {entry['manifest_sha256']} releases.json "
        f"lists, and {compressed_key(release)} is that manifest's"
    )
    records = {r["name"]: r for r in manifest["files"]}
    listings = {f["name"]: f for f in compressed["files"]}
    ways = {
        GZIPPED: lambda r: download_gzipped(address, r, listings.get(r["name"])),
        PUBLISHED: lambda r: download_published(address, r),
    }
    downloaded, failures = {}, []
    for way, download in ways.items():
        downloaded[way], failed = check_way(way, download, records, log)
        failures += failed
    return {
        "release": release,
        "files": len(FIRST_SET),
        "downloaded": downloaded,
        "failures": failures,
    }
