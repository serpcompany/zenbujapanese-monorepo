import { fileURLToPath } from 'node:url'
import { build, type Rolldown } from 'vite'
import { describe, expect, it } from 'vitest'
import {
  apiOrigin,
  appleServicesId,
  googleClientId,
  languageDataOrigin,
  websiteOrigin
} from '../src/shared/hosts.ts'
import { extensionConfig } from './extension-config.ts'
import {
  type Environment,
  environmentFrom,
  environments,
  hosts,
  hostsOf,
  ownHostPatterns,
  signInIds,
  signInIdsOf,
  testApiHost,
  testGoogleClientId,
  testLanguageDataHost
} from './hosts.ts'

const hostsModule = fileURLToPath(new URL('../src/shared/hosts.ts', import.meta.url))

async function bundledHosts(environment: Environment): Promise<string> {
  const output = (await build({
    configFile: false,
    logLevel: 'silent',
    define: extensionConfig('release', environment).define,
    build: { write: false, lib: { entry: hostsModule, formats: ['es'], fileName: 'hosts' } }
  })) as Rolldown.RolldownOutput[]
  return output[0].output[0].code
}

describe("the extension's own hosts", () => {
  it.each(environments)('hold the data, account service, and YouTube hosts in %s', environment => {
    expect(ownHostPatterns('release', environment)).toEqual([
      `${hosts[environment].languageData}/*`,
      `${hosts[environment].api}/*`,
      'https://www.youtube.com/*'
    ])
    expect(ownHostPatterns('test', environment)).toContain(`${testApiHost}/*`)
  })
})

describe('the build setting', () => {
  it("is production's hosts unless it names staging", () => {
    expect(environmentFrom(undefined)).toBe('production')
    expect(environmentFrom('')).toBe('production')
    expect(environmentFrom('staging')).toBe('staging')
    expect(() => environmentFrom('qa')).toThrow('ZENBU_ENVIRONMENT is qa')
  })

  it("names staging's website and API hosts", () => {
    expect(hosts.staging).toEqual({
      website: 'https://staging.zenbujapanese.com',
      languageData: 'https://data.zenbujapanese.com',
      api: 'https://api-staging.zenbujapanese.com'
    })
  })

  it('gives both environments the one language data host, and the test build the local ones', () => {
    for (const environment of environments) {
      expect(hostsOf('release', environment).languageData).toBe('https://data.zenbujapanese.com')
      expect(hostsOf('test', environment)).toEqual({
        ...hosts[environment],
        languageData: testLanguageDataHost,
        api: testApiHost
      })
    }
  })

  it("signs in with Apple as the website's Services ID, and with Google only once a client ID is set, which the test build stands in for", () => {
    for (const environment of environments) {
      expect(signInIdsOf('release', environment)).toEqual({
        googleClientId: null,
        appleServicesId: 'com.zenbujapanese.website'
      })
      expect(signInIdsOf('test', environment)).toEqual({
        ...signInIds[environment],
        googleClientId: testGoogleClientId
      })
    }
  })

  it("gives the tests production's hosts", () => {
    expect(websiteOrigin).toBe('https://zenbujapanese.com')
    expect(languageDataOrigin).toBe('https://data.zenbujapanese.com')
    expect(apiOrigin).toBe('https://api.zenbujapanese.com')
    expect(googleClientId).toBeNull()
    expect(appleServicesId).toBe('com.zenbujapanese.website')
  })

  it.each(environments)('builds %s with its own hosts, and no other', async environment => {
    const code = await bundledHosts(environment)
    for (const each of environments) {
      for (const origin of Object.values(hosts[each])) {
        if (Object.values(hosts[environment]).includes(origin)) {
          expect(code).toContain(JSON.stringify(origin))
        } else expect(code).not.toContain(JSON.stringify(origin))
      }
    }
  })
})
