#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"
require "digest"
require "sqlite3"

record = ARGV.delete("--record")
abort <<~USAGE unless ARGV.length == 4
  usage: #{$PROGRAM_NAME} [--record] DATABASE CONTEXTS_TSV SUMMARY_TSV ROWS_TSV
USAGE

database_path, contexts_path, summary_path, rows_path = ARGV
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

def english_results(db, query, porter_table, exact_table, map_table)
  expression = %Q{"#{query}"}
  exact = db.execute(<<~SQL, expression).to_h do |row|
    SELECT m.pair_id, e.english, offsets(#{exact_table}) AS matched_offsets
    FROM #{exact_table} x
    JOIN #{map_table} m ON m.fts_rowid = x.docid
    JOIN example_sentences e ON e.id = m.pair_id
    WHERE #{exact_table} MATCH ?
  SQL
    [row.fetch("pair_id"), phrase_range(row.fetch("english"), row.fetch("matched_offsets"))]
  end.compact

  candidates = db.execute(<<~SQL, expression).map do |row|
    SELECT e.id, e.japanese, e.english, offsets(#{porter_table}) AS matched_offsets,
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
    "SELECT id, japanese FROM example_sentences WHERE instr(japanese, ?) > 0",
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

summary_rows = []
result_rows = []
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

if record
  File.write(summary_path, summary)
  File.write(rows_path, rows)
  warn "recorded #{summary_rows.length} contexts and #{result_rows.length} visible ranked rows"
else
  expected_summary = File.read(summary_path)
  expected_rows = File.read(rows_path)
  abort "Example Sentence Retrieval summary fixture mismatch" unless summary == expected_summary
  abort "Example Sentence Retrieval row fixture mismatch" unless rows == expected_rows
  warn "validated #{summary_rows.length} contexts and #{result_rows.length} visible ranked rows"
end
