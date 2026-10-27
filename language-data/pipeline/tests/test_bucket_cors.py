from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from locations import LANGUAGE_DATA

RULE_FILE = LANGUAGE_DATA / "bucket-cors.json"
WRANGLER_RULE_KEYS = {"id", "allowed", "exposeHeaders", "maxAgeSeconds"}
WRANGLER_ALLOWED_KEYS = {"origins", "methods", "headers"}


class BucketCorsTests(unittest.TestCase):
    def setUp(self):
        self.policy = json.loads(RULE_FILE.read_text())

    def test_any_origin_may_get_and_head_and_read_the_download_headers(self):
        [rule] = self.policy["rules"]
        self.assertEqual(rule["allowed"]["origins"], ["*"])
        self.assertEqual(sorted(rule["allowed"]["methods"]), ["GET", "HEAD"])
        self.assertLessEqual(
            {"Content-Length", "Content-Range", "ETag"}, set(rule["exposeHeaders"])
        )

    def test_the_rule_is_in_the_format_wrangler_sets(self):
        self.assertEqual(set(self.policy), {"rules"})
        for rule in self.policy["rules"]:
            self.assertLessEqual(set(rule), WRANGLER_RULE_KEYS)
            self.assertLessEqual(set(rule["allowed"]), WRANGLER_ALLOWED_KEYS)


if __name__ == "__main__":
    unittest.main()
