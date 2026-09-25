from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


TOOLS = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).resolve().parent / "fixtures" / "jpdb"
sys.path.insert(0, str(TOOLS))

import jpdb_extract  # noqa: E402


def extract(name: str, url: str) -> dict[str, object]:
    return jpdb_extract.extract_page(url, (FIXTURES / name).read_bytes())


class JPDBExtractTests(unittest.TestCase):
    def test_difficulty_index_extracts_identity_metrics_and_range(self) -> None:
        result = extract(
            "difficulty.html", "https://jpdb.io/anime-difficulty-list?offset=50"
        )
        self.assertEqual("difficulty-index", result["routeType"])
        self.assertEqual({"start": 51, "end": 52, "total": 52}, result["range"])
        entry = result["entries"][0]
        self.assertEqual((758, "Example Anime"), (entry["id"], entry["title"]))
        self.assertEqual(
            [{"name": "Length (in words)", "value": "17830"}, {"name": "Unique words", "value": "2272"}],
            entry["metrics"],
        )
        self.assertEqual("https://myanimelist.net/anime/1", result["evidence"]["externalLinks"][0]["url"])

    def test_media_extracts_aggregate_and_subdeck_stats(self) -> None:
        result = extract("media.html", "https://jpdb.io/anime/758/example-anime")
        self.assertEqual("media-detail", result["routeType"])
        self.assertEqual(("anime", 758, "Example Anime"), (
            result["media"]["category"], result["media"]["id"], result["media"]["title"]
        ))
        self.assertEqual(["aggregate", "subdeck"], [deck["kind"] for deck in result["decks"]])
        self.assertEqual(10, result["decks"][1]["ordinal"])
        self.assertEqual("episode-1", result["decks"][1]["slug"])
        self.assertEqual("88.2", result["decks"][1]["metrics"][1]["value"])

    def test_slugless_web_novel_routes_are_typed(self) -> None:
        listing = jpdb_extract.extract_page(
            "https://jpdb.io/web-novel-difficulty-list?offset=1050",
            '<p>Showing 1051..1051 from 1051 entries</p><div class="result"><h5>Example Web Novel</h5><a href="/web-novel/1748/">Show details...</a></div>',
        )
        self.assertEqual(1748, listing["entries"][0]["id"])
        self.assertEqual("", listing["entries"][0]["slug"])
        media = jpdb_extract.extract_page(
            "https://jpdb.io/web-novel/1748/",
            '<h3>Example Web Novel</h3><a href="/web-novel/1748/vocabulary-list">Vocabulary list</a>',
        )
        self.assertEqual("media-detail", media["routeType"])
        self.assertEqual("", media["media"]["slug"])
        self.assertEqual("aggregate", media["decks"][0]["kind"])
        stats = jpdb_extract.extract_page(
            "https://jpdb.io/web-novel/1748/stats",
            '<h4>Statistics for Example Web Novel</h4><table><tr><td>70%</td><td>10</td></tr></table><script>var data={labels:[1,],datasets:[{data:[100,]}]};</script>',
        )
        self.assertEqual("media-stats", stats["routeType"])
        self.assertEqual("", stats["media"]["slug"])
        numeric_slug = jpdb_extract.extract_page(
            "https://jpdb.io/web-novel/3357/31",
            '<h3>31番目のお妃様</h3><a href="/web-novel/3357/31/vocabulary-list">Vocabulary list</a>',
        )
        self.assertEqual("31", numeric_slug["media"]["slug"])
        numeric_stats = jpdb_extract.extract_page(
            "https://jpdb.io/web-novel/3357/31/stats",
            '<h4>Statistics for 31番目のお妃様</h4><table><tr><td>70%</td><td>10</td></tr></table><script>var data={labels:[1,],datasets:[{data:[100,]}]};</script>',
        )
        self.assertEqual("media-stats", numeric_stats["routeType"])
        self.assertEqual("31", numeric_stats["media"]["slug"])

    def test_media_stats_extracts_coverage_and_difficulty_histogram(self) -> None:
        result = jpdb_extract.extract_page(
            "https://jpdb.io/anime/100/example/stats",
            """<h4>Statistics for Example</h4><table><tr><th>Coverage</th><th>Vocabulary required</th></tr><tr><td>70%</td><td>429</td></tr><tr><td>90%</td><td>1209</td></tr></table><h5>Difficulty histogram</h5><canvas id="chart-difficulty"></canvas><script>var data = { labels: [1,2,3,], datasets: [ { data: [10.5,20,69.5,] } ] };</script>""",
        )
        self.assertEqual("media-stats", result["routeType"])
        self.assertEqual("Example", result["media"]["title"])
        self.assertEqual(
            [
                {"percent": 70.0, "vocabularyRequired": 429},
                {"percent": 90.0, "vocabularyRequired": 1209},
            ],
            result["statistics"]["coverage"],
        )
        self.assertEqual(
            [
                {"level": 1, "percent": 10.5},
                {"level": 2, "percent": 20.0},
                {"level": 3, "percent": 69.5},
            ],
            result["statistics"]["difficultyHistogram"],
        )
        numeric_slug = jpdb_extract.extract_page(
            "https://jpdb.io/anime/5434/86/stats",
            '<h4>Statistics for 86</h4><table><tr><td>70%</td><td>100</td></tr></table><script>var data={labels:[1,],datasets:[{data:[100,]}]};</script>',
        )
        self.assertEqual("media-stats", numeric_slug["routeType"])
        self.assertEqual("86", numeric_slug["media"]["slug"])

    def test_vocabulary_list_extracts_order_occurrences_and_deck_identity(self) -> None:
        result = extract(
            "vocabulary_list.html",
            "https://jpdb.io/anime/758/example-anime/10/episode-1/vocabulary-list",
        )
        self.assertEqual("vocabulary-list", result["routeType"])
        self.assertEqual("subdeck", result["deck"]["kind"])
        self.assertEqual({"start": 1, "end": 3, "total": 3}, result["range"])
        self.assertEqual([1509430, 1509430, 1509480], [word["vid"] for word in result["vocabulary"]])
        self.assertEqual([1, 2, 3], [word["position"] for word in result["vocabulary"]])
        self.assertEqual([3, 2, 1], [word["occurrences"] for word in result["vocabulary"]])
        self.assertEqual(["difference"], result["vocabulary"][0]["meanings"])
        self.assertEqual(["Top 48600"], result["vocabulary"][0]["tags"])

    def test_vocabulary_detail_extracts_all_typed_sections_and_unparsed_evidence(self) -> None:
        result = extract(
            "vocabulary_detail.html",
            "https://jpdb.io/vocabulary/1509430/%E5%88%A5/%E3%81%B9%E3%81%A4",
        )
        vocabulary = result["vocabulary"]
        self.assertEqual(1509430, vocabulary["vid"])
        self.assertEqual({"spelling": "別", "reading": "べつ", "primary": True, "weight": None}, vocabulary["forms"][0])
        self.assertEqual(["Noun"], vocabulary["meanings"][0]["partsOfSpeech"])
        self.assertEqual([48600, 10400], [item["rank"] for item in vocabulary["frequencies"]])
        self.assertEqual([{"text": "べ", "level": "low"}, {"text": "つ", "level": "high"}], vocabulary["pitchAccent"])
        self.assertEqual("m1/example-audio", vocabulary["examples"][0]["audioPath"])
        self.assertEqual(["m1/word-audio"], vocabulary["pronunciationAudioPaths"])
        self.assertEqual(1509480, vocabulary["relations"][0]["targetVID"])
        self.assertEqual(105, vocabulary["usedInMediaCount"])
        self.assertIn(
            {"label": "Undocumented badge", "text": "Undocumented badgerare source marker"},
            result["unparsedEvidence"],
        )
        self.assertRegex(result["evidence"]["visibleTextSHA256"], r"^[0-9a-f]{64}$")

    def test_kanji_detail_extracts_readings_components_attributes_and_relations(self) -> None:
        result = extract("kanji_detail.html", "https://jpdb.io/kanji/%E4%BC%91")
        kanji = result["kanji"]
        self.assertEqual("休", kanji["character"])
        self.assertEqual(["rest"], kanji["meanings"])
        self.assertEqual("A person rests by a tree.", kanji["mnemonic"])
        self.assertEqual(["やす", "きゅう"], [item["value"] for item in kanji["readings"]])
        self.assertEqual(
            [{"character": "亻", "description": "thin person"}, {"character": "木", "description": "tree"}],
            kanji["components"],
        )
        self.assertEqual([{"name": "Frequency rank", "value": "642"}, {"name": "Stroke count", "value": "6"}], kanji["attributes"])
        self.assertEqual(["貅"], kanji["usedInKanji"])
        self.assertEqual(1227560, kanji["usedInVocabulary"][0]["vid"])
        self.assertEqual("m1/kanji-example", kanji["examples"][0]["audioPath"])
        self.assertEqual([], kanji["pronunciationAudioPaths"])

    def test_kanji_reading_extracts_frequency_and_ordered_vocabulary(self) -> None:
        result = jpdb_extract.extract_page(
            "https://jpdb.io/kanji-reading/%E4%BC%91/%E3%82%84%E3%81%99",
            """<table><tr><td>Kanji</td><td>休</td></tr><tr><td>Reading</td><td>やす</td></tr><tr><td>Frequency</td><td>68%</td></tr></table><div class="subsection-used-in"><h6 class="subsection-label">Used in (2 in total)</h6><div class="used-in"><div class="jp"><a href="/vocabulary/1227560/休む/やすむ"><ruby>休<rt>やす</rt></ruby><ruby>む</ruby></a></div><div class="en">to rest</div></div><div class="used-in"><div class="jp"><a href="/vocabulary/1227500/休み/やすみ"><ruby>休<rt>やす</rt></ruby><ruby>み</ruby></a></div><div class="en">rest</div></div></div>""",
        )
        self.assertEqual("kanji-reading", result["routeType"])
        reading = result["kanjiReading"]
        self.assertEqual(("休", "やす", 68.0, 2), (
            reading["character"], reading["reading"], reading["frequencyPercent"], reading["usedInTotal"]
        ))
        self.assertEqual([1227560, 1227500], [item["vid"] for item in reading["vocabulary"]])
        self.assertEqual(["やすむ", "やすみ"], [item["reading"] for item in reading["vocabulary"]])

    def test_vocabulary_used_in_is_a_typed_media_appearance_route(self) -> None:
        result = extract(
            "vocabulary_used_in.html",
            "https://jpdb.io/vocabulary/1509430/%E5%88%A5/used-in",
        )
        self.assertEqual("vocabulary-appearances", result["routeType"])
        self.assertEqual(1509430, result["vocabulary"]["vid"])
        self.assertEqual([322, 77], [item["usedTimes"] for item in result["vocabulary"]["appearances"]])
        self.assertEqual(["anime", "novel"], [item["category"] for item in result["vocabulary"]["appearances"]])

    def test_visible_fallbacks_and_failed_known_section_remain_explicit(self) -> None:
        result = extract(
            "vocabulary_fallback.html",
            "https://jpdb.io/vocabulary/1509430/%E3%81%B9%E3%81%A4/%E3%81%B9%E3%81%A4",
        )
        vocabulary = result["vocabulary"]
        self.assertEqual("べつ", vocabulary["forms"][0]["spelling"])
        self.assertEqual("Noun", vocabulary["meanings"][0]["partsOfSpeech"][0])
        self.assertEqual("別", vocabulary["forms"][1]["spelling"])
        self.assertEqual([], vocabulary["pitchAccent"])
        self.assertIn(
            {"label": "Pitch accent", "text": "Pitch accentべつ"},
            result["unparsedEvidence"],
        )

    def test_output_is_canonical_and_deterministic(self) -> None:
        first = extract("vocabulary_detail.html", "https://jpdb.io/vocabulary/1509430/%E5%88%A5/%E3%81%B9%E3%81%A4")
        second = extract("vocabulary_detail.html", "https://jpdb.io/vocabulary/1509430/%E5%88%A5/%E3%81%B9%E3%81%A4")
        self.assertEqual(jpdb_extract.canonical_json(first), jpdb_extract.canonical_json(second))
        self.assertEqual(first, json.loads(jpdb_extract.canonical_json(first)))
        content_hash = first.pop("contentSHA256")
        self.assertEqual(content_hash, jpdb_extract.sha256_text(jpdb_extract.canonical_json(first)))

    def test_equivalent_source_urls_produce_identical_canonical_identity(self) -> None:
        html = (FIXTURES / "vocabulary_detail.html").read_bytes()
        first = jpdb_extract.extract_page(
            "https://jpdb.io/vocabulary/1509430/別/べつ?b=2&a=1", html
        )
        second = jpdb_extract.extract_page(
            "https://jpdb.io/vocabulary/1509430/%E5%88%A5/%E3%81%B9%E3%81%A4?a=1&b=2", html
        )
        self.assertEqual(first["sourceURL"], second["sourceURL"])
        self.assertEqual(first["contentSHA256"], second["contentSHA256"])

    def test_direct_text_pitch_segment_is_not_dropped(self) -> None:
        result = jpdb_extract.extract_page(
            "https://jpdb.io/vocabulary/1/%E3%81%B9%E3%81%A4",
            """<div class="primary-spelling">べつ</div><div class="subsection-pitch-accent"><h6 class="subsection-label">Pitch accent</h6><div style="background-image:var(--pitch-low-s)">べ</div></div>""",
        )
        self.assertEqual([{"text": "べ", "level": "low"}], result["vocabulary"]["pitchAccent"])

    def test_ruby_reading_retains_okurigana(self) -> None:
        result = jpdb_extract.extract_page(
            "https://jpdb.io/vocabulary/1/%E6%82%AA%E3%81%84",
            '<div class="primary-spelling"><ruby>悪<rt>わる</rt>い</ruby></div>',
        )
        self.assertEqual(
            {"spelling": "悪い", "reading": "わるい", "primary": True, "weight": None},
            result["vocabulary"]["forms"][0],
        )

    def test_live_vocabulary_list_shape_extracts_complete_row(self) -> None:
        result = jpdb_extract.extract_page(
            "https://jpdb.io/anime/100/example/vocabulary-list",
            """<p>Showing 1..1 from 1 entries</p><div class="vocabulary-list"><div class="entry"><div><div class="vocabulary-spelling"><a href="/vocabulary/2831677/お前ら"><ruby>お</ruby><ruby>前<rt>まえ</rt></ruby><ruby>ら</ruby></a><div class="tags xbox"><div class="tag tooltip" data-tooltip="Anime:&nbsp;500">Top 3100</div></div></div><div>you (plural)</div></div><div><div></div><div style="opacity:.5">6</div></div></div></div>""",
        )
        row = result["vocabulary"][0]
        self.assertEqual((2831677, "お前ら", "おまえら"), (row["vid"], row["spelling"], row["reading"]))
        self.assertEqual(6, row["occurrences"])
        self.assertEqual(["you (plural)"], row["meanings"])
        self.assertEqual(["Top 3100"], row["tags"])
        self.assertEqual(
            [
                {
                    "corpus": "global",
                    "rank": 3100,
                    "rankSemantics": "top-band-upper-bound",
                    "display": "Top 3100",
                },
                {
                    "corpus": "Anime",
                    "rank": 500,
                    "rankSemantics": "top-band-upper-bound",
                    "display": "Top 500",
                },
            ],
            row["frequencies"],
        )


if __name__ == "__main__":
    unittest.main()
