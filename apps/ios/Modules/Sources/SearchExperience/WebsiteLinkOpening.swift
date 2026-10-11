import SwiftUI

struct WebsiteLinkOpening: ViewModifier {
  let lookupClient: LookupClient
  @Binding var searchPath: [SearchExperienceRoute]
  @Binding var query: String
  let showSearch: () -> Void
  @State private var task: Task<Void, Never>?

  func body(content: Content) -> some View {
    content.onOpenURL { url in
      showSearch()
      task?.cancel()
      let (searchPath, query) = ($searchPath, $query)
      task = Task { @MainActor in
        let route = await lookupClient.websiteRoute(url)
        guard !Task.isCancelled else { return }
        route.apply(to: &searchPath.wrappedValue, query: &query.wrappedValue)
      }
    }
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
