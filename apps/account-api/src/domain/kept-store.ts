export interface WordNote {
  id: string
  itemId: string | null
  text: string | null
  headword: string | null
  reading: string | null
  present: boolean
  version: number
  updatedAt: Date
}

export interface PhotoFile {
  id: string
  contentType: string
  byteSize: number
  storageKey: string
  uploadedAt: Date
  profileUploadAt: Date | null
}

export type NewPhotoFile = Omit<PhotoFile, 'uploadedAt' | 'profileUploadAt'>

type PhotoStatus = 'shown' | 'emptied' | 'deleted'

export interface Photo {
  id: string
  name: string | null
  savedAt: Date | null
  status: PhotoStatus
  version: number
  updatedAt: Date
}

export interface PhotoWord {
  photoId: string
  itemId: string
  headword: string
  reading: string
  savedAt: Date
  present: boolean
  version: number
  updatedAt: Date
}

export interface ProfilePhoto {
  photoId: string | null
  version: number
  updatedAt: Date
}

export type SettingValue = string | number | boolean

export interface Setting {
  name: string
  value: SettingValue
  version: number
  updatedAt: Date
}

type SearchStatus = 'searched' | 'removed' | 'pruned'

export interface RecentSearch {
  id: string
  query: string | null
  searchedAt: Date | null
  status: SearchStatus
  version: number
  updatedAt: Date
}

export interface KeptReader {
  wordNote(id: string): Promise<WordNote | null>
  photo(id: string): Promise<Photo | null>
  photoWord(photoId: string, itemId: string): Promise<PhotoWord | null>
  profilePhoto(): Promise<ProfilePhoto | null>
  photoFile(id: string): Promise<PhotoFile | null>
  setting(name: string): Promise<Setting | null>
  recentSearch(id: string): Promise<RecentSearch | null>
}

export interface KeptWriter {
  saveWordNote(note: Omit<WordNote, 'updatedAt'>): Promise<void>
  wordNoteCount(): Promise<number>
  forgetGoneNotes(kept: number): Promise<void>
  savePhoto(photo: Omit<Photo, 'updatedAt'>): Promise<void>
  forgetGonePhotos(kept: number): Promise<void>
  oldestEmptiedPhoto(): Promise<Photo | null>
  forgottenVersion(entity: 'photo' | 'photoWord'): Promise<number>
  photoWordCount(photoId: string): Promise<number>
  savePhotoWord(word: Omit<PhotoWord, 'updatedAt'>): Promise<void>
  forgetRemovedPhotoWords(photoId: string, kept: number): Promise<void>
  forgetPhotoWords(photoId: string): Promise<void>
  saveProfilePhoto(photo: Omit<ProfilePhoto, 'updatedAt'>): Promise<void>
  photoFileCount(): Promise<number>
  profileUploadCount(): Promise<number>
  markProfileUpload(id: string): Promise<void>
  savePhotoFile(file: NewPhotoFile, profileUpload: boolean): Promise<PhotoFile>
  movePhotoFile(id: string, storageKey: string): Promise<PhotoFile>
  releasePhotoFile(id: string): Promise<void>
  cancelPhotoDeletion(storageKey: string): Promise<void>
  saveSetting(setting: Omit<Setting, 'updatedAt'>): Promise<void>
  saveRecentSearch(search: Omit<RecentSearch, 'updatedAt'>): Promise<void>
  recentSearchCount(): Promise<number>
  oldestRecentSearch(): Promise<RecentSearch | null>
  forgetRecentSearches(kept: number): Promise<void>
}

export interface PhotoDeletions {
  dueAt(storageKey: string, hours: number): Promise<void>
  due(limit: number): Promise<string[]>
  done(storageKey: string): Promise<void>
}
