#!/usr/bin/env node

import { writeBundle } from '../../dictionary-core/scripts/javascriptcore-bundle.mjs'
import { bundle, bundlePath } from './javascriptcore-bundle.mjs'

await writeBundle(bundlePath, bundle)
