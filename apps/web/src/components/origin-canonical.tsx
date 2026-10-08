import { siteOrigin } from '@/lib/site'

export function OriginCanonical() {
  const origin = siteOrigin()
  return (
    <>
      <link rel="canonical" href={origin} />
      <meta property="og:url" content={origin} />
    </>
  )
}
