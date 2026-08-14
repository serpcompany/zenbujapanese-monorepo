#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"
require "digest"
require "sqlite3"
require "time"

abort <<~USAGE unless ARGV.length == 8
  usage: #{$PROGRAM_NAME} ISSUE140_TSV CONSOLIDATED_TSV CORPUS_DB JPN_INDICES_CSV \
    ISSUE147_EVIDENCE_DIR ISSUE148_EVIDENCE_DIR CONTEXTS_OUTPUT ROWS_OUTPUT
USAGE

source140_path, consolidated_path, corpus_path, indices_path, evidence147,
  evidence148, contexts_output, rows_output = ARGV

db = SQLite3::Database.new(corpus_path)
db.results_as_hash = true
indices = File.foreach(indices_path, chomp: true).each_with_object({}) do |line, result|
  japanese_id = line.split("\t", 2).first
  result[japanese_id] = true
end

CONTEXT = {
  "D01" => ["direct-search", "cave", "en", 32, "exact", false],
  "D02" => ["direct-search", "cat", "en", 50, "capped-lower-bound", false],
  "D03" => ["direct-search", "eat", "en", 50, "capped-lower-bound", false],
  "D04" => ["direct-search", "beautiful", "en", 50, "capped-lower-bound", false],
  "D05" => ["direct-search", "thank you", "en", 50, "capped-lower-bound", false],
  "D06" => ["direct-search", "scared you", "en", 4, "exact", true],
  "D07" => ["direct-search", "startled you", "en", 0, "exact", true],
  "D08" => ["direct-search", "scare you", "en", 4, "exact", true],
  "D09" => ["direct-search", "red you", "en", 0, "exact", true],
  "D10" => ["direct-search", "startle you", "en", 1, "exact", true],
  "D11" => ["direct-search", "startled me", "en", 2, "exact", true],
  "D12" => ["direct-search", "scatter", "en", 21, "exact", false],
  "D13" => ["direct-search", "education", "en", 50, "capped-lower-bound", false],
  "D14" => ["direct-search", "great", "en", 50, "capped-lower-bound", false],
  "D15" => ["direct-search", "neat", "en", 19, "exact", true],
  "D16" => ["direct-search", "quickly", "en", 50, "capped-lower-bound", false],
  "D17" => ["direct-search", "cat!", "en", 50, "capped-lower-bound", false],
  "D18" => ["direct-search", "食べる", "ja", 50, "capped-lower-bound", false],
  "D19" => ["direct-search", "食べた", "ja", 50, "capped-lower-bound", false],
  "D20" => ["direct-search", "ねこ", "ja", 9, "exact", true]
}.freeze

