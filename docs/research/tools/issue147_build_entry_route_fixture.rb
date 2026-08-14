#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"
require "digest"
require "sqlite3"
require "time"

abort "usage: #{$PROGRAM_NAME} CORPUS_DB EVIDENCE_DIR OUTPUT_TSV" unless ARGV.length == 3

corpus_path, evidence_dir, output_path = ARGV
db = SQLite3::Database.new(corpus_path)
db.results_as_hash = true

Probe = Struct.new(:query, :headword, :reading, :rows, keyword_init: true)
RouteRow = Struct.new(:pair_id, :page, :fallback_japanese, :fallback_english, :filename_override, keyword_init: true)

def route_row(pair_id:, page: nil, fallback_japanese: nil, fallback_english: nil, filename_override: nil)
  RouteRow.new(pair_id: pair_id, page: page, fallback_japanese: fallback_japanese,
               fallback_english: fallback_english, filename_override: filename_override)
end

PROBES = {
  "D21" => Probe.new(query: "食べた", headword: "食べる", reading: "たべる", rows: [
    route_row(pair_id: "tatoeba:5254848:1098492", page: 3), route_row(pair_id: "tatoeba:5254850:1098495", page: 3),
    route_row(pair_id: "tatoeba:11604006:953286", page: 3), route_row(pair_id: "tatoeba:12824508:773323", page: 4),
    route_row(pair_id: "tatoeba:1430239:953286", page: 5), route_row(pair_id: "tatoeba:5072721:5072694", page: 6),
    route_row(pair_id: "tatoeba:12824509:773323", page: 6), route_row(pair_id: "tatoeba:2492490:5167613", page: 8),
    route_row(pair_id: "tatoeba:2505736:36600", page: 8), route_row(pair_id: "tatoeba:2969826:1847831", page: 9),
    route_row(pair_id: "tatoeba:3466602:372015", page: 10), route_row(pair_id: "tatoeba:4770397:3628784", page: 11),
    route_row(pair_id: "tatoeba:6828205:7730719", page: 12), route_row(pair_id: "tatoeba:6828206:8092960", page: 12),
    route_row(pair_id: "tatoeba:7551813:2052041", page: 13), route_row(pair_id: "tatoeba:8753239:2650958", page: 13),
    route_row(pair_id: "tatoeba:9962253:1830543", page: 14), route_row(pair_id: "tatoeba:11851980:11333331", page: 15),
    route_row(pair_id: "tatoeba:12206268:3154896", page: 16), route_row(pair_id: "tatoeba:12689090:13057426", page: 16)
  ]),
  "D22" => Probe.new(query: "ねこ", headword: "猫", reading: "ねこ", rows: [
    route_row(pair_id: nil, page: 2, fallback_japanese: "猫だ！", fallback_english: "It's a cat."),
    route_row(pair_id: "tatoeba:10495889:10778427", page: 3), route_row(pair_id: "tatoeba:5113810:282020", page: 3),
    route_row(pair_id: "tatoeba:6828218:8092953", page: 4), route_row(pair_id: "tatoeba:8874675:3825839", page: 5),
    route_row(pair_id: "tatoeba:198627:35821", page: 6), route_row(pair_id: "tatoeba:538768:471758", page: 7),
    route_row(pair_id: "tatoeba:1780171:1780076", page: 8), route_row(pair_id: "tatoeba:3456487:2068371", page: 8),
    route_row(pair_id: "tatoeba:6828215:8804660", page: 9), route_row(pair_id: "tatoeba:9963984:9963970", page: 10),
    route_row(pair_id: "tatoeba:10603327:2900859", page: 11), route_row(pair_id: "tatoeba:121984:282019", page: 12),
    route_row(pair_id: "tatoeba:121987:282017", filename_override: "D22-entry-neko-top20-extension-02.png"),
    route_row(pair_id: "tatoeba:182372:19548", filename_override: "D22-entry-neko-top20-extension-02.png"),
    route_row(pair_id: "tatoeba:354378:354379", filename_override: "D22-entry-neko-top20-extension-02.png"),
    route_row(pair_id: "tatoeba:1172570:1107280", filename_override: "D22-entry-neko-top20-extension-02.png"),
    route_row(pair_id: "tatoeba:3363883:5318944", filename_override: "D22-entry-neko-top20-extension-02.png"),
    route_row(pair_id: "tatoeba:7577167:7577329", filename_override: "D22-entry-neko-top20-extension-03.png"),
    route_row(pair_id: "tatoeba:9065865:2936461", filename_override: "D22-entry-neko-top20-extension-03.png")
  ])
}.freeze

CSV.open(output_path, "w", col_sep: "\t", row_sep: "\n", force_quotes: false) do |csv|
  csv << %w[probe_id phase context_type query entry_headword entry_reading route reference_version environment count_value count_kind captured_row_count exhaustive captured_scope rank captured_at private_evidence_pointer evidence_sha256 japanese english japanese_id english_id pinned_corpus_presence lexical_relation]

  PROBES.each do |probe_id, probe|
    probe.rows.each_with_index do |route_record, index|
      filename = route_record.filename_override || format("%s-entry-%s-scroll-%03d.jpeg", probe_id, probe_id == "D21" ? "taberu" : "neko", route_record.page)
      path = File.join(evidence_dir, filename)
      corpus = route_record.pair_id && db.get_first_row("SELECT id, japanese, english FROM example_sentences WHERE id = ?", route_record.pair_id)
      raise "missing corpus row #{route_record.pair_id}" if route_record.pair_id && !corpus
      japanese_id, english_id = route_record.pair_id ? route_record.pair_id.split(":", 3).drop(1) : ["", ""]

      csv << [
        probe_id, "discovery", "dictionary-entry-route", probe.query, probe.headword, probe.reading,
        "search-best-match-to-word-detail-inline-examples", "Nihongo-1.34.3-9792",
        "iPhone17ProMax-iOS26.6", "", "not-displayed", 20, false, "ordered-top-20-structural-probe",
        index + 1, File.mtime(path).iso8601, "private://issue-147/#{filename}",
        Digest::SHA256.file(path).hexdigest, corpus ? corpus.fetch("japanese") : route_record.fallback_japanese,
        corpus ? corpus.fetch("english") : route_record.fallback_english, japanese_id, english_id,
        (!corpus.nil?).to_s, "dictionary-entry-associated-example"
      ]
    end
  end
end

warn "wrote 2 entry-route probes and 40 top rows"
