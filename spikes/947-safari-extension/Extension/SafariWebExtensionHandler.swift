import Foundation
import SafariServices
import SearchExperience

final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
  func beginRequest(with context: NSExtensionContext) {
    let item = context.inputItems.first as? NSExtensionItem
    let message = item?.userInfo?[SFExtensionMessageKey] as? [String: Any] ?? [:]
    let command = message["command"] as? String ?? ""
    let text = message["text"] as? String ?? ""
    let id = message["id"] as? String ?? ""
    let headword = message["headword"] as? String ?? ""
    let reading = message["reading"] as? String ?? ""
    let stepMB = message["stepMB"] as? Int ?? 10
    let box = ContextBox(context)
    Task {
      let answer: [String: any Sendable]
      switch command {
      case "lookUp":
        answer = await SafariExtensionSpike.lookUp(text)
      case "markKnown", "addToFavorites":
        answer = await SafariExtensionSpike.save(command, id: id, headword: headword, reading: reading)
      case "stress":
        answer = SafariExtensionSpike.stress(stepMB: stepMB)
      case "config":
        answer = [
          "scheme": SafariExtensionSpike.appScheme,
          "dictionary": SafariExtensionSpike.dictionaryBundlePath,
          "memory": SafariExtensionSpike.memory(),
        ]
      default:
        answer = ["error": "unknown command \(command)"]
      }
      box.finish(answer)
    }
  }
}

private final class ContextBox: @unchecked Sendable {
  let context: NSExtensionContext
  init(_ context: NSExtensionContext) { self.context = context }

  func finish(_ answer: [String: any Sendable]) {
    let response = NSExtensionItem()
    response.userInfo = [SFExtensionMessageKey: answer]
    context.completeRequest(returningItems: [response], completionHandler: nil)
  }
}
