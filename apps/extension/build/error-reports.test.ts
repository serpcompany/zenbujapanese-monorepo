import { describe, expect, it } from 'vitest'
import { errorReportDefines, reportEnvironment } from './error-reports.ts'
import { extensionConfig } from './extension-config.ts'
import { extensionVersion, manifest } from './manifest.ts'

describe('reportEnvironment', () => {
  it('is qa unless a package build asks for production, as in the app', () => {
    expect(reportEnvironment(undefined)).toBe('qa')
    expect(reportEnvironment('')).toBe('qa')
    expect(reportEnvironment('production')).toBe('production')
    expect(() => reportEnvironment('staging')).toThrow(/must be qa or production/)
  })
})

describe('errorReportDefines', () => {
  it("names the release after the manifest's version", () => {
    const defines = errorReportDefines(extensionVersion, {})
    expect(defines['import.meta.env.ZENBU_SENTRY_RELEASE']).toBe(
      JSON.stringify(`zenbujapanese-extension@${manifest('release').version}`)
    )
    expect(defines['import.meta.env.ZENBU_SENTRY_ENVIRONMENT']).toBe('"qa"')
  })
})

describe('the build', () => {
  it.each([
    'release',
    'test'
  ] as const)('writes the %s build source maps beside its scripts, unreferenced, for the upload to take out', variant => {
    const config = extensionConfig(variant)
    expect(config.build?.sourcemap).toBe('hidden')
    expect(Object.keys(config.define ?? {})).toContain('import.meta.env.ZENBU_SENTRY_DSN')
  })
})
