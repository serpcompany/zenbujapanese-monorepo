import CoreTransferable
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

@MainActor
@Observable
final class SavedItemNotes {
  private(set) var notes: [LearnerWordNote] = []
  private(set) var editingNoteID: String?
  var draft = ""
  @ObservationIgnored private var noteID: WordNoteID?
  @ObservationIgnored private var textWhenEditingBegan = ""
  @ObservationIgnored private var saveTask: Task<Void, Never>?
  @ObservationIgnored private let store: WordNoteStore

  init(store: WordNoteStore) {
    self.store = store
  }

  var isEditing: Bool { editingNoteID != nil }

  func load(_ noteID: WordNoteID) async {
    let loaded = await store.load(noteID)
    guard !Task.isCancelled else { return }
    self.noteID = noteID
    notes = loaded
    editingNoteID = nil
    draft = ""
  }

  func beginEditing(_ note: LearnerWordNote) {
    if let editingNoteID, editingNoteID != note.id { saveDraft(of: editingNoteID) }
    editingNoteID = note.id
    draft = note.text
    textWhenEditingBegan = note.text
  }

  func beginAdding() {
    if let editingNoteID { saveDraft(of: editingNoteID) }
    editingNoteID = UUID().uuidString
    draft = ""
    textWhenEditingBegan = ""
  }

  func finishEditing() {
    guard let editingNoteID else { return }
    saveDraft(of: editingNoteID)
    self.editingNoteID = nil
    draft = ""
  }

  private func saveDraft(of editingNoteID: String) {
    let trimmed = { (text: String) in text.trimmingCharacters(in: .whitespacesAndNewlines) }
    guard trimmed(draft) != trimmed(textWhenEditingBegan) else { return }
    let note = LearnerWordNote(id: editingNoteID, text: draft)
    notes.apply(note)
    guard let noteID else { return }
    let store = store
    let precedingSave = saveTask
    saveTask = Task {
      await precedingSave?.value
      await store.save(note, noteID)
    }
  }
}

@MainActor
@Observable
final class SavedItemPhotos {
  private(set) var media: [EncounterMedia] = []
  var showsPhotoPicker = false
  var selectedPhoto: PhotosPickerItem?
  var showsCamera = false
  fileprivate var cameraAlert: SavedItemCameraAlert?
  var importFailed = false
  @ObservationIgnored private var reference: EncounterWordReference?
  @ObservationIgnored private let store: EncounterMediaStore
  @ObservationIgnored fileprivate let cameraAuthorizationClient: CameraAuthorizationClient

  init(store: EncounterMediaStore, cameraAuthorizationClient: CameraAuthorizationClient) {
    self.store = store
    self.cameraAuthorizationClient = cameraAuthorizationClient
  }

  var displayable: [EncounterMedia] {
    media.filter { Image(imageData: $0.data) != nil }
  }

  func load(_ item: SavedItem, saving initial: EncounterMediaAttachment? = nil) async {
    let reference = item.encounterReference
    self.reference = reference
    media = []
    if let initial { await store.save(initial, reference) }
    let stored = await store.encounters(reference)
    guard !Task.isCancelled else { return }
    media = stored
  }

  func remove(_ mediaID: String) async {
    guard let reference else { return }
    await store.remove(reference, mediaID)
    media = await store.encounters(reference)
  }

  func presentCamera() {
    guard cameraAuthorizationClient.isCameraAvailable() else {
      cameraAlert = .unavailable
      return
    }
    Task {
      switch cameraAuthorizationClient.state() {
      case .authorized:
        showsCamera = true
      case .notDetermined:
        if await cameraAuthorizationClient.requestAccess() {
          showsCamera = true
        } else {
          cameraAlert = .denied
        }
      case .denied:
        cameraAlert = .denied
      case .restricted:
        cameraAlert = .restricted
      }
    }
  }

  fileprivate func importSelectedPhoto() {
    guard let selectedPhoto else { return }
    Task {
      defer { self.selectedPhoto = nil }
      do {
        guard let selected = try await selectedPhoto.loadTransferable(type: SelectedPhoto.self)
        else {
          importFailed = true
          return
        }
        await save(selected.asset)
      } catch {
        importFailed = true
      }
    }
  }

  fileprivate func saveCameraResult(_ result: Result<[ImageTextAsset], Error>) {
    showsCamera = false
    switch result {
    case .success(let assets):
      guard let asset = assets.first else { return }
      Task { await save(asset) }
    case .failure:
      cameraAlert = .saveFailure
    }
  }

  private func save(_ asset: ImageTextAsset) async {
    guard let reference else { return }
    await store.save(EncounterMediaAttachment(name: asset.name, data: asset.data), reference)
    media = await store.encounters(reference)
  }
}

extension View {
  func savedItemPhotoPresentation(_ photos: SavedItemPhotos) -> some View {
    modifier(SavedItemPhotoPresentation(photos: photos))
  }

  func savedItemActions(
    for item: SavedItem,
    identifierPrefix: String,
    shareText: String,
    notes: SavedItemNotes,
    photos: SavedItemPhotos,
    showsListPicker: Binding<Bool>
  ) -> some View {
    barTrailingItems {
      if notes.isEditing {
        Button("Done", action: notes.finishEditing)
          .font(.body.weight(.semibold))
          .accessibilityIdentifier("word-note.done")
      } else {
        ShareLink(item: shareText) {
          Label("Share", systemImage: "square.and.arrow.up")
        }
        .accessibilityIdentifier("\(identifierPrefix).share")
        SavedItemMenu(
          item: item,
          identifierPrefix: identifierPrefix,
          addToList: { showsListPicker.wrappedValue = true },
          addNote: notes.beginAdding,
          photos: photos
        )
      }
    }
    .savedItemPhotoPresentation(photos)
    .sheet(isPresented: showsListPicker) {
      WordListPickerView(item: item)
    }
  }
}

