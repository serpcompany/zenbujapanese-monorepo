#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"
require "digest"
require "json"

abort <<~USAGE unless ARGV.length == 11
  usage: #{$PROGRAM_NAME} BASELINE_APP FTS_APP DEVICE_CLASS OS_VERSION OUTPUT_TSV \
    BASELINE_RUN_1_JSON BASELINE_RUN_2_JSON BASELINE_RUN_3_JSON FTS_RUN_1_JSON FTS_RUN_2_JSON FTS_RUN_3_JSON
USAGE

baseline_app, fts_app, device_class, os_version, output_path, *result_paths = ARGV

def artifact_fact(app_path)
  executable = File.join(app_path, File.basename(app_path, ".app"))
  resource = File.join(app_path, "LanguageReferenceData.sqlite3")
  raise "missing executable #{executable}" unless File.file?(executable)
  raise "missing corpus resource #{resource}" unless File.file?(resource)
  raise "invalid signature #{app_path}" unless system("codesign", "--verify", "--strict", app_path, out: File::NULL, err: File::NULL)

  files = Dir.glob(File.join(app_path, "**", "*"), File::FNM_DOTMATCH).select { |path| File.file?(path) }
  {
    executable_bytes: File.size(executable),
    bundle_file_bytes: files.sum { |path| File.size(path) },
    packaged_resource_bytes: File.size(resource)
  }
end

artifacts = {
  "zenbu-literal-substring-baseline" => artifact_fact(baseline_app),
  "sqlite-fts4-porter" => artifact_fact(fts_app)
}

headers = %w[
  component run device_class os_version configuration signed executable_bytes bundle_file_bytes
  packaged_resource_bytes source_database_bytes runtime_database_bytes cold_prepare_ms
  warm_six_query_iterations warm_six_query_p50_ms warm_six_query_p95_ms steady_query_rss_bytes
  peak_sampled_rss_bytes rss_sample_interval_ms steady_rss_definition peak_rss_definition
  eligible_rows_per_batch sequential_hashes_equal concurrent_workers concurrent_hashes_equal
  deterministic_hash private_result_sha256 status
]

rows = result_paths.each_with_index.map do |path, index|
  result = JSON.parse(File.read(path))
  expected_engine = index < 3 ? "zenbu-literal-substring-baseline" : "sqlite-fts4-porter"
  raise "unexpected engine in #{path}" unless result.fetch("engine") == expected_engine
  artifact = artifacts.fetch(expected_engine)

  {
    "component" => expected_engine,
    "run" => (index % 3 + 1).to_s,
    "device_class" => device_class,
    "os_version" => os_version,
    "configuration" => "Release",
    "signed" => "true",
    "executable_bytes" => artifact.fetch(:executable_bytes),
    "bundle_file_bytes" => artifact.fetch(:bundle_file_bytes),
    "packaged_resource_bytes" => artifact.fetch(:packaged_resource_bytes),
    "source_database_bytes" => result.fetch("source_database_bytes"),
    "runtime_database_bytes" => result.fetch("database_bytes"),
    "cold_prepare_ms" => result.fetch("cold_prepare_ms"),
    "warm_six_query_iterations" => result.fetch("warm_six_query_iterations"),
    "warm_six_query_p50_ms" => result.fetch("warm_six_query_p50_ms"),
    "warm_six_query_p95_ms" => result.fetch("warm_six_query_p95_ms"),
    "steady_query_rss_bytes" => result.fetch("steady_query_rss_bytes"),
    "peak_sampled_rss_bytes" => result.fetch("peak_sampled_rss_bytes"),
    "rss_sample_interval_ms" => result.fetch("rss_sample_interval_ms"),
    "steady_rss_definition" => result.fetch("steady_rss_definition"),
    "peak_rss_definition" => result.fetch("peak_rss_definition"),
    "eligible_rows_per_batch" => result.fetch("eligible_rows_per_batch"),
    "sequential_hashes_equal" => result.fetch("sequential_hashes_equal"),
    "concurrent_workers" => result.fetch("concurrent_workers"),
    "concurrent_hashes_equal" => result.fetch("concurrent_hashes_equal"),
    "deterministic_hash" => result.fetch("deterministic_hash"),
    "private_result_sha256" => Digest::SHA256.file(path).hexdigest,
    "status" => result.fetch("status")
  }
end

CSV.open(output_path, "w", col_sep: "\t", write_headers: true, headers: headers) do |csv|
  rows.each { |row| csv << headers.map { |header| row.fetch(header) } }
end

puts "wrote #{rows.length} comparable signed runtime rows"
