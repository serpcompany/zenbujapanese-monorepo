#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"
require "digest"
require "sqlite3"

abort <<~USAGE unless ARGV.length == 11
  usage: #{$PROGRAM_NAME} PLAN_TSV CONTEXTS_TSV ROWS_TSV ENTRY_ROUTES_TSV BENCHMARK_TSV \
    CANDIDATE_ROWS_TSV RUNTIME_TSV CORPUS_DB ISSUE147_EVIDENCE_DIR ISSUE148_EVIDENCE_DIR JPN_INDICES_CSV
USAGE

plan_path, contexts_path, rows_path, routes_path, benchmark_path, candidate_rows_path, runtime_path, corpus_path,
  evidence147, evidence148, indices_path = ARGV

plan = CSV.read(plan_path, headers: true, col_sep: "\t")
contexts = CSV.read(contexts_path, headers: true, col_sep: "\t")
rows = CSV.read(rows_path, headers: true, col_sep: "\t")
routes = CSV.read(routes_path, headers: true, col_sep: "\t")
benchmark = CSV.read(benchmark_path, headers: true, col_sep: "\t")
candidate_rows = CSV.read(candidate_rows_path, headers: true, col_sep: "\t")
runtime = CSV.read(runtime_path, headers: true, col_sep: "\t")
db = SQLite3::Database.new(corpus_path)
db.results_as_hash = true

raise "expected 30 planned/retired contexts" unless plan.length == 30
raise "expected 20 contexts" unless contexts.length == 20
raise "expected 40 entry-route rows" unless routes.length == 40
expected_benchmark_rows = contexts.length * 2
raise "expected #{expected_benchmark_rows} benchmark rows" unless benchmark.length == expected_benchmark_rows
raise "expected three baseline plus three FTS runtime rows" unless runtime.length == 6

plan_by_id = plan.to_h { |row| [row.fetch("context_id"), row] }
contexts.each do |context|
  planned = plan_by_id.fetch(context.fetch("context_id"))
  raise "plan query mismatch #{context['context_id']}" unless planned.fetch("query_or_entry") == context.fetch("query_or_entry")
  raise "observed route mismatch #{context['context_id']}" unless planned.fetch("observed_context_type") == context.fetch("context_type")
end
(1..5).each do |number|
  row = plan_by_id.fetch(format("D%02d", number))
  raise "missing D01-D05 route correction" unless row.fetch("planned_context_type") == "dictionary-entry" &&
                                                   row.fetch("observed_context_type") == "direct-search" &&
                                                   !row.fetch("route_correction").empty?
end
(6..20).each do |number|
  row = plan_by_id.fetch(format("D%02d", number))
  raise "unexpected discovery route correction" unless row.fetch("planned_context_type") == "direct-search" &&
                                                       row.fetch("observed_context_type") == "direct-search" &&
                                                       row["route_correction"].to_s.empty?
end
plan.select { |row| row.fetch("phase") == "retired-contaminated" }.each do |row|
  raise "retired context must remain unobserved" unless row.fetch("observed_context_type") == "not-observed"
end

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

db.execute("CREATE VIRTUAL TABLE temp.issue147_validator_fts USING fts4(id, english, tokenize=porter)")
db.execute("INSERT INTO temp.issue147_validator_fts SELECT id, english FROM main.example_sentences")