private struct SavedItemPhotoPresentation: ViewModifier {
  @Bindable var photos: SavedItemPhotos

  func body(content: Content) -> some View {
    content
      .photosPicker(
        isPresented: $photos.showsPhotoPicker,
        selection: $photos.selectedPhoto,
        matching: .images
      )
      .onChange(of: photos.selectedPhoto) {
        photos.importSelectedPhoto()
      }
      .alert("Unable to Save Image", isPresented: $photos.importFailed) {
        Button("OK", role: .cancel) {}
      } message: {
        Text("The selected image could not be read.")
      }
      .alert(item: $photos.cameraAlert) { alert in
        alert.alert(openSettings: photos.cameraAuthorizationClient.openSettings)
      }
      .sheet(isPresented: $photos.showsCamera) {
        ImageCameraPicker { result in
          photos.saveCameraResult(result)
        }
        .ignoresSafeArea()
      }
  }
}

struct SavedItemMenu: View {
  let item: SavedItem
  let identifierPrefix: String
  let addToList: () -> Void
  let addNote: () -> Void
  let photos: SavedItemPhotos

  var body: some View {
    Menu {
      Section {
        KnownWordMenuButton(item: item, identifierPrefix: identifierPrefix)
        Button("Add to List…", systemImage: "text.badge.plus", action: addToList)
          .accessibilityIdentifier("\(identifierPrefix).add-to-list")
      }
      Section {
        Button("Add Note", systemImage: "square.and.pencil", action: addNote)
        if CameraCapture.isOffered {
          Button("Take Photo", systemImage: "camera", action: photos.presentCamera)
        }
        Button("Choose Photo", systemImage: "photo.on.rectangle") {
          photos.showsPhotoPicker = true
        }
      }
    } label: {
      Label("More", systemImage: "ellipsis")
        .labelStyle(.iconOnly)
    }
    .menuOrder(.fixed)
    .accessibilityLabel("More")
    .accessibilityIdentifier("\(identifierPrefix).more-menu")
  }
}

struct SavedItemListsSection: View {
  @Environment(WordLists.self) private var wordLists
  let item: SavedItem
  let identifierPrefix: String
  let openList: (UUID) -> Void
  let editLists: () -> Void

  var body: some View {
    ForEach(wordLists.lists.filter { wordLists.contains(item, in: $0.id) }) { list in
      LinkRow {
        openList(list.id)
      } label: {
        Label(list.name, systemImage: "list.bullet")
      }
      .accessibilityIdentifier("\(identifierPrefix).list.\(list.id)")
    }

    Button("Add to List", systemImage: "text.badge.plus", action: editLists)
      .font(.body)
      .disabled(!wordLists.canChange)
      .accessibilityIdentifier("\(identifierPrefix).add-to-list-row")
  }
}

struct SavedItemNotesSection: View {
  @Bindable var notes: SavedItemNotes
  let editorFocused: FocusState<Bool>.Binding
  let identifierPrefix: String

  var body: some View {
    ForEach(Array(notes.notes.enumerated()), id: \.element.id) { index, note in
      if notes.editingNoteID == note.id {
        noteEditor
      } else {
        Button {
          notes.beginEditing(note)
        } label: {
          Text(note.text)
            .italic()
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityIdentifier(
          index == 0 ? "\(identifierPrefix).note" : "\(identifierPrefix).note.\(index)")
      }
    }

    if let editingNoteID = notes.editingNoteID,
      !notes.notes.contains(where: { $0.id == editingNoteID })
    {
      noteEditor
    }

    if !notes.isEditing || !notes.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      Button("Add Note", systemImage: "square.and.pencil", action: notes.beginAdding)
        .font(.body)
        .accessibilityIdentifier("\(identifierPrefix).add-note")
    }
  }

  private var noteEditor: some View {
    TextField("Add Note", text: $notes.draft, axis: .vertical)
      .italic()
      .focused(editorFocused)
      .accessibilityIdentifier("word-note.editor")
  }
}

fileprivate enum SavedItemCameraAlert: String, Identifiable {
  case unavailable
  case denied
  case restricted
  case saveFailure

  var id: String { rawValue }

  func alert(openSettings: @escaping () -> Void) -> Alert {
    switch self {
    case .unavailable:
      Alert(
        title: Text("Camera Unavailable"),
        message: Text("Camera capture requires a physical device with an available camera."),
        dismissButton: .default(Text("OK"))
      )
    case .denied:
      Alert(
        title: Text("Camera Access Denied"),
        message: Text("Allow Camera access in Settings to take a photo for this word."),
        primaryButton: .default(Text("Open Settings"), action: openSettings),
        secondaryButton: .cancel()
      )
    case .restricted:
      Alert(
        title: Text("Camera Access Restricted"),
        message: Text("Camera access is restricted on this device."),
        dismissButton: .default(Text("OK"))
      )
    case .saveFailure:
      Alert(
        title: Text("Unable to Save Image"),
        message: Text("The captured image could not be read."),
        dismissButton: .default(Text("OK"))
      )
    }
  }
}

private struct SelectedPhoto: Transferable {
  let asset: ImageTextAsset

  static var transferRepresentation: some TransferRepresentation {
    FileRepresentation(importedContentType: .image) { received in
      guard
        let asset = ImageTextAsset(
          photoLibraryImageAt: received.file,
          name: received.file.lastPathComponent)
      else {
        throw CocoaError(.fileReadCorruptFile)
      }
      return SelectedPhoto(asset: asset)
    }
  }
}
