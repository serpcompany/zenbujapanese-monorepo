export const environments = ['production', 'staging'] as const

export type Environment = (typeof environments)[number]

export const defaultEnvironment: Environment = 'production'

type Hosts = { website: string; api: string }

export const hosts: Record<Environment, Hosts> = {
  production: { website: 'https://zenbujapanese.com', api: 'https://api.zenbujapanese.com' },
  staging: {
    website: 'https://staging.zenbujapanese.com',
    api: 'https://api-staging.zenbujapanese.com'
  }
}

export const environmentSetting = 'ZENBU_ENVIRONMENT'

export function environmentFrom(value: string | undefined): Environment {
  if (value === undefined || value === '') return defaultEnvironment
  const environment = environments.find(each => each === value)
  if (environment) return environment
  throw new Error(`${environmentSetting} is ${value}; it can be ${environments.join(' or ')}.`)
}

export function hostDefines(environment: Environment): Record<string, string> {
  return {
    __ZENBU_WEBSITE_ORIGIN__: JSON.stringify(hosts[environment].website),
    __ZENBU_API_ORIGIN__: JSON.stringify(hosts[environment].api)
  }
}
