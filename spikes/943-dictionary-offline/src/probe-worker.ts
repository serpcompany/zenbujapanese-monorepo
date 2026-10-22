import sqlite3InitModule from '@sqlite.org/sqlite-wasm'

const say = (step: string, value?: unknown) => postMessage({ step, value })
say('start')
const t0 = performance.now()
const sqlite3: any = await sqlite3InitModule({ print: (m: string) => say('print', m), printErr: (m: string) => say('printErr', m) } as any)
say('init', { ms: performance.now() - t0, version: sqlite3.version.libVersion })
const memory = new sqlite3.oo1.DB(':memory:')
try {
  memory.exec("CREATE VIRTUAL TABLE t USING fts4(body, tokenize=porter); INSERT INTO t VALUES ('people were eating apples')")
  say('fts4', memory.selectValue("SELECT count(*) FROM t WHERE t MATCH 'eat'"))
} catch (error) {
  say('fts4', String(error))
}
const t1 = performance.now()
const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'probe-pool', initialCapacity: 2 })
say('sahpool', { ms: performance.now() - t1, files: pool.getFileCount() })
say('done')
self.addEventListener('message', async event => {
  if (event.data?.type !== 'fetch') return
  try {
    const response = await fetch(event.data.url, { headers: { Range: 'bytes=0-99' }, cache: 'no-store' })
    say('fetch', { status: response.status, bytes: (await response.arrayBuffer()).byteLength })
  } catch (error) {
    say('fetch', { error: String(error) })
  }
})
