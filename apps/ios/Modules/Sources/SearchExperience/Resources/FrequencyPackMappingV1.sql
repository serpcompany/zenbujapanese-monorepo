ATTACH DATABASE '{{LANGUAGE_DATA_PATH}}' AS language;
CREATE TEMP TABLE candidates AS
WITH language_forms AS (
  SELECT headword AS form, id, 0 AS form_evidence_order, parts_of_speech_json FROM language.entries
  UNION ALL SELECT reading, id, 1, parts_of_speech_json FROM language.entries
  UNION ALL
    SELECT forms.form, forms.entry_id, 2 + forms.kind, entries.parts_of_speech_json
    FROM language.forms
    JOIN language.entries ON entries.id = forms.entry_id
), classified AS (
  SELECT
    s.*,
    CASE
      WHEN s.source_pos LIKE '動詞%' THEN 'verb'
      WHEN s.source_pos LIKE '名詞%' OR s.source_pos LIKE '代名詞%' THEN 'noun'
      WHEN s.source_pos LIKE '形容詞%' OR s.source_pos LIKE '形状詞%' THEN 'adjective'
      WHEN s.source_pos LIKE '副詞%' THEN 'adverb'
      WHEN s.source_pos LIKE '助詞%' THEN 'particle'
      WHEN s.source_pos LIKE '助動詞%' THEN 'auxiliary'
      WHEN s.source_pos LIKE '接続詞%' THEN 'conjunction'
      WHEN s.source_pos LIKE '感動詞%' THEN 'interjection'
      WHEN s.source_pos LIKE '接頭辞%' THEN 'prefix'
      WHEN s.source_pos LIKE '接尾辞%' THEN 'suffix'
      ELSE NULL
    END AS source_pos_class
  FROM source_rows s
)
SELECT
  s.rank,
  s.form,
  s.source_count,
  s.source_pos,
  s.source_record_digest,
  l.id,
  MIN(l.form_evidence_order) AS form_evidence_order,
  MAX(
    CASE s.source_pos_class
      WHEN 'verb' THEN l.parts_of_speech_json LIKE '%Verb%'
      WHEN 'noun' THEN l.parts_of_speech_json LIKE '%Noun%'
        OR l.parts_of_speech_json LIKE '%Pronoun%'
      WHEN 'adjective' THEN l.parts_of_speech_json LIKE '%adjective%'
      WHEN 'adverb' THEN l.parts_of_speech_json LIKE '%Adverb%'
      WHEN 'particle' THEN l.parts_of_speech_json LIKE '%Particle%'
      WHEN 'auxiliary' THEN l.parts_of_speech_json LIKE '%Auxiliary%'
      WHEN 'conjunction' THEN l.parts_of_speech_json LIKE '%Conjunction%'
      WHEN 'interjection' THEN l.parts_of_speech_json LIKE '%Interjection%'
      WHEN 'prefix' THEN l.parts_of_speech_json LIKE '%Prefix%'
      WHEN 'suffix' THEN l.parts_of_speech_json LIKE '%Suffix%'
      ELSE 0
    END
  ) AS pos_match
FROM classified s
JOIN language_forms l ON l.form = s.form
GROUP BY s.rank, l.id;
CREATE TEMP TABLE resolutions AS
SELECT rank, COUNT(*) AS candidate_count, SUM(pos_match) AS pos_candidate_count
FROM candidates
GROUP BY rank;
CREATE TEMP TABLE eligible AS
SELECT
  c.*,
  CASE
    WHEN r.candidate_count = 1 THEN 'uniqueFormFallback'
    WHEN r.pos_candidate_count = 1 AND c.pos_match = 1
      THEN CASE c.form_evidence_order % 2
        WHEN 1 THEN 'exactReadingPOS'
        ELSE 'exactWrittenPOS'
      END
  END AS mapping_relation
FROM candidates c
JOIN resolutions r USING(rank)
WHERE r.candidate_count = 1
   OR (r.pos_candidate_count = 1 AND c.pos_match = 1);
INSERT INTO frequency_evidence
SELECT
  id,
  rank,
  source_count,
  {{COVERED_SOURCE_ROWS}},
  mapping_relation,
  form,
  source_pos,
  source_record_digest
FROM (
  SELECT
    e.*,
    ROW_NUMBER() OVER(
      PARTITION BY id
      ORDER BY
        CASE mapping_relation WHEN 'exactWrittenPOS' THEN 0 ELSE 1 END,
        form_evidence_order,
        rank
    ) AS choice
  FROM eligible e
)
WHERE choice = 1;
