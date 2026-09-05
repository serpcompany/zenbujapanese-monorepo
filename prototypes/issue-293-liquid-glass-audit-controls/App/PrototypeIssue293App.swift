import SwiftUI

// PROTOTYPE ONLY — disposable empirical control for GitHub issue #293.
// Four preregistered variants of native iOS 26 controls, selected by launch argument.
@main
struct PrototypeIssue293App: App {
  var body: some Scene {
    WindowGroup {
      if ProcessInfo.processInfo.arguments.contains("-DefaultContrastControl") {
        DefaultContrastControlView()
      } else {
        PrototypeRootView(variant: .fromProcessArguments)
      }
    }
  }
}

private enum PrototypeVariant: Int {
  case automaticEdge = 1
  case hardEdge = 2
  case deliberateLowContrast = 3
  case semanticRepair = 4

  static var fromProcessArguments: Self {
    let arguments = ProcessInfo.processInfo.arguments
    guard
      let flagIndex = arguments.firstIndex(of: "-PrototypeVariant"),
      arguments.indices.contains(flagIndex + 1),
      let rawValue = Int(arguments[flagIndex + 1]),
      let variant = Self(rawValue: rawValue)
    else {
      return .automaticEdge
    }
    return variant
  }

  var title: String {
    switch self {
    case .automaticEdge: "1 — Untouched automatic edge"
    case .hardEdge: "2 — Untouched hard edge"
    case .deliberateLowContrast: "3 — Deliberate low contrast"
    case .semanticRepair: "4 — Semantic repair"
    }
  }
}

private struct PrototypeRootView: View {
  let variant: PrototypeVariant

  var body: some View {
    TabView {
      Tab("Controls", systemImage: "list.bullet") {
        NavigationStack {
          contentList
            .navigationTitle("Native Controls")
            .navigationDestination(for: Int.self) { row in
              Text("Native destination \(row)")
                .navigationTitle("Row \(row)")
            }
        }
      }

      Tab("About", systemImage: "info.circle") {
        NavigationStack {
          List {
            Section("Prototype") {
              Text("Disposable issue #293 control")
            }
          }
          .navigationTitle("About")
        }
      }
    }
  }

  @ViewBuilder
  private var contentList: some View {
    let list = List {
      Section("Preregistered state") {
        Text(variant.title)
          .accessibilityIdentifier("prototype.variant")

        if variant == .deliberateLowContrast {
          Text("Deliberately low-contrast unobscured label")
            .foregroundStyle(.primary.opacity(0.12))
            .accessibilityIdentifier("prototype.deliberate-low-contrast")
        } else if variant == .semanticRepair {
          Text("Deliberately low-contrast unobscured label")
            .foregroundStyle(.primary)
            .accessibilityIdentifier("prototype.deliberate-low-contrast")
        }
      }

      Section("Native navigation links") {
        ForEach(1...30, id: \.self) { row in
          NavigationLink(value: row) {
            VStack(alignment: .leading) {
              Text("Native row \(row)")
              Text("System secondary label")
                .font(.caption)
                .foregroundStyle(.secondary)
            }
          }
          .accessibilityIdentifier("prototype.row.\(row)")
        }
      }
    }
    .accessibilityIdentifier("prototype.screen")

    if variant == .hardEdge {
      list.scrollEdgeEffectStyle(.hard, for: .bottom)
    } else {
      list
    }
  }
}
