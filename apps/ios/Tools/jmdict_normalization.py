from __future__ import annotations

import gzip
import hashlib
import json
import re
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

FORM_KIND_WRITTEN = 0
FORM_KIND_READING = 1
FORM_KIND_ROMAJI = 2
PRIORITY_PRIMARY_BITS = {"spec1": 1, "ichi1": 2, "news1": 4, "gai1": 8}
PRIORITY_SECONDARY_BITS = {"spec2": 1, "ichi2": 2, "news2": 4, "gai2": 8}

KANA_ROMAJI = {
    "あ": "a", "い": "i", "う": "u", "え": "e", "お": "o",
    "か": "ka", "き": "ki", "く": "ku", "け": "ke", "こ": "ko",
    "が": "ga", "ぎ": "gi", "ぐ": "gu", "げ": "ge", "ご": "go",
    "さ": "sa", "し": "shi", "す": "su", "せ": "se", "そ": "so",
    "ざ": "za", "じ": "ji", "ず": "zu", "ぜ": "ze", "ぞ": "zo",
    "た": "ta", "ち": "chi", "つ": "tsu", "て": "te", "と": "to",
    "だ": "da", "ぢ": "ji", "づ": "zu", "で": "de", "ど": "do",
    "な": "na", "に": "ni", "ぬ": "nu", "ね": "ne", "の": "no",
    "は": "ha", "ひ": "hi", "ふ": "fu", "へ": "he", "ほ": "ho",
    "ば": "ba", "び": "bi", "ぶ": "bu", "べ": "be", "ぼ": "bo",
    "ぱ": "pa", "ぴ": "pi", "ぷ": "pu", "ぺ": "pe", "ぽ": "po",
    "ま": "ma", "み": "mi", "む": "mu", "め": "me", "も": "mo",
    "や": "ya", "ゆ": "yu", "よ": "yo",
    "ら": "ra", "り": "ri", "る": "ru", "れ": "re", "ろ": "ro",
    "わ": "wa", "ゐ": "wi", "ゑ": "we", "を": "o", "ん": "n",
    "ゔ": "vu",
    "きゃ": "kya", "きゅ": "kyu", "きょ": "kyo",
    "ぎゃ": "gya", "ぎゅ": "gyu", "ぎょ": "gyo",
    "しゃ": "sha", "しゅ": "shu", "しょ": "sho",
    "じゃ": "ja", "じゅ": "ju", "じょ": "jo",
    "ちゃ": "cha", "ちゅ": "chu", "ちょ": "cho",
    "にゃ": "nya", "にゅ": "nyu", "にょ": "nyo",
    "ひゃ": "hya", "ひゅ": "hyu", "ひょ": "hyo",
    "びゃ": "bya", "びゅ": "byu", "びょ": "byo",
    "ぴゃ": "pya", "ぴゅ": "pyu", "ぴょ": "pyo",
    "みゃ": "mya", "みゅ": "myu", "みょ": "myo",
    "りゃ": "rya", "りゅ": "ryu", "りょ": "ryo",
}