MANUAL_DIRECT_PAIRS = {
  "D01" => %w[
    tatoeba:484243:483985 tatoeba:11491039:3008736 tatoeba:2804141:2804142 tatoeba:11195158:11085878
    tatoeba:8823605:1294352 tatoeba:9106984:9106983 tatoeba:207433:44686 tatoeba:12068436:9015131
    tatoeba:8621723:7732995 tatoeba:11345330:3431160 tatoeba:207438:44691 tatoeba:106544:297142
    tatoeba:127385:276708 tatoeba:123631:280366 tatoeba:212864:50149 tatoeba:218337:55648
    tatoeba:9944502:3422210 tatoeba:203119:40355 tatoeba:11052134:3536229 tatoeba:8930319:7958294
  ],
  "D02" => %w[
    tatoeba:85345:269036 tatoeba:101396:302300 tatoeba:91803:311909 tatoeba:91804:311908 tatoeba:97661:306043
    tatoeba:101398:302298 tatoeba:78908:324808 tatoeba:107300:296384 tatoeba:115413:288257 tatoeba:121959:35811
    tatoeba:77747:325971 tatoeba:82767:320949 tatoeba:87595:316113 tatoeba:92329:311382 tatoeba:115626:288044
    tatoeba:79818:323899 tatoeba:87596:316112 tatoeba:96408:463186 tatoeba:116987:286680 tatoeba:80122:323595
  ],
  "D03" => %w[
    tatoeba:77229:34326 tatoeba:5160:2765281 tatoeba:5222:1881 tatoeba:78956:324760 tatoeba:77970:62636
    tatoeba:75107:328612 tatoeba:77975:62636 tatoeba:79599:324120 tatoeba:5311:2129 tatoeba:5298:401813
    tatoeba:77668:326050 tatoeba:81307:322408 tatoeba:5274:2073 tatoeba:81207:322508 tatoeba:76443:327277
    tatoeba:79841:323876 tatoeba:81280:322435 tatoeba:4948:1538 tatoeba:81960:321755 tatoeba:76117:327601
  ],
  "D04" => %w[
    tatoeba:85541:410244 tatoeba:5196:1829 tatoeba:85563:318150 tatoeba:4894:1480 tatoeba:84940:2617277
    tatoeba:4796:1375 tatoeba:5062:1658 tatoeba:79125:324592 tatoeba:5032:1627 tatoeba:82922:320794
    tatoeba:84937:318776 tatoeba:85570:318143 tatoeba:81432:322283 tatoeba:85562:318151 tatoeba:85564:318149
    tatoeba:5347:2446 tatoeba:81709:322006 tatoeba:83102:320614 tatoeba:79370:324347 tatoeba:74106:329614
  ],
  "D05" => %w[
    tatoeba:81557:1564 tatoeba:141799:272771 tatoeba:145585:268952 tatoeba:140220:274353 tatoeba:4971:1564
    tatoeba:78721:64536 tatoeba:124756:64155 tatoeba:141469:273101 tatoeba:79266:324451 tatoeba:124725:64155
    tatoeba:137276:275960 tatoeba:144789:54403 tatoeba:74144:329576 tatoeba:140219:274354 tatoeba:78725:64536
    tatoeba:122872:281130 tatoeba:141471:273099 tatoeba:5278:2077 tatoeba:124718:279276 tatoeba:145602:268959
  ]
}.freeze

MANUAL_FRAME_RANGES = {
  "D01" => [[1, 7, 1], [8, 13, 2], [14, 17, 3], [18, 20, 4]],
  "D02" => [[1, 7, 1], [8, 14, 2], [15, 19, 3], [20, 20, 4]],
  "D03" => [[1, 7, 1], [8, 13, 2], [14, 18, 3], [19, 20, 4]],
  "D04" => [[1, 7, 1], [8, 12, 2], [13, 17, 3], [18, 20, 4]],
  "D05" => [[1, 7, 1], [8, 14, 2], [15, 15, "overlap"], [16, 20, 3]]
}.freeze

MANUAL_FILE_STEMS = {
  "D01" => "D01-cave-top20", "D02" => "D02-cat-top20", "D03" => "D03-eat-top20",
  "D04" => "D04-beautiful-top20", "D05" => "D05-thank-you-top20"
}.freeze

ROOT_FILES = {
  "D01" => "D01-cave-root-count.png",
  "D02" => "D02-cat-root-count.png",
  "D03" => "D03-eat-root-count.png",
  "D04" => "D04-beautiful-root-count.png",
  "D05" => "D05-thank-you-root-count.png",
  "D12" => "D12-root.jpeg",
  "D13" => "D13-root-recapture-20260814T2324JST.jpeg",
  "D14" => "D14-root-recapture-20260814T2330JST.jpeg",
  "D15" => "D15-root-recapture-20260814T2334JST.jpeg",
  "D16" => "D16-root-recapture-20260814T2335JST.jpeg",
  "D17" => "D17-root-recapture-20260814T2343JST.jpeg",
  "D18" => "D18-root-recapture-20260814T2345JST.jpeg",
  "D19" => "D19-root-recapture-20260814T2347JST.jpeg",
  "D20" => "D20-root-valid.jpeg"
}.freeze

TERMINAL_FILES = {
  "D01" => "D01-cave-top20-04.png",
  "D02" => "D02-cat-top20-04.png",
  "D03" => "D03-eat-top20-04.png",
  "D04" => "D04-beautiful-top20-04.png",
  "D05" => "D05-thank-you-top20-04.png",
  "D12" => "D12-examples-22.jpeg",
  "D13" => "D13-exhaustive-page-058.jpeg",
  "D14" => "D14-exhaustive-page-073.jpeg",
  "D15" => "D15-exhaustive-page-021.jpeg",
  "D16" => "D16-exhaustive-page-067.jpeg",
  "D17" => "D17-exhaustive-page-062.jpeg",
  "D18" => "D18-exhaustive-page-062.jpeg",
  "D19" => "D19-exhaustive-page-062.jpeg",
  "D20" => "D20-examples-08-valid.jpeg"
}.freeze

