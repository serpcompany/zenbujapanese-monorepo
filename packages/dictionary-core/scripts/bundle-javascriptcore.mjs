#!/usr/bin/env node

import { bundle, bundlePath, writeBundle } from './javascriptcore-bundle.mjs'

await writeBundle(bundlePath, bundle)
