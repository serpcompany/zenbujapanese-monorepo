import openNext from './.open-next/worker.js'
import { retiredWordResponse, retiredWordsLookup } from './src/lib/dictionary/retired'
import { movedPageResponse } from './src/lib/moved-pages'

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    const moved = movedPageResponse(new URL(request.url))
    if (moved) return moved
    const lookup =
      request.method === 'GET' || request.method === 'HEAD' ? retiredWordsLookup(env) : null
    const retired = lookup ? await retiredWordResponse(new URL(request.url), lookup) : null
    return retired ?? openNext.fetch(request, env, ctx)
  }
} satisfies ExportedHandler<CloudflareEnv>
