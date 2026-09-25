#!/usr/bin/env python3
"""Extract deterministic structured records from public JPDB HTML pages."""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
import urllib.parse
from html.parser import HTMLParser
from typing import Iterable


EXTRACT_SCHEMA = "zenbu.jpdb-frontend-extract.v1"
MEDIA_CATEGORIES = "anime|novel|visual-novel|web-novel|live-action|video-game"
DIFFICULTY_PATH = re.compile(
    rf"^/({MEDIA_CATEGORIES.replace('|video-game', '')})-difficulty-list$"
)
MEDIA_PATH = re.compile(rf"^/({MEDIA_CATEGORIES})/(\d+)(?:/(.*))?$")
VOCABULARY_PATH = re.compile(r"^/vocabulary/(\d+)(?:/([^/]+))?(?:/([^/]+))?$")
VOCABULARY_USED_IN_PATH = re.compile(r"^/vocabulary/(\d+)/([^/]+)/used-in$")
KANJI_PATH = re.compile(r"^/kanji/([^/]+)$")
KANJI_READING_PATH = re.compile(r"^/kanji-reading/([^/]+)/([^/]+)$")
VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
    "source", "track", "wbr",
}


def canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def normalized(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).split())


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def canonical_url(url: str, origin: str) -> str | None:
    absolute = urllib.parse.urljoin(origin, url)
    parsed = urllib.parse.urlsplit(absolute)
    base = urllib.parse.urlsplit(origin)
    if parsed.scheme != base.scheme or parsed.netloc != base.netloc:
        return None
    path = urllib.parse.quote(urllib.parse.unquote(parsed.path), safe="/:@-._~")
    query = urllib.parse.urlencode(sorted(urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)))
    return urllib.parse.urlunsplit((base.scheme, base.netloc, path or "/", query, ""))


def media_route(path: str) -> tuple[str, int, str, str] | None:
    match = MEDIA_PATH.match(path)
    if not match:
        return None
    category, media_id, tail = match.group(1), int(match.group(2)), match.group(3) or ""
    parts = [part for part in tail.split("/") if part]
    if (
        not parts
        or parts[0] in {"stats", "vocabulary-list"}
        or (
            category == "web-novel"
            and parts[0].isdigit()
            and len(parts) >= 2
            and parts[1] not in {"stats", "vocabulary-list"}
        )
    ):
        slug = ""
        remainder = "/".join(parts)
    else:
        slug = parts.pop(0)
        remainder = "/".join(parts)
    return category, media_id, slug, remainder


def media_base_path(category: str, media_id: int, slug: str) -> str:
    return f"/{category}/{media_id}" + (f"/{slug}" if slug else "")


class Node:
    def __init__(self, tag: str, attrs: dict[str, str], parent: "Node | None" = None) -> None:
        self.tag = tag
        self.attrs = attrs
        self.parent = parent
        self.children: list[Node | str] = []

    @property
    def classes(self) -> set[str]:
        return set(self.attrs.get("class", "").split())

    def text(self, excluded_tags: set[str] | None = None) -> str:
        excluded = excluded_tags or {"script", "style"}
        if self.tag in excluded:
            return ""
        return normalized(
            "".join(
                child if isinstance(child, str) else child.text(excluded)
                for child in self.children
            )
        )

    def descendants(self, include_self: bool = False) -> list["Node"]:
        result = [self] if include_self else []
        for child in self.children:
            if isinstance(child, Node):
                result.append(child)
                result.extend(child.descendants())
        return result

    def find_class(self, name: str) -> list["Node"]:
        return [node for node in self.descendants() if name in node.classes]

    def ancestors(self) -> Iterable["Node"]:
        current = self.parent
        while current is not None:
            yield current
            current = current.parent


class TreeParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node("document", {})
        self.stack = [self.root]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        node = Node(tag, {key: value or "" for key, value in attrs}, self.stack[-1])
        self.stack[-1].children.append(node)
        if tag not in VOID_TAGS:
            self.stack.append(node)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if tag not in VOID_TAGS:
            self.stack.pop()

    def handle_endtag(self, tag: str) -> None:
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data: str) -> None:
        self.stack[-1].children.append(data)


