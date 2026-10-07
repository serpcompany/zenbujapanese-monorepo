import { afterEach, describe, expect, test, vi } from 'vitest'
import { appleAppSiteAssociationResponse } from './app-links'

const association = new URL('https://zenbujapanese.com/.well-known/apple-app-site-association')

describe('appleAppSiteAssociationResponse', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('claims the word, search, and kanji URLs for the iOS app, as JSON', async () => {
    const response = appleAppSiteAssociationResponse(association, { APPLE_TEAM_ID: 'ABCDE12345' })
    expect(response?.status).toBe(200)
    expect(response?.headers.get('content-type')).toBe('application/json')
    expect(await response?.json()).toEqual({
      applinks: {
        details: [
          {
            appIDs: ['ABCDE12345.com.zenbujapanese.dictionary'],
            components: [
              { '/': '/dictionary/*.json', exclude: true },
              { '/': '/dictionary/search/?*' },
              { '/': '/dictionary/kanji/?*' },
              { '/': '/dictionary/*-*' }
            ]
          }
        ]
      }
    })
  })

  test.each([
    {},
    { APPLE_TEAM_ID: '' },
    { APPLE_TEAM_ID: undefined }
  ])('is not found without APPLE_TEAM_ID (%j), so no app claims links', env => {
    expect(appleAppSiteAssociationResponse(association, env)?.status).toBe(404)
  })

  test.each([
    'abcde12345',
    'ABCDE1234',
    'ABCDE12345.com.zenbujapanese.dictionary',
    ' ABCDE12345'
  ])('is not found, and says why, when APPLE_TEAM_ID is %j, not a team ID', id => {
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(appleAppSiteAssociationResponse(association, { APPLE_TEAM_ID: id })?.status).toBe(404)
    expect(JSON.parse(logged.mock.calls[0][0] as string)).toMatchObject({
      level: 'warn',
      message: 'apple_team_id_invalid'
    })
  })

  test.each([
    'https://zenbujapanese.com/.well-known/apple-app-site-association/',
    'https://zenbujapanese.com/apple-app-site-association',
    'https://zenbujapanese.com/.well-known/assetlinks.json',
    'https://zenbujapanese.com/dictionary/'
  ])('leaves %s to the site', url => {
    expect(
      appleAppSiteAssociationResponse(new URL(url), { APPLE_TEAM_ID: 'ABCDE12345' })
    ).toBeNull()
  })
})
