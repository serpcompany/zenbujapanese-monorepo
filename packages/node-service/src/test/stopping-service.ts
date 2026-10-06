import { serveUntilStopped } from '../http'

serveUntilStopped({
  fetch: () => new Response('ok'),
  port: Number(process.env.PORT),
  listening: { release: 'test' },
  close: async () => {
    process.stdout.write('closed\n')
  }
})
