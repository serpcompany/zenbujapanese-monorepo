export const accountPages = {
  signIn: { path: '/login/' },
  register: { path: '/register/' },
  forgotPassword: { path: '/forgot-password/' },
  account: { path: '/account/' }
} as const

export type AccountPage = keyof typeof accountPages

export function returnedError(
  searchParams: Record<string, string | string[] | undefined>
): string | null {
  const error = searchParams.error
  return typeof error === 'string' && /^[\w'-]{1,80}$/.test(error) ? error : null
}
