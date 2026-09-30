import Foundation
import JavaScriptCore

enum KuromojiContract {
  static let engine = "kuromoji.js"
  static let engineVersion = "0.1.2"
  static let dictionary = "mecab-ipadic 2.7.0-20070801"
  static let dictionarySHA256 =
    "118a96f97fbfdafaa3c0b09204588034c1a6aeb0edf889f5d1b7c8376dab5c9e"
  static let dictionaryFiles = [
    "base.dat.gz", "cc.dat.gz", "check.dat.gz", "tid.dat.gz", "tid_map.dat.gz",
    "tid_pos.dat.gz", "unk.dat.gz", "unk_char.dat.gz", "unk_compat.dat.gz",
    "unk_invoke.dat.gz", "unk_map.dat.gz", "unk_pos.dat.gz",
  ]
}

extension JapaneseMorphologyClient {
  static let kuromoji = JapaneseMorphologyClient(
    availability: { await KuromojiMorphologyStore.shared.availability() },
    analyze: { text in try await KuromojiMorphologyStore.shared.analyze(text) }
  )
}

private actor KuromojiMorphologyStore {
  static let shared = KuromojiMorphologyStore()
  private var adapter: KuromojiJapaneseMorphologyAdapter?

  func availability() -> JapaneseTextAnalysisAvailability {
    do {
      _ = try preparedAdapter()
      return .full
    } catch {
      return .reduced
    }
  }

  func analyze(_ text: String) throws -> JapaneseMorphologyAnalysis {
    try Task.checkCancellation()
    let result = try preparedAdapter().analyze(text)
    try Task.checkCancellation()
    return result
  }

  private func preparedAdapter() throws -> KuromojiJapaneseMorphologyAdapter {
    if let adapter { return adapter }
    let prepared = try KuromojiJapaneseMorphologyAdapter()
    adapter = prepared
    return prepared
  }
}

private final class KuromojiJapaneseMorphologyAdapter: @unchecked Sendable {
  private let context: JSContext

  init() throws {
    guard let context = JSContext() else { throw JapaneseMorphologyError.packUnavailable }
    self.context = context
    context.exceptionHandler = { context, exception in context?.exception = exception }

    let loadDictionary: @convention(block) (String) -> JSValue? = { filename in
      guard KuromojiContract.dictionaryFiles.contains(filename),
        let url = Self.resourceURL(filename),
        let data = try? Data(contentsOf: url)
      else { return nil }
      let bytes = UnsafeMutableRawPointer.allocate(byteCount: data.count, alignment: 1)
      data.copyBytes(to: bytes.assumingMemoryBound(to: UInt8.self), count: data.count)
      var exception: JSValueRef?
      guard
        let buffer = JSObjectMakeArrayBufferWithBytesNoCopy(
          context.jsGlobalContextRef,
          bytes,
          data.count,
          releaseKuromojiArrayBuffer,
          nil,
          &exception
        )
      else {
        bytes.deallocate()
        return nil
      }
      return JSValue(jsValueRef: buffer, in: context)
    }
    context.setObject(
      loadDictionary,
      forKeyedSubscript: "__zenbuLoadKuromojiDictionary" as NSString
    )
    context.evaluateScript(Self.dictionaryLoaderSource)

    guard let sourceURL = Self.resourceURL("kuromoji.js"),
      let source = try? String(contentsOf: sourceURL, encoding: .utf8)
    else { throw JapaneseMorphologyError.packUnavailable }
    context.evaluateScript(source, withSourceURL: sourceURL)
    context.evaluateScript(Self.tokenizerInitializationSource)

    let error = context.objectForKeyedSubscript("__zenbuKuromojiError")
    guard error?.isNull != false,
      context.objectForKeyedSubscript("__zenbuKuromojiTokenizer")?.isObject == true
    else { throw JapaneseMorphologyError.providerContractMismatch }
  }