def replay_candidates(db, context, engine)
  query = context.fetch("query_or_entry")
  language = context.fetch("language")
  if engine.start_with?("sqlite-fts4")
    return [] unless language == "en"
    phrase = %Q{"#{query.gsub('"', '""')}"}
    db.execute(<<~SQL, phrase).map { |row| row.fetch("id") }
      SELECT e.id FROM temp.issue147_validator_fts f
      JOIN main.example_sentences e ON e.id = f.id
      WHERE issue147_validator_fts MATCH ? ORDER BY f.rowid
    SQL
  elsif language == "en"
    db.execute("SELECT id FROM example_sentences WHERE instr(lower(english), lower(?)) > 0 ORDER BY length(japanese), id", query).map { |row| row.fetch("id") }
  else
    db.execute("SELECT id FROM example_sentences WHERE instr(japanese, ?) > 0 ORDER BY length(japanese), id", query).map { |row| row.fetch("id") }
  end
end

context_map = contexts.to_h { |row| [row.fetch("context_id"), row] }
candidate_groups = candidate_rows.group_by { |row| [row.fetch("context_id"), row.fetch("engine")] }
benchmark.each do |aggregate|
  key = [aggregate.fetch("context_id"), aggregate.fetch("engine")]
  candidates = candidate_groups.fetch(key, []).sort_by { |row| row.fetch("rank").to_i }
  actual_ids = candidates.map { |row| row.fetch("pair_id") }
  expected_ids = replay_candidates(db, context_map.fetch(aggregate.fetch("context_id")), aggregate.fetch("engine"))
  raise "full candidate replay mismatch #{key.join('/')}" unless actual_ids == expected_ids
  raise "candidate count mismatch #{key.join('/')}" unless actual_ids.length == aggregate.fetch("eligible_count").to_i
  expected_hash = aggregate.fetch("applicable") == "true" ? Digest::SHA256.hexdigest(actual_ids.join("\n") + "\n") : "not-applicable"
  raise "candidate hash mismatch #{key.join('/')}" unless expected_hash == aggregate.fetch("eligible_ranked_sha256")
  raise "candidate rank gap #{key.join('/')}" unless candidates.map { |row| row.fetch("rank").to_i } == (1..candidates.length).to_a
end

candidate_rows.each do |row|
  other = candidate_groups.fetch([row.fetch("context_id"), row.fetch("other_engine")], [])
  other_ranks = other.to_h { |item| [item.fetch("pair_id"), item.fetch("rank").to_i] }
  expected_other_rank = other_ranks[row.fetch("pair_id")]
  raise "in-other mismatch #{row['context_id']} #{row['pair_id']}" unless row.fetch("in_other_engine") == (!expected_other_rank.nil?).to_s
  raise "other-rank mismatch #{row['context_id']} #{row['pair_id']}" unless row.fetch("other_rank") == (expected_other_rank || "").to_s
  expected_delta = expected_other_rank ? row.fetch("rank").to_i - expected_other_rank : ""
  raise "rank-delta mismatch #{row['context_id']} #{row['pair_id']}" unless row.fetch("rank_delta") == expected_delta.to_s
end

direct_ids = (6..17).map { |number| format("D%02d", number) }
fts = benchmark.select { |row| direct_ids.include?(row.fetch("context_id")) && row.fetch("engine").start_with?("sqlite-fts4") }
substring = benchmark.select { |row| direct_ids.include?(row.fetch("context_id")) && row.fetch("engine").start_with?("zenbu-") }
raise "missing direct benchmark rows" unless fts.length == 12 && substring.length == 12
fts.each do |row|
  raise "FTS missed visible row #{row['context_id']}" unless row.fetch("reference_overlap") == row.fetch("reference_row_count")
  raise "FTS missing-id column not empty #{row['context_id']}" unless row.fetch("missing_reference_pair_ids").empty?
end

fts_overlap = fts.sum { |row| row.fetch("reference_overlap").to_i }
substring_overlap = substring.sum { |row| row.fetch("reference_overlap").to_i }

baselines = runtime.select { |row| row.fetch("component") == "zenbu-literal-substring-baseline" }
fts_runtime = runtime.select { |row| row.fetch("component") == "sqlite-fts4-porter" }
raise "expected three baseline runtime runs" unless baselines.length == 3
raise "expected three FTS runtime runs" unless fts_runtime.length == 3
raise "unsigned or failed runtime row" unless runtime.all? { |row| row.fetch("signed") == "true" && row.fetch("status") == "pass" }
raise "runtime device class mismatch" unless runtime.all? { |row| row.fetch("device_class") == "iPhone14ProMax" }
raise "runtime workload mismatch" unless runtime.all? do |row|
  row.fetch("configuration") == "Release" &&
    row.fetch("warm_six_query_iterations") == "100" &&
    row.fetch("concurrent_workers") == "8" &&
    row.fetch("sequential_hashes_equal") == "true" &&
    row.fetch("concurrent_hashes_equal") == "true"
end
raise "RSS methodology mismatch" unless runtime.all? do |row|
  row.fetch("rss_sample_interval_ms") == "10" &&
    row.fetch("steady_rss_definition") == "median of 9 samples at 20ms intervals after sequential and concurrent query workloads while the corpus database remains open" &&
    row.fetch("peak_rss_definition") == "maximum 10ms sample from before corpus copy/open through steady-query sampling; sampling may miss sub-10ms transients" &&
    row.fetch("steady_query_rss_bytes").to_i.positive? &&
    row.fetch("peak_sampled_rss_bytes").to_i >= row.fetch("steady_query_rss_bytes").to_i
end
raise "nondeterministic runtime hash" unless [baselines, fts_runtime].all? { |group| group.map { |row| row.fetch("deterministic_hash") }.uniq.length == 1 }
raise "runtime index not larger than source" unless fts_runtime.all? { |row| row.fetch("runtime_database_bytes").to_i > row.fetch("source_database_bytes").to_i }
raise "baseline database size mismatch" unless baselines.all? { |row| row.fetch("runtime_database_bytes") == row.fetch("source_database_bytes") }
raise "missing signed artifact sizes" unless runtime.all? { |row| row.fetch("executable_bytes").to_i.positive? && row.fetch("bundle_file_bytes").to_i.positive? }

puts "PASS contexts=#{contexts.length} visible_rows=#{rows.length} entry_route_rows=#{routes.length} " \
     "benchmark_rows=#{benchmark.length} candidate_rows=#{candidate_rows.length} runtime_rows=#{runtime.length} " \
     "fts_overlap=#{fts_overlap} substring_overlap=#{substring_overlap}"
