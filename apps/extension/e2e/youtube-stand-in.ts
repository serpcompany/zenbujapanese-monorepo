import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const youTubeOrigin = 'https://www.youtube.com'

export const standInWatchPage = `${youTubeOrigin}/watch?v=zenbuJa0001`

type StandInSite = { port: number; spki: string; close(): void }

type SiteModule = {
  startStandInSite(options: {
    hosts: string[]
    root: string
    folder: string
    log(line: string): void
  }): Promise<StandInSite>
}

export type YouTubeStandIn = {
  origin: string
  hostRule: string
  spki: string
  asked: string[]
  close(): void
}

const agentChrome = join(import.meta.dirname, '..', 'agent-chrome')

export async function startYouTubeStandIn(): Promise<YouTubeStandIn> {
  const { startStandInSite }: SiteModule = await import(
    pathToFileURL(join(agentChrome, 'site.mjs')).href
  )
  const folder = mkdtempSync(join(tmpdir(), 'zenbu-youtube-'))
  const asked: string[] = []
  const host = new URL(youTubeOrigin).host
  const site = await startStandInSite({
    hosts: [host],
    root: join(agentChrome, 'site'),
    folder,
    log: line => asked.push(line)
  })
  return {
    origin: youTubeOrigin,
    hostRule: `MAP ${host} 127.0.0.1:${site.port}`,
    spki: site.spki,
    asked,
    close() {
      site.close()
      rmSync(folder, { recursive: true, force: true })
    }
  }
}
