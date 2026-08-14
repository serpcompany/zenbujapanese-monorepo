#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"
require "digest"
require "sqlite3"

record = ARGV.delete("--record")
abort <<~USAGE unless ARGV.length == 7
  usage: #{$PROGRAM_NAME} [--record] DATABASE CONTEXTS_TSV SUMMARY_TSV ROWS_TSV BASELINE_CANDIDATES_TSV COMPARISON_SUMMARY_TSV COMPARISON_ROWS_TSV
USAGE

database_path, contexts_path, summary_path, rows_path, baseline_candidates_path,
  comparison_summary_path, comparison_rows_path = ARGV
porter_table = "example_sentence_english_porter_fts"
exact_table = "example_sentence_english_exact_fts"
map_table = "example_sentence_fts_map"
db = SQLite3::Database.new(database_path)
db.results_as_hash = true

def grapheme_count(text)
  text.scan(/\X/).length
end

def range_from_bytes(text, start_byte, end_byte)
  prefix = text.byteslice(0, start_byte).force_encoding(Encoding::UTF_8)
  match = text.byteslice(start_byte, end_byte - start_byte).force_encoding(Encoding::UTF_8)
  [grapheme_count(prefix), grapheme_count(match)]
end

def phrase_range(text, raw_offsets)
  values = raw_offsets.to_s.split.map!(&:to_i)
  raise "invalid FTS offsets" unless (values.length % 4).zero?

  offsets = values.each_slice(4).map do |_column, term, byte_offset, byte_length|
    { term: term, byte_offset: byte_offset, byte_length: byte_length }
  end
  maximum_term = offsets.map { |offset| offset.fetch(:term) }.max
  return nil unless maximum_term

  term_count = maximum_term + 1
  ordered = offsets.sort_by { |offset| [offset.fetch(:byte_offset), offset.fetch(:term)] }
  ordered.each_index do |index|
    next unless ordered[index].fetch(:term).zero?

    phrase = ordered[index, term_count]
    next unless phrase&.map { |offset| offset.fetch(:term) } == (0...term_count).to_a

    crosses_terminal = phrase.each_cons(2).any? do |left, right|
      gap_start = left.fetch(:byte_offset) + left.fetch(:byte_length)
      gap_length = right.fetch(:byte_offset) - gap_start
      gap_length.negative? || text.byteslice(gap_start, gap_length).to_s.match?(/[.?!]\s/)
    end
    next if crosses_terminal

    start_byte = phrase.first.fetch(:byte_offset)
    last = phrase.last
    end_byte = last.fetch(:byte_offset) + last.fetch(:byte_length)
    return range_from_bytes(text, start_byte, end_byte)
  end
  nil
end

def ranked_hash(ids)
  Digest::SHA256.hexdigest(ids.join("\n") + "\n")
end

def rank_map(ids)
  ids.each_with_index.to_h { |id, index| [id, index + 1] }
end

def order_agreement(left, right)
  right_ranks = rank_map(right)
  shared = left.select { |id| right_ranks.key?(id) }
  total = 0
  concordant = 0
  shared.combination(2) do |first, second|
    total += 1
    concordant += 1 if right_ranks.fetch(first) < right_ranks.fetch(second)
  end
  total.zero? ? "na" : format("%.6f", concordant.fdiv(total))
end