def links(node: Node) -> list[Node]:
    return [candidate for candidate in node.descendants() if candidate.tag == "a"]


def direct_text(node: Node) -> str:
    return normalized("".join(child for child in node.children if isinstance(child, str)))


def within_class(node: Node, class_name: str) -> bool:
    return class_name in node.classes or any(class_name in ancestor.classes for ancestor in node.ancestors())


def resolved_url(source_url: str, href: str) -> str:
    source = urllib.parse.urlsplit(source_url)
    origin = urllib.parse.urlunsplit((source.scheme, source.netloc, "/", "", ""))
    absolute = urllib.parse.urljoin(source_url, href)
    return canonical_url(absolute, origin) or urllib.parse.urldefrag(absolute)[0]


def images(node: Node, source_url: str) -> list[dict[str, str]]:
    return [
        {
            "url": urllib.parse.urljoin(source_url, candidate.attrs.get("src", "")),
            "alt": candidate.attrs.get("alt", ""),
            "title": candidate.attrs.get("title", ""),
        }
        for candidate in node.descendants()
        if candidate.tag == "img" and candidate.attrs.get("src")
    ]


def external_links(node: Node, source_url: str) -> list[dict[str, str]]:
    result = []
    source = urllib.parse.urlsplit(source_url)
    for link in links(node):
        absolute = urllib.parse.urljoin(source_url, link.attrs.get("href", ""))
        target = urllib.parse.urlsplit(absolute)
        if target.scheme in ("http", "https") and target.netloc != source.netloc:
            result.append({"text": link.text(), "url": absolute})
    return sorted(result, key=lambda item: (item["url"], item["text"]))


def headings(node: Node) -> list[dict[str, object]]:
    return [
        {"level": int(candidate.tag[1]), "text": candidate.text()}
        for candidate in node.descendants()
        if re.fullmatch(r"h[1-6]", candidate.tag) and candidate.text()
    ]


def table_rows(node: Node) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for row in (candidate for candidate in node.descendants() if candidate.tag == "tr"):
        cells = [
            candidate.text()
            for candidate in row.children
            if isinstance(candidate, Node) and candidate.tag in ("th", "td")
        ]
        if len(cells) >= 2:
            rows.append({"name": cells[0], "value": cells[1]})
    return rows


def ruby_value(node: Node) -> dict[str, str]:
    def reading_text(value: Node) -> str:
        parts: list[str] = []
        for child in value.children:
            if isinstance(child, str):
                parts.append(
                    "".join(
                        character
                        for character in child
                        if "HIRAGANA" in unicodedata.name(character, "")
                        or "KATAKANA" in unicodedata.name(character, "")
                        or character == "ー"
                    )
                )
            elif child.tag == "rt":
                parts.append(child.text())
            else:
                parts.append(reading_text(child))
        return normalized("".join(parts))

    reading = reading_text(node)
    return {"spelling": node.text({"rt", "script", "style"}), "reading": normalized(reading)}


def combined_ruby_value(nodes: list[Node]) -> dict[str, str]:
    values = [ruby_value(node) for node in nodes]
    return {
        "spelling": normalized("".join(value["spelling"] for value in values)),
        "reading": normalized("".join(value["reading"] for value in values)),
    }


def nearest_record_container(node: Node) -> Node:
    for ancestor in node.ancestors():
        if "result" in ancestor.classes or any(
            candidate.tag == "table" for candidate in ancestor.descendants()
        ):
            return ancestor
    return node.parent or node


def listing_range(text: str) -> dict[str, int] | None:
    match = re.search(r"Showing\s+(\d+)\.\.(\d+)\s+from\s+(\d+)\s+entries", text)
    if not match:
        return None
    start, end, total = map(int, match.groups())
    return {"start": start, "end": end, "total": total}


