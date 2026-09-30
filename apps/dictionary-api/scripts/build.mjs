#!/usr/bin/env node

import { build } from 'esbuild'

await build({
  entryPoints: { server: 'src/server.ts', worker: 'src/worker.ts' },
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external: ['@nikkei/napi-sudachi'],
  logLevel: 'info'
})
