export const accountPages = {
  signIn: { path: '/login/' },
  register: { path: '/register/' },
  forgotPassword: { path: '/forgot-password/' },
  account: { path: '/account/' },
  knownWords: { path: '/account/known-words/' },
  lists: { path: '/account/lists/' },
  notes: { path: '/account/notes/' },
  mediaLibrary: { path: '/account/media-library/' },
  recentVideos: { path: '/account/recent-videos/' },
  bookmarks: { path: '/account/bookmarks/' },
  recentSearches: { path: '/account/recent-searches/' },
  settings: { path: '/account/settings/' }
} as const

export type AccountPage = keyof typeof accountPages

export function returnedError(
  searchParams: Record<string, string | string[] | undefined>
): string | null {
  const error = searchParams.error
  return typeof error === 'string' && /^[\w'-]{1,80}$/.test(error) ? error : null
}