def frequency_values(node: Node) -> list[dict[str, object]]:
    values: list[dict[str, object]] = []
    for tag in node.find_class("tag"):
        global_rank = re.search(r"\bTop\s+(\d+)", tag.text(), re.IGNORECASE)
        if global_rank:
            values.append(
                {
                    "corpus": "global",
                    "rank": int(global_rank.group(1)),
                    "rankSemantics": "top-band-upper-bound",
                    "display": f"Top {global_rank.group(1)}",
                }
            )
        for corpus, rank in re.findall(
            r"([^:;]+):(?:&nbsp;|\s)*(\d+)", tag.attrs.get("data-tooltip", "")
        ):
            values.append(
                {
                    "corpus": normalized(corpus),
                    "rank": int(rank),
                    "rankSemantics": "top-band-upper-bound",
                    "display": f"Top {rank}",
                }
            )
    unique = {
        (str(item["corpus"]), int(item["rank"])): item
        for item in values
    }
    return [
        unique[key]
        for key in sorted(unique, key=lambda item: (0 if item[0] == "global" else 1, item))
    ]


def section_nodes(root: Node) -> dict[str, Node]:
    sections: dict[str, Node] = {}
    for label in root.find_class("subsection-label"):
        name = label.text()
        if name:
            sections.setdefault(name, label.parent or label)
    return sections


def base_evidence(root: Node, source_url: str, origin: str) -> dict[str, object]:
    visible = root.text()
    external = []
    discovered = []
    for link in links(root):
        href = link.attrs.get("href", "")
        absolute = urllib.parse.urljoin(source_url, href)
        internal = canonical_url(absolute, origin)
        item = {"text": link.text(), "url": internal or absolute}
        if internal:
            discovered.append(internal)
        elif urllib.parse.urlsplit(absolute).scheme in ("http", "https"):
            external.append(item)
    canonical = next(
        (
            canonical_url(node.attrs.get("href", ""), origin)
            for node in root.descendants()
            if node.tag == "link" and "canonical" in node.attrs.get("rel", "").split()
        ),
        None,
    )
    return {
        "canonicalURL": canonical,
        "discoveredURLs": sorted(set(discovered)),
        "evidence": {
            "externalLinks": sorted(external, key=lambda item: (str(item["url"]), str(item["text"]))),
            "images": images(root, source_url),
            "metadata": [
                {
                    "key": node.attrs.get("name") or node.attrs.get("property") or node.attrs.get("http-equiv", ""),
                    "content": node.attrs.get("content", ""),
                }
                for node in root.descendants()
                if node.tag == "meta" and node.attrs.get("content")
            ],
            "genericTables": table_rows(root),
            "headings": headings(root),
            "visibleTextSHA256": sha256_text(visible),
        },
    }


def extract_difficulty(root: Node, url: str, family: str) -> dict[str, object]:
    entries = []
    seen: set[int] = set()
    for link in links(root):
        absolute = urllib.parse.urlsplit(urllib.parse.urljoin(url, link.attrs.get("href", "")))
        if absolute.netloc != urllib.parse.urlsplit(url).netloc:
            continue
        target = absolute.path
        route = media_route(target)
        if not route or route[0] != family or route[3] or route[1] in seen:
            continue
        _, media_id, slug, _ = route
        seen.add(media_id)
        container = nearest_record_container(link)
        title = next(
            (candidate.text() for candidate in container.descendants() if candidate.tag in ("h4", "h5", "h6") and candidate.text()),
            link.text(),
        )
        entries.append(
            {
                "category": family,
                "id": media_id,
                "slug": slug,
                "title": title,
                "metrics": table_rows(container),
                "externalLinks": external_links(container, url),
                "images": images(container, url),
                "detailURL": resolved_url(url, link.attrs.get("href", "")),
            }
        )
    return {
        "routeType": "difficulty-index",
        "category": family,
        "range": listing_range(root.text()),
        "entries": entries,
    }


def deck_identity(path: str, category: str, media_id: int, media_slug: str) -> dict[str, object]:
    base = media_base_path(category, media_id, media_slug)
    remainder = path[len(base):].strip("/")
    parts = remainder.split("/") if remainder else []
    if parts and parts[-1] == "vocabulary-list":
        parts.pop()
    return {
        "key": path.removesuffix("/vocabulary-list") or base,
        "kind": "aggregate" if not parts else "subdeck",
        "ordinal": int(parts[0]) if parts and parts[0].isdigit() else None,
        "slug": parts[1] if len(parts) > 1 else None,
    }