def normalized_text(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


ARCHAIC_VERB_CODES = (
    "v2a-s", "v2b-k", "v2b-s", "v2d-k", "v2d-s", "v2g-k", "v2g-s", "v2h-k", "v2h-s",
    "v2k-k", "v2k-s", "v2m-k", "v2m-s", "v2n-s", "v2r-k", "v2r-s", "v2s-s", "v2t-k",
    "v2t-s", "v2w-s", "v2y-k", "v2y-s", "v2z-s", "v4b", "v4g", "v4h", "v4k", "v4m",
    "v4n", "v4r", "v4s", "v4t", "vn", "vr", "vs-c",
)
GODAN_VERB_CODES = (
    "v5aru", "v5b", "v5g", "v5k", "v5k-s", "v5m", "v5n", "v5r", "v5r-i", "v5s", "v5t",
    "v5u", "v5u-s", "v5uru",
)

PART_OF_SPEECH_CATEGORIES: dict[str, str] = {
    "n": "noun",
    "n-adv": "noun",
    "n-t": "noun",
    "pn": "pronoun",
    "n-pref": "nounPrefix",
    "n-suf": "nounSuffix",
    "adj-no": "noAdjective",
    "adj-f": "prenominal",
    "adj-pn": "preNounAdjective",
    "adj-i": "iAdjective",
    "adj-ix": "iAdjective",
    "adj-na": "naAdjective",
    "adj-t": "taruAdjective",
    "adj-nari": "archaicNaAdjective",
    "adj-ku": "archaicAdjective",
    "adj-shiku": "archaicAdjective",
    "adj-kari": "archaicAdjective",
    "adv": "adverb",
    "adv-to": "adverbTo",
    "aux": "auxiliary",
    "aux-adj": "auxiliaryAdjective",
    "aux-v": "auxiliaryVerb",
    "conj": "conjunction",
    "cop": "copula",
    "ctr": "counter",
    "exp": "expression",
    "int": "interjection",
    "num": "numeric",
    "pref": "prefix",
    "suf": "suffix",
    "prt": "particle",
    "unc": "unclassified",
    "v-unspec": "verb",
    "v1": "ichidanVerb",
    "v1-s": "ichidanVerb",
    "vz": "zuruVerb",
    **{code: "godanVerb" for code in GODAN_VERB_CODES},
    **{code: "archaicVerb" for code in ARCHAIC_VERB_CODES},
    "vk": "kuruVerb",
    "vs": "takesSuru",
    "vs-i": "suruVerb",
    "vs-s": "suruVerb",
    "vi": "intransitive",
    "vt": "transitive",
}


def jmdict_entity_codes(source: Path) -> dict[str, str]:
    with gzip.open(source, "rt", encoding="utf-8") as xml_source:
        declarations = []
        for line in xml_source:
            if line.startswith("]>"):
                break
            declarations.append(line)
    codes: dict[str, str] = {}
    for code, description in re.findall(r'<!ENTITY (\S+) "([^"]*)">', "".join(declarations)):
        if codes.setdefault(description, code) != code:
            raise ValueError(f"ambiguous JMdict entity description: {description}")
    return codes


def normalize_parts_of_speech(provider_labels: list[str], entity_codes: dict[str, str]) -> list[str]:
    categories: list[str] = []
    for provider_label in provider_labels:
        code = entity_codes.get(provider_label)
        category = PART_OF_SPEECH_CATEGORIES.get(code or "")
        if category is None:
            raise ValueError(f"unmapped JMdict part of speech: {code or provider_label}")
        if category not in categories:
            categories.append(category)
    return categories


def legacy_note_parts_of_speech(provider_labels: list[str]) -> list[str]:
    categories: list[str] = []
    rules = [
        ("ichidan verb", "Ichidan Verb"),
        ("godan verb", "Godan Verb"),
        ("kuru verb", "Irregular Verb"),
        ("suru verb", "Suru Verb"),
        ("intransitive verb", "Intransitive Verb"),
        ("transitive verb", "Transitive Verb"),
        ("auxiliary verb", "Auxiliary Verb"),
        ("adjectival nouns or quasi-adjectives", "Na-adjective"),
        ("adjective (keiyoushi)", "I-adjective"),
        ("noun", "Noun"), ("verb", "Verb"), ("adjective", "Adjective"),
        ("adverb", "Adverb"), ("particle", "Particle"), ("expression", "Expression"),
        ("conjunction", "Conjunction"), ("interjection", "Interjection"),
        ("pronoun", "Pronoun"), ("prefix", "Prefix"), ("suffix", "Suffix"),
        ("counter", "Counter"), ("auxiliary", "Auxiliary"), ("copula", "Copula"),
        ("numeric", "Numeric"),
    ]
    for provider_label in provider_labels:
        normalized = provider_label.casefold()
        category = next((name for token, name in rules if token in normalized), "Other")
        if category not in categories:
            categories.append(category)
    return categories


def normalize_form_labels(provider_labels: list[str]) -> list[str]:
    labels: list[str] = []
    rules = {
        "rarely used kanji form": "Rare",
        "search-only kanji form": "Search only",
        "search-only kana form": "Search only",
        "out-dated or obsolete kana usage": "Obsolete",
        "out-dated or obsolete kanji usage": "Obsolete",
        "irregular kana usage": "Irregular kana",
        "irregular kanji usage": "Irregular kanji",
        "irregular okurigana usage": "Irregular okurigana",
    }
    for provider_label in provider_labels:
        if normalized := rules.get(provider_label.casefold()):
            if normalized not in labels:
                labels.append(normalized)
    return labels


def normalize_usage_notes(provider_labels: list[str]) -> list[str]:
    notes: list[str] = []
    rules = {
        "word usually written using kana alone": "Usually written in kana",
        "archaic": "Archaic",
        "obsolete term": "Obsolete",
        "honorific or respectful (sonkeigo) language": "Honorific",
        "humble (kenjougo) language": "Humble",
        "colloquialism": "Colloquial",
    }
    for provider_label in provider_labels:
        if normalized := rules.get(provider_label.casefold()):
            if normalized not in notes:
                notes.append(normalized)
    return notes


def normalized_cross_reference(value: str) -> dict[str, object] | None:
    parts = [part.strip() for part in value.split("・") if part.strip()]
    if not parts:
        return None
    sense = int(parts.pop()) if parts[-1].isdigit() else None
    return {
        "form": parts[0],
        "reading": parts[1] if len(parts) > 1 else None,
        "sense": sense,
        "sourceValue": value,
    }


def language_reference_id(source_identity: str, source_record_id: str) -> bytes:
    return hashlib.sha256(f"{source_identity}\0{source_record_id}".encode()).digest()[:16]


def word_note_identity(record: dict[str, object]) -> str:
    signature = {
        "headword": normalized_text(str(record["headword"])),
        "reading": normalized_text(str(record["reading"])),
        "writtenForms": record["written_forms"],
        "readingForms": record["reading_forms"],
        "senses": record["note_senses"],
        "partsOfSpeech": record["note_parts_of_speech"],
    }
    payload = json.dumps(signature, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return f"wn1:{hashlib.sha256(payload.encode()).hexdigest()}"


def romanize_kana(value: str) -> str:
    hiragana = "".join(
        chr(ord(character) - 0x60) if "ァ" <= character <= "ヶ" else character
        for character in unicodedata.normalize("NFKC", value)
    )
    output: list[str] = []
    index = 0
    geminate = False
    while index < len(hiragana):
        character = hiragana[index]
        if character == "っ":
            geminate = True
            index += 1
            continue
        if character == "ー":
            if output:
                vowel = next((letter for letter in reversed(output[-1]) if letter in "aeiou"), "")
                output.append(vowel)
            index += 1
            continue
        pair = hiragana[index:index + 2]
        syllable = KANA_ROMAJI.get(pair)
        if syllable:
            index += 2
        else:
            syllable = KANA_ROMAJI.get(character)
            index += 1
        if not syllable:
            if character in "・ -'":
                output.append("-")
            continue
        if geminate and syllable[0] not in "aeioun":
            output.append(syllable[0])
        output.append(syllable)
        geminate = False
    return "".join(output).strip("-")


def text_values(parent: ET.Element, path: str) -> list[str]:
    return [text for node in parent.findall(path) if (text := (node.text or "").strip())]


def choose_primary(elements: list[ET.Element], form_tag: str) -> tuple[str, bool]:
    if not elements:
        return "", False
    prioritized = [element for element in elements if element.findall("ke_pri") or element.findall("re_pri")]
    selected = prioritized[0] if prioritized else elements[0]
    return (selected.findtext(form_tag) or "").strip(), bool(prioritized)


def priority_score(elements: list[ET.Element]) -> int:
    score = 0
    for element in elements:
        for priority in text_values(element, "ke_pri") + text_values(element, "re_pri"):
            if priority == "spec1":
                score = max(score, 100)
            elif priority == "ichi1":
                score = max(score, 95)
            elif priority == "news1":
                score = max(score, 90)
            elif priority in {"gai1", "spec2"}:
                score = max(score, 85)
            elif priority in {"ichi2", "news2"}:
                score = max(score, 75)
            elif priority.startswith("nf") and priority[2:].isdigit():
                score = max(score, 70 - int(priority[2:]))
    return score


def normalized_priority_profile(provider_tags: list[str]) -> tuple[int, int, int | None]:
    primary_mask = 0
    secondary_mask = 0
    news_frequency_band: int | None = None
    for tag in provider_tags:
        if tag in PRIORITY_PRIMARY_BITS:
            primary_mask |= PRIORITY_PRIMARY_BITS[tag]
        elif tag in PRIORITY_SECONDARY_BITS:
            secondary_mask |= PRIORITY_SECONDARY_BITS[tag]
        elif re.fullmatch(r"nf\d\d", tag):
            band = int(tag[2:])
            if not 1 <= band <= 48:
                raise ValueError(f"out-of-range JMdict news-frequency band: {tag}")
            news_frequency_band = min(news_frequency_band or band, band)
        else:
            raise ValueError(f"unknown JMdict priority marker: {tag}")
    return primary_mask, secondary_mask, news_frequency_band


def semantic_fingerprint(record: dict[str, object]) -> bytes:
    payload = json.dumps(
        {
            "headword": record["headword"],
            "reading": record["reading"],
            "meanings": record["meanings"],
            "partsOfSpeech": record["parts_of_speech"],
            "writtenForms": record["written_forms"],
            "readingForms": record["reading_forms"],
            "senses": record["canonical_senses"],
            "glossAtoms": record["gloss_atoms"],
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode()).digest()