  func analyze(_ text: String) throws -> JapaneseMorphologyAnalysis {
    context.setObject(text, forKeyedSubscript: "__zenbuKuromojiInput" as NSString)
    guard
      let json = context.evaluateScript(
        "JSON.stringify(__zenbuKuromojiTokenizer.tokenize(__zenbuKuromojiInput))"
      )?.toString(),
      let data = json.data(using: .utf8),
      let tokens = try? JSONDecoder().decode([KuromojiToken].self, from: data)
    else { throw JapaneseMorphologyError.providerContractMismatch }

    var previousEnd = 0
    let candidates = try tokens.map { token in
      let utf16Range = NSRange(
        location: token.wordPosition - 1,
        length: (token.surfaceForm as NSString).length
      )
      guard let range = Range(utf16Range, in: text) else {
        throw JapaneseMorphologyError.invalidProviderRange
      }
      let scalarStart = text.unicodeScalars.distance(
        from: text.startIndex, to: range.lowerBound)
      let scalarEnd = text.unicodeScalars.distance(from: text.startIndex, to: range.upperBound)
      let scalarRange = scalarStart..<scalarEnd
      guard scalarRange.lowerBound == previousEnd,
        String(text[range]) == token.surfaceForm
      else { throw JapaneseMorphologyError.invalidProviderRange }
      previousEnd = scalarRange.upperBound
      let dictionaryForm = token.basicForm == "*" ? token.surfaceForm : token.basicForm
      let partOfSpeech = [
        token.partOfSpeech,
        token.partOfSpeechDetail1,
        token.partOfSpeechDetail2,
        token.partOfSpeechDetail3,
      ].filter { !$0.isEmpty && $0 != "*" }
      return JapaneseMorphologyCandidate(
        surface: token.surfaceForm,
        scalarRange: scalarRange,
        dictionaryForm: dictionaryForm,
        normalizedForm: dictionaryForm,
        reading: token.reading ?? token.surfaceForm,
        partOfSpeech: partOfSpeech,
        isOutOfVocabulary: token.wordType != "KNOWN",
        children: []
      )
    }
    guard previousEnd == text.unicodeScalars.count else {
      throw JapaneseMorphologyError.invalidProviderRange
    }
    return JapaneseMorphologyAnalysis(
      transcript: text,
      candidates: candidates,
      engine: KuromojiContract.engine,
      engineVersion: KuromojiContract.engineVersion,
      dictionary: KuromojiContract.dictionary,
      dictionarySHA256: KuromojiContract.dictionarySHA256
    )
  }

  private static func resourceURL(_ filename: String) -> URL? {
    let name = (filename as NSString).deletingPathExtension
    let ext = (filename as NSString).pathExtension
    return Bundle.module.url(
      forResource: name,
      withExtension: ext.isEmpty ? nil : ext,
      subdirectory: "Kuromoji"
    ) ?? Bundle.module.url(forResource: name, withExtension: ext.isEmpty ? nil : ext)
  }

  private static let dictionaryLoaderSource =
    """
    class ZenbuKuromojiXHR {
      open(_method, url) { this.url = url; }
      send() {
        const filename = this.url.split('/').pop();
        this.response = __zenbuLoadKuromojiDictionary(filename);
        if (this.response) {
          this.status = 200;
          this.onload?.call(this);
        } else {
          this.onerror?.call(this, new Error(`Missing ${filename}`));
        }
      }
      addEventListener(type, callback) {
        if (type === 'load') this.onload = callback;
        if (type === 'error') this.onerror = callback;
      }
    }
    globalThis.XMLHttpRequest = ZenbuKuromojiXHR;
    """

  private static let tokenizerInitializationSource =
    """
    var __zenbuKuromojiTokenizer = null;
    var __zenbuKuromojiError = null;
    kuromoji.builder({ dicPath: 'bundle://' }).build((error, tokenizer) => {
      __zenbuKuromojiError = error ? String(error) : null;
      __zenbuKuromojiTokenizer = tokenizer;
    });
    """
}

private struct KuromojiToken: Decodable {
  let wordType: String
  let wordPosition: Int
  let surfaceForm: String
  let partOfSpeech: String
  let partOfSpeechDetail1: String
  let partOfSpeechDetail2: String
  let partOfSpeechDetail3: String
  let basicForm: String
  let reading: String?

  enum CodingKeys: String, CodingKey {
    case wordType = "word_type"
    case wordPosition = "word_position"
    case surfaceForm = "surface_form"
    case partOfSpeech = "pos"
    case partOfSpeechDetail1 = "pos_detail_1"
    case partOfSpeechDetail2 = "pos_detail_2"
    case partOfSpeechDetail3 = "pos_detail_3"
    case basicForm = "basic_form"
    case reading
  }
}

private func releaseKuromojiArrayBuffer(
  _ bytes: UnsafeMutableRawPointer?,
  _: UnsafeMutableRawPointer?
) {
  bytes?.deallocate()
}