def extract_media(root: Node, url: str, route: tuple[str, int, str, str]) -> dict[str, object]:
    category, media_id, slug, _ = route
    page_title = next(
        (node.text() for node in root.descendants() if node.tag == "h3" and node.text()), slug
    )
    decks = []
    seen: set[str] = set()
    for link in links(root):
        target = urllib.parse.urlsplit(urllib.parse.urljoin(url, link.attrs.get("href", ""))).path
        base_path = media_base_path(category, media_id, slug)
        if not target.endswith("/vocabulary-list") or not (
            target == base_path + "/vocabulary-list" or target.startswith(base_path + "/")
        ):
            continue
        identity = deck_identity(target, category, media_id, slug)
        if str(identity["key"]) in seen:
            continue
        seen.add(str(identity["key"]))
        container = nearest_record_container(link)
        title = next(
            (node.text() for node in container.descendants() if node.tag in ("h5", "h6") and node.text()),
            page_title if identity["kind"] == "aggregate" else link.text(),
        )
        decks.append(
            {
                **identity,
                "title": title,
                "vocabularyListURL": resolved_url(url, link.attrs.get("href", "")),
                "metrics": table_rows(container),
                "images": images(container, url),
            }
        )
    return {
        "routeType": "media-detail",
        "media": {
            "category": category,
            "id": media_id,
            "slug": slug,
            "title": page_title,
            "metrics": next((deck["metrics"] for deck in decks if deck["kind"] == "aggregate"), []),
            "externalLinks": external_links(root, url),
            "images": images(root, url),
        },
        "decks": decks,
    }


def extract_media_stats(root: Node, route: tuple[str, int, str, str]) -> dict[str, object]:
    category, media_id, slug, _ = route
    heading = next(
        (node.text() for node in root.descendants() if node.tag in ("h3", "h4") and node.text()),
        slug,
    )
    title = re.sub(r"^Statistics for\s+", "", heading)
    coverage = []
    for row in table_rows(root):
        percent = re.fullmatch(r"(\d+(?:\.\d+)?)%", row["name"])
        required = re.fullmatch(r"\d+", row["value"])
        if percent and required:
            coverage.append(
                {
                    "percent": float(percent.group(1)),
                    "vocabularyRequired": int(required.group(0)),
                }
            )
    histogram = []
    for script in (node for node in root.descendants() if node.tag == "script"):
        source = "".join(child for child in script.children if isinstance(child, str))
        labels = re.search(r"labels:\s*\[([^]]+)\]", source)
        values = re.search(r"datasets:\s*\[.*?data:\s*\[([^]]+)\]", source, re.DOTALL)
        if not labels or not values:
            continue
        try:
            levels = [int(value.strip()) for value in labels.group(1).split(",") if value.strip()]
            percentages = [
                float(value.strip()) for value in values.group(1).split(",") if value.strip()
            ]
        except ValueError:
            continue
        if len(levels) == len(percentages):
            histogram = [
                {"level": level, "percent": percentage}
                for level, percentage in zip(levels, percentages)
            ]
            break
    return {
        "routeType": "media-stats",
        "media": {
            "category": category,
            "id": media_id,
            "slug": slug,
            "title": title,
        },
        "statistics": {
            "coverage": coverage,
            "difficultyHistogram": histogram,
        },
    }


