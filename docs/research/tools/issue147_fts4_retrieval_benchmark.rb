#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"
require "digest"
require "sqlite3"

abort <<~USAGE unless ARGV.length == 5
  usage: #{$PROGRAM_NAME} CONTEXTS_TSV ROWS_TSV CORPUS_DB AGGREGATE_TSV CANDIDATE_ROWS_TSV
USAGE

contexts_path, rows_path, corpus_path, aggregate_path, candidate_rows_path = ARGV

contexts = CSV.read(contexts_path, headers: true, col_sep: "\t").to_h do |row|
  [row.fetch("context_id"), row.to_h]
end
reference_rows = CSV.read(rows_path, headers: true, col_sep: "\t").group_by { |row| row.fetch("context_id") }

db = SQLite3::Database.new(corpus_path)
db.results_as_hash = true
db.execute("CREATE VIRTUAL TABLE temp.issue147_english_fts USING fts4(id, english, tokenize=porter)")
db.execute("INSERT INTO temp.issue147_english_fts SELECT id, english FROM main.example_sentences")

def pair_id(row)
  "tatoeba:#{row.fetch('japanese_id')}:#{row.fetch('english_id')}"
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
  pairs = shared.combination(2)
  total = 0
  concordant = 0
  pairs.each do |first, second|
    total += 1
    concordant += 1 if right_ranks.fetch(first) < right_ranks.fetch(second)
  end
  total.zero? ? "na" : format("%.6f", concordant.fdiv(total))
end

def fts_candidates(db, query)
  quoted_phrase = %Q{"#{query.gsub('"', '""')}"}
  db.execute(<<~SQL, quoted_phrase).map { |row| row.fetch("id") }
    SELECT e.id
    FROM temp.issue147_english_fts f
    JOIN main.example_sentences e ON e.id = f.id
    WHERE issue147_english_fts MATCH ?
    ORDER BY f.rowid
  SQL
end

def zenbu_candidates(db, query, language)
  if language == "en"
    db.execute(<<~SQL, query).map { |row| row.fetch("id") }
      SELECT id FROM main.example_sentences
      WHERE instr(lower(english), lower(?)) > 0
      ORDER BY length(japanese), id
    SQL
  else
    db.execute(<<~SQL, query).map { |row| row.fetch("id") }
      SELECT id FROM main.example_sentences
      WHERE instr(japanese, ?) > 0
      ORDER BY length(japanese), id
    SQL
  end
end

aggregate_rows = []
candidate_rows = []

contexts.sort.each do |context_id, context|
  query = context.fetch("query_or_entry")
  language = context.fetch("language")
  reference = Array(reference_rows[context_id]).sort_by { |row| row.fetch("rank").to_i }.map { |row| pair_id(row) }
  zenbu = zenbu_candidates(db, query, language)
  engines = {
    "zenbu-normalized-literal-substring-length-id-baseline" => { applicable: true, ids: zenbu },
    "sqlite-fts4-porter-quoted-phrase-rowid-order-diagnostic" => {
      applicable: language == "en", ids: language == "en" ? fts_candidates(db, query) : []
    }
  }

  engines.each do |engine, engine_data|
    other_engine, other_data = engines.find { |name, _data| name != engine }
    ids = engine_data.fetch(:ids)
    other_ids = other_data.fetch(:ids)
    ranks = rank_map(ids)
    other_ranks = rank_map(other_ids)
    overlap = reference & ids
    mutual = ids & other_ids
    rank_deltas = mutual.map { |id| ranks.fetch(id) - other_ranks.fetch(id) }
    applicable = engine_data.fetch(:applicable)

    aggregate_rows << [
      context_id, query, language, engine, applicable, reference.length, ids.length,
      applicable ? ranked_hash(ids) : "not-applicable", overlap.length,
      reference.empty? ? "na" : format("%.6f", overlap.length.fdiv(reference.length)),
      order_agreement(reference, ids), (reference - ids).join(","), other_engine,
      other_data.fetch(:applicable), mutual.length, ids.length - mutual.length,
      other_ids.length - mutual.length, order_agreement(ids, other_ids),
      rank_deltas.empty? ? "na" : format("%.6f", rank_deltas.sum { |delta| delta.abs }.fdiv(rank_deltas.length)),
      rank_deltas.empty? ? "na" : rank_deltas.map(&:abs).max
    ]

    ids.each_with_index do |id, index|
      other_rank = other_ranks[id]
      candidate_rows << [
        context_id, query, language, engine, index + 1, id, other_engine,
        (!other_rank.nil?).to_s, other_rank || "", other_rank ? index + 1 - other_rank : ""
      ]
    end
  end
end

CSV.open(aggregate_path, "w", col_sep: "\t", row_sep: "\n", force_quotes: false) do |csv|
  csv << %w[context_id query language engine applicable reference_row_count eligible_count eligible_ranked_sha256 reference_overlap reference_recall reference_shared_order_agreement missing_reference_pair_ids other_engine other_applicable mutual_eligible_count only_this_count only_other_count mutual_order_agreement mean_absolute_rank_delta max_absolute_rank_delta]
  aggregate_rows.each { |row| csv << row }
end

CSV.open(candidate_rows_path, "w", col_sep: "\t", row_sep: "\n", force_quotes: false) do |csv|
  csv << %w[context_id query language engine rank pair_id other_engine in_other_engine other_rank rank_delta]
  candidate_rows.each { |row| csv << row }
end

warn "wrote #{aggregate_rows.length} aggregate rows and #{candidate_rows.length} complete candidate rows"
