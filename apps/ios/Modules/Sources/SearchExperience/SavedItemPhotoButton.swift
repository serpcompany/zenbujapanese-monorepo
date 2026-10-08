import SwiftUI

struct SavedItemPhotoButton: View {
  @State private var presentedMedia: EncounterMedia?
  let media: EncounterMedia
  let count: Int
  let encounterMedia: [EncounterMedia]
  let removeEncounterMedia: (String) async -> Void

  var body: some View {
    Button {
      presentedMedia = media
    } label: {
      if let image = Image(imageData: media.data) {
        HStack(spacing: 8) {
          if count > 1 {
            Text("\(count)").font(.caption.monospacedDigit())
          }
          image
            .resizable()
            .scaledToFill()
            .frame(width: 56, height: 44)
            .clipped()
            .clipShape(RoundedRectangle(cornerRadius: 5))
        }
      }
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Saved encounter images, \(count)")
    .accessibilityIdentifier("word-detail.image-attachment")
    .sheet(item: $presentedMedia) { media in
      EncounterMediaViewer(
        encounterMedia: encounterMedia,
        initialMediaID: media.id,
        removeEncounterMedia: removeEncounterMedia
      )
    }
  }
}

private struct EncounterMediaViewer: View {
  @Environment(\.dismiss) private var dismiss
  @State private var selectedMediaID: String
  @State private var isRemovingMedia = false

  let encounterMedia: [EncounterMedia]
  let removeEncounterMedia: (String) async -> Void

  init(
    encounterMedia: [EncounterMedia],
    initialMediaID: String,
    removeEncounterMedia: @escaping (String) async -> Void
  ) {
    self.encounterMedia = encounterMedia
    self.removeEncounterMedia = removeEncounterMedia
    _selectedMediaID = State(initialValue: initialMediaID)
  }

  var body: some View {
    NavigationStack {
      PagedView(selection: $selectedMediaID, showsIndex: true) {
        ForEach(Array(encounterMedia.enumerated()), id: \.element.id) { index, media in
          VStack(spacing: 12) {
            if let image = Image(imageData: media.data) {
              image.resizable().scaledToFit()
                .accessibilityLabel("Image \(index + 1) of \(encounterMedia.count)")
                .accessibilityIdentifier("word-detail.image-page")
                .accessibilityHidden(media.id != selectedMediaID)
            }
          }
          .padding()
          .tag(media.id)
        }
      }
      .inlineNavigationTitle()
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Done", action: dismiss.callAsFunction)
            .accessibilityIdentifier("word-detail.image-attachment-done")
        }
        ToolbarItem(placement: .destructiveAction) {
          Button("Remove from Word", role: .destructive) {
            Task { await removeSelectedMedia() }
          }
          .disabled(isRemovingMedia)
          .accessibilityIdentifier("word-detail.image-attachment-remove")
        }
      }
    }
  }

  private func removeSelectedMedia() async {
    guard !isRemovingMedia else { return }
    isRemovingMedia = true
    defer { isRemovingMedia = false }
    await removeEncounterMedia(selectedMediaID)
    guard encounterMedia.count > 1,
      let nextMedia = encounterMedia.first(where: { $0.id != selectedMediaID })
    else {
      dismiss()
      return
    }
    selectedMediaID = nextMedia.id
  }
}