def extract_vocabulary_list(root: Node, url: str, route: tuple[str, int, str, str]) -> dict[str, object]:
    path = urllib.parse.urlsplit(url).path
    category, media_id, slug, _ = route
    listing = listing_range(root.text())
    start = listing["start"] if listing else 1
    vocabulary = []
    list_containers = root.find_class("vocabulary-list")
    rows = (
        [node for node in list_containers[0].descendants() if "entry" in node.classes]
        if list_containers
        else [node for node in root.descendants() if {"result", "vocabulary"} <= node.classes]
    )
    for row_index, container in enumerate(rows):
        match_pair = next(
            (
                (link, VOCABULARY_PATH.match(urllib.parse.urlsplit(urllib.parse.urljoin(url, link.attrs.get("href", ""))).path))
                for link in links(container)
                if VOCABULARY_PATH.match(urllib.parse.urlsplit(urllib.parse.urljoin(url, link.attrs.get("href", ""))).path)
            ),
            None,
        )
        if not match_pair:
            continue
        link, word = match_pair
        assert word is not None
        rubies = [node for node in link.descendants() if node.tag == "ruby"]
        displayed = combined_ruby_value(rubies) if rubies else {"spelling": link.text(), "reading": ""}
        occurrence_nodes = [
            node for node in container.descendants()
            if node.classes.intersection({"occurrences", "occurrence-count", "count"})
            and re.fullmatch(r"\d+", node.text())
        ]
        metric_occurrence = next(
            (row["value"] for row in table_rows(container) if row["name"] in ("Used times", "Occurrences")),
            None,
        )
        direct_columns = [child for child in container.children if isinstance(child, Node)]
        structural_occurrence = None
        if len(direct_columns) >= 2:
            right_column = direct_columns[-1]
            leaf_numbers = [
                node.text()
                for node in right_column.descendants(include_self=True)
                if re.fullmatch(r"\d+", node.text())
                and not any(isinstance(child, Node) for child in node.children)
            ]
            structural_occurrence = leaf_numbers[-1] if leaf_numbers else None
        occurrence = (
            int(occurrence_nodes[-1].text())
            if occurrence_nodes
            else int(metric_occurrence)
            if metric_occurrence and metric_occurrence.isdigit()
            else int(structural_occurrence)
            if structural_occurrence and structural_occurrence.isdigit()
            else None
        )
        numeric_evidence = [
            node.text() for node in container.descendants()
            if not node.children or all(isinstance(child, str) for child in node.children)
            if re.fullmatch(r"\d+(?:\.\d+)?%?", node.text())
        ]
        meaning_nodes = container.find_class("en") + container.find_class("description")
        if not meaning_nodes and direct_columns:
            left_children = [child for child in direct_columns[0].children if isinstance(child, Node)]
            meaning_nodes = [child for child in left_children if "vocabulary-spelling" not in child.classes]
        vocabulary.append(
            {
                "vid": int(word.group(1)),
                "spelling": displayed["spelling"],
                "reading": displayed["reading"],
                "position": start + row_index,
                "occurrences": occurrence,
                "numericEvidence": numeric_evidence,
                "meanings": [node.text() for node in meaning_nodes if node.text()],
                "tags": [node.text() for node in container.find_class("tag") if node.text()],
                "frequencies": frequency_values(container),
                "detailURL": resolved_url(url, link.attrs.get("href", "")),
            }
        )
    return {
        "routeType": "vocabulary-list",
        "media": {"category": category, "id": media_id, "slug": slug},
        "deck": deck_identity(path, category, media_id, slug),
        "range": listing,
        "vocabulary": vocabulary,
    }


def extract_examples(section: Node) -> list[dict[str, object]]:
    examples = []
    for item in section.find_class("used-in"):
        japanese = item.find_class("jp")
        english = item.find_class("en")
        if not japanese:
            continue
        wrapper = item.parent or item
        audio = next(
            (node.attrs["data-audio"] for node in wrapper.descendants(include_self=True) if node.attrs.get("data-audio")),
            None,
        )
        examples.append(
            {
                "japanese": japanese[0].text(),
                "english": english[0].text() if english else "",
                "audioPath": audio,
            }
        )
    return examples


