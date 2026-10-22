import { createRequire } from 'node:module'
const require = createRequire(new URL('../../apps/account-api/package.json', import.meta.url))
const { PGlite } = await import(require.resolve('@electric-sql/pglite'))
const { PGLiteSocketServer } = await import(require.resolve('@electric-sql/pglite-socket'))
const db = await PGlite.create()
const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: Number(process.env.DB_PORT ?? 55433), maxConnections: 20 })
await server.start()
console.log(`postgres://postgres@${server.getServerConn()}/postgres`)
