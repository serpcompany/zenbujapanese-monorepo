import Foundation
import JavaScriptCore

enum DictionaryCoreError: Error, Equatable {
  case bundleUnavailable
  case failed(String)
}

final class DictionaryCore {
  private let context: JSContext
  private let endpoint: JSValue

  init(statements: SQLiteStatements) throws {
    guard
      let url = Bundle.module.url(
        forResource: "dictionary-core", withExtension: "js", subdirectory: "DictionaryCore")
        ?? Bundle.module.url(forResource: "dictionary-core", withExtension: "js"),
      let source = try? String(contentsOf: url, encoding: .utf8),
      let context = JSContext(),
      let host = JSValue(newObjectIn: context)
    else { throw DictionaryCoreError.bundleUnavailable }
    let rows = SQLiteJSONRows(statements: statements)
    let all: @convention(block) (String, String) -> String = { sql, parametersJSON in
      rows.answer(sql, parametersJSON: parametersJSON)
    }
    let interrupted: @convention(block) () -> Bool = { Task<Never, Never>.isCancelled }
    host.setObject(all, forKeyedSubscript: "all" as NSString)
    host.setObject(interrupted, forKeyedSubscript: "interrupted" as NSString)
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

  func begin(_ method: String, _ argument: String) throws -> DictionaryCoreCall {
    let call = try returned(endpoint.invokeMethod("begin", withArguments: [method, argument]))
    return DictionaryCoreCall(call: call, core: self)
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

final class DictionaryCoreCall {
  enum Step<Value> {
    case finished(Value)
    case analyzing(String)
  }

  private struct Outcome<Value: Decodable>: Decodable {
    let value: Value?
    let analyze: String?
    let error: String?
  }

  private let call: JSValue
  private let core: DictionaryCore

  fileprivate init(call: JSValue, core: DictionaryCore) {
    self.call = call
    self.core = core
  }

  func step<Value: Decodable>(_ type: Value.Type) throws -> Step<Value> {
    let json = try core.returned(call.invokeMethod("outcome", withArguments: [])).toString() ?? ""
    let outcome = try JSONDecoder().decode(Outcome<Value>.self, from: Data(json.utf8))
    if let value = outcome.value { return .finished(value) }
    if let text = outcome.analyze { return .analyzing(text) }
    throw DictionaryCoreError.failed(outcome.error ?? "The dictionary core answered nothing")
  }

  func analyzed(_ answerJSON: String) throws {
    _ = try core.returned(call.invokeMethod("analyzed", withArguments: [answerJSON]))
  }
}

struct DictionaryCoreSearchResults: Decodable, Sendable {
  struct Item: Decodable, Sendable {
    let id: String
    let relevance: Int
    let fallbackOrder: Int
    let matchedSummary: String?
    let match: String
  }

  let items: [Item]
  let leadingLexicalEntryCount: Int
  let presentation: LookupSearchResults.Presentation
  let resolution: LookupSearchResults.Resolution
  let readingRefinement: String?
  let usesPrimaryEntryExamples: Bool
}

struct DictionaryLinkCandidate: Decodable, Equatable, Sendable {
  let id: String
  let reading: String
  let partsOfSpeech: [PartOfSpeech]
}

extension DictionaryLinkCandidate {
  init(_ entry: DictionaryEntry) {
    self.init(id: entry.id.rawValue, reading: entry.reading, partsOfSpeech: entry.partsOfSpeech)
  }
}

struct DictionaryCoreAnalysis: Encodable {
  struct Word: Encodable {
    let surface: String
    let dictionaryForm: String
    let partOfSpeech: [String]
    let isOutOfVocabulary: Bool
  }

  let words: [Word]

  init(_ analysis: JapaneseMorphologyAnalysis) {
    words = analysis.candidates.map {
      Word(
        surface: $0.surface,
        dictionaryForm: $0.dictionaryForm,
        partOfSpeech: $0.partOfSpeech,
        isOutOfVocabulary: $0.isOutOfVocabulary
      )
    }
  }
}
