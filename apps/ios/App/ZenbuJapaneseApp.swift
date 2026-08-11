import LookupReplica
import SwiftUI

@main
struct ZenbuJapaneseApp: App {
  var body: some Scene {
    WindowGroup {
      SearchReplicaRootView()
        .preferredColorScheme(.dark)
    }
  }
}
