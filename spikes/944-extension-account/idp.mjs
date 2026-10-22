import http from 'node:http'
const id = process.argv[2]
const back = `https://${id}.chromiumapp.org/cb`
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const state = url.searchParams.get('state') ?? ''
  if (url.pathname === '/fragment') {
    res.writeHead(302, { location: `${back}#id_token=fake.jwt.token&state=${state}` })
    return res.end()
  }
  if (url.pathname === '/form-post') {
    res.writeHead(200, { 'content-type': 'text/html' })
    return res.end(`<form method="post" action="${back}"><input name="id_token" value="fake.jwt.token"><input name="state" value="${state}"></form><script>document.forms[0].submit()</script>`)
  }
  if (url.pathname === '/bridge' && req.method === 'POST') {
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', () => {
      res.writeHead(303, { location: `${back}#${body}` })
      res.end()
    })
    return
  }
  if (url.pathname === '/form-post-bridge') {
    res.writeHead(200, { 'content-type': 'text/html' })
    return res.end(`<form method="post" action="http://127.0.0.1:${process.env.IDP_PORT ?? 3997}/bridge"><input name="id_token" value="fake.jwt.token"><input name="state" value="${state}"></form><script>document.forms[0].submit()</script>`)
  }
  if (url.pathname === '/echo') {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify(req.headers))
  }
  if (url.pathname === '/page') {
    res.writeHead(200, { 'content-type': 'text/html' })
    return res.end('<p lang="ja">日本語のページ</p>')
  }
  res.writeHead(404); res.end()
}).listen(Number(process.env.IDP_PORT ?? 3997), '127.0.0.1')
