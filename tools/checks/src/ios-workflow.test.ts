import { describe, expect, test } from 'vitest'
import { readWorkflow, workflowSteps } from './agents/workflow'

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
    expect(workflow.jobs.contracts?.if).toBeUndefined()
  })

  test('runs the Swift job only when the owners turn it on, or by hand', () => {
    expect(workflow.jobs.swift?.if).toBe(
      "${{ vars.IOS_SWIFT_TESTS == 'on' || github.event_name == 'workflow_dispatch' }}"
    )
  })

  test('tests the package on an iPhone Simulator, an iPad Simulator, and the Mac', () => {
    const packageScheme = '-scheme ZenbuJapaneseModules-Package'
    expect(runsCommand(' test', packageScheme, 'platform=iOS Simulator,id=$SIMULATOR')).toBe(true)
    expect(runsCommand(' test', packageScheme, 'platform=iOS Simulator,id=$IPAD_SIMULATOR')).toBe(
      true
    )
    expect(runsCommand(' test', packageScheme, 'platform=macOS,arch=arm64')).toBe(true)
    expect(runs.some(run => run.includes('print("IPAD_SIMULATOR=" + pads[0]["udid"])'))).toBe(true)
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
