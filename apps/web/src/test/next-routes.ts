import { modifyRouteRegex } from 'next/dist/lib/redirect-status'
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match'
import { prepareDestination } from 'next/dist/shared/lib/router/utils/prepare-destination'

export function routeAsNextMatches(
  rules: readonly { source: string; destination: string }[],
  pathname: string
): string | null {
  for (const { source, destination } of rules) {
    const params = getPathMatch(source, {
      strict: true,
      removeUnnamedParams: true,
      regexModifier: regex => modifyRouteRegex(regex, ['/_next'])
    })(pathname)
    if (params) {
      return prepareDestination({ appendParamsToQuery: false, destination, params, query: {} })
        .parsedDestination.pathname
    }
  }
  return null
}
