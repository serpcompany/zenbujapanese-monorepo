export type DataState =
  | { state: 'checking' }
  | { state: 'downloading'; done: number; total: number }
  | { state: 'ready'; release: string; updateFailed?: string }
  | { state: 'updating'; release: string; done: number; total: number }
  | { state: 'failed'; reason: string }
