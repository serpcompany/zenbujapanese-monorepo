type InstalledRelease = { release: string; bytes: number; checkedAt: number | null }

export type DataState =
  | { state: 'checking' }
  | { state: 'downloading'; done: number; total: number }
  | ({ state: 'ready'; updateFailed?: string } & InstalledRelease)
  | ({ state: 'updating'; done: number; total: number } & InstalledRelease)
  | { state: 'failed'; reason: string }