def extract_vocabulary(root: Node, url: str, match: re.Match[str]) -> dict[str, object]:
    vid = int(match.group(1))
    primary = root.find_class("primary-spelling")
    rubies = [node for node in (primary[0].descendants() if primary else []) if node.tag == "ruby"]
    primary_form = combined_ruby_value(rubies) if rubies else {
        "spelling": primary[0].text() if primary else urllib.parse.unquote(match.group(2) or ""),
        "reading": urllib.parse.unquote(match.group(3) or ""),
    }
    meanings = []
    meaning_sections = root.find_class("subsection-meanings")
    if meaning_sections:
        pending_pos: list[str] = []
        for node in meaning_sections[0].descendants():
            if "part-of-speech" in node.classes:
                pending_pos = [child.text() for child in node.children if isinstance(child, Node) and child.text()]
                if not pending_pos and node.text():
                    pending_pos = [node.text()]
            elif "description" in node.classes and node.text():
                meanings.append(
                    {
                        "ordinal": len(meanings),
                        "text": re.sub(r"^\d+\.\s*", "", node.text()),
                        "partsOfSpeech": pending_pos,
                    }
                )
    forms = [{**primary_form, "primary": True, "weight": None}]
    for alternate in root.find_class("alt-spelling"):
        ruby = next((node for node in alternate.descendants() if node.tag == "ruby"), None)
        weight = re.search(r"(\d+(?:\.\d+)?)%", alternate.text())
        alternate_rubies = [node for node in alternate.descendants() if node.tag == "ruby"]
        alternate_value = combined_ruby_value(alternate_rubies) if alternate_rubies else {
            "spelling": normalized(re.sub(r"\d+(?:\.\d+)?%", "", alternate.text())),
            "reading": "",
        }
        if not alternate_value["spelling"]:
            continue
        forms.append(
            {
                **alternate_value,
                "primary": False,
                "weight": float(weight.group(1)) / 100 if weight else None,
            }
        )
    frequencies = frequency_values(root)
    pitch = []
    pitch_sections = root.find_class("subsection-pitch-accent")
    if pitch_sections:
        for node in pitch_sections[0].descendants():
            style = node.attrs.get("style", "")
            level = "low" if "pitch-low" in style else "high" if "pitch-high" in style else None
            direct = [child.text() for child in node.children if isinstance(child, Node) and child.text()]
            segment = direct[0] if direct else direct_text(node)
            if level and segment:
                pitch.append({"text": segment, "level": level})
    pronunciation_audios = sorted(
        {
            node.attrs["data-audio"]
            for node in root.descendants()
            if node.attrs.get("data-audio") and not within_class(node, "subsection-examples")
        }
    )
    relation_sections = root.find_class("subsection-used-in")
    relations = []
    if relation_sections:
        for link in links(relation_sections[0]):
            related = VOCABULARY_PATH.match(urllib.parse.urlsplit(link.attrs.get("href", "")).path)
            if related:
                relations.append({"relation": "used-in-vocabulary", "targetVID": int(related.group(1)), "text": link.text()})
    examples = []
    example_sections = root.find_class("subsection-examples")
    if example_sections:
        examples = extract_examples(example_sections[0])
    used_in = next(
        (
            int(count.group(1))
            for link in links(root)
            if (count := re.search(r"Used in:\s*(\d+)", link.text()))
        ),
        None,
    )
    parsed_labels = set()
    if meanings:
        parsed_labels.add("Meanings")
    if len(forms) > 1:
        parsed_labels.add("Alt. forms")
    if pitch:
        parsed_labels.add("Pitch accent")
    parsed_labels.update(
        label for label in section_nodes(root)
        if (label.startswith("Used in vocabulary") and relations)
        or (label.startswith("Examples") and examples)
    )
    return {
        "routeType": "vocabulary-detail",
        "vocabulary": {
            "vid": vid,
            "routeSpelling": urllib.parse.unquote(match.group(2) or ""),
            "routeReading": urllib.parse.unquote(match.group(3) or ""),
            "forms": forms,
            "meanings": meanings,
            "frequencies": frequencies,
            "pitchAccent": pitch,
            "pronunciationAudioPaths": pronunciation_audios,
            "examples": examples,
            "relations": relations,
            "usedInMediaCount": used_in,
        },
        "_parsedLabels": sorted(parsed_labels),
    }


def extract_vocabulary_appearances(
    root: Node, url: str, match: re.Match[str]
) -> dict[str, object]:
    appearances = []
    seen: set[tuple[str, int]] = set()
    for link in links(root):
        target = urllib.parse.urlsplit(urllib.parse.urljoin(url, link.attrs.get("href", ""))).path
        media = media_route(target)
        if not media:
            continue
        category, media_id, slug, _ = media
        key = (category, media_id)
        if key in seen:
            continue
        seen.add(key)
        container = nearest_record_container(link)
        used_times = next(
            (row["value"] for row in table_rows(container) if row["name"] == "Used times"),
            None,
        )
        if used_times is None:
            count = re.search(r"Used times\s*(\d+)", container.text())
            used_times = count.group(1) if count else None
        title = next(
            (node.text() for node in container.descendants() if node.tag in ("h4", "h5", "h6") and node.text()),
            link.text(),
        )
        appearances.append(
            {
                "category": category,
                "mediaID": media_id,
                "slug": slug,
                "title": title,
                "usedTimes": int(used_times) if used_times and used_times.isdigit() else None,
                "mediaURL": resolved_url(url, link.attrs.get("href", "")),
            }
        )
    return {
        "routeType": "vocabulary-appearances",
        "vocabulary": {
            "vid": int(match.group(1)),
            "routeSpelling": urllib.parse.unquote(match.group(2)),
            "appearances": appearances,
        },
        "_parsedLabels": [],
    }


