import CoreTransferable
import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

// What Word Detail and Kanji Detail share for a `SavedItem`: the ••• menu, its Lists and Notes
// sections, and the photos attached to it.

/// The learner's notes on one word or kanji, and the note being edited.
@MainActor
@Observable
final class SavedItemNotes {
  private(set) var notes: [LearnerWordNote] = []
  /// The note being edited, or a new note's ID while one is being added.
  private(set) var editingNoteID: String?
  var draft = ""
  @ObservationIgnored private var noteID: SavedItemID?
  @ObservationIgnored private var saveTask: Task<Void, Never>?
  @ObservationIgnored private let store: WordNoteStore

  init(store: WordNoteStore) {
    self.store = store
  }

  var isEditing: Bool { editingNoteID != nil }

  /// Shows the notes saved for `noteID`, dropping any edit in progress.
  func load(_ noteID: SavedItemID) async {
    let loaded = await store.load(noteID)
    guard !Task.isCancelled else { return }
    self.noteID = noteID
    notes = loaded
    editingNoteID = nil
    draft = ""
  }

  func beginEditing(_ note: LearnerWordNote) {
    editingNoteID = note.id
    draft = note.text
  }

  /// Saves the note being edited, if any, and starts a new one.
  func beginAdding() {
    if let editingNoteID {
      notes = notesApplyingDraft(noteID: editingNoteID)
      scheduleSave(notes)
    }
    editingNoteID = UUID().uuidString
    draft = ""
  }

  /// Saves the note being edited. An emptied note is deleted.
  func finishEditing() {
    guard let editingNoteID else { return }
    notes = notesApplyingDraft(noteID: editingNoteID)
    self.editingNoteID = nil
    draft = ""
    scheduleSave(notes)
  }

  private func scheduleSave(_ notes: [LearnerWordNote]) {
    guard let noteID else { return }
    let store = store
    let precedingSave = saveTask
    saveTask = Task {
      await precedingSave?.value
      await store.save(notes, noteID)
    }
  }

  private func notesApplyingDraft(noteID: String) -> [LearnerWordNote] {
    let normalized = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    var updatedNotes = notes
    if let index = updatedNotes.firstIndex(where: { $0.id == noteID }) {
      if normalized.isEmpty {
        updatedNotes.remove(at: index)
      } else {
        updatedNotes[index].text = normalized
      }
    } else if !normalized.isEmpty {
      updatedNotes.append(LearnerWordNote(id: noteID, text: normalized))
    }
    return updatedNotes
  }
}

/// The photos attached to one word or kanji, and the camera and photo picker that add them.
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

  /// Photos the device can display.
  var displayable: [EncounterMedia] {
    media.filter { UIImage(data: $0.data) != nil }
  }

  /// Shows the photos saved for `item`, first saving `initial` to it when given.
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

  fileprivate func saveCameraResult(_ result: Result<ImageTextAsset?, Error>) {
    showsCamera = false
    switch result {
    case .success(let asset):
      guard let asset else { return }
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
  /// Adds the photo picker, camera, and their alerts that `photos` presents.
  func savedItemPhotoPresentation(_ photos: SavedItemPhotos) -> some View {
    modifier(SavedItemPhotoPresentation(photos: photos))
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

/// The ••• menu: Known, Add to List, Add Note, and photos.
struct SavedItemMenu: View {
  let item: SavedItem
  /// The accessibility identifier prefix of the screen showing the menu.
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
        Button("Take Photo", systemImage: "camera", action: photos.presentCamera)
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

/// The lists holding the item, each opening its list, and Add to List.
struct SavedItemListsSection: View {
  @Environment(WordLists.self) private var wordLists
  let item: SavedItem
  let identifierPrefix: String
  let openList: (UUID) -> Void
  let editLists: () -> Void

  var body: some View {
    ForEach(wordLists.lists.filter { wordLists.contains(item, in: $0.id) }) { list in
      Button {
        openList(list.id)
      } label: {
        HStack {
          Label(list.name, systemImage: "list.bullet")
          Spacer()
          Image(systemName: "chevron.right")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.tertiary)
        }
      }
      .tint(.primary)
      .accessibilityIdentifier("\(identifierPrefix).list.\(list.id)")
    }

    Button("Add to List", systemImage: "text.badge.plus", action: editLists)
      .font(.body)
      .disabled(!wordLists.canChange)
      .accessibilityIdentifier("\(identifierPrefix).add-to-list-row")
  }
}

/// Each note, the one being edited as a text field, and Add Note.
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
