import { notFound } from 'next/navigation'
import { isLocale, type Locale } from './config'

export async function localeOf(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  return locale
}
