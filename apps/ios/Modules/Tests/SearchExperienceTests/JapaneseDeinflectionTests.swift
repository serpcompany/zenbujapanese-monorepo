import Testing
@testable import SearchExperience

@Suite("Japanese-script deinflection")
struct JapaneseDeinflectionTests {
  @Test("まけたら resolves to 負ける without the optional analysis pack")
  func maketara() async throws {
    let query = SearchQuery("まけたら")
    #expect(try await LookupClient.live.entryMatchingForm(query.value) == nil)
    let results = try await LookupClient.live.search(query)
    #expect(results.wasDeinflected)
    #expect(results.presentation == .ranked)
    #expect(results.entries.first?.headword == "負ける")
  }

  @Test(
    "common kana and kanji inflections lead with their dictionary form",
    arguments: [
      ("負けたら", "負ける"), ("まけた", "負ける"), ("たべなかった", "食べる"),
      ("食べさせられなかったら", "食べる"), ("見ている", "見る"),
      ("食べちゃった", "食べる"), ("食べよう", "食べる"),
      ("書いて", "書く"), ("泳いだ", "泳ぐ"), ("話しました", "話す"),
      ("待って", "待つ"), ("死んだ", "死ぬ"), ("呼んだら", "呼ぶ"), ("読みます", "読む"),
      ("帰った", "帰る"), ("買わない", "買う"), ("書けば", "書く"), ("飲みたい", "飲む"),
      ("書かれた", "書く"), ("行った", "行く"), ("書いちゃった", "書く"), ("読んじゃう", "読む"),
      ("来ます", "来る"), ("こなかった", "来る"), ("しなかった", "する"),
      ("勉強した", "勉強"),
      ("高かった", "高い"), ("高くない", "高い"), ("たかくて", "高い"), ("高ければ", "高い"),
    ]
  )
  func inflections(query: String, headword: String) async throws {
    let results = try await LookupClient.live.search(SearchQuery(query))
    #expect(results.wasDeinflected, "\(query) was not deinflected")
    let leading = results.entries.prefix(results.leadingLexicalEntryCount).map(\.headword)
    #expect(leading.contains(headword), "\(query) led with \(leading), not \(headword)")
  }

  @Test(
    "an inflection that is also a dictionary word keeps it first, then its lemmas",
    arguments: [
      ("きた", "来る"), ("こない", "来る"), ("した", "する"), ("食べられる", "食べる"),
      ("かって", "買う"), ("かって", "勝つ"), ("いって", "行く"), ("いって", "言う"),
    ]
  )
  func exactWordThenLemma(query: String, lemma: String) async throws {
    let results = try await LookupClient.live.search(SearchQuery(query))
    #expect(!results.wasDeinflected)
    #expect(results.relevance(for: try #require(results.entries.first)).sourceOrder == 0)
    let entry = try #require(
      results.entries.first { $0.headword == lemma }, "\(query) omitted \(lemma)")
    #expect(results.relevance(for: entry).sourceOrder == 1, "\(lemma) not after exact matches")
  }

  @Test("ambiguous kana offers every matching verb in the leading group")
  func ambiguousKana() async throws {
    let results = try await LookupClient.live.search(SearchQuery("よんだら"))
    #expect(results.wasDeinflected)
    let leading = Set(results.entries.prefix(results.leadingLexicalEntryCount).map(\.headword))
    #expect(leading.isSuperset(of: ["読む", "呼ぶ"]))
  }

  @Test(
    "exact dictionary forms keep direct results",
    arguments: ["いる", "負け", "負ける", "見る", "静"]
  )
  func dictionaryFormsStayDirect(query: String) async throws {
    let results = try await LookupClient.live.search(SearchQuery(query))
    #expect(!results.wasDeinflected)
  }

  @Test("candidate chains carry the word class the base must have")
  func candidateWordClasses() {
    let candidates = JapaneseDeinflector.candidates(for: "まけたら")
    #expect(candidates.contains { $0.term == "まける" && $0.wordClasses.contains(.ichidan) })
    #expect(candidates.allSatisfy { $0.term != "まけたら" })

    let chained = JapaneseDeinflector.candidates(for: "食べさせられなかったら")
    #expect(chained.contains { $0.term == "食べる" && $0.wordClasses.contains(.ichidan) })
  }

  @Test("word classes only accept matching dictionary parts of speech")
  func wordClassAcceptance() {
    #expect(JapaneseWordClass.ichidan.accepts([.ichidanVerb]))
    #expect(!JapaneseWordClass.ichidan.accepts([.noun]))
    #expect(JapaneseWordClass.godan.accepts([.godanVerb]))
    #expect(JapaneseWordClass.iAdjective.accepts([.iAdjective]))
    #expect(JapaneseWordClass.suruNoun.accepts([.noun, .takesSuru, .transitive]))
    #expect(!JapaneseWordClass.suruNoun.accepts([.noun, .transitive]))
  }
}
