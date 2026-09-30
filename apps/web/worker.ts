// The Worker's entry (wrangler.jsonc `main`): OpenNext's worker, built by `opennextjs-cloudflare
// build` into .open-next/, behind the one answer Next.js can't give: 410 Gone for a retired word
// URL (src/lib/dictionary/retired.ts, from the dictionary service). Every other request goes
// straight to the app. `pnpm dev` runs Next.js without this file, so there a retired word's page
// is a 404.
//
// .open-next/worker.js only exists after a build, and the generated cloudflare-env.d.ts imports
// this file's type, so a fresh checkout's typecheck reads this file without it: the import is
// untyped.

// biome-ignore lint/suspicious/noTsIgnore: @ts-expect-error would fail once .open-next/ is built.
// @ts-ignore
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
