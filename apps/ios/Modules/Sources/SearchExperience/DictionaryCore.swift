import Foundation
import JavaScriptCore

enum DictionaryCoreError: Error, Equatable {
  case bundleUnavailable
  case failed(String)
}

final class DictionaryCore {
  private let context: JSContext
  private let endpoint: JSValue
  private let answerNow: JSValue
  private let answerNowJSON: JSValue

  init(
    statements: SQLiteStatements? = nil,
    kanji: (@Sendable () -> KanjiFiles?)? = nil,
    radicals: (@Sendable () -> [UInt8]?)? = nil,
    tokenizerFile: (@Sendable (String) -> InflatedBytes?)? = nil,
    frequencyLists: FrequencyListReading? = nil
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
      Self.answer(host, "kanjiReference") { _ in kanji()?.wholeReference() }
    }
    if let radicals {
      Self.answer(host, "radicals") { _ in radicals() }
    }
    if let frequencyLists {
      Self.answer(host, "frequencyLists") { _ in frequencyLists.lists() }
      let listRows: @convention(block) (String, String, String) -> JSValue? = {
        list, sql, parametersJSON in
        var json = frequencyLists.rows(list, sql, parametersJSON)
        return json.withNulTerminatedUTF8 { JSValue.parsing($0) }
      }
      host.setObject(listRows, forKeyedSubscript: "frequencyListRows" as NSString)
    }
    if let tokenizerFile {
      let unpacked: @convention(block) (String) -> JSValue? = { file in
        guard let context = JSContext.current(), let bytes = tokenizerFile(file) else { return nil }
        guard
          let buffer = JSObjectMakeArrayBufferWithBytesNoCopy(
            context.jsGlobalContextRef, bytes.pointer, bytes.count, { bytes, _ in free(bytes) },
            nil, nil)
        else {
          free(bytes.pointer)
          return nil
        }
        return JSValue(jsValueRef: buffer, in: context)
      }
      host.setObject(unpacked, forKeyedSubscript: "tokenizerFile" as NSString)
    }
    context.setObject(host, forKeyedSubscript: "zenbuHost" as NSString)
    context.evaluateScript(source, withSourceURL: url)
    guard context.exception == nil,
      let endpoint = context.objectForKeyedSubscript("zenbuDictionary"), endpoint.isObject,
      let answerNow = endpoint.objectForKeyedSubscript("answer"), answerNow.isObject,
      let answerNowJSON = endpoint.objectForKeyedSubscript("answerJSON"), answerNowJSON.isObject
    else {
      throw DictionaryCoreError.failed(
        context.exception?.toString() ?? "The dictionary core did not load")
    }
    self.context = context
    self.endpoint = endpoint
    self.answerNow = answerNow
    self.answerNowJSON = answerNowJSON
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

  static func argument(_ value: some Encodable) throws -> String {
    String(decoding: try JSONEncoder().encode(value), as: UTF8.self)
  }

  func begin(_ method: String, _ argument: String) throws -> DictionaryCoreCall {
    try autoreleasepool {
      let call = try returned(endpoint.invokeMethod("begin", withArguments: [method, argument]))
      return DictionaryCoreCall(call: call, core: self)
    }
  }

  func answer<Answer: Decodable>(_ method: String, _ argument: String) throws -> Answer {
    let json = try asked(answerNowJSON, method, argument)
    guard let text = JSValueToStringCopy(context.jsGlobalContextRef, json, nil) else {
      throw DictionaryCoreError.failed("\(method) answered nothing")
    }
    defer { JSStringRelease(text) }
    var bytes = Data(count: JSStringGetMaximumUTF8CStringSize(text))
    let written = bytes.withUnsafeMutableBytes { buffer in
      JSStringGetUTF8CString(text, buffer.bindMemory(to: CChar.self).baseAddress, buffer.count)
    }
    bytes.count = max(written - 1, 0)
    return try JSONDecoder().decode(Answer.self, from: bytes)
  }

