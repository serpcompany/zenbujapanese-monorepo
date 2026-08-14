#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"
require "digest"
require "sqlite3"

abort <<~USAGE unless ARGV.length == 9
  usage: #{$PROGRAM_NAME} CONTEXTS_TSV ROWS_TSV ENTRY_ROUTES_TSV BENCHMARK_TSV \
    RUNTIME_TSV CORPUS_DB ISSUE147_EVIDENCE_DIR ISSUE148_EVIDENCE_DIR JPN_INDICES_CSV
USAGE

contexts_path, rows_path, routes_path, benchmark_path, runtime_path, corpus_path,
  evidence147, evidence148, indices_path = ARGV

contexts = CSV.read(contexts_path, headers: true, col_sep: "\t")
rows = CSV.read(rows_path, headers: true, col_sep: "\t")
routes = CSV.read(routes_path, headers: true, col_sep: "\t")
benchmark = CSV.read(benchmark_path, headers: true, col_sep: "\t")
runtime = CSV.read(runtime_path, headers: true, col_sep: "\t")
db = SQLite3::Database.new(corpus_path)
db.results_as_hash = true

raise "expected 20 contexts" unless contexts.length == 20
raise "expected 40 entry-route rows" unless routes.length == 40
expected_benchmark_rows = contexts.count { |row| row.fetch("language") == "en" } * 2
raise "expected #{expected_benchmark_rows} benchmark rows" unless benchmark.length == expected_benchmark_rows
raise "expected baseline plus three FTS runtime rows" unless runtime.length == 4

row_groups = rows.group_by { |row| row.fetch("context_id") }
contexts.each do |context|
  context_rows = row_groups.fetch(context.fetch("context_id"), [])
  raise "captured count mismatch #{context['context_id']}" unless context_rows.length == context.fetch("captured_row_count").to_i
  expected_ranks = (1..context_rows.length).to_a
  actual_ranks = context_rows.map { |row| row.fetch("rank").to_i }
  raise "rank gap #{context['context_id']}" unless actual_ranks == expected_ranks

  displayed_count = context.fetch("count_value").to_i
  exhaustive = context.fetch("exhaustive") == "true"
  case context.fetch("count_kind")
  when "exact"
    expected_capture = [displayed_count, 20].min
    raise "exact-list capture mismatch #{context['context_id']}" unless context_rows.length == expected_capture
    raise "exact-list exhaustive flag mismatch #{context['context_id']}" unless exhaustive == (displayed_count <= 20)
  when "capped-lower-bound"
    raise "capped-list capture mismatch #{context['context_id']}" unless context_rows.length == 20
    raise "capped list cannot be exhaustive #{context['context_id']}" if exhaustive
  else
    raise "unknown count kind #{context['context_id']} #{context['count_kind']}"
  end
end

raise "duplicate context/rank" unless rows.map { |row| [row.fetch("context_id"), row.fetch("rank")] }.uniq.length == rows.length

corpus_group_sizes = db.execute("SELECT id FROM example_sentences").each_with_object(Hash.new(0)) do |row, counts|
  counts[row.fetch("id").split(":", 3).fetch(2)] += 1
end

indices = File.foreach(indices_path, chomp: true).each_with_object({}) do |line, result|
  japanese_id = line.split("\t", 2).first
  result[japanese_id] = true
end

rows.each do |row|
  pair_id = "tatoeba:#{row.fetch('japanese_id')}:#{row.fetch('english_id')}"
  corpus = db.get_first_row("SELECT japanese, english FROM example_sentences WHERE id = ?", pair_id)
  raise "missing corpus pair #{pair_id}" unless corpus
  raise "text mismatch #{pair_id}" unless corpus.fetch("japanese") == row.fetch("japanese") && corpus.fetch("english") == row.fetch("english")
  raise "group size mismatch #{pair_id}" unless corpus_group_sizes.fetch(row.fetch("english_id")) == row.fetch("duplicate_group_size").to_i
  expected_indices = indices.key?(row.fetch("japanese_id")).to_s
  raise "indices mismatch #{pair_id}" unless expected_indices == row.fetch("japanese_indices")
