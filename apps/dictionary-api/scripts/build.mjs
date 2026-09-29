#!/usr/bin/env node
// Bundles the service into dist/: server.mjs and worker.mjs, which the server starts as worker
// threads. The shared core and Hono are bundled in; Sudachi's native module stays external, so
// the image installs it (Dockerfile).

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
