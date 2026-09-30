import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { findComments } from './comments/find'
import { root } from './files'
import { commentRule, sizeRule } from './rules'
import { checkSizes } from './sizes'

interface ToolCall {
  tool_input?: { file_path?: string }
}

const call = JSON.parse(readFileSync(0, 'utf8') || '{}') as ToolCall
const edited = call.tool_input?.file_path
if (!edited || !existsSync(edited)) process.exit(0)

const path = relative(root, resolve(edited)).split(sep).join('/')
if (path.startsWith('..')) process.exit(0)

const messages: string[] = []
for (const file of findComments([path]).found) {
  messages.push(
    ...file.comments.map(comment => `${path}:${comment.line}:${comment.column}  ${comment.text}`),
    commentRule
  )
}
const sizes = checkSizes([path]).filter(size => size.path === path)
if (sizes.length) messages.push(...sizes.map(size => `${size.path}  ${size.problem}`), sizeRule)

if (messages.length) {
  console.error(messages.join('\n'))
  process.exit(2)
}
