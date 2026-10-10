import Foundation
import JavaScriptCore

enum DictionaryCoreError: Error, Equatable {
  case bundleUnavailable
  case failed(String)
}

final class DictionaryCore {
  private let context: JSContext
  private let endpoint: JSValue

  init(
    statements: SQLiteStatements? = nil,
    kanji: (@Sendable () -> KanjiFiles?)? = nil
  ) throws {
    guard
      let url = Bundle.module.url(
        forResource: "dictionary-core", withExtension: "js", subdirectory: "DictionaryCore")
        ?? Bundle.module.url(forResource: "dictionary-core", withExtension: "js"),
      let source = try? String(contentsOf: url, encoding: .utf8),
      let context = JSContext(),
      let host = JSValue(newObjectIn: context)
    else { throw DictionaryCoreError.bundleUnavailable }
    if let statements {
      let rows = SQLiteJSONRows(statements: statements)
      let all: @convention(block) (String, String) -> JSValue? = { sql, parametersJSON in
        var json = rows.answer(sql, parametersJSON: parametersJSON)
        return json.withNulTerminatedUTF8 { JSValue.parsing($0) }
      }
      let interrupted: @convention(block) () -> Bool = { Task<Never, Never>.isCancelled }
      host.setObject(all, forKeyedSubscript: "all" as NSString)
      host.setObject(interrupted, forKeyedSubscript: "interrupted" as NSString)
    }
    if let kanji {
      Self.answer(host, "kanjiSources") { _ in kanji()?.sources }
      Self.answer(host, "kanjiEntry") { kanji()?.entry($0) }
      Self.answer(host, "kanjiStructure") { kanji()?.structure($0) }
      Self.answer(host, "kanjiElement") { kanji()?.element($0) }
    }
    context.setObject(host, forKeyedSubscript: "zenbuHost" as NSString)
    context.evaluateScript(source, withSourceURL: url)
    guard context.exception == nil,
      let endpoint = context.objectForKeyedSubscript("zenbuDictionary"), endpoint.isObject
    else {
      throw DictionaryCoreError.failed(
        context.exception?.toString() ?? "The dictionary core did not load")
    }
    self.context = context
    self.endpoint = endpoint
  }

  private static func answer(
    _ host: JSValue, _ name: String, with record: @escaping (String) -> [UInt8]?
  ) {
    let function: @convention(block) (String) -> JSValue? = { argument in
      record(argument)?.withUnsafeBufferPointer { json in
        json.withMemoryRebound(to: CChar.self) { $0.baseAddress.flatMap(JSValue.parsing) }
      }
    }
    host.setObject(function, forKeyedSubscript: name as NSString)
  }

  func installKuromoji() throws {
    try autoreleasepool {
      try KuromojiEngine.install(in: context)
      context.evaluateScript(
        "zenbuHost.tokenize = text => __zenbuKuromojiTokenizer.tokenize(text);")
      _ = try returned(endpoint)
    }
  }

  func begin(_ method: String, _ argument: String) throws -> DictionaryCoreCall {
    try autoreleasepool {
      let call = try returned(endpoint.invokeMethod("begin", withArguments: [method, argument]))
      return DictionaryCoreCall(call: call, core: self)
    }
  }

  func answer<Answer: Decodable>(_ method: String, _ argument: String) throws -> Answer {
    switch try begin(method, argument).step(Answer.self) {
    case .finished(let answer): return answer
    case .analyzing: throw DictionaryCoreError.failed("\(method) asked for an analysis")
    }
  }

  func answer<Answer: Decodable>(
    _ method: String, _ argument: String, analyzingWith morphology: JapaneseMorphologyClient?,
    isolation: isolated (any Actor)? = #isolation
  ) async throws -> Answer {
    do {
      let call = try begin(method, argument)
      while true {
        switch try call.step(Answer.self) {
        case .finished(let answer):
          try Task<Never, Never>.checkCancellation()
          return answer
        case .analyzing(let text):
          try call.analyzed(await DictionaryCoreAnalysis.json(of: text, by: morphology))
        }
      }
    } catch {
      try Task<Never, Never>.checkCancellation()
      throw error
    }
  }

