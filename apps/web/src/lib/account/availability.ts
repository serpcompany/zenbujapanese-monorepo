import { isFields } from './answers'

export function accountServiceIn(wrangler: string, siteEnv: string | undefined): string {
  const config: unknown = JSON.parse(wrangler)
  if (!isFields(config)) return ''
  const environment = siteEnv ? (isFields(config.env) ? config.env[siteEnv] : null) : config
  const vars = isFields(environment) && isFields(environment.vars) ? environment.vars : {}
  return typeof vars.ACCOUNT_API_URL === 'string' ? vars.ACCOUNT_API_URL.trim() : ''
}

export const accountPagesOpen = () => process.env.ZENBU_ACCOUNT_PAGES === 'open'
