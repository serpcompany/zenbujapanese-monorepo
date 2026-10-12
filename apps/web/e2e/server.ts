import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

export const onProductionBuild = process.env.E2E_SERVER === 'preview'

interface CheckoutPorts {
  site: number
  e2e: number
  preview: number
  dictionary: number
}

export function checkoutPorts(): CheckoutPorts {
  process.env.ZENBU_CHECKOUT_PORTS ??= execFileSync(
    process.execPath,
    [join(__dirname, '..', '..', '..', 'tools', 'checks', 'ports.mjs'), '--json'],
    { encoding: 'utf8' }
  )
  return JSON.parse(process.env.ZENBU_CHECKOUT_PORTS)
}
