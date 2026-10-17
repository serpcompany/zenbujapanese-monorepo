import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { jobResults } from './agents/job-results'
import { readWorkflow, workflowSteps } from './agents/workflow'
import { root } from './files'

const path = '.github/workflows/ios.yml'
const workflow = readWorkflow(path)
const runs = workflowSteps(path, 'swift').map(step =>
  (step.run ?? '').replace(/\\\n\s*/g, '').trimEnd()
)

function runsCommand(ending: string, ...parts: string[]): boolean {
  return runs.some(run => run.endsWith(ending) && parts.every(part => run.includes(part)))
}

describe('the iOS workflow', () => {
  test('runs the contract tests on every pull request that changes the app', () => {
    expect(workflow.jobs.contracts?.if).toBe("needs.changes.outputs.changed == 'true'")
  })

  test('runs the Swift job only when the owners turn it on and the app changed, or by hand', () => {
    expect(workflow.jobs.swift?.if?.replace(/\s+/g, ' ').trim()).toBe(
      "github.event_name == 'workflow_dispatch' || (vars.IOS_SWIFT_TESTS == 'on' && needs.changes.outputs.changed == 'true')"
    )
  })

  test('passes without the Swift job while the owners keep it off', () => {
    const results = jobResults(workflow, { event: 'pull_request', changed: true })
    expect(results).toMatchObject({ contracts: 'success', swift: 'skipped', ios: 'success' })
  })

  test('run by hand, starts the Swift job once the contract tests pass, and never after they fail', () => {
    const byHand = { event: 'workflow_dispatch', changed: true } as const
    expect(jobResults(workflow, byHand)).toMatchObject({ swift: 'success', ios: 'success' })
    expect(jobResults(workflow, { ...byHand, failing: ['contracts'] })).toMatchObject({
      swift: 'skipped',
      ios: 'failure'
    })
  })

  test('tests the package on an iPhone Simulator, an iPad Simulator, and the Mac', () => {
    const packageScheme = '-scheme ZenbuJapaneseModules-Package'
    expect(runsCommand(' test', packageScheme, 'platform=iOS Simulator,id=$SIMULATOR')).toBe(true)
    expect(runsCommand(' test', packageScheme, 'platform=iOS Simulator,id=$IPAD_SIMULATOR')).toBe(
      true
    )
    expect(runsCommand(' test', packageScheme, 'platform=macOS,arch=arm64')).toBe(true)
  })

  test('selects the pinned Xcode before anything builds, and makes its Simulators with the script agents use', () => {
    expect(readFileSync(join(root, '.xcode-version'), 'utf8')).toMatch(/^\d+\.\d+(\.\d+)?\n$/)
    const select = runs.indexOf(
      'sudo xcode-select -s "/Applications/Xcode_$(cat .xcode-version).app"'
    )
    expect(select).toBeGreaterThan(-1)
    expect(
      runs.findIndex(run => /\b(xcodebuild|xcrun|swift|simulator\.py)\b/.test(run))
    ).toBeGreaterThan(select)
    const made = runs.find(run => run.includes('>>"$GITHUB_ENV"')) ?? ''
    expect(made).toContain('simulator=$(python3 apps/ios/Tools/simulator.py)')
    expect(made).toContain('ipad=$(python3 apps/ios/Tools/simulator.py --device ipad)')
    expect(made).toContain('SIMULATOR=%s\\nIPAD_SIMULATOR=%s\\n')
    expect(
      workflowSteps(path, 'changes').some(step =>
        String(step.with?.paths ?? '').includes('.xcode-version')
      )
    ).toBe(true)
  })

  test("runs the app's UI tests on an iPhone Simulator, an iPad Simulator, and the Mac", () => {
    const app = '-scheme ZenbuJapanese '
    const uiTestBuild = 'ZENBU_BUNDLE_ID_SUFFIX=.uitests'
    for (const simulator of ['$SIMULATOR', '$IPAD_SIMULATOR']) {
      expect(runsCommand(' test', app, uiTestBuild, `platform=iOS Simulator,id=${simulator}`)).toBe(
        true
      )
    }
    expect(
      runsCommand(' CODE_SIGN_ENTITLEMENTS= test', app, uiTestBuild, 'platform=macOS,arch=arm64')
    ).toBe(true)
    expect(runs).toContain('sudo automationmodetool enable-automationmode-without-authentication')
  })
})
