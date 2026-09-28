# Context

Terms whose misreading has caused, or would cause, a product or architectural mistake.

## Language Reference ID

Zenbu's permanent 16-byte ID for a dictionary entry: the first 16 bytes of SHA-256 over the
source identity and its record number. Anything a learner saves or syncs refers to a word by it
(ADR 0006). It is not a JMdict `ent_seq`.

## JMdict entry number

JMdict's `ent_seq`, a 7-digit number EDRDG never reuses. Word page URLs end in it
(ADR 0007). It identifies a word publicly; it never keys learner data.
