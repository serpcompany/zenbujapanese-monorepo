import { isFields } from './answers'

const anOrigin = /^https?:\/\/[^/\s]+$/

export const isAnOrigin = (value: string) => anOrigin.test(value)

export function accountServiceIn(wrangler: string, siteEnv: string | undefined): string | null {
  const config: unknown = JSON.parse(wrangler)
  if (!isFields(config)) return null
  const environment = siteEnv ? (isFields(config.env) ? config.env[siteEnv] : null) : config
  const vars = isFields(environment) && isFields(environment.vars) ? environment.vars : {}
  const service = typeof vars.ACCOUNT_API_URL === 'string' ? vars.ACCOUNT_API_URL.trim() : ''
  return isAnOrigin(service) ? service : null
}

export const accountPagesFor = (wrangler: string, siteEnv: string | undefined) =>
  accountServiceIn(wrangler, siteEnv) ? 'open' : 'closed'

export const accountPagesOpen = () => process.env.ZENBU_ACCOUNT_PAGES === 'open'
