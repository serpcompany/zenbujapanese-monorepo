import { createServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scratch = resolve(here, '../../../tmp/agent/netflix-mock');
mkdirSync(scratch, { recursive: true });
const key = join(scratch, 'key.pem');
const cert = join(scratch, 'cert.pem');
const video = join(scratch, 'video.mp4');
if (!existsSync(cert)) {
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '7', '-subj', '/CN=mock.local']);
}
if (!existsSync(video)) {
  execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=60', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-movflags', '+faststart', video]);
}

const files = {
  '/mock-netflix.js': [join(here, 'mock-netflix.js'), 'text/javascript'],
  '/video.mp4': [video, 'video/mp4'],
  '/timedtext/ja.ttml': [join(here, 'ja.ttml'), 'application/ttml+xml'],
  '/timedtext/en.ttml': [join(here, 'en.ttml'), 'application/ttml+xml'],
};

const port = Number(process.env.PORT ?? 8443);
createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
  const path = new URL(req.url, 'https://x').pathname;
  const file = path.startsWith('/watch/') ? [join(here, 'watch.html'), 'text/html'] : files[path];
  console.log(req.headers.host, req.method, req.url, file ? 200 : 404);
  if (!file) return res.writeHead(404).end();
  const body = readFileSync(file[0]);
  const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
  if (range && path === '/video.mp4') {
    const start = Number(range[1]);
    const end = range[2] ? Number(range[2]) : body.length - 1;
    res.writeHead(206, { 'Content-Type': file[1], 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
    return res.end(body.subarray(start, end + 1));
  }
  res.writeHead(200, { 'Content-Type': file[1], 'Accept-Ranges': 'bytes' }).end(body);
}).listen(port, '127.0.0.1', () => console.log(`mock on https://127.0.0.1:${port}`));
