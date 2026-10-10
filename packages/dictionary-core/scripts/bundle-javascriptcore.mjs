#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { bundle, bundlePath } from './javascriptcore-bundle.mjs'

mkdirSync(dirname(bundlePath), { recursive: true })
writeFileSync(bundlePath, await bundle())
console.log(`Wrote ${bundlePath}`)
