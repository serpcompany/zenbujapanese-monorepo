import SwiftUI

/// A video the learner opened, most recent first.
struct WatchedVideo: Codable, Hashable, Identifiable {
  let videoID: String
  var title: String?
  /// The share of the captions' words the learner knew when last watched, from 0 to 1.
  var comprehension: Double?
  var author: String?
  var duration: TimeInterval?
  /// Where the learner left off.
  var position: TimeInterval?

  /// How far through the video the learner got, from 0 to 1.
  var progress: Double? {
    guard let duration, duration > 0, let position else { return nil }
    return min(max(position / duration, 0), 1)
  }

  var id: String { videoID }
  var thumbnailURL: URL? { URL(string: "https://i.ytimg.com/vi/\(videoID)/mqdefault.jpg") }
}

/// Recently watched videos, stored only on the device.
@MainActor
@Observable
final class WatchHistory {
  private(set) var videos: [WatchedVideo]
  @ObservationIgnored private let defaults: UserDefaults
  private static let storageKey = "watch.recent-videos.v1"

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    videos =
      defaults.data(forKey: Self.storageKey)
      .flatMap { try? JSONDecoder().decode([WatchedVideo].self, from: $0) } ?? []
  }

  /// Moves the video to the top, applying any new details and keeping the rest.
  func record(_ videoID: YouTubeVideoID, update: (inout WatchedVideo) -> Void = { _ in }) {
    var video =
      videos.first { $0.videoID == videoID.rawValue } ?? WatchedVideo(videoID: videoID.rawValue)
    update(&video)
    videos.removeAll { $0.videoID == videoID.rawValue }
    videos.insert(video, at: 0)
    videos = Array(videos.prefix(50))
    save()
  }

  func remove(_ video: WatchedVideo) {
    videos.removeAll { $0 == video }
    save()
  }

  private func save() {
    defaults.set(try? JSONEncoder().encode(videos), forKey: Self.storageKey)
  }
}

/// Lists recently watched videos, and searches for or opens a video from a browser-style bar.
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
        // Each video is its own card, like example sentences on a word's page.
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

  /// Opens a pasted video link directly; searches for anything else.
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

/// Plays a video above its Japanese captions, following along as it plays.
struct WatchSessionView: View {
  private enum CaptionState {
    case loading
    case loaded(YouTubeVideoCaptions)
    case failed(YouTubeCaptionError?)
  }

  @Environment(ReadingAidPreferences.self) private var readingAidPreferences
  @Environment(WordKnowledge.self) private var wordKnowledge
  @State private var player = YouTubePlayerController()
  /// The dictionary word of every countable word occurrence in the captions.
  @State private var captionWords: [LanguageReferenceID]?
  @State private var captionState = CaptionState.loading
  /// Whether on-device translation of missing lines has started for these captions.
  @State private var isTranslatingMissingLines = false
  @State private var missingTranslationTask: Task<Void, Never>?
  /// The position the learner is dragging the scrubber to, until they let go.
  @State private var scrubPosition: TimeInterval?
  @Binding private var presentedWord: RecognizedWordSheetRequest?

  private let videoID: YouTubeVideoID
  private let captionClient: YouTubeCaptionClient
  private let japaneseTextAnalysisClient: JapaneseTextAnalysisClient
  private let history: WatchHistory

  init(
    videoID: YouTubeVideoID,
    history: WatchHistory,
    captionClient: YouTubeCaptionClient,
    japaneseTextAnalysisClient: JapaneseTextAnalysisClient,
    presentedWord: Binding<RecognizedWordSheetRequest?>
  ) {
    self.videoID = videoID
    self.history = history
    self.captionClient = captionClient
    self.japaneseTextAnalysisClient = japaneseTextAnalysisClient
    _presentedWord = presentedWord
  }

