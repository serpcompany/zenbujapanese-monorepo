---
status: proposed
---

# Keep Dictionary Best Match evidence typed and app-owned

Zenbu will make Dictionary Matches, Dictionary Ranking, Dictionary Best Matches, and Primary Dictionary Entry selection app-owned contracts. Written-form, reading, romaji, and English-gloss evidence remain distinct and may corroborate one another; source order, provider identifiers, provider ranking, and query-specific exceptions are not Ranking inputs. This extends [ADR 0001](0001-language-capability-boundaries.md) without changing the separate Example Sentence Retrieval contract in [ADR 0002](0002-example-sentence-retrieval-contract.md).

The proposed v1 comparator is direction-specific. English input compares semantic-gloss evidence, corroborating romaji evidence, source sense position, normalized priority evidence, and a provenance-free semantic tie-break. Japanese input compares exact or partial written/reading evidence, the matched form's normalized priority profile, and a narrow lexical-breadth tie-break for otherwise indistinguishable reading homographs. A Primary Dictionary Entry is selected only after eligibility and total ordering; Dictionary Best Matches may still contain several entries.

The importer will preserve individual English gloss atoms and form-scoped app-owned priority profiles for the `spec`, `ichi`, `news`, `gai`, and `nf` source evidence already present in the pinned JMdict export. Raw marker strings and provider coordinates remain provenance-side adapter inputs, not capability vocabulary. The complete bundled artifact is deterministically rebuilt and policy-versioned; no on-device migration or private DictionaryFramework behavior is adopted. The evidence, candidate tuple, benchmark limits, migration, and licensing consequences are recorded in the [Dictionary Best Match research](../research/dictionary-best-match-evidence-contract-2026-08-15.md).
