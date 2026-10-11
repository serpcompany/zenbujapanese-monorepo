import Foundation
import JavaScriptCore

enum KuromojiContract {
  static let dictionaryFiles = [
    "base.dat.gz", "cc.dat.gz", "check.dat.gz", "tid.dat.gz", "tid_map.dat.gz",
    "tid_pos.dat.gz", "unk.dat.gz", "unk_char.dat.gz", "unk_compat.dat.gz",
    "unk_invoke.dat.gz", "unk_map.dat.gz", "unk_pos.dat.gz",
  ]
}

enum KuromojiEngine {
  static func install(in context: JSContext) throws {
    let loadDictionary: @convention(block) (String) -> JSValue? = { filename in
      guard KuromojiContract.dictionaryFiles.contains(filename),
        let url = resourceURL(filename),
        let packed = try? Data(contentsOf: url),
        let unpacked = Gunzip.inflated(packed)
      else { return nil }
      var exception: JSValueRef?
      guard
        let buffer = JSObjectMakeArrayBufferWithBytesNoCopy(
          context.jsGlobalContextRef,
          unpacked.pointer,
          unpacked.count,
          releaseKuromojiArrayBuffer,
          nil,
          &exception
        )
      else {
        free(unpacked.pointer)
        return nil
      }
      return JSValue(jsValueRef: buffer, in: context)
    }
    context.setObject(
      loadDictionary,
      forKeyedSubscript: "__zenbuLoadKuromojiDictionary" as NSString
    )
    context.evaluateScript(dictionaryLoaderSource)

    guard let sourceURL = resourceURL("kuromoji.js"),
      let source = try? String(contentsOf: sourceURL, encoding: .utf8)
    else { throw JapaneseMorphologyError.packUnavailable }
    guard let script = readingUnpackedFiles(source) else {
      throw JapaneseMorphologyError.providerContractMismatch
    }
    context.evaluateScript(script, withSourceURL: sourceURL)
    context.evaluateScript(tokenizerInitializationSource)

    let error = context.objectForKeyedSubscript("__zenbuKuromojiError")
    guard error?.isNull != false,
      context.objectForKeyedSubscript("__zenbuKuromojiTokenizer")?.isObject == true
    else { throw JapaneseMorphologyError.providerContractMismatch }
  }

  static func readingUnpackedFiles(_ script: String) -> String? {
    let pieces = script.components(separatedBy: unpackingInScript)
    return pieces.count == 2 ? pieces.joined(separator: "callback(null, arraybuffer);") : nil
  }

  private static let unpackingInScript = [
    "var gz = new zlib.Zlib.Gunzip(new Uint8Array(arraybuffer));",
    "var typed_array = gz.decompress();",
    "callback(null, typed_array.buffer);",
  ].joined(separator: "\n        ")

  static func resourceURL(_ filename: String) -> URL? {
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

private func releaseKuromojiArrayBuffer(
  _ bytes: UnsafeMutableRawPointer?,
  _: UnsafeMutableRawPointer?
) {
  free(bytes)
}
