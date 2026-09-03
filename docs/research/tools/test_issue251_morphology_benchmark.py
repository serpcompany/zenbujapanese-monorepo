#!/usr/bin/env python3

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("issue251_morphology_benchmark.py")
SPEC = importlib.util.spec_from_file_location("issue251_benchmark", MODULE_PATH)
benchmark = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(benchmark)


class Issue251MorphologyBenchmarkTests(unittest.TestCase):
    def setUp(self):
        self.truth = {
            "id": "red-contract",
            "text": "学生がいる。",
            "tokens": [
                {
                    "surface": "学生",
                    "start": 0,
                    "end": 2,
                    "lemma": "学生",
                    "reading": "ガクセイ",
                    "pos": "NOUN",
                    "oov": False,
                },
                {
                    "surface": "が",
                    "start": 2,
                    "end": 3,
                    "lemma": "が",
                    "reading": "ガ",
                    "pos": "ADP",
                    "oov": False,
                },
                {
                    "surface": "いる",
                    "start": 3,
                    "end": 5,
                    "lemma": "居る",
                    "reading": "イル",
                    "pos": "VERB",
                    "oov": False,
                    "link": {"kind": "abstain", "forbiddenIds": ["wrong-id"]},
                },
                {
                    "surface": "。",
                    "start": 5,
                    "end": 6,
                    "lemma": "。",
                    "reading": "。",
                    "pos": "PUNCT",
                    "oov": False,
                },
            ],
        }
        self.metadata = {
            "schema": "zenbu.japanese-text-analysis-output.v1",
            "engine": "contract",
            "engineVersion": "1",
            "dictionary": "fixture",
            "dictionarySHA256": "a" * 64,
        }
        self.correct = {
            **self.metadata,
            "id": "red-contract",
            "text": "学生がいる。",
            "tokens": [dict(token) for token in self.truth["tokens"]],
        }

    def score_one(self, mutation):
        candidate = json.loads(json.dumps(self.correct, ensure_ascii=False))
        mutation(candidate)
        return benchmark.score_records([self.truth], [candidate])

    def test_wrong_boundary_fails_exact_sentence(self):
        result = self.score_one(
            lambda row: row["tokens"].__setitem__(
                0, {**row["tokens"][0], "end": 1, "surface": "学"}
            )
        )
        self.assertEqual(result["sentenceAllCorrect"], {"correct": 0, "total": 1})
        self.assertLess(result["boundary"]["f1"], 1)

    def test_wrong_lemma_reading_and_pos_fail_independent_metrics(self):
        for field, wrong, metric in [
            ("lemma", "生徒", "lemma"),
            ("reading", "ガクショウ", "reading"),
            ("pos", "VERB", "pos"),
        ]:
            with self.subTest(field=field):
                result = self.score_one(
                    lambda row, f=field, value=wrong: row["tokens"][0].__setitem__(
                        f, value
                    )
                )
                self.assertLess(result[metric]["accuracy"], 1)
                self.assertEqual(result["sentenceAllCorrect"]["correct"], 0)

    def test_guessed_homograph_is_a_severe_wrong_link(self):
        def guess(row):
            row["tokens"][2]["linkIds"] = ["wrong-id"]

        result = self.score_one(guess)
        self.assertEqual(result["links"]["severeWrong"], 1)
        self.assertEqual(result["links"]["exactLink"]["precision"], 0)
        self.assertFalse(result["hardGates"]["zeroSevereWrongLinks"])

    def test_ranges_must_round_trip_to_exact_text(self):
        candidate = json.loads(json.dumps(self.correct, ensure_ascii=False))
        candidate["tokens"][0]["surface"] = "生徒"
        with self.assertRaisesRegex(ValueError, "round-trip"):
            benchmark.validate_candidate(candidate)

    def test_version_and_checksum_drift_fail_closed(self):
        for field, value in [("engineVersion", "2"), ("dictionarySHA256", "b" * 64)]:
            with self.subTest(field=field):
                candidate = json.loads(json.dumps(self.correct, ensure_ascii=False))
                candidate[field] = value
                with self.assertRaisesRegex(ValueError, "metadata drift"):
                    benchmark.validate_candidate(
                        candidate, expected_metadata=self.metadata
                    )

    def test_public_result_loader_rejects_mixed_provider_metadata(self):
        second = json.loads(json.dumps(self.correct, ensure_ascii=False))
        second["id"] = "second"
        second["engineVersion"] = "2"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "results.jsonl"
            path.write_text(
                "\n".join(
                    json.dumps(row, ensure_ascii=False)
                    for row in (self.correct, second)
                )
                + "\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "metadata drift"):
                benchmark.load_jsonl(path, self.metadata)

    def test_oov_precision_recall_and_f1_are_independent_from_accuracy(self):
        truth = {
            "id": "oov",
            "text": "猫X",
            "tokens": [
                {"surface": "猫", "start": 0, "end": 1, "oov": False},
                {"surface": "X", "start": 1, "end": 2, "oov": True},
            ],
        }
        candidate = {
            **self.metadata,
            "id": "oov",
            "text": "猫X",
            "tokens": [
                {"surface": "猫", "start": 0, "end": 1, "oov": True},
                {"surface": "X", "start": 1, "end": 2, "oov": True},
            ],
        }
        result = benchmark.score_records([truth], [candidate])
        self.assertEqual(result["oovDetection"]["precision"], 0.5)
        self.assertEqual(result["oovDetection"]["recall"], 1)

    def test_explicit_alternate_boundaries_are_reported_separately(self):
        truth = {
            "id": "alternate",
            "text": "日本語",
            "tokens": [{"surface": "日本語", "start": 0, "end": 3}],
            "allowedBoundaryEdgeSets": [[], [2]],
        }
        candidate = {
            **self.metadata,
            "id": "alternate",
            "text": "日本語",
            "tokens": [
                {"surface": "日本", "start": 0, "end": 2},
                {"surface": "語", "start": 2, "end": 3},
            ],
        }
        result = benchmark.score_records([truth], [candidate])
        self.assertLess(result["boundary"]["f1"], 1)
        self.assertEqual(result["allowedBoundary"]["f1"], 1)

    def test_reordered_candidates_score_by_id_not_file_order(self):
        second_truth = {
            "id": "second",
            "text": "猫",
            "tokens": [
                {
                    "surface": "猫",
                    "start": 0,
                    "end": 1,
                    "lemma": "猫",
                    "reading": "ネコ",
                    "pos": "NOUN",
                    "oov": False,
                }
            ],
        }
        second = {**self.metadata, **second_truth}
        result = benchmark.score_records(
            [self.truth, second_truth], [second, self.correct]
        )
        self.assertEqual(result["sentenceAllCorrect"], {"correct": 2, "total": 2})

    def test_normalized_result_hash_is_order_independent_and_deterministic(self):
        second = {
            **self.metadata,
            "id": "second",
            "text": "猫",
            "tokens": [
                {
                    "surface": "猫",
                    "start": 0,
                    "end": 1,
                    "lemma": "猫",
                    "reading": "ネコ",
                    "pos": "NOUN",
                    "oov": False,
                }
            ],
        }
        self.assertEqual(
            benchmark.normalized_output_sha256([self.correct, second]),
            benchmark.normalized_output_sha256([second, self.correct]),
        )

    def test_conllu_truth_retains_lexeme_and_surface_pronunciation_readings(self):
        misc = "SpaceAfter=No|UnidicInfo=エラブ,選ぶ,選ん,選ぶ,エラン,,,エラブ,エラブ,選ぶ"
        self.assertEqual(benchmark._unidic_readings(misc), ["エラブ", "エラン"])

    def test_sentence_bootstrap_is_deterministic_and_exposes_direction(self):
        samples_a = [1.0, 1.0, 1.0, 0.9, 0.8]
        samples_b = [0.7, 0.6, 0.7, 0.5, 0.4]
        first = benchmark.bootstrap_paired_difference(
            samples_a, samples_b, seed=251, replicates=1000
        )
        second = benchmark.bootstrap_paired_difference(
            samples_a, samples_b, seed=251, replicates=1000
        )
        self.assertEqual(first, second)
        self.assertGreater(first["low95"], 0)


if __name__ == "__main__":
    unittest.main()
