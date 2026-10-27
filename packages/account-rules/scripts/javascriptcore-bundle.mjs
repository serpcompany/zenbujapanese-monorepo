import { fileURLToPath } from 'node:url'
import { appResource, bundleFor } from '../../dictionary-core/scripts/javascriptcore-bundle.mjs'

const fromPackage = path => fileURLToPath(new URL(`../${path}`, import.meta.url))

export const bundlePath = appResource('AccountRules/account-rules.js')

export const bundle = () =>
  bundleFor(fromPackage('.'), fromPackage('src/embedded/javascriptcore.ts'))
