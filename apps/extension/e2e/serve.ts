import { startLocalServer } from './local-server.ts'

const server = await startLocalServer(Number(process.env.PORT ?? 0))
console.log(JSON.stringify({ url: server.url, release: server.release, hostRule: server.hostRule }))

const stop = () => server.close().then(() => process.exit(0))
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
