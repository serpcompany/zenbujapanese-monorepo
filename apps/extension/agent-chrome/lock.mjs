import { linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { isAlive, writeAtomically } from './files.mjs'
import { lockPath, stateDir } from './paths.mjs'

export function lockOwner() {
  try {
    return Number(readFileSync(lockPath, 'utf8')) || null
  } catch {
    return null
  }
}

function tryLink() {
  const mine = `${lockPath}.${process.pid}`
  writeFileSync(mine, String(process.pid))
  try {
    linkSync(mine, lockPath)
    return true
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    return false
  } finally {
    rmSync(mine, { force: true })
  }
}

export function takeLock() {
  mkdirSync(stateDir, { recursive: true })
  for (let attempt = 0; attempt < 2; attempt++) {
    if (tryLink() && lockOwner() === process.pid) return
    const owner = lockOwner()
    if (isAlive(owner)) {
      throw new Error(`Chrome is in use by pid ${owner}. One Chrome per Mac: wait for it to stop.`)
    }
    rmSync(lockPath, { force: true })
  }
  throw new Error(`could not take ${lockPath}`)
}

export function handLockTo(pid) {
  if (lockOwner() === process.pid) writeAtomically(lockPath, String(pid))
}

export function releaseLock(pid) {
  if (lockOwner() === pid) rmSync(lockPath, { force: true })
}
