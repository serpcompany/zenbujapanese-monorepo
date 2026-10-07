import { log } from './log'

const associationPath = '/.well-known/apple-app-site-association'
const iosAppBundleId = 'com.zenbujapanese.app'
const appleTeamIdPattern = /^[A-Z0-9]{10}$/

const dataRoutes = { '/': '/dictionary/*.json', exclude: true }
const searchPages = { '/': '/dictionary/search/?*' }
const kanjiPages = { '/': '/dictionary/kanji/?*' }
const wordPages = { '/': '/dictionary/*-*' }

function appleTeamId(env: object): string | null {
  const value = 'APPLE_TEAM_ID' in env ? env.APPLE_TEAM_ID : undefined
  if (typeof value !== 'string' || value === '') return null
  if (appleTeamIdPattern.test(value)) return value
  log('warn', 'apple_team_id_invalid', { length: value.length })
  return null
}

export function appleAppSiteAssociationResponse(url: URL, env: object): Response | null {
  if (url.pathname !== associationPath) return null
  const teamId = appleTeamId(env)
  if (!teamId) return new Response(null, { status: 404 })
  return Response.json({
    applinks: {
      details: [
        {
          appIDs: [`${teamId}.${iosAppBundleId}`],
          components: [dataRoutes, searchPages, kanjiPages, wordPages]
        }
      ]
    }
  })
}
