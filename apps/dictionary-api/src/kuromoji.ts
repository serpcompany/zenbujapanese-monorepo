import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'
import type { KuromojiToken, Tokenize } from '@zenbu/dictionary-core/examples/morphology'

export const pinnedKuromojiFiles: Record<string, string> = {
  'kuromoji.js': 'ab0ac10f1c4a9b5e246e63e57b04ba14d3a6148cd7e8d62cb97a960d4f85a3e6',
  'base.dat.gz': '0803327762e1c93ca731e4319ab8343340f2806bb84941207782cde9d2d5a8eb',
  'cc.dat.gz': '02b7631be0d4de3a1a75cd9f9cc51536e4f94c9e6b389b813e06ba0f6e7de765',
  'check.dat.gz': '193ae0035fff6fe812b58d9ee730e7a7d7ee601d918481ce51075c58114f6cc9',
  'tid.dat.gz': 'd43d831cb6fb0f0a411739cd287a6d5e998e121a8daca614df14a81a0dcac586',
  'tid_map.dat.gz': '33efd5ffd87a70f669add093fa39dee44341d58f940844ef107c8fd98bb795b2',
  'tid_pos.dat.gz': '60dbfc99a6ab993f30c5dab648bec6ad7f9aaefa5c14e1843837d95e509f8895',
  'unk.dat.gz': 'f7f991cdeb9bfd3e9c0e4577cc50ee0815a11c508cccd444a9d3ab3c81521100',
  'unk_char.dat.gz': '9a8e86fd9aff32d323fbb59f5a7006f05927a11f8173c90712cc56293aeb3225',
  'unk_compat.dat.gz': '50f60aa29bc2e86c2903ab8c825bb6fa604d2b294d96941c1d3924259791899d',
  'unk_invoke.dat.gz': '6b210889548457c3006913afd12c8b525562255f2709e404604be9614a25e94c',
  'unk_map.dat.gz': '6df12460e5477230bb6fd9641def918b699fc0a8868016b6c9f794488630509b',
  'unk_pos.dat.gz': '5b183a29f281acc7e0542beca47b83f7985047c0a2d27e78a66f32276be5ad11'
}

const dictionaryLoaderSource = `
class ZenbuKuromojiXHR {
  open(_method, url) { this.url = url; }
  send() {
    const filename = this.url.split('/').pop();
    this.response = __zenbuLoadKuromojiDictionary(filename);
    if (this.response) {
      this.status = 200;
      this.onload?.call(this);
    } else {
      this.onerror?.call(this, new Error(\`Missing \${filename}\`));
    }
  }
  addEventListener(type, callback) {
    if (type === 'load') this.onload = callback;
    if (type === 'error') this.onerror = callback;
  }
}
globalThis.XMLHttpRequest = ZenbuKuromojiXHR;
`

const tokenizerInitializationSource = `
var __zenbuKuromojiTokenizer = null;
var __zenbuKuromojiError = null;
kuromoji.builder({ dicPath: 'bundle://' }).build((error, tokenizer) => {
  __zenbuKuromojiError = error ? String(error) : null;
  __zenbuKuromojiTokenizer = tokenizer;
});
`

export function loadKuromoji(directory: string): Tokenize {
  const bytes = new Map<string, Buffer>()
  for (const [name, sha256] of Object.entries(pinnedKuromojiFiles)) {
    const file = readFileSync(join(directory, name))
    const actual = createHash('sha256').update(file).digest('hex')
    if (actual !== sha256) {
      throw new Error(`${name} is ${actual}, not the pinned Kuromoji file ${sha256}`)
    }
    bytes.set(name, file)
  }
  const context = vm.createContext({
    __zenbuLoadKuromojiDictionary(filename: string) {
      const file = filename === 'kuromoji.js' ? undefined : bytes.get(filename)
      return file ? file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) : null
    }
  })
  vm.runInContext(dictionaryLoaderSource, context)
  vm.runInContext((bytes.get('kuromoji.js') as Buffer).toString('utf8'), context)
  vm.runInContext(tokenizerInitializationSource, context)
  if (
    context.__zenbuKuromojiError !== null ||
    typeof context.__zenbuKuromojiTokenizer !== 'object'
  ) {
    throw new Error(`Kuromoji didn't build: ${context.__zenbuKuromojiError}`)
  }
  const tokenizeToJson = vm.runInContext(
    '(text) => JSON.stringify(__zenbuKuromojiTokenizer.tokenize(text))',
    context
  ) as (text: string) => string
  return text => JSON.parse(tokenizeToJson(text)) as KuromojiToken[]
}
