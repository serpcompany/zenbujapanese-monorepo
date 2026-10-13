import { existsSync, lstatSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'

const restoredFromBase = [
  '.claude',
  '.mcp.json',
  '.claude.json',
  '.gitmodules',
  '.ripgreprc',
  'CLAUDE.md',
  'CLAUDE.local.md',
  '.husky'
]
const readLimit = '25,000 tokens'

export const named = path => JSON.stringify(String(path ?? ''))

export const counted = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`

const lineCount = text => text.split('\n').length - (text.endsWith('\n') ? 1 : 0)

const isRestored = path =>
  restoredFromBase.some(kept => path === kept || path.startsWith(`${kept}/`))

const inHeader = path => (named(path) === `"${path}"` ? path : named(path))

function patchText(file) {
  const before =
    file.status === 'added' ? '/dev/null' : inHeader(`a/${file.previous_filename ?? file.filename}`)
  const after = file.status === 'removed' ? '/dev/null' : inHeader(`b/${file.filename}`)
  return `--- ${before}\n+++ ${after}\n${file.patch}\n`
}

function emptyChangeFolder(workspace, changeFolder) {
  const root = realpathSync(workspace)
  const inside = relative(workspace, changeFolder)
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) {
    throw new Error(`${named(changeFolder)} is not inside the checkout`)
  }
  let parent = root
  for (const part of inside.split(sep).slice(0, -1)) {
    parent = join(parent, part)
    if (lstatSync(parent, { throwIfNoEntry: false })?.isSymbolicLink()) {
      throw new Error(
        `${named(parent)} is a symbolic link in this pull request, so the change isn't written under it`
      )
    }
  }
  rmSync(changeFolder, { recursive: true, force: true })
  mkdirSync(changeFolder, { recursive: true })
  if (realpathSync(changeFolder) !== join(root, inside)) {
    throw new Error(`${named(changeFolder)} is not inside the checkout`)
  }
}

function describeFile(file, position, { workspace, changeFolder }) {
  const number = String(position + 1).padStart(4, '0')
  const inCheckout = join(workspace, file.filename)
  const restored = isRestored(file.filename)
  const hasPatch = typeof file.patch === 'string'
  const onlyRenamed = file.status === 'renamed' && !hasPatch && !file.additions && !file.deletions
  const readable = file.status !== 'removed' && !restored && !onlyRenamed && existsSync(inCheckout)
  const entry = { path: file.filename, patch: null, file: readable ? inCheckout : null }
  const status = file.previous_filename
    ? `${file.status} from ${named(file.previous_filename)}`
    : String(file.status)
  const about = `${position + 1}. ${named(file.filename)}, ${status}, +${file.additions} -${file.deletions}`
  if (hasPatch) {
    const text = patchText(file)
    entry.patch = join(changeFolder, `${number}.patch`)
    writeFileSync(entry.patch, text)
    const view = restored
      ? "; the review's checkout holds the base branch's copy of this path, so the patch is the only view of this pull request's version (the action keeps a copy under `.claude-pr/`)"
      : ''
    return {
      entry,
      line: `${about}: \`${number}.patch\` (${counted(lineCount(text), 'line')})${view}`
    }
  }
  if (onlyRenamed) {
    return { entry, line: `${about}: renamed with no change to its text, so it has no patch` }
  }
  const instead = restored
    ? "and the review's checkout holds the base branch's copy of this path, not this pull request's"
    : entry.file
      ? `so read the file itself: ${named(entry.file)}`
      : 'and the file is not in the checkout'
  return {
    entry,
    line: `${about}: GitHub gives no text patch for it (binary, or too large), ${instead}`
  }
}

export function writeChange(files, { pullRequest, workspace, changeFolder, changeFile }) {
  emptyChangeFolder(workspace, changeFolder)
  const changed = files.map((file, position) =>
    describeFile(file, position, { workspace, changeFolder })
  )
  const index = [
    `# The change in pull request #${pullRequest}`,
    '',
    `GitHub lists ${counted(files.length, 'changed file')} in this pull request. Each has one line here: its number, path, status, lines added and removed, and what to read for it. A patch file is in this directory, \`${changeFolder}\`, and holds that one file's diff. One Read returns at most ${readLimit}, so read a patch of many lines in parts, with \`offset\` and \`limit\`, to its last line.`,
    '',
    ...changed.map(each => each.line)
  ]
  writeFileSync(join(changeFolder, 'index.md'), `${index.join('\n')}\n`)
  writeFileSync(changeFile, JSON.stringify(changed.map(each => each.entry)))
  return [
    '',
    '# The change',
    '',
    `The workflow has written this pull request's whole change, as GitHub lists it, to \`${changeFolder}\`:`,
    '',
    `- \`index.md\` lists the ${counted(files.length, 'changed file')}: each one's path, status, lines added and removed, and its patch file with its line count.`,
    "- `0001.patch` and the files numbered after it each hold one changed file's diff, numbered as in the index. A file the index gives no patch for is read itself, in the checkout.",
    '',
    `Read \`index.md\`, then every patch it lists, with the Read tool. One Read returns at most ${readLimit}: page through a long patch with \`offset\` and \`limit\` until its last line. \`gh pr diff\` is not how to read a change here: its output is cut off after the first part of a change of any size. In the summary's \`Read <N> of <M> changed files.\`, M is ${files.length}.`
  ]
}
