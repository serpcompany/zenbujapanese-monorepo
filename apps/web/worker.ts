import openNext from './.open-next/worker.js'
import { appleAppSiteAssociationResponse } from './src/lib/app-links'
import { retiredWordResponse, retiredWordsLookup } from './src/lib/dictionary/retired'
import { movedPageResponse } from './src/lib/moved-pages'

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const answered = movedPageResponse(url) ?? appleAppSiteAssociationResponse(url, env)
    if (answered) return answered
    const lookup =
      request.method === 'GET' || request.method === 'HEAD' ? retiredWordsLookup(env) : null
    const retired = lookup ? await retiredWordResponse(url, lookup) : null
    return retired ?? openNext.fetch(request, env, ctx)
  }
} satisfies ExportedHandler<CloudflareEnv>