ISSUE148_FILES = {
  "D06" => "nihongo-scared-you-examples.png",
  "D07" => "nihongo-startled-you-search.png",
  "D08" => "nihongo-scare-you-examples.png",
  "D09" => "nihongo-red-you-search.png",
  "D10" => "nihongo-startle-you-examples.png",
  "D11" => "nihongo-startled-me-examples.png"
}.freeze

ISSUE148_PAIRS = {
  "D06" => %w[tatoeba:108058:295628 tatoeba:12574578:12373614 tatoeba:2409471:2396319 tatoeba:472836:473875],
  "D07" => [],
  "D08" => %w[tatoeba:12574578:12373614 tatoeba:2409471:2396319 tatoeba:472836:473875 tatoeba:108058:295628],
  "D09" => [],
  "D10" => %w[tatoeba:1804152:1804150],
  "D11" => %w[tatoeba:180017:18876 tatoeba:201898:39109]
}.freeze

D20_PAIRS = %w[
  tatoeba:9065865:2936461 tatoeba:229125:66484 tatoeba:198626:35819
  tatoeba:1518071:1557001 tatoeba:172958:241515 tatoeba:187012:24149
  tatoeba:77011:326708 tatoeba:227532:64885 tatoeba:205933:43179
].freeze

def file_fact(directory, name, issue)
  path = File.join(directory, name)
  {
    captured_at: File.mtime(path).iso8601,
    pointer: "private://#{issue}/#{name}",
    sha256: Digest::SHA256.file(path).hexdigest
  }
end

def direct_ranks(db, query, language)
  rows = if language == "en"
           db.execute(<<~SQL, query)
             SELECT id FROM example_sentences
             WHERE instr(lower(english), lower(?)) > 0
             ORDER BY length(japanese), id LIMIT 100
           SQL
         else
           db.execute(<<~SQL, query)
             SELECT id FROM example_sentences
             WHERE instr(japanese, ?) > 0
             ORDER BY length(japanese), id LIMIT 100
           SQL
         end
  rows.each_with_index.to_h { |row, index| [row.fetch("id"), index + 1] }
end

