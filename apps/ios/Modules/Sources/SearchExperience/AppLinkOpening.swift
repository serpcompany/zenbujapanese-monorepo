import SwiftUI

struct AppLinkOpening: ViewModifier {
  let lookupClient: LookupClient
  @Binding var searchPath: [SearchExperienceRoute]
  @Binding var query: String
  let showSearch: () -> Void
  let translate: (String) -> Void
  @State private var task: Task<Void, Never>?
  @Environment(\.appearsActive) private var appearsActive
  private let inbox = AppLinkInbox.shared

  func body(content: Content) -> some View {
    content
      .onOpenURL(perform: open)
      .onChange(of: PendingLink(url: inbox.pending, isActive: appearsActive), initial: true) {
        _, pending in
        guard pending.isActive, let url = inbox.take() else { return }
        open(url)
      }
  }

  private func open(_ url: URL) {
    switch AppLink(url, scheme: AppLink.scheme) {
    case .dictionary(let link):
      showSearch()
      task?.cancel()
      let (searchPath, query) = ($searchPath, $query)
      task = Task { @MainActor in
        let route = await lookupClient.route(link)
        guard !Task.isCancelled else { return }
        route.apply(to: &searchPath.wrappedValue, query: &query.wrappedValue)
      }
    case .translate(let text):
      translate(text)
    }
  }
}

private struct PendingLink: Equatable {
  let url: URL?
  let isActive: Bool
}

enum AppLink: Equatable {
  case dictionary(DictionaryLink)
  case translate(String)

  static let scheme = AppAction.scheme(ofApp: Bundle.main.bundleIdentifier ?? "")

  init(_ url: URL, scheme: String) {
    switch AppAction(url, scheme: scheme) {
    case .lookUp(let text):
      self = .dictionary(.lookUp(text))
    case .translate(let text):
      self = .translate(text)
    case nil:
      self = .dictionary(.website(url))
    }
  }
}

enum DictionaryLink: Equatable, Sendable {
  case website(URL)
  case lookUp(String)
}

extension LookupClient {
  func route(_ link: DictionaryLink) async -> WebsiteLinkRoute {
    switch link {
    case .website(let url): return await websiteRoute(url)
    case .lookUp(let text): return await lookUp(text)
    }
  }
}

@MainActor
@Observable
public final class AppLinkInbox {
  public static let shared = AppLinkInbox()
  private(set) var pending: URL?

  public func lookUp(_ text: String) {
    receive(.lookUp(text))
  }

  public func translate(_ text: String) {
    receive(.translate(text))
  }

  func receive(_ action: AppAction) {
    pending = action.url(scheme: AppLink.scheme)
  }

  func receive(_ link: URL) {
    pending = link
  }

  func take() -> URL? {
    defer { pending = nil }
    return pending
  }
}

enum WebsiteLinkRoute: Equatable {
  case open(SearchExperienceRoute)
  case search(String)
  case home

  func apply(to searchPath: inout [SearchExperienceRoute], query: inout String) {
    switch self {
    case .open(let route):
      searchPath.append(route)
    case .search(let text):
      searchPath = []
      query = text
    case .home:
      searchPath = []
    }
  }
}
