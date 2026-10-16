import { defaultLocale, isLocale, type Locale } from './config'

const neverPrefixed = /^\/(?:_|api(?:\/|$)|\.well-known\/)/i
const file = /\/[^/]+\.\w+$/

function isPagePath(pathname: string): boolean {
  return (
    pathname.startsWith('/') &&
    !pathname.startsWith('//') &&
    !neverPrefixed.test(pathname) &&
    !file.test(pathname)
  )
}

export function localizedPath(path: string, locale: Locale): string {
  if (locale === defaultLocale) return path
  const end = path.search(/[?#]/)
  const pathname = end === -1 ? path : path.slice(0, end)
  if (!isPagePath(pathname)) return path
  return `/${locale}${pathname}${end === -1 ? '' : path.slice(end)}`
}

export function pathLocale(pathname: string): { locale: Locale; path: string } {
  const first = pathname.split('/')[1] ?? ''
  if (first === defaultLocale || !isLocale(first)) return { locale: defaultLocale, path: pathname }
  return { locale: first, path: pathname.slice(first.length + 1) || '/' }
}