def english_results(db, query, porter_table, exact_table, map_table)
  expression = %Q{"#{query}"}
  exact = db.execute(<<~SQL, expression).to_h do |row|
    SELECT 'esp1_' || lower(hex(m.pair_id)) AS pair_id,
           e.english, offsets(#{exact_table}) AS matched_offsets
    FROM #{exact_table} x
    JOIN #{map_table} m ON m.fts_rowid = x.docid
    JOIN example_sentences e ON e.id = m.pair_id
    WHERE #{exact_table} MATCH ?
  SQL
    [row.fetch("pair_id"), phrase_range(row.fetch("english"), row.fetch("matched_offsets"))]
  end.compact

  candidates = db.execute(<<~SQL, expression).map do |row|
    SELECT 'esp1_' || lower(hex(e.id)) AS id,
           e.japanese, e.english, offsets(#{porter_table}) AS matched_offsets,
           matchinfo(#{porter_table}, 'l') AS document_length
    FROM #{porter_table} p
    JOIN #{map_table} m ON m.fts_rowid = p.docid
    JOIN example_sentences e ON e.id = m.pair_id
    WHERE #{porter_table} MATCH ?
  SQL
    porter_range = phrase_range(row.fetch("english"), row.fetch("matched_offsets"))
    next unless porter_range

    exact_range = exact[row.fetch("id")]
    relation = exact_range ? "exact-surface-phrase" : "porter-equivalent-phrase"
    relation_rank = exact_range ? 0 : 1
    range = exact_range || porter_range
    english_terms = row.fetch("document_length").unpack1("L<")
    japanese_length = grapheme_count(row.fetch("japanese"))
    {
      id: row.fetch("id"), relation: relation, relation_rank: relation_rank,
      location: range[0], length: range[1], english_terms: english_terms,
      japanese_length: japanese_length,
      rank: [relation_rank, range[0], english_terms, japanese_length, row.fetch("id")]
    }
  end.compact
  return [] unless candidates.any? { |candidate| candidate.fetch(:relation_rank).zero? }

  candidates.sort_by { |candidate| candidate.fetch(:rank) }
end

def japanese_results(db, query)
  db.execute(
    "SELECT 'esp1_' || lower(hex(id)) AS id, japanese " \
      "FROM example_sentences WHERE instr(japanese, ?) > 0",
    query
  ).map do |row|
    byte_offset = row.fetch("japanese").b.index(query.b)
    raise "SQLite containment did not yield a range" unless byte_offset

    location, length = range_from_bytes(
      row.fetch("japanese"), byte_offset, byte_offset + query.bytesize
    )
    entire = row.fetch("japanese") == query
    relation = entire ? "entire-japanese-sentence" : "contained-japanese-surface"
    relation_rank = entire ? 2 : 3
    japanese_length = grapheme_count(row.fetch("japanese"))
    {
      id: row.fetch("id"), relation: relation, relation_rank: relation_rank,
      location: location, length: length, english_terms: 0,
      japanese_length: japanese_length,
      rank: [relation_rank, location, 0, japanese_length, row.fetch("id")]
    }
  end.sort_by { |candidate| candidate.fetch(:rank) }
end

def replay_baseline_provider_ids(db, query, language)
  predicate = language == "en" ? "instr(lower(e.english), lower(?)) > 0" : "instr(e.japanese, ?) > 0"
  db.execute(<<~SQL, query).map { |row| row.fetch("provider_pair_id") }
    SELECT 'tatoeba:' || p.source_japanese_record_id || ':' ||
             p.source_english_record_id AS provider_pair_id
    FROM example_sentences e
    JOIN example_sentence_provenance p ON p.pair_id = e.id
    WHERE p.source_identity = 'tatoeba.weekly-export' AND #{predicate}
    ORDER BY length(e.japanese), provider_pair_id
  SQL
end

provider_to_pair_id = db.execute(<<~SQL).to_h do |row|
  SELECT 'tatoeba:' || source_japanese_record_id || ':' || source_english_record_id AS provider_pair_id,
         'esp1_' || lower(hex(pair_id)) AS pair_id
  FROM example_sentence_provenance
  WHERE source_identity = 'tatoeba.weekly-export'
SQL
  [row.fetch("provider_pair_id"), row.fetch("pair_id")]
end
committed_baseline_by_context = CSV.read(
  baseline_candidates_path, headers: true, col_sep: "\t"
).select do |row|
  row.fetch("engine") == "zenbu-normalized-literal-substring-length-id-baseline"
end.group_by { |row| row.fetch("context_id") }.transform_values do |rows|
  rows.sort_by { |row| Integer(row.fetch("rank"), 10) }.map { |row| row.fetch("pair_id") }
end

summary_rows = []
result_rows = []
comparison_summary_rows = []
comparison_rows = []
contexts = CSV.read(contexts_path, headers: true, col_sep: "\t")
  .select { |row| row.fetch("context_type") == "direct-search" }
  .sort_by { |row| row.fetch("context_id") }

contexts.each do |context|
  context_id = context.fetch("context_id")
  query = context.fetch("query_or_entry")
  language = context.fetch("language")
  route = language == "en" ? "direct-english" : "direct-japanese"
  candidates = if language == "en"
                 english_results(db, query, porter_table, exact_table, map_table)
               else
                 japanese_results(db, query)
               end
  committed_baseline_provider_ids = committed_baseline_by_context.fetch(context_id, [])
  replayed_baseline_provider_ids = replay_baseline_provider_ids(db, query, language)
  unless replayed_baseline_provider_ids == committed_baseline_provider_ids
    abort "committed #147 baseline replay mismatch for #{context_id}"
  end
  baseline_ids = committed_baseline_provider_ids.map do |provider_id|
    provider_to_pair_id.fetch(provider_id) do
      abort "committed #147 provider pair lacks app-owned identity: #{provider_id}"
    end
  end
  v1_ids = candidates.map { |candidate| candidate.fetch(:id) }
  baseline_ranks = rank_map(baseline_ids)
  v1_ranks = rank_map(v1_ids)
  mutual_ids = baseline_ids.select { |id| v1_ranks.key?(id) }
  rank_deltas = mutual_ids.map { |id| v1_ranks.fetch(id) - baseline_ranks.fetch(id) }
  comparison_summary_rows << [
    context_id, query, route, baseline_ids.length, ranked_hash(baseline_ids),
    v1_ids.length, ranked_hash(v1_ids), mutual_ids.length,
    baseline_ids.length - mutual_ids.length, v1_ids.length - mutual_ids.length,
    order_agreement(baseline_ids, v1_ids),
    rank_deltas.empty? ? "na" : format("%.6f", rank_deltas.sum { |delta| delta.abs }.fdiv(rank_deltas.length)),
    rank_deltas.empty? ? "na" : rank_deltas.map(&:abs).max
  ]
  (baseline_ids | v1_ids).sort.each do |pair_id|
    baseline_rank = baseline_ranks[pair_id]
    v1_rank = v1_ranks[pair_id]
    comparison_rows << [
      context_id, query, route, pair_id, (!baseline_rank.nil?).to_s, baseline_rank || "",
      (!v1_rank.nil?).to_s, v1_rank || "",
      baseline_rank && v1_rank ? v1_rank - baseline_rank : ""
    ]
  end
  visible = candidates.first(100)
  count_kind = candidates.length > 50 ? "more-than-50" : "exact"
  count_value = candidates.length > 50 ? 50 : candidates.length
  summary_rows << [
    context_id, query, route, candidates.length, count_kind, count_value,
    (candidates.length > 100).to_s, visible.length,
    ranked_hash(candidates.map { |candidate| candidate.fetch(:id) }),
    ranked_hash(visible.map { |candidate| candidate.fetch(:id) })
  ]
  visible.each_with_index do |candidate, index|
    result_rows << [
      context_id, query, route, index + 1, candidate.fetch(:id),
      candidate.fetch(:relation), candidate.fetch(:location), candidate.fetch(:length),
      candidate.fetch(:english_terms), candidate.fetch(:japanese_length),
      candidate.fetch(:rank).join("|")
    ]
  end
end

summary = CSV.generate(col_sep: "\t", row_sep: "\n") do |csv|
  csv << %w[context_id query route complete_match_count count_kind count_value truncated visible_count complete_ranked_sha256 visible_ranked_sha256]
  summary_rows.each { |row| csv << row }
end
rows = CSV.generate(col_sep: "\t", row_sep: "\n") do |csv|
  csv << %w[context_id query route result_rank pair_id lexical_relation match_location match_length english_term_count japanese_grapheme_count rank_tuple]
  result_rows.each { |row| csv << row }
end
comparison_summary = CSV.generate(col_sep: "\t", row_sep: "\n") do |csv|
  csv << %w[context_id query route baseline_complete_count baseline_ranked_sha256 v1_complete_count v1_ranked_sha256 mutual_count baseline_only_count v1_only_count mutual_order_agreement mean_absolute_rank_delta max_absolute_rank_delta]
  comparison_summary_rows.each { |row| csv << row }
end
comparison = CSV.generate(col_sep: "\t", row_sep: "\n") do |csv|
  csv << %w[context_id query route pair_id in_baseline baseline_rank in_v1 v1_rank rank_delta]
  comparison_rows.each { |row| csv << row }
end

if record
  File.write(summary_path, summary)
  File.write(rows_path, rows)
  File.write(comparison_summary_path, comparison_summary)
  File.write(comparison_rows_path, comparison)
  warn "recorded #{summary_rows.length} contexts, #{result_rows.length} visible rows, and #{comparison_rows.length} complete comparison rows"
else
  expected_summary = File.read(summary_path)
  expected_rows = File.read(rows_path)
  abort "Example Sentence Retrieval summary fixture mismatch" unless summary == expected_summary
  abort "Example Sentence Retrieval row fixture mismatch" unless rows == expected_rows
  abort "Example Sentence Retrieval comparison summary mismatch" unless comparison_summary == File.read(comparison_summary_path)
  abort "Example Sentence Retrieval complete comparison mismatch" unless comparison == File.read(comparison_rows_path)
  warn "validated #{summary_rows.length} contexts, #{result_rows.length} visible rows, and #{comparison_rows.length} complete comparison rows"
end
