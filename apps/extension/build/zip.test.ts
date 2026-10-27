import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { unzipFiles, zipFiles } from './zip.ts'

const entries = [
  { path: 'manifest.json', data: Buffer.from('{"name":"Zenbu Japanese"}\n') },
  { path: 'pages/side-panel.html', data: Buffer.from('<!doctype html>\n'.repeat(200)) },
  { path: 'assets/empty.js', data: Buffer.alloc(0) }
]

let folder: string | undefined

async function scratch(): Promise<string> {
  folder = await mkdtemp(join(tmpdir(), 'zenbu-zip-'))
  return folder
}

afterEach(async () => {
  if (folder) await rm(folder, { recursive: true, force: true })
  folder = undefined
})

describe('zipFiles and unzipFiles', () => {
  it('read back every file as it was written', () => {
    const files = unzipFiles(zipFiles(entries))
    expect([...files.keys()]).toEqual(entries.map(entry => entry.path))
    for (const entry of entries) expect(files.get(entry.path)).toEqual(entry.data)
  })

  it('write the same bytes for the same files, whenever they run', () => {
    expect(zipFiles(entries)).toEqual(zipFiles(entries))
  })

  it("write a zip the system's unzip tests and lists", async () => {
    const zip = join(await scratch(), 'package.zip')
    await writeFile(zip, zipFiles(entries))
    execFileSync('unzip', ['-tq', zip])
    const listed = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' })
    expect(listed.trim().split('\n')).toEqual(entries.map(entry => entry.path))
  })

  it("read a zip the system's zip wrote, folders and all", async () => {
    const at = await scratch()
    await writeFile(join(at, 'manifest.json'), entries[0].data)
    await mkdir(join(at, 'pages'))
    await writeFile(join(at, 'pages', 'side-panel.html'), entries[1].data)
    execFileSync('zip', ['-qr', 'package.zip', 'manifest.json', 'pages'], { cwd: at })
    const files = unzipFiles(await readFile(join(at, 'package.zip')))
    expect([...files.keys()].sort()).toEqual(['manifest.json', 'pages/side-panel.html'])
    expect(files.get('pages/side-panel.html')).toEqual(entries[1].data)
  })

  it('refuses a file that is not a zip', () => {
    expect(() => unzipFiles(Buffer.from('not a zip'))).toThrow('not a zip')
  })
})
