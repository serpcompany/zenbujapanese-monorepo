import openNext from './.open-next/worker.js'
import { appleAppSiteAssociationResponse } from './src/lib/app-links'
import { retiredWordResponse, retiredWordsLookup } from './src/lib/dictionary/retired'
import { movedPageResponse } from './src/lib/moved-pages'
import { otherHostResponse } from './src/lib/other-hosts'
import { behindStagingAccess, withEnvironmentNoindex } from './src/lib/staging-access'

async function served(
  request: Request,
  url: URL,
  env: CloudflareEnv,
  ctx: ExecutionContext
): Promise<Response> {
  const moved = movedPageResponse(url)
  if (moved) return moved
  const lookup =
    request.method === 'GET' || request.method === 'HEAD' ? retiredWordsLookup(env) : null
  const retired = lookup ? await retiredWordResponse(url, lookup) : null
  return retired ?? openNext.fetch(request, env, ctx)
}

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const association = appleAppSiteAssociationResponse(url, env)
    if (association) {
      return env.SITE_ENV === 'staging' ? withEnvironmentNoindex(association) : association
    }
    const redirect = otherHostResponse(request, env.SITE_ENV)
    if (redirect) return redirect
    const serve = (forwarded: Request) => served(forwarded, url, env, ctx)
    if (env.SITE_ENV !== 'staging') return serve(request)
    return behindStagingAccess(request, url, env.STAGING_BASIC_AUTH_PASSWORD, serve)
  }
} satisfies ExportedHandler<CloudflareEnv>