  func flag(_ method: String, _ argument: String) throws -> Bool {
    JSValueToBoolean(context.jsGlobalContextRef, try asked(answerNow, method, argument))
  }

  func text(_ method: String, _ argument: String) throws -> String? {
    let engine = context.jsGlobalContextRef
    let answer = try asked(answerNow, method, argument)
    guard JSValueIsString(engine, answer), let text = JSValueToStringCopy(engine, answer, nil)
    else { return nil }
    defer { JSStringRelease(text) }
    return String(
      decoding: UnsafeBufferPointer(
        start: JSStringGetCharactersPtr(text), count: JSStringGetLength(text)),
      as: UTF16.self)
  }

  private func asked(_ function: JSValue, _ method: String, _ argument: String) throws
    -> JSValueRef
  {
    let engine = context.jsGlobalContextRef
    let name = JSStringCreateWithUTF8CString(method)
    defer { JSStringRelease(name) }
    let text = Self.script(argument)
    defer { JSStringRelease(text) }
    var arguments = (JSValueMakeString(engine, name), JSValueMakeString(engine, text))
    var exception: JSValueRef?
    let answer = withUnsafePointer(to: &arguments) { pair in
      pair.withMemoryRebound(to: JSValueRef?.self, capacity: 2) {
        JSObjectCallAsFunction(engine, function.jsValueRef, nil, 2, $0, &exception)
      }
    }
    guard let answer, exception == nil else {
      let message = exception.flatMap { JSValue(jsValueRef: $0, in: context)?.toString() }
      throw DictionaryCoreError.failed(message ?? "The dictionary core failed")
    }
    return answer
  }

  private static func script(_ text: String) -> JSStringRef {
    let whole = text.withCString { utf8 in
      strlen(utf8) == text.utf8.count ? JSStringCreateWithUTF8CString(utf8) : nil
    }
    return whole ?? JSStringCreateWithCFString(text as CFString)
  }

  func answer<Answer: Decodable>(
    _ method: String, _ argument: String, analyzingWith morphology: JapaneseMorphologyClient?,
    isolation: isolated (any Actor)? = #isolation
  ) async throws -> Answer {
    try await finished(
      method, argument, as: Answer.self, analyzingWith: morphology, isolation: isolation
    ).answer
  }

  func answerAsWritten(
    _ method: String, _ argument: String, analyzingWith morphology: JapaneseMorphologyClient?,
    isolation: isolated (any Actor)? = #isolation
  ) async throws -> String {
    try await finished(
      method, argument, as: Unread.self, analyzingWith: morphology, isolation: isolation
    ).call.value()
  }

  private struct Unread: Decodable {
    init(from decoder: Decoder) {}
  }

  private func finished<Answer: Decodable>(
    _ method: String, _ argument: String, as answer: Answer.Type,
    analyzingWith morphology: JapaneseMorphologyClient?, isolation: isolated (any Actor)?
  ) async throws -> (answer: Answer, call: DictionaryCoreCall) {
    do {
      let call = try begin(method, argument)
      while true {
        switch try call.step(Answer.self) {
        case .finished(let answer):
          try Task<Never, Never>.checkCancellation()
          return (answer, call)
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

  func value() throws -> String {
    try autoreleasepool {
      try core.returned(call.invokeMethod("value", withArguments: [])).toString() ?? ""
    }
  }
}

struct FrequencyListReading: Sendable {
  let lists: @Sendable () -> [UInt8]?
  let rows: @Sendable (_ list: String, _ sql: String, _ parametersJSON: String) -> JSONBytes
}

struct DictionaryCoreSearchResults: Decodable, Sendable {
  struct Item: Decodable, Sendable {
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
      let words = try? DictionaryCore.argument(DictionaryCoreAnalysis(analysis))
    else { return #"{"error":"The text could not be analyzed"}"# }
    return words
  }
}
