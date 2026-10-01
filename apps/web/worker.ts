import openNext from './.open-next/worker.js'
import { retiredWordResponse, retiredWordsLookup } from './src/lib/dictionary/retired'

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    const lookup =
      request.method === 'GET' || request.method === 'HEAD' ? retiredWordsLookup(env) : null
    const retired = lookup ? await retiredWordResponse(new URL(request.url), lookup) : null
    return retired ?? openNext.fetch(request, env, ctx)
  }
} satisfies ExportedHandler<CloudflareEnv>
