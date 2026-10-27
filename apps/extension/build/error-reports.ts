export const sentryOrganization = 'serpcompany'

export const sentryProject = 'zenbujapanese-extension'

const sentryDsn = ''

const environments = ['qa', 'production'] as const

export type ReportEnvironment = (typeof environments)[number]

const environmentVariable = 'ZENBU_SENTRY_ENVIRONMENT'

export function reportEnvironment(value: string | undefined): ReportEnvironment {
  if (value === undefined || value === '') return 'qa'
  const known = environments.find(environment => environment === value)
  if (known === undefined) {
    throw new Error(`${environmentVariable} is ${value}; it must be qa or production`)
  }
  return known
}

export function releaseName(version: string): string {
  return `${sentryProject}@${version}`
}

export function errorReportDefines(
  version: string,
  environ: Record<string, string | undefined>
): Record<string, string> {
  return {
    'import.meta.env.ZENBU_SENTRY_DSN': JSON.stringify(sentryDsn),
    'import.meta.env.ZENBU_SENTRY_ENVIRONMENT': JSON.stringify(
      reportEnvironment(environ[environmentVariable])
    ),
    'import.meta.env.ZENBU_SENTRY_RELEASE': JSON.stringify(releaseName(version))
  }
}
