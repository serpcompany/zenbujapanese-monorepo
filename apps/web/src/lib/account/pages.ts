import type { Metadata } from 'next'

export const accountPages = {
  signIn: {
    path: '/login/',
    title: 'Sign in',
    description: 'Sign in to your Zenbu account with Apple, Google, or a code we email you.'
  },
  register: {
    path: '/register/',
    title: 'Create your account',
    description: 'Make a Zenbu account with Apple, Google, or your email. There is no password.'
  },
  forgotPassword: {
    path: '/forgot-password/',
    title: 'No password needed',
    description: 'Zenbu accounts have no password. Sign in with a code we email you.'
  },
  account: {
    path: '/account/',
    title: 'Your account',
    description: 'Your Zenbu account: your profile, how you sign in, and deleting the account.'
  }
} as const

export type AccountPage = keyof typeof accountPages

export function returnedError(
  searchParams: Record<string, string | string[] | undefined>
): string | null {
  const error = searchParams.error
  return typeof error === 'string' && /^[\w'-]{1,80}$/.test(error) ? error : null
}

export function accountMetadata(page: AccountPage): Metadata {
  const { path, title, description } = accountPages[page]
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: { index: false, follow: false }
  }
}
