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

  test('tests the package on an iPhone Simulator and builds it and its tests for the Mac', () => {
    const packageScheme = '-scheme ZenbuJapaneseModules-Package'
    expect(runsCommand(' test', packageScheme, 'platform=iOS Simulator,id=$SIMULATOR')).toBe(true)
    expect(runsCommand(' build-for-testing', packageScheme, 'platform=macOS,arch=arm64')).toBe(true)
  })

  test('builds the app, unsigned, for an iPad Simulator and for the Mac', () => {
    const app = '-scheme ZenbuJapanese '
    const unsigned = ' CODE_SIGNING_ALLOWED=NO build'
    expect(runsCommand(unsigned, app, 'platform=iOS Simulator,id=$IPAD_SIMULATOR')).toBe(true)
    expect(runsCommand(unsigned, app, 'platform=macOS,arch=arm64')).toBe(true)
    expect(runs.some(run => run.includes('print("IPAD_SIMULATOR=" + pads[0]["udid"])'))).toBe(true)
  })
})
