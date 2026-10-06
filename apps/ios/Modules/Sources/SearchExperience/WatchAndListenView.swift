import SwiftUI

struct WatchAndListenView: View {
  @State private var query = ""
  let history: WatchHistory
  let searchProvider: VideoSearchProvider
  let openVideo: (YouTubeVideoID) -> Void
  let search: (VideoSearch) -> Void

  var body: some View {
    Group {
      if history.videos.isEmpty {
        ContentUnavailableView {
          Label("No Videos Yet", systemImage: "play.rectangle")
        } description: {
          Text(
            "Search \(searchProvider.name) or paste a YouTube link, then tap any word in the Japanese captions to look it up."
          )
        }
      } else {
        List {
          ForEach(history.videos.enumerated(), id: \.element.id) { index, video in
            Section {
              Button {
                if let id = YouTubeVideoID(rawValue: video.videoID) { openVideo(id) }
              } label: {
                RecentVideoCard(video: video)
              }
              .tint(.primary)
              .listRowInsets(EdgeInsets(top: 12, leading: 12, bottom: 12, trailing: 12))
              .swipeActions {
                Button("Remove", systemImage: "trash", role: .destructive) {
                  history.remove(video)
                }
              }
              .accessibilityIdentifier("watch.recent.\(video.videoID)")
            } header: {
              if index == 0 { Text("Recent") }
            }
          }
        }
        .listSectionSpacing(12)
        .listStyle(.insetGrouped)
      }
    }
    .navigationTitle("Player")
    .searchable(
      text: $query,
      placement: .navigationBarDrawer(displayMode: .always),
      prompt: "Search \(searchProvider.name) or paste a link"
    )
    .keyboardType(.webSearch)
    .textInputAutocapitalization(.never)
    .autocorrectionDisabled()
    .onSubmit(of: .search, submit)
  }

  private func submit() {
    let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { return }
    if let videoID = YouTubeVideoID(pastedLink: text) {
      openVideo(videoID)
    } else {
      search(VideoSearch(query: text, provider: searchProvider))
    }
    query = ""
  }
}

private struct RecentVideoCard: View {
  let video: WatchedVideo

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      RecentVideoThumbnail(video: video)
        .aspectRatio(16 / 9, contentMode: .fit)
        .clipShape(.rect(cornerRadius: 12))
      Text(video.title ?? "YouTube Video")
        .font(.headline)
        .lineLimit(2)
      if let author = video.author {
        Text(author)
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }
    }
  }
}

private struct RecentVideoThumbnail: View {
  let video: WatchedVideo

  var body: some View {
    Color.clear
      .aspectRatio(16 / 9, contentMode: .fit)
      .overlay {
        AsyncImage(url: video.thumbnailURL) { image in
          image.resizable().aspectRatio(16 / 9, contentMode: .fill)
        } placeholder: {
          Rectangle().fill(.quaternary)
        }
      }
      .clipped()
      .overlay(alignment: .topLeading) {
        if let comprehension = video.comprehension {
          ComprehensionBadge(fraction: comprehension).padding(8)
        }
      }
      .overlay(alignment: .bottomTrailing) {
        if let duration = video.duration {
          Text(WatchSessionView.timestamp(duration))
            .font(.caption2.weight(.semibold).monospacedDigit())
            .foregroundStyle(.white)
            .padding(.horizontal, 4)
            .padding(.vertical, 1)
            .background(.black.opacity(0.7), in: .rect(cornerRadius: 4))
            .padding(4)
            .padding(.bottom, video.progress == nil ? 0 : 3)
        }
      }
      .overlay(alignment: .bottom) {
        if let progress = video.progress {
          GeometryReader { geometry in
            Rectangle()
              .fill(.red)
              .frame(width: geometry.size.width * progress)
          }
          .frame(height: 3)
          .background(.white.opacity(0.35))
          .accessibilityLabel("Watched \(progress.formatted(.percent.precision(.fractionLength(0))))")
        }
      }
  }
}

struct ComprehensionBadge: View {
  let fraction: Double

  var body: some View {
    let percent = fraction.formatted(.percent.precision(.fractionLength(0)))
    HStack(spacing: 4) {
      Image(systemName: "graduationcap.fill")
      Text(percent)
    }
    .font(.subheadline.weight(.bold).monospacedDigit())
    .foregroundStyle(Self.color(for: fraction))
    .padding(.horizontal, 10)
    .padding(.vertical, 5)
    .background(.black.opacity(0.88), in: .capsule)
    .environment(\.colorScheme, .dark)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(percent) of words known")
  }

  static func color(for fraction: Double) -> Color {
    switch fraction {
    case ..<0.25: .red
    case ..<0.5: .orange
    case ..<0.75: .yellow
    default: .green
    }
  }
}