  fileprivate func returned(_ value: JSValue?) throws -> JSValue {
    if let exception = context.exception {
      context.exception = nil
      throw DictionaryCoreError.failed(exception.toString() ?? "The dictionary core failed")
    }
    guard let value else { throw DictionaryCoreError.failed("The dictionary core is gone") }
    return value
  }
}

extension JSValue {
  fileprivate static func parsing(_ nulTerminatedUTF8: UnsafePointer<CChar>) -> JSValue? {
    guard let context = JSContext.current(),
      let text = JSStringCreateWithUTF8CString(nulTerminatedUTF8)
    else { return nil }
    defer { JSStringRelease(text) }
    return JSValueMakeFromJSONString(context.jsGlobalContextRef, text)
      .map { JSValue(jsValueRef: $0, in: context) }
  }
}

final class DictionaryCoreCall {
  enum Step<Value> {
    case finished(Value)
    case analyzing(String)
  }

  private struct Outcome<Value: Decodable>: Decodable {
    let value: Value?
    let analyze: String?
    let error: String?

    private enum CodingKeys: String, CodingKey {
      case value
      case analyze
      case error
    }

    init(from decoder: Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      value = container.contains(.value) ? try container.decode(Value.self, forKey: .value) : nil
      analyze = try container.decodeIfPresent(String.self, forKey: .analyze)
      error = try container.decodeIfPresent(String.self, forKey: .error)
    }
  }

  private let call: JSValue
  private let core: DictionaryCore

  fileprivate init(call: JSValue, core: DictionaryCore) {
    self.call = call
    self.core = core
  }

  func step<Value: Decodable>(_ type: Value.Type) throws -> Step<Value> {
    let json = try autoreleasepool {
      try core.returned(call.invokeMethod("outcome", withArguments: [])).toString() ?? ""
    }
    let outcome = try JSONDecoder().decode(Outcome<Value>.self, from: Data(json.utf8))
    if let value = outcome.value { return .finished(value) }
    if let text = outcome.analyze { return .analyzing(text) }
    throw DictionaryCoreError.failed(outcome.error ?? "The dictionary core answered nothing")
  }

  func analyzed(_ answerJSON: String) throws {
    try autoreleasepool {
      _ = try core.returned(call.invokeMethod("analyzed", withArguments: [answerJSON]))
    }
  }
}

struct DictionaryCoreSearchResults: Codable, Sendable {
  struct Item: Codable, Sendable {
    let id: String
    let entSeq: Int
    let headword: String
    let reading: String
    let entrySummary: String
    let matchedSummary: String?
    let relevance: Int
    let fallbackOrder: Int
    let match: String
  }

  let items: [Item]
  let leadingLexicalEntryCount: Int
  let presentation: LookupSearchResults.Presentation
  let resolution: LookupSearchResults.Resolution
  let readingRefinement: String?
  let usesPrimaryEntryExamples: Bool
  let primaryEntry: String?
}

struct DictionaryLinkCandidate: Decodable, Sendable {
  let id: String
}

struct DictionaryCoreAnalysis: Encodable {
  struct Word: Encodable {
    let surface: String
    let dictionaryForm: String
    let normalizedForm: String
    let reading: String
    let partOfSpeech: [String]
    let isOutOfVocabulary: Bool
    let children: [Word]

    init(_ candidate: JapaneseMorphologyCandidate) {
      surface = candidate.surface
      dictionaryForm = candidate.dictionaryForm
      normalizedForm = candidate.normalizedForm
      reading = candidate.reading
      partOfSpeech = candidate.partOfSpeech
      isOutOfVocabulary = candidate.isOutOfVocabulary
      children = candidate.children.map(Word.init)
    }
  }

  let words: [Word]

  init(_ analysis: JapaneseMorphologyAnalysis) {
    words = analysis.candidates.map(Word.init)
  }

  static func json(of text: String, by morphology: JapaneseMorphologyClient?) async -> String {
    guard let analysis = try? await morphology?.analyze(text),
      let json = try? JSONEncoder().encode(DictionaryCoreAnalysis(analysis))
    else { return #"{"error":"The text could not be analyzed"}"# }
    return String(decoding: json, as: UTF8.self)
  }
}
