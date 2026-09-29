// Runs the TypeScript worker (./worker.ts) under `pnpm dev`: tsx's loader doesn't reach worker
// threads by itself, so this registers it, then loads the worker. Production runs the bundle.
import { register } from 'tsx/esm/api'

register()
await import('./worker.ts')
