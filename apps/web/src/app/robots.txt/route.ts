import { robotsTxt } from '@/lib/robots'

export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  return new Response(robotsTxt(request), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  })
}
