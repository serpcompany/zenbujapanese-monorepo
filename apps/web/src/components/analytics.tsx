import { GoogleTagManager } from '@next/third-parties/google'
import Script from 'next/script'
import { isProductionSite } from '@/lib/site'

const gtmId = process.env.NEXT_PUBLIC_GTM_ID
const cloudflareBeaconToken = process.env.NEXT_PUBLIC_CF_BEACON_TOKEN

export function Analytics() {
  if (!isProductionSite()) return null
  return (
    <>
      {gtmId ? <GoogleTagManager gtmId={gtmId} /> : null}
      {cloudflareBeaconToken ? (
        <Script
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon={JSON.stringify({ token: cloudflareBeaconToken })}
          strategy="afterInteractive"
        />
      ) : null}
    </>
  )
}
