import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { expect, onProductionBuild, test } from './test'

const builtServer = join(__dirname, '..', '.open-next', 'server-functions', 'default')
const builtByOpenNext = 'The OpenNext build is the worker, and next dev runs Next.js alone'

const chunksThenNoClose =
  /async pull\(([\w$]+)\)\{([\w$]+)<([\w$]+)\.length&&\1\.enqueue\(\3\[\2\+\+\]\)\}/
const copyThenNoClose =
  /async pull\(([\w$]+)\)\{for\(;;\)\{let\{done:([\w$]+),value:([\w$]+)\}=await [\w$]+\.read\(\);if\(!\2\)\{\1\.enqueue\(\3\);continue\}return\}\}/
const streamsLeftOpen = [chunksThenNoClose, copyThenNoClose]

const builtScripts = () =>
  readdirSync(builtServer, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && /\.[cm]?js$/.test(entry.name))
    .map(entry => join(entry.parentPath, entry.name))

test.describe('The built worker', () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The build is the same at every width')
    test.skip(!onProductionBuild, builtByOpenNext)
  })

  test('closes every stream Next.js prerenders a page with, so a render frees its payload', () => {
    const scripts = builtScripts()
    expect(scripts.some(script => /app-page-turbo\.runtime\.prod\.js$/.test(script))).toBe(true)
    const leavingStreamsOpen = scripts.filter(script => {
      const code = readFileSync(script, 'utf8')
      return streamsLeftOpen.some(stream => stream.test(code))
    })
    expect(leavingStreamsOpen.map(script => relative(builtServer, script))).toEqual([])
  })
})
