#!/usr/bin/env python3
"""List queries that might be broad enough to precompute, for the search benchmark.

    python3 bench/search-d1/candidates.py <LanguageReferenceData.sqlite3> <out.json>

Every character in a written or reading form, every two-character reading prefix, every one- to
three-letter romaji prefix, and the 3,000 most common English gloss words. precompute.mjs keeps
only the ones that read many rows.
"""

import collections
import json
import re
import sqlite3
import sys


def main(source, destination):
    db = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
    candidates = set()
    for form, kind in db.execute("SELECT form, kind FROM forms"):
        if kind in (0, 1):
            candidates.update(form)
        if kind == 1 and len(form) >= 2:
            candidates.add(form[:2])
        if kind == 2:
            letters = form.lower()
            candidates.update(letters[:n] for n in (1, 2, 3) if len(letters) >= n)
    words = collections.Counter()
    for (text,) in db.execute("SELECT normalized_text FROM gloss_atoms"):
        words.update(re.findall(r"[a-z]+", text.lower()))
    candidates.update(word for word, _ in words.most_common(3000))
    candidates = sorted(c for c in candidates if c.strip())
    with open(destination, "w", encoding="utf-8") as out:
        json.dump(candidates, out, ensure_ascii=False)
    print(f"{len(candidates)} candidates")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
