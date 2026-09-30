from __future__ import annotations

import json

from refusal import Refusal
from release_inputs import check_name


def frequency_sources(repo, inputs, heads, records, by_sha, language_reference, depend):
    if not inputs.catalog:
        return []
    catalog_name = next((f["name"] for f in inputs.files if f["path"] == inputs.catalog), None)
    catalog = json.loads((repo / inputs.catalog).read_bytes())
    sources = []
    for pack in catalog["packs"]:
        pack_id = check_name(pack["packID"], "frequency pack")
        reference = language_reference(
            pack_id, pack.get("languageDataSHA256"), "languageDataSHA256"
        )
        policies = by_sha.get(pack.get("mappingPolicySHA256"), [])
        if pack.get("bundled"):
            resource = f"{pack['bundledResource']}.sqlite3"
            if resource not in records:
                raise Refusal(f"{pack_id} is bundled as {resource}, which isn't in the release")
            if records[resource]["sha256"] != pack["bundledArtifactSHA256"]:
                raise Refusal(
                    f"{inputs.catalog}: {pack_id} pins {resource} at "
                    f"{pack['bundledArtifactSHA256']}, not {records[resource]['sha256']}"
                )
            if catalog_name:
                for target in [reference, resource, *policies]:
                    depend(records[catalog_name], target)
            continue
        archive = inputs.source_archives.get(pack_id)
        if archive:
            head = heads[archive]
            if head.lfs_oid != pack["sourceSHA256"] or head.lfs_size != pack["sourceBytes"]:
                raise Refusal(
                    f"{pack_id}: the catalog names {pack['sourceSHA256']} "
                    f"({pack['sourceBytes']} bytes), but {archive} at HEAD is {head.lfs_oid} "
                    f"({head.lfs_size} bytes)"
                )
        source = {
            "name": pack_id,
            "version": pack["packVersion"],
            "url": pack["downloadURL"],
            "sha256": pack["sourceSHA256"],
            "bytes": pack["sourceBytes"],
            "depends_on": [],
        }
        for target in [reference, *policies]:
            depend(source, target)
        if catalog_name:
            for target in [reference, *policies]:
                depend(records[catalog_name], target)
        sources.append(source)
    unknown = sorted(set(inputs.source_archives) - {source["name"] for source in sources})
    if unknown:
        raise Refusal(f"source_archives names packs the catalog doesn't download: {unknown}")
    return sources
