#!/usr/bin/env ruby
# frozen_string_literal: true

require "sqlite3"

class InvalidQuery < StandardError; end

def bound_phrase(normalized_query)
  raise InvalidQuery, "empty" if normalized_query.empty?
  raise InvalidQuery, "non-ASCII" unless normalized_query.ascii_only?
  raise InvalidQuery, "embedded ASCII double quote" if normalized_query.include?('"')

  %Q{"#{normalized_query}"}
end

database = SQLite3::Database.new(":memory:")
database.execute("CREATE VIRTUAL TABLE examples USING fts4(english, tokenize=porter)")
[
  "A cat!",
  "A dog chased the cat.",
  "Don't stop.",
  "I didn't mean to scare you.",
  'She said "hello" to you.'
].each { |sentence| database.execute("INSERT INTO examples(english) VALUES (?)", sentence) }

search = lambda do |query|
  database.execute("SELECT english FROM examples WHERE examples MATCH ? ORDER BY rowid", bound_phrase(query)).flatten
end

raise "ordinary punctuation changed eligibility" unless search.call("cat!") == ["A cat!", "A dog chased the cat."]
raise "apostrophe changed eligibility" unless search.call("don't") == ["Don't stop."]
raise "Porter phrase expansion missing" unless search.call("scared you") == ["I didn't mean to scare you."]

begin
  search.call('said "hello"')
  raise "embedded quote was not rejected"
rescue InvalidQuery => error
  raise unless error.message == "embedded ASCII double quote"
end

legacy_doubled = %Q{"#{'said "hello"'.gsub('"', '""')}"}
legacy_rows = database.execute("SELECT english FROM examples WHERE examples MATCH ?", legacy_doubled).flatten
raise "legacy probe no longer demonstrates silent misretrieval" unless legacy_rows.empty?

puts "PASS ordinary_punctuation apostrophe porter bound_parameter typed_quote_rejection legacy_quote_doubling"
