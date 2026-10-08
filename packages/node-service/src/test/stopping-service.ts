import { serveUntilStopped } from '../http'

serveUntilStopped({
  fetch: () => new Response('ok'),
  port: Number(process.env.PORT),
  hostname: process.env.HOSTNAME_TO_SERVE,
  listening: { release: 'test' },
  close: async () => {
    process.stdout.write('closed\n')
  }
})
