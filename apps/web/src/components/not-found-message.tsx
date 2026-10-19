import { HTTPAccessErrorFallback } from 'next/dist/client/components/http-access-fallback/error-fallback'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'

const notFoundStatus = 404

export function NotFoundMessage({ locale }: { locale: Locale }) {
  return (
    <HTTPAccessErrorFallback
      status={notFoundStatus}
      message={getDictionary(locale).chrome.notFound.message}
    />
  )
}