  var body: some View {
    VStack(spacing: 0) {
      YouTubePlayerView(videoID: videoID, controller: player)
        .aspectRatio(16 / 9, contentMode: .fit)
        // Taps on the video play or pause instead of bringing up YouTube's overlays.
        .overlay {
          Color.clear
            .contentShape(.rect)
            .onTapGesture { player.togglePlayback() }
            .accessibilityHidden(true)
        }
        .overlay { playerFailure }
      playbackControls
      Divider()
      captions
    }
    // The video names itself in the player, so the bar keeps room for Player's own actions.
    .navigationTitle("Player")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) { playerMenu }
    }
    .task(id: videoID) {
      history.record(videoID)
      await loadCaptions()
    }
    .task(id: captionTextIdentity) { await analyzeCaptionWords() }
    .onChange(of: comprehension?.fraction) { _, fraction in
      if let fraction { history.record(videoID) { $0.comprehension = fraction } }
    }
    .onChange(of: readingAidPreferences.showsTranslations) { requestMissingTranslations() }
    .onChange(of: player.duration) { _, duration in
      if duration > 0 { history.record(videoID) { $0.duration = duration } }
    }
    .onDisappear {
      let position = player.currentTime
      if position > 0 { history.record(videoID) { $0.position = position } }
    }
    .onChange(of: readingAidPreferences.translationSource) {
      Task { await loadCaptions() }
    }
  }

  /// Quick access to the reading aids Player uses, and to the video itself.
  private var playerMenu: some View {
    @Bindable var preferences = readingAidPreferences
    return Menu("More", systemImage: "ellipsis") {
      Section("Show") {
        Toggle("Furigana", isOn: $preferences.showsFurigana)
        Toggle("Furigana on Known Words", isOn: Binding(
          get: { !preferences.hidesFuriganaOnKnownWords },
          set: { preferences.hidesFuriganaOnKnownWords = !$0 }
        ))
        .disabled(!preferences.showsFurigana)
        Toggle("Word Meanings", isOn: $preferences.showsWordMeanings)
        Toggle("Translations", isOn: $preferences.showsTranslations)
      }
      Section {
        ShareLink(item: URL(string: "https://youtu.be/\(videoID.rawValue)")!) {
          Label("Share Video", systemImage: "square.and.arrow.up")
        }
      }
    }
    .accessibilityIdentifier("watch.more")
  }

  /// How much of the captions' vocabulary the learner knows, fixed above the caption cards.
  private var comprehensionSummary: some View {
    HStack(spacing: 8) {
      if let comprehension, let fraction = comprehension.fraction,
        let percent = comprehension.percentText
      {
        Text(percent)
          .font(.footnote.weight(.bold).monospacedDigit())
          .foregroundStyle(ComprehensionBadge.color(for: fraction))
        Text("\(comprehension.knownCount) of \(comprehension.totalCount) words known")
      } else {
        Text("Counting known words…")
      }
    }
    .font(.footnote.monospacedDigit())
    .foregroundStyle(.secondary)
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 20)
    .padding(.vertical, 10)
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("watch.comprehension")
  }

  private var comprehension: Comprehension? {
    captionWords.map { Comprehension(words: $0, isKnown: wordKnowledge.isKnown) }
  }

  /// Changes when the caption text changes, not when translations arrive.
  private var captionTextIdentity: [String] { loadedCues.map(\.text) }

  /// Analyzes every caption line once, so comprehension covers the whole video, not just the
  /// lines on screen.
  private func analyzeCaptionWords() async {
    let lines = captionTextIdentity
    guard !lines.isEmpty else { return }
    var words: [LanguageReferenceID] = []
    for line in lines {
      let tokens = await japaneseTextAnalysisClient.linkedTokens(line, SearchQuery(""), nil)
      guard !Task.isCancelled else { return }
      words += Comprehension.countedWords(in: tokens)
    }
    captionWords = words
  }

  @ViewBuilder
  private var playerFailure: some View {
    if case .failed(let code) = player.state {
      ContentUnavailableView(
        "Video Unavailable",
        systemImage: "play.slash",
        description: Text(
          code == 101 || code == 150
            ? "The video's owner doesn't allow it to play in other apps."
            : "YouTube couldn't play this video.")
      )
      .background(.black)
      .environment(\.colorScheme, .dark)
    }
  }

  @ViewBuilder
  private var captions: some View {
    switch captionState {
    case .loading:
      ProgressView("Loading captions…")
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityIdentifier("watch.captions-loading")
    case .failed(let error):
      ContentUnavailableView {
        Label("No Japanese Captions", systemImage: "captions.bubble")
      } description: {
        Text(
          error == .noJapaneseCaptions
            ? "This video has no Japanese captions. Try another video."
            : "Zenbu couldn't load this video's captions.")
      } actions: {
        if error != .noJapaneseCaptions {
          Button("Try Again") { Task { await loadCaptions() } }
        }
      }
      .frame(maxHeight: .infinity)
      .accessibilityIdentifier("watch.captions-unavailable")
    case .loaded(let captions):
      captionList(captions)
    }
  }

  private func captionList(_ captions: YouTubeVideoCaptions) -> some View {
    let activeCueID = activeCue(in: captions.cues)?.id
    return VStack(spacing: 0) {
      comprehensionSummary
      Divider()
      ScrollViewReader { proxy in
        List {
          ForEach(captions.cues) { cue in
            cueRow(cue)
              .captionCardRow(isActive: cue.id == activeCueID)
              .id(cue.id)
          }
        }
        .listStyle(.plain)
        .contentMargins(.top, 8, for: .scrollContent)
        .onChange(of: activeCueID) { _, id in
          guard let id else { return }
          withAnimation { proxy.scrollTo(id, anchor: .center) }
        }
        .accessibilityIdentifier("watch.captions")
      }
    }
  }

  /// The line being spoken is the active card.
  private func cueRow(_ cue: SubtitleCue) -> some View {
    CaptionCard(
      text: cue.text,
      translation: cue.translation,
      label: timeRange(cue),
      japaneseTextAnalysisClient: japaneseTextAnalysisClient,
      identifierPrefix: "watch.cue.\(cue.id)",
      openCandidates: { surface, candidates in open(surface, candidates: candidates, from: cue) },
      openWord: { entry in open(entry, from: cue) }
    )
    // Tapping a line outside its words plays the video from that line.
    .contentShape(.rect)
    .onTapGesture { play(cue) }
    .accessibilityElement(children: .contain)
    .accessibilityAction(named: "Play from Here") { play(cue) }
    .accessibilityIdentifier("watch.cue.\(cue.id)")
  }

  /// Transport controls between the player and the captions, in the style of a music app:
  /// a scrubber with elapsed and remaining time, line-by-line skipping, and playback speed.
  private var playbackControls: some View {
    VStack(spacing: 0) {
      PlaybackScrubber(
        position: scrubPosition ?? player.currentTime,
        duration: player.duration,
        scrub: { scrubPosition = $0 },
        commit: { position in
          // A repeated line follows the scrubber to the line at its new position.
          if player.loop != nil,
            let cue = loadedCues.last(where: { $0.start <= position }) ?? loadedCues.first
          {
            player.setLoop(cue.start...cue.end)
          }
          player.seek(to: position, play: player.isPlaying)
          scrubPosition = nil
        }
      )
      HStack(spacing: 0) {
        Text(
          "\(Self.timestamp(scrubPosition ?? player.currentTime)) / \(Self.timestamp(player.duration))"
        )
        .font(.caption2.monospacedDigit())
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityHidden(true)
        HStack(spacing: 28) {
          Button("Previous Line", systemImage: "backward.end.fill") { step(by: -1) }
            .font(.body)
            .accessibilityIdentifier("watch.previous")
          Button {
            player.togglePlayback()
          } label: {
            Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
              .font(.callout.weight(.semibold))
              .foregroundStyle(Color(uiColor: .systemBackground))
              .contentTransition(.symbolEffect(.replace))
              .frame(width: 36, height: 36)
              .background(.primary, in: .circle)
          }
          .accessibilityLabel(player.isPlaying ? "Pause" : "Play")
          .accessibilityIdentifier("watch.play-pause")
          Button("Next Line", systemImage: "forward.end.fill") { step(by: 1) }
            .font(.body)
            .accessibilityIdentifier("watch.next")
        }
        HStack(spacing: 4) {
          repeatButton
          speedMenu
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
      }
      .labelStyle(.iconOnly)
      .tint(.primary)
    }
    .buttonStyle(.borderless)
    .padding(.horizontal, 16)
    .padding(.bottom, 2)
    .background(Color(uiColor: .secondarySystemBackground))
    .disabled(player.state != .ready)
  }

  /// Repeats the current line until turned off, like a music app's repeat-one.
  private var repeatButton: some View {
    let isOn = player.loop != nil
    return Button(isOn ? "Stop Repeating Line" : "Repeat Line", systemImage: "repeat.1") {
      if isOn {
        player.setLoop(nil)
      } else if let cue = activeCue(in: loadedCues) {
        player.setLoop(cue.start...cue.end)
        if !player.isPlaying { player.seek(to: cue.start, play: false) }
      }
    }
    .font(.footnote.weight(.semibold))
    .foregroundStyle(isOn ? Color.accentColor : .primary)
    .frame(minWidth: 36, minHeight: 44)
    .accessibilityAddTraits(isOn ? .isSelected : [])
    .accessibilityIdentifier("watch.repeat")
  }

  private var speedMenu: some View {
    Menu {
      Picker(
        "Playback Speed",
        selection: Binding(get: { player.playbackRate }, set: player.setPlaybackRate)
      ) {
        ForEach(Self.playbackRates, id: \.self) { rate in
          Text(Self.rateLabel(rate)).tag(rate)
        }
      }
    } label: {
      Text(Self.rateLabel(player.playbackRate))
        .font(.footnote.weight(.semibold).monospacedDigit())
        .frame(minWidth: 44, minHeight: 44)
    }
    .accessibilityLabel("Playback speed, \(Self.rateLabel(player.playbackRate))")
    .accessibilityIdentifier("watch.speed")
  }

  private static let playbackRates: [Double] = [0.5, 0.75, 1, 1.25, 1.5]

  private static func rateLabel(_ rate: Double) -> String {
    rate.formatted(.number.precision(.fractionLength(0...2))) + "×"
  }

  private var loadedCues: [SubtitleCue] {
    if case .loaded(let captions) = captionState { return captions.cues }
    return []
  }

  /// The line being spoken, the last line spoken during a pause between lines, or the first
  /// line before any is spoken, so one line is always current.
  private func activeCue(in cues: [SubtitleCue]) -> SubtitleCue? {
    cues.last { $0.start <= player.currentTime } ?? cues.first
  }

  private func step(by offset: Int) {
    let cues = loadedCues
    guard !cues.isEmpty else { return }
    // Before the first line starts, "next" goes to the first line.
    let index = cues.last { $0.start <= player.currentTime }?.id ?? -1
    let target = cues[min(max(index + offset, 0), cues.count - 1)]
    // While repeating, the new line repeats; while playing, keep playing from the new line;
    // while paused, play just that line.
    if player.loop != nil {
      play(target)
    } else if player.isPlaying, !player.isPlayingOneStretch {
      player.seek(to: target.start)
    } else {
      player.play(from: target.start, until: target.end)
    }
  }

  /// Plays from a line; while repeating, that line becomes the one repeated.
  private func play(_ cue: SubtitleCue) {
    if player.loop != nil { player.setLoop(cue.start...cue.end) }
    player.seek(to: cue.start)
  }

  private func open(_ entry: DictionaryEntry, from cue: SubtitleCue) {
    player.pause()
    presentedWord = RecognizedWordSheetRequest(
      id: "watch.\(videoID.rawValue).\(cue.id).\(entry.id.rawValue)",
      surface: entry.headword,
      entry: entry,
      candidateEntries: [],
      encounterMedia: nil
    )
  }

  /// Opens a word with several possible entries in the same sheet, which lists them to choose.
  private func open(_ surface: String, candidates: [DictionaryEntry], from cue: SubtitleCue) {
    player.pause()
    presentedWord = RecognizedWordSheetRequest(
      id: "watch.\(videoID.rawValue).\(cue.id).\(surface)",
      surface: surface,
      entry: nil,
      candidateEntries: candidates,
      encounterMedia: nil
    )
  }

  private func loadCaptions() async {
    captionState = .loading
    missingTranslationTask?.cancel()
    isTranslatingMissingLines = false
    do {
      var captions = try await captionClient.captions(videoID)
      // Apple translates each line itself, so YouTube's translations aren't shown.
      if readingAidPreferences.translationSource == .apple {
        captions = captions.withoutTranslations
      }
      captionState = .loaded(captions)
      history.record(videoID) { video in
        video.title = captions.title ?? video.title
        video.author = captions.author ?? video.author
      }
      requestMissingTranslations()
    } catch {
      captionState = .failed(error as? YouTubeCaptionError)
    }
  }

  /// Translates on the device the lines YouTube didn't translate. It uses only language assets
  /// already installed, so it never interrupts playback to ask for a download.
  private func requestMissingTranslations() {
    let lines = loadedCues.filter { $0.translation == nil }
    guard readingAidPreferences.showsTranslations, !isTranslatingMissingLines, !lines.isEmpty
    else { return }
    isTranslatingMissingLines = true
    missingTranslationTask = Task {
      let client = NaturalTranslationClient.live
      guard (try? await client.availability()) == .installed else { return }
      for line in lines {
        guard let translation = try? await client.translateInstalled(line.text),
          !Task.isCancelled
        else { return }
        setTranslation(translation, for: line.id, text: line.text)
      }
    }
  }

  private func setTranslation(_ translation: String, for cueID: Int, text: String) {
    // The captions may have reloaded since translation began; only write to the same line.
    guard case .loaded(let captions) = captionState, captions.cues.indices.contains(cueID),
      captions.cues[cueID].text == text
    else { return }
    var cues = captions.cues
    cues[cueID].translation = translation
    captionState = .loaded(
      YouTubeVideoCaptions(
        title: captions.title, cues: cues, isAutomatic: captions.isAutomatic,
        author: captions.author))
  }

  private func timeRange(_ cue: SubtitleCue) -> String {
    "\(Self.timestamp(cue.start)) – \(Self.timestamp(cue.end))"
  }

  static func timestamp(_ seconds: TimeInterval) -> String {
    let total = Int(seconds.rounded(.down))
    let hours = total / 3600
    let minutes = total / 60 % 60
    let secs = total % 60
    return hours > 0
      ? String(format: "%d:%02d:%02d", hours, minutes, secs)
      : String(format: "%d:%02d", minutes, secs)
  }
}

