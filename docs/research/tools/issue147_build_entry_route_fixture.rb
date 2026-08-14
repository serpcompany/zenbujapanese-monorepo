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

PROBES = {
  "D21" => {
    query: "食べた", headword: "食べる", reading: "たべる",
    rows: [
      ["tatoeba:5254848:1098492", 3], ["tatoeba:5254850:1098495", 3],
      ["tatoeba:11604006:953286", 3], ["tatoeba:12824508:773323", 4],
      ["tatoeba:1430239:953286", 5], ["tatoeba:5072721:5072694", 6],
      ["tatoeba:12824509:773323", 6], ["tatoeba:2492490:5167613", 8],
      ["tatoeba:2505736:36600", 8], ["tatoeba:2969826:1847831", 9],
      ["tatoeba:3466602:372015", 10], ["tatoeba:4770397:3628784", 11],
      ["tatoeba:6828205:7730719", 12], ["tatoeba:6828206:8092960", 12],
      ["tatoeba:7551813:2052041", 13], ["tatoeba:8753239:2650958", 13],
      ["tatoeba:9962253:1830543", 14], ["tatoeba:11851980:11333331", 15],
      ["tatoeba:12206268:3154896", 16], ["tatoeba:12689090:13057426", 16]
    ]
  },
  "D22" => {
    query: "ねこ", headword: "猫", reading: "ねこ",
    rows: [
      [nil, 2, "猫だ！", "It's a cat."], ["tatoeba:10495889:10778427", 3],
      ["tatoeba:5113810:282020", 3], ["tatoeba:6828218:8092953", 4],
      ["tatoeba:8874675:3825839", 5], ["tatoeba:198627:35821", 6],
      ["tatoeba:538768:471758", 7], ["tatoeba:1780171:1780076", 8],
      ["tatoeba:3456487:2068371", 8], ["tatoeba:6828215:8804660", 9],
      ["tatoeba:9963984:9963970", 10], ["tatoeba:10603327:2900859", 11],
      ["tatoeba:121984:282019", 12],
      ["tatoeba:121987:282017", nil, nil, nil, "D22-entry-neko-top20-extension-02.png"],
      ["tatoeba:182372:19548", nil, nil, nil, "D22-entry-neko-top20-extension-02.png"],
      ["tatoeba:354378:354379", nil, nil, nil, "D22-entry-neko-top20-extension-02.png"],
      ["tatoeba:1172570:1107280", nil, nil, nil, "D22-entry-neko-top20-extension-02.png"],
      ["tatoeba:3363883:5318944", nil, nil, nil, "D22-entry-neko-top20-extension-02.png"],
      ["tatoeba:7577167:7577329", nil, nil, nil, "D22-entry-neko-top20-extension-03.png"],
      ["tatoeba:9065865:2936461", nil, nil, nil, "D22-entry-neko-top20-extension-03.png"]
    ]
  }
}.freeze

CSV.open(output_path, "w", col_sep: "\t", row_sep: "\n", force_quotes: false) do |csv|
  csv << %w[probe_id phase context_type query entry_headword entry_reading route reference_version environment count_value count_kind captured_row_count exhaustive captured_scope rank captured_at private_evidence_pointer evidence_sha256 japanese english japanese_id english_id pinned_corpus_presence lexical_relation]

  PROBES.each do |probe_id, probe|
    probe[:rows].each_with_index do |(pair_id, page, fallback_japanese, fallback_english, filename_override), index|
      filename = filename_override || format("%s-entry-%s-scroll-%03d.jpeg", probe_id, probe_id == "D21" ? "taberu" : "neko", page)
      path = File.join(evidence_dir, filename)
      corpus = pair_id && db.get_first_row("SELECT id, japanese, english FROM example_sentences WHERE id = ?", pair_id)
      raise "missing corpus row #{pair_id}" if pair_id && !corpus
      japanese_id, english_id = pair_id ? pair_id.split(":", 3).drop(1) : ["", ""]

      csv << [
        probe_id, "discovery", "dictionary-entry-route", probe[:query], probe[:headword], probe[:reading],
        "search-best-match-to-word-detail-inline-examples", "Nihongo-1.34.3-9792",
        "iPhone17ProMax-iOS26.6", "", "not-displayed", 20, false, "ordered-top-20-structural-probe",
        index + 1, File.mtime(path).iso8601, "private://issue-147/#{filename}",
        Digest::SHA256.file(path).hexdigest, corpus ? corpus.fetch("japanese") : fallback_japanese,
        corpus ? corpus.fetch("english") : fallback_english, japanese_id, english_id,
        (!corpus.nil?).to_s, "dictionary-entry-associated-example"
      ]
    end
  end
end

warn "wrote 2 entry-route probes and 40 top rows"
