import { readFileSync, renameSync, writeFileSync } from 'node:fs'

export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

export function writeAtomically(path, text) {
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, text)
  renameSync(temporary, path)
}

export function isAlive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}
