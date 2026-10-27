import { linkSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { isAlive, writeAtomically } from './files.mjs'
import { lockPath, stateDir } from './paths.mjs'

const breakerPath = `${lockPath}.break`
const leftover = new RegExp(`^${basename(lockPath)}\\.(\\d+)$`)

function pidIn(path) {
  try {
    return Number(readFileSync(path, 'utf8')) || null
  } catch {
    return null
  }
}

export function lockOwner() {
  return pidIn(lockPath)
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

function takeBreaker() {
  try {
    writeFileSync(breakerPath, String(process.pid), { flag: 'wx' })
    return true
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    return false
  }
}

function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

export function breakStaleLock(staleOwner) {
  for (let wait = 0; wait < 40; wait++) {
    if (takeBreaker()) {
      try {
        if (lockOwner() === staleOwner && !isAlive(staleOwner)) rmSync(lockPath, { force: true })
      } finally {
        rmSync(breakerPath, { force: true })
      }
      return
    }
    const breaker = pidIn(breakerPath)
    if (breaker && !isAlive(breaker)) {
      throw new Error(`pid ${breaker} died while taking the lock: remove ${breakerPath}`)
    }
    pause(50)
  }
  throw new Error(`${breakerPath} stayed taken for 2 s`)
}

function removeLeftovers() {
  for (const name of readdirSync(stateDir)) {
    const pid = Number(leftover.exec(name)?.[1])
    if (pid && !isAlive(pid)) rmSync(join(stateDir, name), { force: true })
  }
}

export function takeLock() {
  mkdirSync(stateDir, { recursive: true })
  for (let attempt = 0; attempt < 2; attempt++) {
    if (tryLink() && lockOwner() === process.pid) return removeLeftovers()
    const owner = lockOwner()
    if (isAlive(owner)) {
      throw new Error(`Chrome is in use by pid ${owner}. One Chrome per Mac: wait for it to stop.`)
    }
    breakStaleLock(owner)
  }
  throw new Error(`could not take ${lockPath}`)
}

export function handLockTo(pid) {
  if (lockOwner() === process.pid) writeAtomically(lockPath, String(pid))
}

export function releaseLock(pid) {
  if (lockOwner() === pid) rmSync(lockPath, { force: true })
}
