import { defaultLocale, locales } from './config'

type PathRule = { source: string; destination: string }

const filePattern = '[^/]+\\.\\w+'
const servedAsAsked = /^\/(?:_|api(?:\/|$)|\.well-known\/)/i
const file = /\/[^/]+\.\w+\/?$/
const defaultLocalePrefix = new RegExp(`^/${defaultLocale}(?=/|$)`)

export const defaultLocaleRedirects: readonly PathRule[] = [
  { source: `/${defaultLocale}`, destination: '/' },
  { source: `/${defaultLocale}/:file(${filePattern})`, destination: '/:file' },
  { source: `/${defaultLocale}/:dir+/:file(${filePattern})`, destination: '/:dir+/:file' },
  { source: `/${defaultLocale}/:path+`, destination: '/:path+/' }
]

const firstSegment = `(?!(?:${locales.join('|')}|api|_next)(?:/|$))[^/]+`

export const defaultLocaleRewrites: readonly PathRule[] = [
  { source: '/', destination: `/${defaultLocale}/` },
  { source: `/:first(${firstSegment})`, destination: `/${defaultLocale}/:first` },
  { source: `/:first(${firstSegment})/:rest+`, destination: `/${defaultLocale}/:first/:rest+` }
]

export function withoutDefaultLocale(pathname: string): string | undefined {
  if (!defaultLocalePrefix.test(pathname)) return undefined
  const path = pathname.replace(defaultLocalePrefix, '') || '/'
  if (servedAsAsked.test(path)) return path
  if (file.test(path)) return path.replace(/\/$/, '')
  return path.endsWith('/') ? path : `${path}/`
}