def lexical_relation(query, language, japanese, english)
  if language == "ja"
    japanese.include?(query) ? "exact-japanese-surface" : "japanese-written-or-conjugation-family"
  else
    literal = query.downcase.gsub(/[^[:alnum:]']+/, " ").strip
    english.downcase.include?(literal) ? "normalized-literal-surface" : "sqlite-fts4-porter-phrase-candidate"
  end
end

corpus_rows = db.execute("SELECT id, japanese, english FROM example_sentences").to_h { |row| [row.fetch("id"), row] }
english_group_sizes = corpus_rows.keys.each_with_object(Hash.new(0)) do |id, counts|
  counts[id.split(":", 3).fetch(2)] += 1
end
direct_rank_maps = CONTEXT.to_h do |context_id, (_type, query, language, _count, _kind, _exhaustive)|
  [context_id, direct_ranks(db, query, language)]
end

row_records = []

MANUAL_DIRECT_PAIRS.each do |context_id, pairs|
  meta = CONTEXT.fetch(context_id)
  ranks = direct_rank_maps.fetch(context_id)
  pairs.each_with_index do |pair_id, index|
    rank = index + 1
    corpus = corpus_rows.fetch(pair_id)
    japanese_id, english_id = pair_id.split(":", 3).drop(1)
    frame = MANUAL_FRAME_RANGES.fetch(context_id).find { |start_rank, end_rank, _frame| (start_rank..end_rank).cover?(rank) }.fetch(2)
    filename = if frame == "overlap"
                 "D05-thank-you-rank14-16-overlap.png"
               else
                 format("%s-%02d.png", MANUAL_FILE_STEMS.fetch(context_id), frame)
               end
    evidence = file_fact(evidence147, filename, "issue-147")
    row_records << {
      context_id: context_id,
      rank: rank,
      captured_at: evidence[:captured_at],
      environment: "Nihongo-1.34.3-9792-iPhone17ProMax-iOS26.6",
      pointer: evidence[:pointer], sha256: evidence[:sha256],
      japanese: corpus.fetch("japanese"), english: corpus.fetch("english"),
      japanese_id: japanese_id, english_id: english_id,
      zenbu_present: ranks.key?(pair_id).to_s, zenbu_rank: ranks[pair_id] || "",
      lexical_relation: lexical_relation(meta[1], meta[2], corpus.fetch("japanese"), corpus.fetch("english")),
      general_japanese: "true", general_english: "true", direct_link: "true",
      japanese_indices: indices.key?(japanese_id).to_s,
      duplicate_group: "english:#{english_id}", duplicate_group_size: english_group_sizes.fetch(english_id),
      observation_source: "issue-147-direct-transcription"
    }
  end
end

ISSUE148_PAIRS.each do |context_id, pairs|
  evidence = file_fact(evidence148, ISSUE148_FILES.fetch(context_id), "issue-148")
  meta = CONTEXT.fetch(context_id)
  ranks = direct_rank_maps.fetch(context_id)
  pairs.each_with_index do |pair_id, index|
    corpus = corpus_rows.fetch(pair_id)
    japanese_id, english_id = pair_id.split(":", 3).drop(1)
    row_records << {
      context_id: context_id, rank: index + 1, captured_at: evidence[:captured_at],
      environment: "Nihongo-1.34.3-9792-iPhone17ProMax-iOS26.6",
      pointer: evidence[:pointer], sha256: evidence[:sha256],
      japanese: corpus.fetch("japanese"), english: corpus.fetch("english"),
      japanese_id: japanese_id, english_id: english_id,
      zenbu_present: ranks.key?(pair_id).to_s, zenbu_rank: ranks[pair_id] || "",
      lexical_relation: lexical_relation(meta[1], meta[2], corpus.fetch("japanese"), corpus.fetch("english")),
      general_japanese: "true", general_english: "true", direct_link: "true",
      japanese_indices: indices.key?(japanese_id).to_s,
      duplicate_group: "english:#{english_id}", duplicate_group_size: english_group_sizes.fetch(english_id),
      observation_source: "issue-148-de8164e"
    }
  end
end

consolidated = CSV.read(consolidated_path, headers: true, col_sep: "\t")
consolidated.each do |row|
  context_id = row.fetch("context_id")
  next if context_id <= "D05" || row.fetch("rank").to_i > 20
  meta = CONTEXT.fetch(context_id)
  page = row.fetch("first_page").to_i
  filename = context_id == "D12" ? format("D12-examples-%02d.jpeg", page) : format("%s-exhaustive-page-%03d.jpeg", context_id, page)
  evidence = file_fact(evidence147, filename, "issue-147")
  pair_id = row.fetch("pair_id")
  japanese_id, english_id = pair_id.split(":", 3).drop(1)
  ranks = direct_rank_maps.fetch(context_id)
  row_records << {
    context_id: context_id, rank: row.fetch("rank"), captured_at: evidence[:captured_at],
    environment: "Nihongo-1.34.3-9792-iPhone17ProMax-iOS26.6",
    pointer: evidence[:pointer], sha256: evidence[:sha256],
    japanese: row.fetch("japanese"), english: row.fetch("english"),
    japanese_id: japanese_id, english_id: english_id,
    zenbu_present: ranks.key?(pair_id).to_s, zenbu_rank: ranks[pair_id] || "",
    lexical_relation: lexical_relation(meta[1], meta[2], row.fetch("japanese"), row.fetch("english")),
    general_japanese: "true", general_english: "true", direct_link: "true",
    japanese_indices: indices.key?(japanese_id).to_s,
    duplicate_group: "english:#{english_id}", duplicate_group_size: english_group_sizes.fetch(english_id),
    observation_source: "issue-147-capture-ocr-#{row.fetch('confidence')}-#{row.fetch('match_score')}"
  }
end

D20_PAIRS.each_with_index do |pair_id, index|
  evidence = file_fact(evidence147, format("D20-examples-%02d-valid.jpeg", index), "issue-147")
  corpus = corpus_rows.fetch(pair_id)
  japanese_id, english_id = pair_id.split(":", 3).drop(1)
  ranks = direct_rank_maps.fetch("D20")
  row_records << {
    context_id: "D20", rank: index + 1, captured_at: evidence[:captured_at],
    environment: "Nihongo-1.34.3-9792-iPhone17ProMax-iOS26.6",
    pointer: evidence[:pointer], sha256: evidence[:sha256],
    japanese: corpus.fetch("japanese"), english: corpus.fetch("english"),
    japanese_id: japanese_id, english_id: english_id,
    zenbu_present: ranks.key?(pair_id).to_s, zenbu_rank: ranks[pair_id] || "",
    lexical_relation: lexical_relation("ねこ", "ja", corpus.fetch("japanese"), corpus.fetch("english")),
    general_japanese: "true", general_english: "true", direct_link: "true",
    japanese_indices: indices.key?(japanese_id).to_s,
    duplicate_group: "english:#{english_id}", duplicate_group_size: english_group_sizes.fetch(english_id),
    observation_source: "issue-147-direct-transcription"
  }
end

row_records.sort_by! { |row| [row[:context_id], row[:rank].to_i] }
row_counts = row_records.group_by { |row| row[:context_id] }.transform_values(&:length)

CSV.open(contexts_output, "w", col_sep: "\t", row_sep: "\n", force_quotes: false) do |csv|
  csv << %w[context_id phase context_type query_or_entry language reference_version environment captured_at_start captured_at_end private_evidence_start_pointer private_evidence_start_sha256 private_evidence_terminal_pointer private_evidence_terminal_sha256 count_value count_kind captured_row_count exhaustive terminal_evidence zenbu_baseline]
  CONTEXT.each do |context_id, (type, query, language, count_value, count_kind, exhaustive)|
    if context_id <= "D05"
      start_fact = file_fact(evidence147, ROOT_FILES.fetch(context_id), "issue-147")
      end_fact = file_fact(evidence147, TERMINAL_FILES.fetch(context_id), "issue-147")
      terminal = "displayed-count-plus-ordered-top-20"
    elsif context_id <= "D11"
      fact = file_fact(evidence148, ISSUE148_FILES.fetch(context_id), "issue-148")
      start_fact = end_fact = fact
      terminal = exhaustive ? "exact-count-screen" : "not-proven"
    else
      start_fact = file_fact(evidence147, ROOT_FILES.fetch(context_id), "issue-147")
      end_fact = file_fact(evidence147, TERMINAL_FILES.fetch(context_id), "issue-147")
      terminal = exhaustive ? "exact-count-plus-all-rows" : "displayed-count-plus-ordered-top-20"
    end
    csv << [context_id, "discovery", type, query, language, "Nihongo-1.34.3-9792", "iPhone17ProMax-iOS26.6",
            start_fact[:captured_at], end_fact[:captured_at], start_fact[:pointer], start_fact[:sha256],
            end_fact[:pointer], end_fact[:sha256], count_value, count_kind, row_counts.fetch(context_id, 0),
            exhaustive, terminal, "Zenbu-140b194"]
  end
end

CSV.open(rows_output, "w", col_sep: "\t", row_sep: "\n", force_quotes: false) do |csv|
  csv << %w[context_id rank captured_at environment private_evidence_pointer evidence_sha256 japanese english japanese_id english_id zenbu_present_pre zenbu_rank_pre lexical_relation general_japanese general_english direct_link japanese_indices duplicate_group duplicate_group_size observation_source]
  row_records.each do |row|
    csv << [row[:context_id], row[:rank], row[:captured_at], row[:environment], row[:pointer], row[:sha256],
            row[:japanese], row[:english], row[:japanese_id], row[:english_id], row[:zenbu_present], row[:zenbu_rank],
            row[:lexical_relation], row[:general_japanese], row[:general_english], row[:direct_link],
            row[:japanese_indices], row[:duplicate_group], row[:duplicate_group_size], row[:observation_source]]
  end
end

warn "wrote #{CONTEXT.length} contexts and #{row_records.length} visible rows"