def extract_kanji(root: Node, url: str, character: str) -> dict[str, object]:
    sections = section_nodes(root)
    keyword_section = sections.get("Keyword")
    keyword = ""
    if keyword_section:
        keyword = normalized(keyword_section.text().removeprefix("Keyword"))
    mnemonic_section = sections.get("Mnemonic")
    mnemonic = normalized(mnemonic_section.text().removeprefix("Mnemonic")) if mnemonic_section else ""
    info = table_rows(sections.get("Info", root))
    readings = []
    for link in links(sections.get("Info", root)):
        target = urllib.parse.urlsplit(urllib.parse.urljoin(url, link.attrs.get("href", ""))).path
        match = re.match(r"^/kanji-reading/[^/]+/([^/]+)$", target)
        if match:
            readings.append({"value": urllib.parse.unquote(match.group(1)), "url": resolved_url(url, link.attrs.get("href", ""))})
    components = []
    composed = sections.get("Composed of")
    if composed:
        for link in links(composed):
            target = KANJI_PATH.match(urllib.parse.urlsplit(link.attrs.get("href", "")).path)
            if target:
                item_text = (link.parent or link).text()
                description = normalized(item_text.removeprefix(link.text()))
                components.append({"character": urllib.parse.unquote(target.group(1)), "description": description})
    used_in_kanji = []
    used_in_vocabulary = []
    for label, section in sections.items():
        if label.startswith("Used in kanji"):
            for link in links(section):
                target = KANJI_PATH.match(urllib.parse.urlsplit(link.attrs.get("href", "")).path)
                if target:
                    used_in_kanji.append(urllib.parse.unquote(target.group(1)))
        if label.startswith("Used in vocabulary"):
            for link in links(section):
                target = VOCABULARY_PATH.match(urllib.parse.urlsplit(link.attrs.get("href", "")).path)
                if target:
                    used_in_vocabulary.append({"vid": int(target.group(1)), "text": link.text()})
    examples = []
    example_section = next((section for label, section in sections.items() if label.startswith("Examples")), None)
    if example_section:
        examples = extract_examples(example_section)
    parsed_labels = set()
    if keyword:
        parsed_labels.add("Keyword")
    if info or readings:
        parsed_labels.add("Info")
    if components:
        parsed_labels.add("Composed of")
    if mnemonic:
        parsed_labels.add("Mnemonic")
    parsed_labels.update(
        label for label in sections
        if (label.startswith("Used in kanji") and used_in_kanji)
        or (label.startswith("Used in vocabulary") and used_in_vocabulary)
        or (label.startswith("Examples") and examples)
    )
    return {
        "routeType": "kanji-detail",
        "kanji": {
            "character": urllib.parse.unquote(character),
            "meanings": [keyword] if keyword else [],
            "keyword": keyword,
            "mnemonic": mnemonic,
            "attributes": info,
            "readings": readings,
            "components": components,
            "usedInKanji": sorted(set(used_in_kanji)),
            "usedInVocabulary": used_in_vocabulary,
            "examples": examples,
            "pronunciationAudioPaths": sorted(
                {
                    node.attrs["data-audio"]
                    for node in root.descendants()
                    if node.attrs.get("data-audio") and not within_class(node, "subsection-examples")
                }
            ),
        },
        "_parsedLabels": sorted(parsed_labels),
    }


