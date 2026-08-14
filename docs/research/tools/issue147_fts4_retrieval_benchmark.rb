#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"
require "sqlite3"

abort "usage: #{$PROGRAM_NAME} CONTEXTS_TSV ROWS_TSV CORPUS_DB OUTPUT_TSV" unless ARGV.length == 4

contexts_path, rows_path, corpus_path, output_path = ARGV

contexts = CSV.read(contexts_path, headers: true, col_sep: "\t").to_h do |row|
  [row.fetch("context_id"), row.to_h]
end
reference_rows = CSV.read(rows_path, headers: true, col_sep: "\t").group_by do |row|
  row.fetch("context_id")
end

db = SQLite3::Database.new(corpus_path)
db.results_as_hash = true
db.execute("CREATE VIRTUAL TABLE temp.issue147_english_fts USING fts4(id, english, tokenize=porter)")
db.execute("INSERT INTO temp.issue147_english_fts SELECT id, english FROM main.example_sentences")

def pair_id(row)
  "tatoeba:#{row.fetch('japanese_id')}:#{row.fetch('english_id')}"
end

def order_agreement(reference, candidate)
  reference_index = reference.each_with_index.to_h
  shared = candidate.select { |id| reference_index.key?(id) }.uniq
  pairs = shared.combination(2).to_a
  return "na" if pairs.empty?

  concordant = pairs.count { |left, right| reference_index.fetch(left) < reference_index.fetch(right) }
  format("%.3f", concordant.fdiv(pairs.length))
end

result_rows = []

contexts.sort.each do |context_id, context|
  next unless context.fetch("language") == "en"

  reference = Array(reference_rows[context_id]).sort_by { |row| row.fetch("rank").to_i }.map { |row| pair_id(row) }
  next if reference.empty? && context.fetch("captured_row_count").to_i.positive?

  query = context.fetch("query_or_entry")
  quoted_phrase = %Q{"#{query.gsub('"', '""')}"}
  fts = db.execute(<<~SQL, quoted_phrase).map { |row| row.fetch("id") }
    SELECT e.id
    FROM temp.issue147_english_fts f
    JOIN main.example_sentences e ON e.id = f.id
    WHERE issue147_english_fts MATCH ?
    ORDER BY f.rowid
  SQL
  substring = db.execute(<<~SQL, query).map { |row| row.fetch("id") }
    SELECT id
    FROM main.example_sentences
    WHERE instr(lower(english), lower(?)) > 0
    ORDER BY length(japanese), id
  SQL

  {
    "sqlite-fts4-porter-quoted-phrase-rowid-order-diagnostic" => fts,
    "zenbu-normalized-literal-substring-length-id-baseline" => substring
  }.each do |candidate_name, candidate|
    overlap = reference & candidate
    result_rows << [
      context_id,
      query,
      candidate_name,
      reference.length,
      candidate.length,
      overlap.length,
      reference.empty? ? "na" : format("%.3f", overlap.length.fdiv(reference.length)),
      order_agreement(reference, candidate),
      (reference - candidate).join(","),
      candidate.take(reference.length).join(",")
    ]
  end
end

CSV.open(output_path, "w", col_sep: "\t", row_sep: "\n", force_quotes: false) do |csv|
  csv << %w[context_id query candidate reference_row_count candidate_row_count reference_overlap reference_recall shared_pair_order_agreement missing_reference_pair_ids candidate_prefix_pair_ids]
  result_rows.each { |row| csv << row }
end

warn "wrote #{result_rows.length} discovery benchmark rows to #{output_path}"
