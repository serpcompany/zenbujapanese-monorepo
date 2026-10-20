import SwiftUI

#if DEBUG
  @MainActor
  @Observable
  final class SpeechStandIn {
    static let shared = SpeechStandIn()
    private(set) var spoken = ""

    var client: SpeechSynthesisClient {
      SpeechSynthesisClient { text, language in
        SpeechStandIn.shared.spoken = "\(language.localeIdentifier) \(text)"
      }
    }
  }

  private struct SpokenProbe: View {
    var body: some View {
      HarnessProbe(identifier: "speech.spoken", text: SpeechStandIn.shared.spoken)
    }
  }
#endif

extension View {
  @ViewBuilder
  func showingSpeechToUITests() -> some View {
    #if DEBUG
      if LaunchHarness.standsInForSpeech {
        ZStack(alignment: .topLeading) {
          self
          SpokenProbe()
        }
      } else {
        self
      }
    #else
      self
    #endif
  }
}
