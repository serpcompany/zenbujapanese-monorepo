export type Variant = 'release' | 'test'

export const environments = ['production', 'staging'] as const

export type Environment = (typeof environments)[number]

export const defaultEnvironment: Environment = 'production'

type Hosts = { website: string; api: string; languageData: string }

const languageData = 'https://data.zenbujapanese.com'

export const hosts: Record<Environment, Hosts> = {
  production: {
    website: 'https://zenbujapanese.com',
    api: 'https://api.zenbujapanese.com',
    languageData
  },
  staging: {
    website: 'https://staging.zenbujapanese.com',
    api: 'https://api-staging.zenbujapanese.com',
    languageData
  }
}

export const testLanguageDataHost = 'http://language-data.localhost'

export function hostsOf(variant: Variant, environment: Environment): Hosts {
  const own = hosts[environment]
  return variant === 'test' ? { ...own, languageData: testLanguageDataHost } : own
}

export const environmentSetting = 'ZENBU_ENVIRONMENT'

export function environmentFrom(value: string | undefined): Environment {
  if (value === undefined || value === '') return defaultEnvironment
  const environment = environments.find(each => each === value)
  if (environment) return environment
  throw new Error(`${environmentSetting} is ${value}; it can be ${environments.join(' or ')}.`)
}

export function hostDefines(environment: Environment, variant: Variant = 'release') {
  const { website, api, languageData } = hostsOf(variant, environment)
  return {
    __ZENBU_WEBSITE_ORIGIN__: JSON.stringify(website),
    __ZENBU_API_ORIGIN__: JSON.stringify(api),
    __ZENBU_LANGUAGE_DATA_ORIGIN__: JSON.stringify(languageData)
  }
}
