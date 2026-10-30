export type Variant = 'release' | 'test'

export const environments = ['production', 'staging'] as const

export type Environment = (typeof environments)[number]

export const defaultEnvironment: Environment = 'production'

type Hosts = { website: string; languageData: string; api: string }

type SignInIds = { googleClientId: string | null; appleServicesId: string }

const languageData = 'https://data.zenbujapanese.com'

export const hosts: Record<Environment, Hosts> = {
  production: {
    website: 'https://zenbujapanese.com',
    languageData,
    api: 'https://api.zenbujapanese.com'
  },
  staging: {
    website: 'https://staging.zenbujapanese.com',
    languageData,
    api: 'https://api-staging.zenbujapanese.com'
  }
}

const websiteServicesId = 'com.zenbujapanese.website'

export const signInIds: Record<Environment, SignInIds> = {
  production: { googleClientId: null, appleServicesId: websiteServicesId },
  staging: { googleClientId: null, appleServicesId: websiteServicesId }
}

export const testLanguageDataHost = 'http://language-data.localhost'

export const testApiHost = 'http://account-api.localhost'

export const testGoogleClientId = 'zenbu-extension-test.apps.googleusercontent.com'

export function hostsOf(variant: Variant, environment: Environment): Hosts {
  const own = hosts[environment]
  return variant === 'test' ? { ...own, languageData: testLanguageDataHost, api: testApiHost } : own
}

export function signInIdsOf(variant: Variant, environment: Environment): SignInIds {
  const own = signInIds[environment]
  return variant === 'test' ? { ...own, googleClientId: testGoogleClientId } : own
}

export const environmentSetting = 'ZENBU_ENVIRONMENT'

export function environmentFrom(value: string | undefined): Environment {
  if (value === undefined || value === '') return defaultEnvironment
  const environment = environments.find(each => each === value)
  if (environment) return environment
  throw new Error(`${environmentSetting} is ${value}; it can be ${environments.join(' or ')}.`)
}

export function hostDefines(environment: Environment, variant: Variant = 'release') {
  const { website, languageData, api } = hostsOf(variant, environment)
  const { googleClientId, appleServicesId } = signInIdsOf(variant, environment)
  return {
    __ZENBU_WEBSITE_ORIGIN__: JSON.stringify(website),
    __ZENBU_LANGUAGE_DATA_ORIGIN__: JSON.stringify(languageData),
    __ZENBU_API_ORIGIN__: JSON.stringify(api),
    __ZENBU_GOOGLE_CLIENT_ID__: JSON.stringify(googleClientId),
    __ZENBU_APPLE_SERVICES_ID__: JSON.stringify(appleServicesId)
  }
}