def extract_kanji_reading(root: Node, url: str, match: re.Match[str]) -> dict[str, object]:
    character = urllib.parse.unquote(match.group(1))
    reading = urllib.parse.unquote(match.group(2))
    info = {row["name"]: row["value"] for row in table_rows(root)}
    percent_match = re.search(r"(\d+(?:\.\d+)?)%", info.get("Frequency", ""))
    section = next(
        (value for label, value in section_nodes(root).items() if label.startswith("Used in")),
        None,
    )
    total_match = re.search(r"Used in\s*\((\d+)\s+in total\)", section.text() if section else "")
    vocabulary = []
    if section:
        for position, item in enumerate(section.find_class("used-in"), 1):
            link = next(
                (
                    link
                    for link in links(item)
                    if VOCABULARY_PATH.match(
                        urllib.parse.urlsplit(
                            urllib.parse.urljoin(url, link.attrs.get("href", ""))
                        ).path
                    )
                ),
                None,
            )
            if not link:
                continue
            target = VOCABULARY_PATH.match(
                urllib.parse.urlsplit(urllib.parse.urljoin(url, link.attrs.get("href", ""))).path
            )
            assert target is not None
            rubies = [node for node in link.descendants() if node.tag == "ruby"]
            form = combined_ruby_value(rubies) if rubies else {"spelling": link.text(), "reading": ""}
            english = item.find_class("en")
            vocabulary.append(
                {
                    "position": position,
                    "vid": int(target.group(1)),
                    "spelling": form["spelling"],
                    "reading": form["reading"],
                    "meaning": english[0].text() if english else "",
                    "detailURL": resolved_url(url, link.attrs.get("href", "")),
                }
            )
    return {
        "routeType": "kanji-reading",
        "kanjiReading": {
            "character": character,
            "reading": reading,
            "frequencyPercent": float(percent_match.group(1)) if percent_match else None,
            "usedInTotal": int(total_match.group(1)) if total_match else None,
            "vocabulary": vocabulary,
        },
        "_parsedLabels": [label for label in section_nodes(root) if label.startswith("Used in") and vocabulary],
    }


def unparsed_sections(root: Node, parsed_labels: set[str]) -> list[dict[str, str]]:
    result = []
    for label, section in section_nodes(root).items():
        if label not in parsed_labels:
            result.append({"label": label, "text": section.text()})
    return sorted(result, key=lambda item: item["label"])


def extract_page(source_url: str, html: bytes | str) -> dict[str, object]:
    text = html.decode("utf-8", errors="replace") if isinstance(html, bytes) else html
    parser = TreeParser()
    parser.feed(text)
    root = parser.root
    parsed = urllib.parse.urlsplit(source_url)
    origin = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, "/", "", ""))
    path = parsed.path
    difficulty = DIFFICULTY_PATH.match(path)
    media = media_route(path)
    vocabulary_appearances = VOCABULARY_USED_IN_PATH.match(path)
    vocabulary = VOCABULARY_PATH.match(path)
    kanji = KANJI_PATH.match(path)
    kanji_reading = KANJI_READING_PATH.match(path)
    if difficulty:
        route = extract_difficulty(root, source_url, difficulty.group(1))
        parsed_labels: set[str] = set()
    elif media and media[3].endswith("vocabulary-list"):
        route = extract_vocabulary_list(root, source_url, media)
        parsed_labels = set()
    elif media and media[3] == "stats":
        route = extract_media_stats(root, media)
        parsed_labels = set()
    elif media:
        route = extract_media(root, source_url, media)
        parsed_labels = set()
    elif vocabulary_appearances:
        route = extract_vocabulary_appearances(root, source_url, vocabulary_appearances)
        parsed_labels = set(route.pop("_parsedLabels", []))
    elif vocabulary:
        route = extract_vocabulary(root, source_url, vocabulary)
        parsed_labels = set(route.pop("_parsedLabels", []))
    elif kanji_reading:
        route = extract_kanji_reading(root, source_url, kanji_reading)
        parsed_labels = set(route.pop("_parsedLabels", []))
    elif kanji:
        route = extract_kanji(root, source_url, kanji.group(1))
        parsed_labels = set(route.pop("_parsedLabels", []))
    else:
        route = {"routeType": "generic-public-page"}
        parsed_labels = set()
    evidence = base_evidence(root, source_url, origin)
    result = {
        "schema": EXTRACT_SCHEMA,
        "schemaVersion": 1,
        "sourceURL": resolved_url(source_url, source_url),
        **evidence,
        **route,
        "unparsedEvidence": unparsed_sections(root, parsed_labels),
    }
    result["contentSHA256"] = sha256_text(canonical_json(result))
    return result