/// A thin music-app scrubber: a 4pt track whose small knob grows while dragged. The stock
/// slider's knob is too large for a player's progress bar.
private struct PlaybackScrubber: View {
  let position: TimeInterval
  let duration: TimeInterval
  let scrub: (TimeInterval) -> Void
  let commit: (TimeInterval) -> Void
  @GestureState private var isDragging = false

  var body: some View {
    GeometryReader { geometry in
      let fraction = duration > 0 ? min(max(position / duration, 0), 1) : 0
      let knob: CGFloat = isDragging ? 16 : 10
      ZStack(alignment: .leading) {
        Capsule().fill(.quaternary).frame(height: 4)
        Capsule().fill(.primary).frame(width: geometry.size.width * fraction, height: 4)
        Circle()
          .fill(.primary)
          .frame(width: knob, height: knob)
          .offset(x: geometry.size.width * fraction - knob / 2)
      }
      .frame(maxHeight: .infinity)
      .contentShape(.rect)
      .gesture(
        DragGesture(minimumDistance: 0)
          .updating($isDragging) { _, state, _ in state = true }
          .onChanged { value in scrub(time(at: value.location.x, width: geometry.size.width)) }
          .onEnded { value in commit(time(at: value.location.x, width: geometry.size.width)) }
      )
      .animation(.easeOut(duration: 0.15), value: isDragging)
    }
    .frame(height: 18)
    .accessibilityElement()
    .accessibilityLabel("Playback position")
    .accessibilityValue(WatchSessionView.timestamp(position))
    .accessibilityAdjustableAction { direction in
      let step: TimeInterval = direction == .increment ? 10 : -10
      commit(min(max(position + step, 0), duration))
    }
    .accessibilityIdentifier("watch.scrubber")
  }

  private func time(at x: CGFloat, width: CGFloat) -> TimeInterval {
    guard width > 0 else { return 0 }
    return duration * Double(min(max(x / width, 0), 1))
  }
}

/// A recent video as a full-width card, like a video feed.
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

/// A video's thumbnail with its comprehension pill, length, and how far the learner watched.
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

/// The share of a video's words the learner knows, as a pill over its thumbnail, colored by how
/// much is known, on a dark backing so it reads over any image.
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

  /// Red under 25%, orange to 50%, yellow to 75%, and green from 75%, so a glance shows how
  /// comfortable a video will be.
  static func color(for fraction: Double) -> Color {
    switch fraction {
    case ..<0.25: .red
    case ..<0.5: .orange
    case ..<0.75: .yellow
    default: .green
    }
  }
}
