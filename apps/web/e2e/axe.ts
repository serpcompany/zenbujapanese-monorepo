import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

export async function axeFailures(page: Page, rule: string, { orUnclear = false } = {}) {
  const { violations, incomplete } = await new AxeBuilder({ page }).withRules([rule]).analyze()
  return [...violations, ...(orUnclear ? incomplete : [])].flatMap(result =>
    result.nodes.map(node => `${node.target.join(' ')}: ${node.failureSummary ?? ''}`)
  )
}
