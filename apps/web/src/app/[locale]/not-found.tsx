import { locale } from 'next/root-params'
import { NotFoundMessage } from '@/components/not-found-message'
import { defaultLocale, isLocale } from '@/lib/i18n/config'

export default async function NotFound() {
  const segment = await locale()
  return <NotFoundMessage locale={isLocale(segment) ? segment : defaultLocale} />
}