end

def verify_private_pointer(pointer, expected_sha, evidence147, evidence148)
  path = case pointer
         when %r{\Aprivate://issue-147/(.+)\z} then File.join(evidence147, Regexp.last_match(1))
         when %r{\Aprivate://issue-148/(.+)\z} then File.join(evidence148, Regexp.last_match(1))
         else return
         end
  raise "missing evidence #{pointer}" unless File.file?(path)
  raise "evidence hash mismatch #{pointer}" unless Digest::SHA256.file(path).hexdigest == expected_sha
end

rows.each { |row| verify_private_pointer(row.fetch("private_evidence_pointer"), row.fetch("evidence_sha256"), evidence147, evidence148) }
routes.each { |row| verify_private_pointer(row.fetch("private_evidence_pointer"), row.fetch("evidence_sha256"), evidence147, evidence148) }
contexts.each do |context|
  verify_private_pointer(context.fetch("private_evidence_start_pointer"), context.fetch("private_evidence_start_sha256"), evidence147, evidence148)
  verify_private_pointer(context.fetch("private_evidence_terminal_pointer"), context.fetch("private_evidence_terminal_sha256"), evidence147, evidence148)
end

routes.each do |row|
  next unless row.fetch("pinned_corpus_presence") == "true"
  pair_id = "tatoeba:#{row.fetch('japanese_id')}:#{row.fetch('english_id')}"
  corpus = db.get_first_row("SELECT japanese, english FROM example_sentences WHERE id = ?", pair_id)
  raise "entry-route pair mismatch #{pair_id}" unless corpus && corpus.fetch("japanese") == row.fetch("japanese") && corpus.fetch("english") == row.fetch("english")
end

direct_ids = (6..17).map { |number| format("D%02d", number) }
fts = benchmark.select { |row| direct_ids.include?(row.fetch("context_id")) && row.fetch("candidate").start_with?("sqlite-fts4") }
substring = benchmark.select { |row| direct_ids.include?(row.fetch("context_id")) && row.fetch("candidate").start_with?("zenbu-") }
raise "missing direct benchmark rows" unless fts.length == 12 && substring.length == 12
fts.each do |row|
  raise "FTS missed visible row #{row['context_id']}" unless row.fetch("reference_overlap") == row.fetch("reference_row_count")
  raise "FTS missing-id column not empty #{row['context_id']}" unless row.fetch("missing_reference_pair_ids").empty?
end

fts_overlap = fts.sum { |row| row.fetch("reference_overlap").to_i }
substring_overlap = substring.sum { |row| row.fetch("reference_overlap").to_i }

baseline = runtime.find { |row| row.fetch("component") == "baseline" }
fts_runtime = runtime.select { |row| row.fetch("component") == "sqlite-fts4-porter" }
raise "missing runtime baseline" unless baseline
raise "expected three FTS runtime runs" unless fts_runtime.length == 3
raise "unsigned or failed runtime row" unless runtime.all? { |row| row.fetch("signed") == "true" && row.fetch("status") == "pass" }
raise "runtime device class mismatch" unless runtime.all? { |row| row.fetch("device_class") == "iPhone14ProMax" }
raise "nondeterministic runtime hash" unless fts_runtime.map { |row| row.fetch("deterministic_hash") }.uniq.length == 1
raise "concurrency mismatch" unless fts_runtime.all? { |row| row.fetch("concurrent_workers") == "8" && row.fetch("concurrent_hashes_equal") == "true" }
raise "runtime index not larger than source" unless fts_runtime.all? { |row| row.fetch("runtime_database_bytes").to_i > row.fetch("source_database_bytes").to_i }
raise "FTS executable not larger than baseline" unless fts_runtime.all? { |row| row.fetch("executable_bytes").to_i > baseline.fetch("executable_bytes").to_i }

puts "PASS contexts=#{contexts.length} visible_rows=#{rows.length} entry_route_rows=#{routes.length} " \
     "benchmark_rows=#{benchmark.length} runtime_rows=#{runtime.length} fts_overlap=#{fts_overlap} substring_overlap=#{substring_overlap}"
