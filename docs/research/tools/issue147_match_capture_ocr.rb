#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"
require "sqlite3"
require "unicode_normalize/normalize"

abort "usage: #{$PROGRAM_NAME} OCR_DIR CORPUS_DB OUTPUT_TSV [CONSOLIDATED_TSV [CORRECTIONS_TSV]]" unless (3..5).cover?(ARGV.length)

ocr_dir, corpus_path, output_path, consolidated_path, corrections_path = ARGV

CONTEXTS = {
  "D01" => [:fts, "cave"],
  "D02" => [:fts, "cat"],
  "D03" => [:fts, "eat"],
  "D04" => [:fts, "beautiful"],
  "D05" => [:fts, "thank you"],
  "D12" => [:fts, "scatter"],
  "D13" => [:fts, "education"],
  "D14" => [:fts, "great"],
  "D15" => [:fts, "neat"],
  "D16" => [:fts, "quickly"],
  "D17" => [:fts, "cat"],
  "D18" => [:japanese_surface, "食べ"],
  "D19" => [:japanese_surface, "食べ"]
}.freeze

def english_normalize(text)
  text.unicode_normalize(:nfkc)
      .downcase
      .tr("’‘", "''")
      .gsub(/[^[:alnum:]']+/, " ")
      .gsub(/\s+/, " ")
      .strip
end

def japanese_normalize(text)
  text.unicode_normalize(:nfkc).gsub(/[^\p{Han}\p{Hiragana}\p{Katakana}ー]/, "")
end

def fuzzy_match(sentence, ocr)
  tokens = sentence.split.reject { |token| token.length == 1 }
  return nil if tokens.length < 4

  positions = tokens.map { |token| (position = ocr.index(token)) && [token, position] }.compact
  coverage = positions.sum { |token, _position| token.length }.fdiv(tokens.sum(&:length))
  return nil if coverage < 0.84

  [coverage, positions.map(&:last).min]
end

def english_segments(raw_ocr)
  segments = []
  current = []

  raw_ocr.each_line do |line|
    stripped = line.strip
    letters = stripped.scan(/[A-Za-z]/).length
    ascii_like = letters >= 2 && letters.fdiv([stripped.length, 1].max) >= 0.45

    if ascii_like
      current << stripped
    elsif current.any?
      segments << english_normalize(current.join(" "))
      current = []
    end
  end
  segments << english_normalize(current.join(" ")) if current.any?
  segments.reject { |segment| segment.empty? || segment.match?(/\A(search|view|best matches|additional matches)\b/) }
end

def trigrams(text)
  padded = "  #{text}  "
  (0..padded.length - 3).map { |index| padded[index, 3] }
end

def text_analysis(text)
  grams = trigrams(text)
  {
    text: text,
    grams: grams,
    gram_counts: grams.each_with_object(Hash.new(0)) { |gram, counts| counts[gram] += 1 },
    tokens: text.split.uniq
  }
end

def segment_score(segment, sentence)
  return 1.0 if segment[:text] == sentence[:text]

  overlap = segment[:gram_counts].sum { |gram, count| [count, sentence[:gram_counts][gram]].min }
  dice = (2.0 * overlap) / (segment[:grams].length + sentence[:grams].length)
  token_overlap = (segment[:tokens] & sentence[:tokens]).length.fdiv([sentence[:tokens].length, 1].max)
  (0.75 * dice) + (0.25 * token_overlap)
end

def japanese_coverage(sentence, ocr)
  return 0.0 if sentence.length < 4

  grams = sentence.chars.each_cons(2).map(&:join).uniq
  grams.count { |gram| ocr.include?(gram) }.fdiv([grams.length, 1].max)
end

db = SQLite3::Database.new(corpus_path)
db.results_as_hash = true
db.execute("CREATE VIRTUAL TABLE temp.capture_english_fts USING fts4(id, english, tokenize=porter)")
db.execute("INSERT INTO temp.capture_english_fts SELECT id, english FROM main.example_sentences")

rows = []

CONTEXTS.each do |context_id, (mode, query)|
  candidates = case mode
               when :fts
                 db.execute(<<~SQL, query)
                   SELECT e.id, e.japanese, e.english
                   FROM temp.capture_english_fts f
                   JOIN main.example_sentences e ON e.id = f.id
                   WHERE capture_english_fts MATCH ?
                 SQL
               when :japanese_surface
                 db.execute(
                   "SELECT id, japanese, english FROM main.example_sentences WHERE japanese LIKE ?",
                   "%#{query}%"
                 )
               end
  candidate_analyses = candidates.map { |candidate| [candidate, text_analysis(english_normalize(candidate["english"]))] }

  Dir.glob(File.join(ocr_dir, "#{context_id}-exhaustive-page-*.txt")).sort.each do |ocr_path|
    page = File.basename(ocr_path)[/page-(\d+)/, 1].to_i
    raw_ocr = File.read(ocr_path, encoding: "UTF-8")
    english_ocr = english_normalize(raw_ocr)
    japanese_ocr = japanese_normalize(raw_ocr)
    segments = english_segments(raw_ocr)

    candidates.each do |candidate|
      english = english_normalize(candidate["english"])
      japanese = japanese_normalize(candidate["japanese"])
      exact_segment_index = segments.index(english)
      exact_position = exact_segment_index && (exact_segment_index * 100)

      if exact_position
        match_type = if japanese_ocr.include?(japanese)
                       "exact-en-ja"
                     elsif japanese_coverage(japanese, japanese_ocr) >= 0.72
                       "exact-en-fuzzy-ja"
                     else
                       "exact-en"
                     end
        rows << [context_id, page, exact_position, match_type, "1.000", candidate["id"], candidate["japanese"], candidate["english"]]
        next
      end

      fuzzy = fuzzy_match(english, english_ocr)
      next unless fuzzy

      score, position = fuzzy
      rows << [context_id, page, position, "fuzzy-en", format("%.3f", score), candidate["id"], candidate["japanese"], candidate["english"]]
    end


    segments.each_with_index do |segment, segment_index|
      segment_analysis = text_analysis(segment)
      best = candidate_analyses.map do |candidate, candidate_analysis|
        [segment_score(segment_analysis, candidate_analysis), candidate]
      end.max_by(&:first)
      next unless best && best[0] >= 0.45

      score, candidate = best
      rows << [context_id, page, segment_index * 100, "segment-best-en", format("%.3f", score), candidate["id"], candidate["japanese"], candidate["english"]]
    end
  end
end

CSV.open(output_path, "w", col_sep: "\t", row_sep: "\n", force_quotes: false) do |csv|
  csv << %w[context_id page position match_type score pair_id japanese english]
  rows.sort_by { |row| [row[0], row[1], row[2], row[5]] }.each { |row| csv << row }
end

warn "wrote #{rows.length} OCR candidate matches to #{output_path}"

if consolidated_path
  accepted = rows.select { |row| row[3].start_with?("exact-") || row[3] == "segment-best-en" }
  grouped = accepted.group_by { |row| [row[0], row[5]] }

  # When identical English text has multiple Japanese links, Japanese OCR is
  # the discriminator. Otherwise retain the ambiguity for manual review.
  by_english = grouped.group_by { |(_context_id, _pair_id), matches| [matches.first[0], english_normalize(matches.first[7])] }
  selected = by_english.flat_map do |_key, pair_groups|
    japanese_exact = pair_groups.select do |_pair_key, matches|
      matches.any? { |row| ["exact-en-ja", "exact-en-fuzzy-ja"].include?(row[3]) }
    end
    japanese_exact.empty? ? pair_groups : japanese_exact
  end

  consolidated = selected.map do |(context_id, pair_id), matches|
    first = matches.min_by { |row| [row[1], row[2]] }
    pages = matches.map { |row| row[1] }.uniq.sort
    confidence = if matches.any? { |row| row[3] == "exact-en-ja" }
                   "exact-en-ja"
                 elsif matches.any? { |row| row[3] == "exact-en-fuzzy-ja" }
                   "exact-en-fuzzy-ja"
                 elsif matches.any? { |row| row[3] == "exact-en" }
                   "exact-en"
                 else
                   "segment-best-en"
                 end
    best_score = matches.map { |row| row[4].to_f }.max
    [context_id, nil, first[1], first[2], pages.last, pages.length, format("%.3f", best_score), confidence,
     pair_id, first[6], first[7]]
  end

  if corrections_path
    CSV.read(corrections_path, headers: true, col_sep: "\t").each do |correction|
      index = consolidated.index { |row| row[0] == correction.fetch("context_id") && row[8] == correction.fetch("pair_id") }
      raise "missing correction target #{correction['context_id']} #{correction['pair_id']}" unless index

      case correction.fetch("action")
      when "remove"
        consolidated.delete_at(index)
      when "replace"
        replacement_id = correction.fetch("replacement_pair_id")
        replacement = db.get_first_row("SELECT id, japanese, english FROM example_sentences WHERE id = ?", replacement_id)
        raise "missing replacement #{replacement_id}" unless replacement

        consolidated[index][2] = correction.fetch("first_page").to_i
        consolidated[index][3] = correction.fetch("first_position").to_i
        consolidated[index][4] = correction.fetch("first_page").to_i
        consolidated[index][5] = 1
        consolidated[index][6] = "1.000"
        consolidated[index][7] = "manual-visual-correction"
        consolidated[index][8] = replacement.fetch("id")
        consolidated[index][9] = replacement.fetch("japanese")
        consolidated[index][10] = replacement.fetch("english")
      else
        raise "unknown correction action #{correction['action']}"
      end
    end
  end

  CSV.open(consolidated_path, "w", col_sep: "\t", row_sep: "\n", force_quotes: false) do |csv|
    csv << %w[context_id rank first_page first_position last_page seen_page_count match_score confidence pair_id japanese english]
    consolidated.group_by(&:first).sort.each do |_context_id, context_rows|
      context_rows.sort_by! { |row| [row[2], row[3], row[8]] }
      context_rows.each_with_index do |row, index|
        row[1] = index + 1
        csv << row
      end
    end
  end
  warn "wrote #{consolidated.length} consolidated rows to #{consolidated_path}"
end
