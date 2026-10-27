import { fileURLToPath } from 'node:url'
import { build, type Rolldown } from 'vite'
import { describe, expect, it } from 'vitest'
import { apiOrigin, websiteOrigin } from '../src/shared/hosts.ts'
import { extensionConfig } from './extension-config.ts'
import { type Environment, environmentFrom, environments, hosts } from './hosts.ts'

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
      api: 'https://api-staging.zenbujapanese.com'
    })
  })

  it("gives the tests production's hosts", () => {
    expect(websiteOrigin).toBe('https://zenbujapanese.com')
    expect(apiOrigin).toBe('https://api.zenbujapanese.com')
  })

  it.each(environments)('builds %s with its own hosts, and no other', async environment => {
    const code = await bundledHosts(environment)
    for (const each of environments) {
      for (const origin of Object.values(hosts[each])) {
        if (each === environment) expect(code).toContain(JSON.stringify(origin))
        else expect(code).not.toContain(JSON.stringify(origin))
      }
    }
  })
})
